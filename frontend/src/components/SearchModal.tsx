import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';

interface SearchMessage {
  id: string;
  content: string;
  created_at: string;
  channel_id: string | null;
  dm_thread_id: string | null;
  sender_name: string;
  sender_avatar: string | null;
  channel_name: string | null;
}

interface SearchTask {
  id: string;
  title: string;
  priority: string | null;
  task_key: string | null;
  due_date: string | null;
  board_id: string;
  board_name: string;
  column_title: string | null;
}

interface SearchResults {
  messages: SearchMessage[];
  tasks: SearchTask[];
}

interface SearchModalProps {
  onClose: () => void;
}

export default function SearchModal({ onClose }: SearchModalProps) {
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
    if (!q.trim() || q.length < 2 || !currentWorkspace) {
      setResults({ messages: [], tasks: [] });
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.get<SearchResults>('/api/search', {
        params: { q, workspace_id: currentWorkspace.id },
      });
      setResults(data);
      setActiveIndex(0);
    } catch {
      setResults({ messages: [], tasks: [] });
    } finally {
      setLoading(false);
    }
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

  // Flat list for keyboard navigation
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

  const priorityStyle = (p: string | null) => {
    if (p === 'high' || p === 'critical') return { background: '#FEE2E2', color: '#DC2626' };
    if (p === 'medium') return { background: '#FEF3C7', color: '#D97706' };
    return { background: '#F0FDF4', color: '#16A34A' };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl animate-fade-in"
        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: '#F3F4F6' }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            className="flex-1 text-[15px] text-gray-900 outline-none bg-transparent placeholder-gray-400"
            placeholder="Search messages and tasks…"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
          />
          {loading && (
            <div className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
              style={{ borderColor: '#E5E7EB', borderTopColor: '#7C3AED' }} />
          )}
          <kbd className="text-[11px] px-1.5 py-0.5 rounded font-mono" style={{ background: '#F3F4F6', color: '#9CA3AF' }}>
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {query.length < 2 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#D1D5DB" strokeWidth={1.5} className="mb-3">
                <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
              </svg>
              <p className="text-[13px]" style={{ color: '#9CA3AF' }}>Type at least 2 characters to search</p>
            </div>
          )}

          {query.length >= 2 && !loading && totalResults === 0 && (
            <div className="flex flex-col items-center justify-center py-10">
              <p className="text-[13px]" style={{ color: '#9CA3AF' }}>No results for <strong className="text-gray-700">"{query}"</strong></p>
            </div>
          )}

          {/* Messages section */}
          {results.messages.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
                Messages
              </div>
              {results.messages.map((msg, i) => (
                <button
                  key={msg.id}
                  onClick={() => goToMessage(msg)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
                  style={{ background: activeIndex === i ? '#F5F3FF' : 'transparent' }}
                >
                  {msg.sender_avatar
                    ? <img src={msg.sender_avatar} className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5" alt={msg.sender_name} />
                    : <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600 flex-shrink-0 mt-0.5">{msg.sender_name?.[0]}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[12px] font-semibold text-gray-900">{msg.sender_name}</span>
                      {msg.channel_name && <span className="text-[11px]" style={{ color: '#9CA3AF' }}>in #{msg.channel_name}</span>}
                      <span className="text-[11px] ml-auto" style={{ color: '#9CA3AF' }}>
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-[13px] text-gray-700 truncate leading-snug">{msg.content}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Tasks section */}
          {results.tasks.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
                Tasks
              </div>
              {results.tasks.map((task, i) => {
                const fi = results.messages.length + i;
                return (
                  <button
                    key={task.id}
                    onClick={() => goToTask(task)}
                    onMouseEnter={() => setActiveIndex(fi)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                    style={{ background: activeIndex === fi ? '#F5F3FF' : 'transparent' }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: '#EDE9FE' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="#7C3AED">
                        <path d="M13.5 2h-11A1.5 1.5 0 001 3.5v9A1.5 1.5 0 002.5 14h11a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0013.5 2zM6.5 11.5l-3-3 1.06-1.06 1.94 1.94 4.44-4.44 1.06 1.06-5.5 5.5z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-medium text-gray-900 truncate">{task.title}</span>
                        {task.task_key && (
                          <span className="text-[10.5px] font-mono flex-shrink-0" style={{ color: '#9CA3AF' }}>{task.task_key}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{task.board_name}</span>
                        {task.column_title && <span className="text-[11px]" style={{ color: '#9CA3AF' }}>· {task.column_title}</span>}
                        {task.priority && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ml-auto"
                            style={priorityStyle(task.priority)}>
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

        {/* Footer hint */}
        {totalResults > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-t text-[11px]" style={{ borderColor: '#F3F4F6', color: '#9CA3AF' }}>
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">Esc</kbd> close</span>
          </div>
        )}
      </div>
    </div>
  );
}
