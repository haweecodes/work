import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';
import type { Channel } from '../types';

const TEMPLATES: { id: string; label: string; desc: string; emoji: string; columns: string[] }[] = [
  { id: 'simple',   label: 'Simple',   desc: '2 cols', emoji: '⬜', columns: ['To Do', 'Done'] },
  { id: 'standard', label: 'Standard', desc: '4 cols', emoji: '📋', columns: ['To Do', 'In Progress', 'In Review', 'Done'] },
  { id: 'software', label: 'Software', desc: '5 cols', emoji: '💻', columns: ['Backlog', 'To Do', 'In Progress', 'Testing', 'Done'] },
  { id: 'custom',   label: 'Custom',   desc: 'Blank',  emoji: '✏️', columns: [] },
];

interface CreateBoardModalProps {
  onClose: () => void;
}

export default function CreateBoardModal({ onClose }: CreateBoardModalProps) {
  const navigate = useNavigate();
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace);
  const fetchBoards      = useBoardStore(s => s.fetchBoards);
  const addChannel       = useWorkspaceStore(s => s.addChannel);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('standard');
  const [columns, setColumns] = useState<string[]>(['To Do', 'In Progress', 'In Review', 'Done']);
  const [boardPrivate, setBoardPrivate] = useState(false);
  const [createChannel, setCreateChannel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const selectTemplate = (id: string) => {
    setSelectedTemplate(id);
    const tmpl = TEMPLATES.find(t => t.id === id);
    if (tmpl) setColumns([...tmpl.columns]);
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    setColumns(prev => { const n = [...prev]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
  };

  const moveDown = (i: number) => {
    setColumns(prev => {
      if (i === prev.length - 1) return prev;
      const n = [...prev]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n;
    });
  };

  const channelName = name.trim().toLowerCase().replace(/\s+/g, '-') || 'board-channel';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !currentWorkspace) return;
    const validCols = columns.map(c => c.trim()).filter(Boolean);
    if (validCols.length === 0) { setError('Add at least one column.'); return; }

    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        workspace_id: currentWorkspace.id,
        name: trimmed,
        columns: validCols,
        is_private: boardPrivate ? 1 : 0,
      };
      if (createChannel) body.channel = { is_private: boardPrivate };

      const { data } = await client.post('/api/boards', body);

      if (data.channel_id && createChannel) {
        const chRes = await client.get<Channel>(`/api/boards/${data.id}/channel`);
        if (chRes.data) addChannel(chRes.data);
      }

      await fetchBoards(currentWorkspace.id);
      onClose();
      navigate(`/board/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create board');
      setLoading(false);
    }
  };

  const validColCount = columns.filter(c => c.trim()).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={!loading ? onClose : undefined}
    >
      <div
        className="bg-white rounded-2xl shadow-panel w-full max-w-md p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
              </svg>
            </div>
            <h2 className="font-semibold text-gray-900 text-lg">New Board</h2>
          </div>
          <button onClick={onClose} disabled={loading}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Board name */}
          <div>
            <label className="label">Board name</label>
            <input
              ref={inputRef}
              className="input"
              placeholder="e.g. Product Roadmap"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={loading}
              maxLength={80}
            />
          </div>

          {/* Template picker */}
          <div>
            <label className="label">Template</label>
            <div className="grid grid-cols-4 gap-2">
              {TEMPLATES.map(t => {
                const active = selectedTemplate === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTemplate(t.id)}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl transition-all text-center"
                    style={{
                      border: active ? '2px solid #6366f1' : '2px solid #f3f4f6',
                      background: active ? '#eef2ff' : '#f9fafb',
                      color: active ? '#4338ca' : '#6b7280',
                    }}
                  >
                    <span className="text-base leading-none">{t.emoji}</span>
                    <span className="text-[11px] font-semibold leading-tight mt-0.5">{t.label}</span>
                    <span className="text-[10px] leading-tight opacity-70">{t.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">
                Columns
                <span className="ml-1.5 text-gray-400 font-normal">({validColCount})</span>
              </label>
              <button
                type="button"
                onClick={() => setColumns(prev => [...prev, ''])}
                className="text-[12px] font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Add column
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {columns.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-5 border-2 border-dashed border-gray-200 rounded-xl">
                  No columns yet — add one above
                </p>
              ) : (
                columns.map((col, i) => (
                  <div key={i} className="flex items-center gap-1.5 group">
                    <span className="flex-shrink-0 text-gray-300">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </span>
                    <input
                      autoFocus={col === ''}
                      className="flex-1 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none transition-all"
                      style={{ '--tw-ring-color': '#a5b4fc' } as React.CSSProperties}
                      value={col}
                      placeholder="Column name"
                      onChange={e => setColumns(prev => prev.map((c, idx) => idx === i ? e.target.value : c))}
                      onFocus={e => (e.currentTarget.style.borderColor = '#818cf8')}
                      onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                    />
                    {/* Up / Down / Remove — always reserve space, show on hover */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => moveUp(i)} disabled={i === 0}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-25 disabled:cursor-default transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button type="button" onClick={() => moveDown(i)} disabled={i === columns.length - 1}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-25 disabled:cursor-default transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button type="button" onClick={() => setColumns(prev => prev.filter((_, idx) => idx !== i))}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Board visibility */}
          <div className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-sm font-medium text-gray-700">Private board</span>
                <span className="text-xs text-gray-400">Only invited members can access</span>
              </div>
              <button
                type="button"
                onClick={() => setBoardPrivate(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${boardPrivate ? 'bg-primary-500' : 'bg-gray-200'}`}
                aria-pressed={boardPrivate}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${boardPrivate ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </button>
            </div>
          </div>

          {/* Board channel */}
          <div className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Board channel</span>
                <span className="text-xs text-gray-400">Get task updates in a channel</span>
              </div>
              <button
                type="button"
                onClick={() => setCreateChannel(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${createChannel ? 'bg-primary-500' : 'bg-gray-200'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${createChannel ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {createChannel && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16 flex-shrink-0">Visibility</span>
                  <span className="text-xs text-gray-500 italic">
                    {boardPrivate ? 'Private — matches board' : 'Public — matches board'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16 flex-shrink-0">Name</span>
                  <span className="text-xs text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded-md"># {channelName}</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={loading} className="btn-ghost flex-1 disabled:opacity-40">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || validColCount === 0}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-t-white rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: 'white' }} />
                  Creating…
                </>
              ) : 'Create board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
