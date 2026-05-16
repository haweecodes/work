import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import useNotificationStore from '../store/notificationStore';

export default function PriorityAlertBanner() {
  const { priorityAlerts, resolveAlert } = useNotificationStore();
  const [resolving, setResolving] = useState(false);

  const alert = priorityAlerts[0];
  const total = priorityAlerts.length;

  if (!alert) return null;

  const handleAcknowledge = async () => {
    setResolving(true);
    await resolveAlert(alert.id);
    setResolving(false);
  };

  return (
    <div
      className="flex items-center gap-3 flex-shrink-0 w-full"
      style={{ background: '#2C3A4A', padding: '10px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Pulsing dot */}
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: '#F04040', flexShrink: 0,
        animation: 'pulse 1.5s ease-in-out infinite',
      }} />

      {/* Label */}
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#F04040', flexShrink: 0 }}>
        Priority Alert
      </span>

      {/* Queue counter */}
      {total > 1 && (
        <span style={{ fontSize: 11, color: 'rgba(248,247,243,0.65)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {total} unresolved
        </span>
      )}

      {/* Sender */}
      {alert.sender_name && (
        <span style={{ fontSize: 13, color: 'rgba(248,247,243,0.80)', flexShrink: 0 }}>
          From <strong style={{ color: 'var(--paper)', fontWeight: 600 }}>{alert.sender_name}</strong>
        </span>
      )}

      {/* Message */}
      <span style={{
        fontSize: 13, color: 'var(--paper)', flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        letterSpacing: '-0.005em',
      }}>
        — {alert.message}
      </span>

      {/* Timestamp */}
      <span style={{ fontSize: 11, color: 'rgba(248,247,243,0.65)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
      </span>

      {/* Acknowledge */}
      <button
        onClick={handleAcknowledge}
        disabled={resolving}
        style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--paper)',
          border: '1px solid rgba(248,247,243,0.25)', padding: '4px 14px',
          flexShrink: 0, background: 'transparent', cursor: resolving ? 'not-allowed' : 'pointer',
          opacity: resolving ? 0.5 : 1, fontFamily: 'inherit',
        }}
        onMouseEnter={e => { if (!resolving) e.currentTarget.style.borderColor = 'rgba(248,247,243,0.7)'; }}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(248,247,243,0.25)')}
      >
        {resolving ? '…' : 'Acknowledge'}
      </button>
    </div>
  );
}
