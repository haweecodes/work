import { X, Mail, Phone, Clock, Shield } from 'lucide-react';
import useWorkspaceStore from '../store/workspaceStore';
import useAuthStore from '../store/authStore';
import UserAvatar from './UserAvatar';

interface Props {
  userId: string;
  onClose: () => void;
}

export default function UserProfilePanel({ userId, onClose }: Props) {
  const members          = useWorkspaceStore(s => s.members);
  const teams            = useWorkspaceStore(s => s.teams);
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace);
  const currentUser      = useAuthStore(s => s.user);

  const member     = members.find(m => m.id === userId);
  const userTeams  = teams.filter(t => t.members.some(m => m.id === userId));
  const isOwner    = currentWorkspace?.owner_id === userId;
  const isSelf     = currentUser?.id === userId;

  const roleLabel = isOwner ? 'Owner' : (member?.role === 'admin' ? 'Admin' : 'Member');
  const roleBg    = isOwner ? '#7C3AED' : (member?.role === 'admin' ? '#6366f1' : undefined);

  if (!member) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px', borderBottom: '1px solid var(--rule)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink)' }}>
            Profile
          </span>
          <button onClick={onClose} style={{ color: 'var(--faint)', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--faint)' }}>Member not found</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 20px 14px', borderBottom: '1px solid var(--rule)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink)' }}>
          Profile
        </span>
        <button onClick={onClose} style={{ color: 'var(--faint)', display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px 20px' }}>
        {/* Avatar + name hero */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <UserAvatar
            src={member.avatar_url}
            name={member.name}
            size={72}
            statusEmoji={member.status_emoji}
            statusText={member.status_text}
          />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>
              {member.name}
              {isSelf && (
                <span style={{
                  marginLeft: 8, fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
                  color: 'var(--faint)', border: '1px solid var(--rule)', padding: '2px 6px',
                  verticalAlign: 'middle',
                }}>
                  you
                </span>
              )}
            </div>
            {/* Role badge */}
            <span style={{
              display: 'inline-block',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: roleBg ? 'var(--paper)' : 'var(--muted)',
              background: roleBg ?? 'transparent',
              border: roleBg ? 'none' : '1px solid var(--rule)',
              padding: '2px 9px',
            }}>
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Status */}
        {(member.status_emoji || member.status_text) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--faint)', marginBottom: 8,
            }}>
              Status
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px',
              background: 'var(--surface, #F9F9F8)', border: '1px solid var(--rule)',
            }}>
              {member.status_emoji && (
                <span style={{ fontSize: 18, lineHeight: 1 }}>{member.status_emoji}</span>
              )}
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                {member.status_text || 'No status message'}
              </span>
            </div>
          </div>
        )}

        {/* Info rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'var(--faint)', marginBottom: 8,
          }}>
            Info
          </div>

          <InfoRow icon={<Mail style={{ width: 14, height: 14 }} />} label="Email" value={member.email} />

          {member.mobile_number && (
            <InfoRow icon={<Phone style={{ width: 14, height: 14 }} />} label="Mobile" value={member.mobile_number} />
          )}

          {member.working_hours && (
            <InfoRow icon={<Clock style={{ width: 14, height: 14 }} />} label="Hours" value={member.working_hours} />
          )}

          <InfoRow
            icon={<Shield style={{ width: 14, height: 14 }} />}
            label="Role"
            value={roleLabel}
          />
        </div>

        {/* Teams */}
        {userTeams.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--faint)', marginBottom: 8,
            }}>
              Teams
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {userTeams.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface, #F9F9F8)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{
                    fontSize: 11, lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, flexShrink: 0,
                    background: '#7C3AED', color: '#fff', fontWeight: 700,
                    borderRadius: 3,
                  }}>
                    {t.name[0].toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 'auto' }}>
                    {t.members.length} {t.members.length === 1 ? 'member' : 'members'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 10px', borderRadius: 6,
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface, #F9F9F8)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: 'var(--faint)', flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{
          fontSize: 13, color: 'var(--ink)',
          wordBreak: 'break-all',
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}
