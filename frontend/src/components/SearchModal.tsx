import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';

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

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ messages: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace);
  const { setSelectedTask, columns } = useBoardStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const totalResults = results.messages.length + results.tasks.length;

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2 || !currentWorkspace) { setResults({ messages: [], tasks: [] }); return; }
    setLoading(true);
    try {
      const { data } = await client.get<SearchResults>('/api/search', {
        params: { q, workspace_id: currentWorkspace.id },
      });
      setResults(data);
      setActiveIndex(0);
    } catch { setResults({ messages: [], tasks: [] }); }
    finally { setLoading(false); }
  }, [currentWorkspace]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(val), 300);
  };

  const goToMessage = (msg: SearchMessage) => {
    if (msg.channel_id) navigate(`/channel/${msg.channel_id}`);
    else if (msg.dm_thread_id) navigate(`/dm/${msg.dm_thread_id}`);
    onClose();
  };

  const goToTask = (task: SearchTask) => {
    const taskObj = columns.flatMap(c => c.tasks).find(t => t.id === task.id);
    if (taskObj) setSelectedTask(taskObj);
    else navigate(`/board/${task.board_id}`);
    onClose();
  };

  const flatItems: Array<{ type: 'message'; item: SearchMessage } | { type: 'task'; item: SearchTask }> = [
    ...results.messages.map(m => ({ type: 'message' as const, item: m })),
    ...results.tasks.map(t => ({ type: 'task' as const, item: t })),
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flatItems.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && flatItems[activeIndex]) {
      const sel = flatItems[activeIndex];
      if (sel.type === 'message') goToMessage(sel.item);
      else goToTask(sel.item);
    }
  };

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
        <div className="flex items-baseline gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--rule)' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--faint)', flexShrink: 0, marginBottom: 2 }}>
            <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            style={{ flex: 1, fontSize: 15, color: 'var(--ink)', background: 'transparent', border: 'none', outline: 'none', letterSpacing: '-0.005em', fontFamily: 'inherit' }}
            placeholder="Search messages and tasks…"
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

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {query.length < 2 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>Type at least 2 characters to search</p>
            </div>
          )}

          {query.length >= 2 && !loading && totalResults === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>No results for "{query}"</p>
            </div>
          )}

          {/* Messages */}
          {results.messages.length > 0 && (
            <div>
              <div className="px-5 py-2.5" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>
                Messages
              </div>
              {results.messages.map((msg, i) => (
                <button key={msg.id} onClick={() => goToMessage(msg)} onMouseEnter={() => setActiveIndex(i)}
                  className="w-full text-left px-5 py-3 flex items-start gap-3"
                  style={{ background: activeIndex === i ? 'var(--paper-2)' : 'transparent', borderBottom: '1px solid var(--rule-2)' }}>
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
              ))}
            </div>
          )}

          {/* Tasks */}
          {results.tasks.length > 0 && (
            <div>
              <div className="px-5 py-2.5" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>
                Tasks
              </div>
              {results.tasks.map((task, i) => {
                const fi = results.messages.length + i;
                return (
                  <button key={task.id} onClick={() => goToTask(task)} onMouseEnter={() => setActiveIndex(fi)}
                    className="w-full text-left px-5 py-3 flex items-baseline gap-3"
                    style={{ background: activeIndex === fi ? 'var(--paper-2)' : 'transparent', borderBottom: '1px solid var(--rule-2)' }}>
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
                        {task.priority && (
                          <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: task.priority === 'high' || task.priority === 'critical' ? 'var(--ink)' : 'var(--muted)', fontWeight: task.priority === 'high' || task.priority === 'critical' ? 500 : 400, marginLeft: 'auto' }}>
                            {task.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {totalResults > 0 && (
          <div className="flex items-center gap-4 px-5 py-3" style={{ borderTop: '1px solid var(--rule)', fontSize: 11, color: 'var(--faint)', letterSpacing: '0.04em' }}>
            <span><kbd style={{ fontFamily: 'inherit' }}>↑↓</kbd> navigate</span>
            <span><kbd style={{ fontFamily: 'inherit' }}>↵</kbd> open</span>
            <span><kbd style={{ fontFamily: 'inherit' }}>Esc</kbd> close</span>
          </div>
        )}
      </div>
    </div>
  );
}
