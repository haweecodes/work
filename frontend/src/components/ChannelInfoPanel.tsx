import { useEffect, useState } from 'react';
import { X, Hash, Lock } from 'lucide-react';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import UserAvatar from './UserAvatar';
import type { User, Channel } from '../types';

interface Props {
  channelId: string;
  onClose: () => void;
}

export default function ChannelInfoPanel({ channelId, onClose }: Props) {
  const channels = useWorkspaceStore(s => s.channels);
  const members  = useWorkspaceStore(s => s.members);
  const channel  = channels.find(c => c.id === channelId) as Channel | undefined;

  const [channelMembers, setChannelMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    client.get<User[]>(`/api/channels/${channelId}/members`)
      .then(({ data }) => setChannelMembers(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  const isPrivate = !!channel?.is_archived === false && !!channel?.is_private;

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
            fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'var(--faint)', marginBottom: 10,
          }}>
            Members · {loading ? '…' : channelMembers.length}
          </div>

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
                const live = members.find(lm => lm.id === m.id);
                return (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 8px', borderRadius: 6,
                  }}>
                    <UserAvatar
                      src={m.avatar_url}
                      name={m.name}
                      size={28}
                      statusEmoji={live?.status_emoji ?? m.status_emoji}
                      statusText={live?.status_text ?? m.status_text}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.name}
                      </div>
                      {(live?.status_emoji || live?.status_text || m.status_emoji || m.status_text) && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {(live?.status_emoji ?? m.status_emoji)} {(live?.status_text ?? m.status_text)}
                        </div>
                      )}
                    </div>
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
