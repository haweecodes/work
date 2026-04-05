import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotificationStore from '../store/notificationStore';
import useAuthStore from '../store/authStore';
import { formatDistanceToNow } from 'date-fns';

const TYPE_ICONS: Record<string, string> = {
  mention: '💬',
  dm: '✉️',
  task_assigned: '✅',
  task_due: '⏰',
};

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { notifications, unreadCount, markAllRead, markRead } = useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={panelRef} className="bg-white rounded-xl shadow-dropdown border border-gray-100 py-2 animate-fade-in max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <span className="font-semibold text-sm text-gray-900">Notifications</span>
        {unreadCount > 0 && user && (
          <button onClick={() => markAllRead(user.id)} className="text-xs text-primary-600 hover:underline font-medium">
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-2xl mb-1">🔔</p>
          <p className="text-sm text-gray-500">All caught up!</p>
        </div>
      ) : (
        <div>
          {notifications.map(n => (
            <button key={n.id} onClick={() => { markRead(n.id); onClose(); }}
              className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${!n.is_read ? 'bg-primary-50/50' : ''}`}>
              <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${!n.is_read ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                  {n.message}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </div>
              {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-1.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
