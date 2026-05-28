import { useEffect, useState } from 'react';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';
import useAuthStore from '../store/authStore';
import type { BoardMember, Member } from '../types';

interface BoardMembersModalProps {
  boardId: string;
  onClose: () => void;
}

export default function BoardMembersModal({ boardId, onClose }: BoardMembersModalProps) {
  const user = useAuthStore(s => s.user);
  const members = useWorkspaceStore(s => s.members);
  const boards = useBoardStore(s => s.boards);
  const fetchBoardMembers = useBoardStore(s => s.fetchBoardMembers);
  const addBoardMember = useBoardStore(s => s.addBoardMember);
  const removeBoardMember = useBoardStore(s => s.removeBoardMember);

  const board = boards.find(b => b.id === boardId);
  const isOwner = board?.created_by === user?.id;

  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBoardMembers(boardId).then(m => {
      setBoardMembers(m);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [boardId, fetchBoardMembers]);

  const memberIds = new Set(boardMembers.map(m => m.id));
  const suggestions: Member[] = search.trim().length >= 1
    ? members.filter(m => !memberIds.has(m.id) && m.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  const handleAdd = async (m: Member) => {
    setAdding(m.id);
    setError('');
    try {
      await addBoardMember(boardId, m.id);
      const updated = await fetchBoardMembers(boardId);
      setBoardMembers(updated);
      setSearch('');
    } catch {
      setError('Failed to add member');
    } finally {
      setAdding(null);
    }
  };

  const handleRemove = async (memberId: string) => {
    setRemoving(memberId);
    setError('');
    try {
      await removeBoardMember(boardId, memberId);
      setBoardMembers(prev => prev.filter(m => m.id !== memberId));
    } catch {
      setError('Failed to remove member');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-panel w-full max-w-sm p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-base leading-tight">Board members</h2>
              <p className="text-xs text-gray-400 leading-tight">{board?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Add member search — owner only */}
        {isOwner && (
          <div className="mb-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="input pl-9"
                placeholder="Search workspace members…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {suggestions.length > 0 && (
              <div className="mt-1 border border-gray-100 rounded-xl overflow-hidden shadow-dropdown">
                {suggestions.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={adding === m.id}
                    onClick={() => handleAdd(m)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors"
                  >
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt={m.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary-600">{m.name[0]?.toUpperCase()}</span>
                        </div>
                    }
                    <span className="text-sm text-gray-800 font-medium">{m.name}</span>
                    {adding === m.id && (
                      <span className="ml-auto w-4 h-4 border-2 border-t-primary-500 rounded-full animate-spin" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>
        )}

        {/* Members list */}
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span className="w-5 h-5 border-2 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : boardMembers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No members yet</p>
          ) : (
            boardMembers.map(m => {
              const isSelf = m.id === user?.id;
              const canRemove = isOwner || isSelf;
              return (
                <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 group">
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt={m.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary-600">{m.name[0]?.toUpperCase()}</span>
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                    {board?.created_by === m.id && (
                      <p className="text-[11px] text-primary-500 font-medium leading-tight">Owner</p>
                    )}
                  </div>
                  {canRemove && removing !== m.id && (
                    <button
                      type="button"
                      onClick={() => handleRemove(m.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                      title={isSelf ? 'Leave board' : 'Remove member'}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {removing === m.id && (
                    <span className="w-4 h-4 border-2 border-t-red-400 rounded-full animate-spin ml-auto" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {!isOwner && (
          <p className="text-xs text-gray-400 text-center mt-4">Only the board owner can add members.</p>
        )}
      </div>
    </div>
  );
}
