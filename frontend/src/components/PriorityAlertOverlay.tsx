import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import useNotificationStore from '../store/notificationStore';

export default function PriorityAlertOverlay() {
  const { priorityAlerts, resolveAlert } = useNotificationStore();
  const [resolving, setResolving] = useState(false);

  const alert = priorityAlerts[0];
  if (!alert) return null;

  const total = priorityAlerts.length;

  const handleAcknowledge = async () => {
    setResolving(true);
    await resolveAlert(alert.id);
    setResolving(false);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(23,23,27,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      // Intentionally no onClick handler — must click Acknowledge
    >
      <div style={{
        background: '#F8F7F3',
        border: '1px solid #E5E3DD',
        width: '100%', maxWidth: 480,
        margin: '0 16px',
        padding: '36px 40px',
      }}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--danger)',
            display: 'inline-block', flexShrink: 0,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--danger)',
          }}>
            Priority Alert
          </span>
          {total > 1 && (
            <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 'auto' }}>
              {total} unresolved
            </span>
          )}
        </div>

        {/* Sender */}
        <div className="flex items-center gap-2 mb-5">
          {alert.sender_avatar ? (
            <img src={alert.sender_avatar} alt={alert.sender_name}
              style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--rule)', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            From <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{alert.sender_name ?? 'A teammate'}</strong>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--faint)', fontVariantNumeric: 'tabular-nums' }}>
              {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
            </span>
          </span>
        </div>

        {/* Message */}
        <p style={{
          fontSize: 17, fontWeight: 500, color: 'var(--ink)',
          lineHeight: 1.55, letterSpacing: '-0.01em',
          marginBottom: 32,
        }}>
          {alert.message}
        </p>

        {/* Acknowledge button */}
        <button
          onClick={handleAcknowledge}
          disabled={resolving}
          style={{
            width: '100%', padding: '12px 0',
            background: 'var(--ink)', color: 'var(--paper)',
            fontSize: 12, fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', border: 'none', cursor: resolving ? 'not-allowed' : 'pointer',
            opacity: resolving ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {resolving ? 'Acknowledging…' : total > 1 ? `Acknowledge · ${total - 1} more remaining` : 'Acknowledge'}
        </button>
      </div>
    </div>
  );
}
