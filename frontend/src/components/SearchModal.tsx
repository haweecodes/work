import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Lock, MessageCircle, Kanban, Plus, UserPlus, Bell, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';
import useAuthStore from '../store/authStore';
import useUIStore from '../store/uiStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchMessage {
  id: string; content: string; created_at: string;
  channel_id: string | null; dm_thread_id: string | null;
  sender_name: string; sender_avatar: string | null; channel_name: string | null;
}

interface SearchTask {
  id: string; title: string; priority: string | null;
  task_key: string | null; due_date: string | null;
  board_id: string; board_name: string; column_title: string | null;
}

interface SearchResults { messages: SearchMessage[]; tasks: SearchTask[]; }

type PaletteItem =
  | { kind: 'channel'; id: string; name: string; isPrivate: boolean }
  | { kind: 'dm';      threadId: string; name: string }
  | { kind: 'board';   id: string; name: string }
  | { kind: 'action';  label: string; onRun: () => void }
  | { kind: 'message'; item: SearchMessage }
  | { kind: 'task';    item: SearchTask };

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)', padding: '10px 20px 4px' }}>
      {label}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ messages: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useNavigate();
  const user             = useAuthStore(s => s.user);
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace);
  const channels         = useWorkspaceStore(s => s.channels);
  const dmThreads        = useWorkspaceStore(s => s.dmThreads);
  const members          = useWorkspaceStore(s => s.members);
  const boards           = useBoardStore(s => s.boards);
  const { openCreateBoard, openInvite, openSidebar } = useUIStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  // ── Navigation items (instantaneous, from store) ───────────────────────────

  const channelItems: PaletteItem[] = useMemo(() =>
    channels.map(ch => ({ kind: 'channel', id: ch.id, name: ch.name, isPrivate: !!ch.is_private })),
  [channels]);

  const dmItems: PaletteItem[] = useMemo(() =>
    dmThreads.map(t => {
      const other = t.participants?.find(p => p.id !== user?.id);
      return { kind: 'dm', threadId: t.id, name: other?.name ?? 'Direct Message' };
    }),
  [dmThreads, user?.id]);

  const boardItems: PaletteItem[] = useMemo(() =>
    boards.map(b => ({ kind: 'board', id: b.id, name: b.name })),
  [boards]);

  const actionItems: PaletteItem[] = useMemo(() => [
    { kind: 'action', label: 'New board',       onRun: openCreateBoard },
    { kind: 'action', label: 'Invite teammate', onRun: openInvite },
    { kind: 'action', label: 'Notifications',   onRun: () => openSidebar({ type: 'notifications' }) },
  ], [openCreateBoard, openInvite, openSidebar]);

  // ── Prefix parsing ─────────────────────────────────────────────────────────
  // Supports: task: / t:  board: / b:  channel: / ch: / c:  dm:  msg: / m:

  const PREFIX_RE = /^(task|t|board|b|channel|ch|c|dm|msg|m):\s*(.*)/i;

  const { scope, term } = useMemo(() => {
    const match = query.match(PREFIX_RE);
    if (!match) return { scope: null, term: query };
    const raw = match[1].toLowerCase();
    const scopeMap: Record<string, string> = {
      task: 'task', t: 'task',
      board: 'board', b: 'board',
      channel: 'channel', ch: 'channel', c: 'channel',
      dm: 'dm',
      msg: 'msg', m: 'msg',
    };
    return { scope: scopeMap[raw], term: match[2] };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ── Filter by query ────────────────────────────────────────────────────────

  const q = term.trim().toLowerCase();
  const hasQuery = q.length >= 2;

  // When a scope is active, hide unrelated sections even if term is short
  const showChannels = !scope || scope === 'channel';
  const showDms      = !scope || scope === 'dm';
  const showBoards   = !scope || scope === 'board';
  const showMsgs     = !scope || scope === 'msg';
  const showTasks    = !scope || scope === 'task';
  const showActions  = !scope;

  const filteredChannels = showChannels
    ? (q ? channelItems.filter(c => (c as any).name.toLowerCase().includes(q)) : channelItems)
    : [];
  const filteredDms = showDms
    ? (q ? dmItems.filter(d => (d as any).name.toLowerCase().includes(q)) : dmItems)
    : [];
  const filteredBoards = showBoards
    ? (q ? boardItems.filter(b => (b as any).name.toLowerCase().includes(q)) : boardItems)
    : [];

  // ── API search ─────────────────────────────────────────────────────────────

  const search = useCallback(async (termVal: string, scopeVal: string | null) => {
    const trimmed = termVal.trim();
    // Need 2+ chars OR an active scope with any term to trigger API search
    const needsApi = (showMsgs || showTasks) && (trimmed.length >= 2 || (scopeVal && trimmed.length >= 1));
    if (!needsApi || !currentWorkspace) { setResults({ messages: [], tasks: [] }); return; }
    setLoading(true);
    try {
      const { data } = await client.get<SearchResults>('/api/search', { params: { q: trimmed || scopeVal, workspace_id: currentWorkspace.id } });
      setResults(data);
    } catch { setResults({ messages: [], tasks: [] }); }
    finally { setLoading(false); }
  }, [currentWorkspace, showMsgs, showTasks]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setActiveIndex(0);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const match = val.match(PREFIX_RE);
    const newScope = match ? (['task','t','board','b','channel','ch','c','dm','msg','m'].includes(match[1].toLowerCase()) ? match[1] : null) : null;
    const newTerm = match ? match[2] : val;
    debounceTimer.current = setTimeout(() => search(newTerm, newScope), 300);
  };

  // ── Flat list of all items in render order ─────────────────────────────────

  const flatItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [
      ...filteredChannels,
      ...filteredDms,
      ...filteredBoards,
      ...(showActions && !hasQuery ? actionItems : []),
      ...(showMsgs ? results.messages.map(m => ({ kind: 'message' as const, item: m })) : []),
      ...(showTasks ? results.tasks.map(t => ({ kind: 'task' as const, item: t })) : []),
    ];
    return items;
  }, [filteredChannels, filteredDms, filteredBoards, actionItems, showActions, showMsgs, showTasks, hasQuery, results]);

  // Keep activeIndex in bounds
  useEffect(() => {
    setActiveIndex(i => Math.min(i, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // ── Execute ────────────────────────────────────────────────────────────────

  const execute = useCallback((item: PaletteItem) => {
    switch (item.kind) {
      case 'channel': navigate(`/channel/${item.id}`); break;
      case 'dm':      navigate(`/dm/${item.threadId}`); break;
      case 'board':   navigate(`/board/${item.id}`); break;
      case 'action':  item.onRun(); break;
      case 'message':
        if (item.item.channel_id) navigate(`/channel/${item.item.channel_id}`);
        else if (item.item.dm_thread_id) navigate(`/dm/${item.item.dm_thread_id}`);
        break;
      case 'task':
        if (item.item.task_key) navigate(`/board/${item.item.board_id}?taskKey=${item.item.task_key}`);
        else navigate(`/board/${item.item.board_id}`);
        break;
    }
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flatItems.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && flatItems[activeIndex]) execute(flatItems[activeIndex]);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const isEmpty = flatItems.length === 0;

  function renderItem(item: PaletteItem, idx: number) {
    const isActive = idx === activeIndex;
    const bg = isActive ? 'rgba(99,102,241,0.08)' : 'transparent';

    if (item.kind === 'channel') {
      const Icon = item.isPrivate ? Lock : Hash;
      return (
        <button key={item.id} data-idx={idx} onClick={() => execute(item)} onMouseEnter={() => setActiveIndex(idx)}
          className="w-full text-left px-5 py-2.5 flex items-center gap-2.5"
          style={{ background: bg }}>
          <Icon size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: isActive ? 'var(--ink)' : 'var(--ink-2)' }}>{item.name}</span>
        </button>
      );
    }

    if (item.kind === 'dm') {
      return (
        <button key={item.threadId} data-idx={idx} onClick={() => execute(item)} onMouseEnter={() => setActiveIndex(idx)}
          className="w-full text-left px-5 py-2.5 flex items-center gap-2.5"
          style={{ background: bg }}>
          <MessageCircle size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: isActive ? 'var(--ink)' : 'var(--ink-2)' }}>{item.name}</span>
        </button>
      );
    }

    if (item.kind === 'board') {
      return (
        <button key={item.id} data-idx={idx} onClick={() => execute(item)} onMouseEnter={() => setActiveIndex(idx)}
          className="w-full text-left px-5 py-2.5 flex items-center gap-2.5"
          style={{ background: bg }}>
          <Kanban size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: isActive ? 'var(--ink)' : 'var(--ink-2)' }}>{item.name}</span>
        </button>
      );
    }

    if (item.kind === 'action') {
      const Icon = item.label === 'New board' ? Plus : item.label === 'Invite teammate' ? UserPlus : Bell;
      return (
        <button key={item.label} data-idx={idx} onClick={() => execute(item)} onMouseEnter={() => setActiveIndex(idx)}
          className="w-full text-left px-5 py-2.5 flex items-center gap-2.5"
          style={{ background: bg }}>
          <Icon size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: isActive ? 'var(--ink)' : 'var(--ink-2)' }}>{item.label}</span>
        </button>
      );
    }

    if (item.kind === 'message') {
      const msg = item.item;
      return (
        <button key={msg.id} data-idx={idx} onClick={() => execute(item)} onMouseEnter={() => setActiveIndex(idx)}
          className="w-full text-left px-5 py-3 flex items-start gap-3"
          style={{ background: bg, borderBottom: '1px solid var(--rule-2)' }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 mb-1">
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{msg.sender_name}</span>
              {msg.channel_name && <span style={{ fontSize: 11, color: 'var(--faint)' }}>#{msg.channel_name}</span>}
              <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }} className="truncate">{msg.content}</p>
          </div>
        </button>
      );
    }

    if (item.kind === 'task') {
      const task = item.item;
      return (
        <button key={task.id} data-idx={idx} onClick={() => execute(item)} onMouseEnter={() => setActiveIndex(idx)}
          className="w-full text-left px-5 py-3 flex items-baseline gap-3"
          style={{ background: bg, borderBottom: '1px solid var(--rule-2)' }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span style={{ fontSize: 14, color: 'var(--ink)', letterSpacing: '-0.005em' }} className="truncate">{task.title}</span>
              {task.task_key && (
                <span style={{ fontSize: 10, color: 'var(--faint)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.1em', flexShrink: 0 }}>{task.task_key}</span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>{task.board_name}</span>
              {task.column_title && <span style={{ fontSize: 11, color: 'var(--faint)' }}>· {task.column_title}</span>}
            </div>
          </div>
        </button>
      );
    }

    return null;
  }

  // ── Sectioned list ─────────────────────────────────────────────────────────

  function renderSection(label: string, items: PaletteItem[], startIdx: number) {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <SectionHeader label={label} />
        {items.map((item, i) => renderItem(item, startIdx + i))}
      </div>
    );
  }

  // Compute flat offsets for keyboard navigation
  const chOffset  = 0;
  const dmOffset  = chOffset + filteredChannels.length;
  const bdOffset  = dmOffset + filteredDms.length;
  const acOffset  = bdOffset + filteredBoards.length;
  const actionCount = showActions && !hasQuery ? actionItems.length : 0;
  const msgOffset = acOffset + actionCount;
  const tskOffset = msgOffset + (showMsgs ? results.messages.length : 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      style={{ background: 'rgba(23,23,27,0.35)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xl animate-fade-in"
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}
        onKeyDown={handleKeyDown}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--rule)' }}>
          <Search size={14} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          {scope && (
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--ink)', background: 'var(--paper-2)',
              border: '1px solid var(--rule)', padding: '1px 7px', flexShrink: 0,
            }}>
              {scope}
            </span>
          )}
          <input
            ref={inputRef}
            style={{ flex: 1, fontSize: 15, color: 'var(--ink)', background: 'transparent', border: 'none', outline: 'none', letterSpacing: '-0.005em', fontFamily: 'inherit' }}
            placeholder={scope ? `Search ${scope}s…` : 'Go to channel, board, or search…'}
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
          />
          {loading && (
            <div className="w-4 h-4 border-2 animate-spin flex-shrink-0"
              style={{ borderColor: 'var(--rule)', borderTopColor: 'var(--ink)' }} />
          )}
          <kbd style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--rule)', color: 'var(--faint)', fontFamily: 'inherit', flexShrink: 0 }}>
            Esc
          </kbd>
        </div>

        {/* Items */}
        <div ref={listRef} className="max-h-[440px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {isEmpty && (scope || q.length >= 1) && !loading && (
            <div className="py-12 text-center">
              <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>
                No {scope ?? 'results'} matching "{term || query}"
              </p>
            </div>
          )}

          {!isEmpty && (
            <>
              {filteredChannels.length > 0 && renderSection('Channels', filteredChannels, chOffset)}
              {filteredDms.length > 0      && renderSection('Direct Messages', filteredDms, dmOffset)}
              {filteredBoards.length > 0   && renderSection('Boards', filteredBoards, bdOffset)}
              {showActions && !hasQuery    && renderSection('Actions', actionItems, acOffset)}
              {showMsgs && results.messages.length > 0 && renderSection('Messages', results.messages.map(m => ({ kind: 'message' as const, item: m })), msgOffset)}
              {showTasks && results.tasks.length > 0   && renderSection('Tasks',    results.tasks.map(t => ({ kind: 'task'    as const, item: t })), tskOffset)}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--rule)', fontSize: 11, color: 'var(--faint)', letterSpacing: '0.04em' }}>
          <div className="flex items-center gap-4">
            <span><kbd style={{ fontFamily: 'inherit' }}>↑↓</kbd> navigate</span>
            <span><kbd style={{ fontFamily: 'inherit' }}>↵</kbd> open</span>
            <span><kbd style={{ fontFamily: 'inherit' }}>Esc</kbd> close</span>
          </div>
          {!scope && (
            <span style={{ color: 'var(--faint)', fontStyle: 'italic' }}>
              tip: <kbd style={{ fontFamily: 'inherit', fontStyle: 'normal' }}>task:</kbd> <kbd style={{ fontFamily: 'inherit', fontStyle: 'normal' }}>board:</kbd> <kbd style={{ fontFamily: 'inherit', fontStyle: 'normal' }}>channel:</kbd> <kbd style={{ fontFamily: 'inherit', fontStyle: 'normal' }}>msg:</kbd>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
