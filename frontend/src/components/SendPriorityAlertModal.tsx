import { useState } from 'react';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useAuthStore from '../store/authStore';
import UserAvatar from './UserAvatar';

interface Props {
  onClose: () => void;
  initialMessage?: string;
  initialRecipientIds?: string[];
}

export default function SendPriorityAlertModal({ onClose, initialMessage = '', initialRecipientIds = [] }: Props) {
  const members          = useWorkspaceStore(s => s.members);
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace);
  const user = useAuthStore(s => s.user);
  const [message, setMessage] = useState(initialMessage);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialRecipientIds));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [skipped, setSkipped] = useState<Array<{ name: string; reason: string }>>([]);
  const [sentCount, setSentCount] = useState(0);

  const otherMembers = members.filter(m => m.id !== user?.id);

  const toggleMember = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!message.trim() || selectedIds.size === 0) return;
    setSending(true);
    setError('');
    try {
      const { data } = await client.post<{ sent: number; skipped: Array<{ name: string; reason: string }> }>(
        '/api/notifications/priority',
        { recipient_ids: Array.from(selectedIds), message: message.trim(), workspace_id: currentWorkspace?.id }
      );
      setSentCount(data.sent);
      setSkipped(data.skipped ?? []);
      setSent(true);
      // Auto-close only if all delivered and no skips to review
      if ((data.skipped ?? []).length === 0) {
        setTimeout(onClose, 1200);
      }
    } catch {
      setError('Failed to send alert. Try again.');
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(23,23,27,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{ background: '#F8F7F3', border: '1px solid #E5E3DD', width: '100%', maxWidth: 440, margin: '0 16px', padding: '32px 36px' }}
        onClick={e => e.stopPropagation()}
      >
        {sent ? (
          <div className="py-2">
            {sentCount > 0 && (
              <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', marginBottom: 8 }}>
                Alert sent to {sentCount} {sentCount === 1 ? 'person' : 'people'}
              </p>
            )}
            {skipped.length > 0 && (
              <div style={{ marginTop: sentCount > 0 ? 12 : 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 8 }}>
                  {sentCount === 0 ? 'No alerts delivered' : 'Some not delivered'}
                </p>
                <div className="flex flex-col gap-2">
                  {skipped.map((s, i) => (
                    <div key={i} style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 10 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>{s.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{s.reason}</p>
                    </div>
                  ))}
                </div>
                <button onClick={onClose} className="btn-ghost" style={{ marginTop: 16 }}>Close</button>
              </div>
            )}
            {skipped.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Recipients will see a banner until they acknowledge</p>
            )}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 mb-6">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--danger)' }}>
                Send Priority Alert
              </span>
            </div>

            {/* Warning */}
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
              Recipients see a persistent banner at the top of their screen until they acknowledge. One alert per person — if they already have a pending alert from you, this won't be delivered. Use only when immediate attention is required.
            </p>

            {/* Message */}
            <div className="mb-5">
              <label className="label">Alert message</label>
              <textarea
                autoFocus
                rows={3}
                style={{ width: '100%', fontSize: 15, color: 'var(--ink)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--rule)', outline: 'none', resize: 'none', padding: '4px 0', lineHeight: 1.55, fontFamily: 'inherit', letterSpacing: '-0.005em' }}
                placeholder="What requires immediate attention?"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--ink)')}
                onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--rule)')}
              />
            </div>

            {/* Recipients */}
            <div className="mb-5">
              <div className="flex items-baseline justify-between mb-1">
                <label className="label">Recipients</label>
                {otherMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIds(
                      selectedIds.size === otherMembers.length
                        ? new Set()
                        : new Set(otherMembers.map(m => m.id))
                    )}
                    style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                    {selectedIds.size === otherMembers.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0">
                {otherMembers.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    className="flex items-center gap-2.5 py-2"
                    style={{ borderBottom: '1px solid var(--rule-2)', background: 'transparent', textAlign: 'left' }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: 2, flexShrink: 0,
                      border: `1.5px solid ${selectedIds.has(m.id) ? 'var(--ink)' : 'var(--rule)'}`,
                      background: selectedIds.has(m.id) ? 'var(--ink)' : 'transparent',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selectedIds.has(m.id) && (
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="var(--paper)">
                          <path d="M1 6l3.5 3.5L11 2" stroke="var(--paper)" strokeWidth={1.8} strokeLinecap="round" fill="none" />
                        </svg>
                      )}
                    </span>
                    <UserAvatar src={m.avatar_url} name={m.name} size={20} statusEmoji={m.status_emoji} statusText={m.status_text} />
                    <span style={{ fontSize: 14, color: 'var(--ink-2)', fontWeight: selectedIds.has(m.id) ? 500 : 400 }}>
                      {m.name}
                    </span>
                    {m.status_emoji && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 2 }}>
                        {m.status_emoji} {m.status_text}
                      </span>
                    )}
                  </button>
                ))}
                {otherMembers.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>No other members in this workspace</p>
                )}
              </div>
            </div>

            {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

            {/* Actions */}
            <div className="flex items-baseline gap-5">
              <button
                onClick={handleSend}
                disabled={sending || !message.trim() || selectedIds.size === 0}
                className="btn-primary"
              >
                {sending ? 'Sending…' : `Send alert to ${selectedIds.size || 0} ${selectedIds.size === 1 ? 'person' : 'people'} →`}
              </button>
              <button onClick={onClose} className="btn-ghost">Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
