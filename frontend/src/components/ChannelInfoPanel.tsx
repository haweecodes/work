import { useEffect, useState } from 'react';
import { X, Hash, Lock, UserPlus, UserMinus, Search } from 'lucide-react';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useAuthStore from '../store/authStore';
import UserAvatar from './UserAvatar';
import type { User, Channel } from '../types';

interface Props {
  channelId: string;
  onClose: () => void;
}

export default function ChannelInfoPanel({ channelId, onClose }: Props) {
  const channels       = useWorkspaceStore(s => s.channels);
  const wsMembers      = useWorkspaceStore(s => s.members);
  const isAdmin        = useWorkspaceStore(s => s.isAdmin);
  const currentUser    = useAuthStore(s => s.user);
  const channel        = channels.find(c => c.id === channelId) as Channel | undefined;

  const [channelMembers, setChannelMembers] = useState<User[]>([]);
  const [loading, setLoading]               = useState(true);
  const [showAdd, setShowAdd]               = useState(false);
  const [search, setSearch]                 = useState('');
  const [adding, setAdding]                 = useState<string | null>(null);
  const [removing, setRemoving]             = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    client.get<User[]>(`/api/channels/${channelId}/members`)
      .then(({ data }) => setChannelMembers(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  const isPrivate  = !!channel?.is_private;
  const canManage  = isPrivate && (
    channel?.created_by === currentUser?.id || isAdmin(currentUser?.id ?? '')
  );

  const memberIds  = new Set(channelMembers.map(m => m.id));
  const nonMembers = wsMembers.filter(m => !memberIds.has(m.id));
  const filtered   = search.trim()
    ? nonMembers.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : nonMembers;

  async function handleAdd(userId: string) {
    setAdding(userId);
    try {
      await client.post(`/api/channels/${channelId}/members`, { user_id: userId });
      const added = wsMembers.find(m => m.id === userId);
      if (added) setChannelMembers(prev => [...prev, added as unknown as User]);
    } catch { /* ignore */ }
    setAdding(null);
  }

  async function handleRemove(userId: string) {
    setRemoving(userId);
    try {
      await client.delete(`/api/channels/${channelId}/members/${userId}`);
      setChannelMembers(prev => prev.filter(m => m.id !== userId));
    } catch { /* ignore */ }
    setRemoving(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 20px 14px', borderBottom: '1px solid var(--rule)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink)' }}>
          Channel info
        </span>
        <button onClick={onClose} style={{ color: 'var(--faint)', display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {/* Channel name + type */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {channel?.is_private
              ? <Lock style={{ width: 18, height: 18, color: 'var(--faint)', flexShrink: 0 }} />
              : <Hash style={{ width: 18, height: 18, color: 'var(--faint)', flexShrink: 0 }} />
            }
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
              {channel?.name ?? '…'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--paper)', background: channel?.is_private ? 'var(--ink-2)' : 'var(--primary-500, #6366f1)',
              padding: '2px 8px',
            }}>
              {channel?.is_private ? 'Private' : 'Public'}
            </span>
            {channel?.is_archived === 1 && (
              <span style={{
                fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--faint)', border: '1px solid var(--rule)', padding: '2px 8px',
              }}>
                Archived
              </span>
            )}
          </div>
        </div>

        {/* Members */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)',
            }}>
              Members · {loading ? '…' : channelMembers.length}
            </span>
            {canManage && (
              <button
                onClick={() => { setShowAdd(v => !v); setSearch(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 500, color: 'var(--primary-500, #6366f1)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </button>
            )}
          </div>

          {/* Add member picker */}
          {showAdd && canManage && (
            <div style={{
              marginBottom: 12, border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--rule)' }}>
                <Search style={{ width: 13, height: 13, color: 'var(--faint)', flexShrink: 0 }} />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search workspace members…"
                  style={{
                    flex: 1, fontSize: 12, border: 'none', outline: 'none',
                    background: 'transparent', color: 'var(--ink)',
                  }}
                />
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--faint)', textAlign: 'center' }}>
                    {search ? 'No match' : 'All workspace members are already in this channel'}
                  </div>
                ) : (
                  filtered.map(m => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                      cursor: 'pointer',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface, #f9f9f8)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <UserAvatar src={m.avatar_url} name={m.name} size={24} />
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{m.name}</span>
                      <button
                        disabled={adding === m.id}
                        onClick={() => handleAdd(m.id)}
                        style={{
                          fontSize: 11, fontWeight: 500, color: 'white',
                          background: adding === m.id ? 'var(--faint)' : 'var(--primary-500, #6366f1)',
                          border: 'none', borderRadius: 4, padding: '3px 10px', cursor: adding === m.id ? 'default' : 'pointer',
                        }}
                      >
                        {adding === m.id ? '…' : 'Add'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--rule)', flexShrink: 0 }} />
                  <div style={{ height: 12, borderRadius: 4, background: 'var(--rule)', width: `${50 + (i % 3) * 20}%` }} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {channelMembers.map(m => {
                const live      = wsMembers.find(lm => lm.id === m.id);
                const isSelf    = m.id === currentUser?.id;
                const showLeave = isPrivate && isSelf;
                const showKick  = canManage && !isSelf;

                return (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 8px', borderRadius: 6,
                  }}
                    className="group"
                  >
                    <UserAvatar
                      src={m.avatar_url}
                      name={m.name}
                      size={28}
                      statusEmoji={live?.status_emoji ?? m.status_emoji}
                      statusText={live?.status_text ?? m.status_text}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.name}
                      </div>
                      {(live?.status_emoji || live?.status_text || m.status_emoji || m.status_text) && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {(live?.status_emoji ?? m.status_emoji)} {(live?.status_text ?? m.status_text)}
                        </div>
                      )}
                    </div>
                    {(showLeave || showKick) && (
                      <button
                        disabled={removing === m.id}
                        onClick={() => handleRemove(m.id)}
                        title={showLeave ? 'Leave channel' : 'Remove member'}
                        style={{
                          display: 'flex', alignItems: 'center', color: 'var(--faint)',
                          background: 'none', border: 'none', cursor: removing === m.id ? 'default' : 'pointer',
                          padding: 4, borderRadius: 4, opacity: removing === m.id ? 0.4 : 1,
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = showLeave ? '#ef4444' : 'var(--ink)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
