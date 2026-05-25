import { useState, useEffect } from 'react';
import { X, User, Phone, Clock, Smile } from 'lucide-react';
import useAuthStore from '../store/authStore';
import UserAvatar from './UserAvatar';

interface Props {
  onClose: () => void;
}

const STATUS_PRESETS = [
  { emoji: '🟢', text: 'Available' },
  { emoji: '🎯', text: 'Focusing' },
  { emoji: '📅', text: 'In a meeting' },
  { emoji: '🏖️', text: 'Vacationing' },
  { emoji: '🤒', text: 'Out sick' },
  { emoji: '🌙', text: 'After hours' },
];

export default function UserSettingsModal({ onClose }: Props) {
  const user       = useAuthStore(s => s.user);
  const updateUser = useAuthStore(s => s.updateUser);
  const setStatus  = useAuthStore(s => s.setStatus);

  const [name,         setName]         = useState(user?.name ?? '');
  const [mobile,       setMobile]       = useState(user?.mobile_number ?? '');
  const [workingHours, setWorkingHours] = useState(user?.working_hours ?? '');
  const [statusEmoji,  setStatusEmoji]  = useState(user?.status_emoji ?? '');
  const [statusText,   setStatusText]   = useState(user?.status_text ?? '');
  const [saving,       setSaving]       = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [error,        setError]        = useState('');
  const [saved,        setSaved]        = useState(false);
  const [statusSaved,  setStatusSaved]  = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setMobile(user?.mobile_number ?? '');
    setWorkingHours(user?.working_hours ?? '');
    setStatusEmoji(user?.status_emoji ?? '');
    setStatusText(user?.status_text ?? '');
  }, [user?.id]);

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await updateUser({ name: name.trim(), mobile_number: mobile.trim() || null, working_hours: workingHours.trim() || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetStatus() {
    setStatusSaving(true);
    try {
      await setStatus(statusEmoji.trim() || null, statusText.trim() || null);
      setStatusSaved(true);
      setTimeout(() => setStatusSaved(false), 2000);
    } catch {
      setError('Failed to save status');
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleClearStatus() {
    setStatusSaving(true);
    try {
      await setStatus(null, null);
      setStatusEmoji('');
      setStatusText('');
    } catch {
      setError('Failed to clear status');
    } finally {
      setStatusSaving(false);
    }
  }

  function applyPreset(emoji: string, text: string) {
    setStatusEmoji(emoji);
    setStatusText(text);
  }

  const hasStatus = !!(user?.status_emoji || user?.status_text);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-panel w-full max-w-md overflow-y-auto max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Account settings</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar + email */}
        <div className="px-6 pt-5 pb-3 flex items-center gap-4">
          <UserAvatar
            src={user?.avatar_url}
            name={user?.name}
            size={56}
            statusEmoji={user?.status_emoji}
            statusText={user?.status_text}
            className="ring-2 ring-gray-100 rounded-full"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            {hasStatus && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {user?.status_emoji} {user?.status_text}
              </p>
            )}
          </div>
        </div>

        {/* ── Status section ── */}
        <div className="px-6 pb-4">
          <label className="block text-xs font-medium text-gray-500 mb-2">
            <span className="flex items-center gap-1.5"><Smile className="w-3.5 h-3.5" />Status</span>
          </label>

          {/* Preset pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {STATUS_PRESETS.map(p => (
              <button
                key={p.emoji}
                type="button"
                onClick={() => applyPreset(p.emoji, p.text)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors"
                style={{
                  borderColor: statusEmoji === p.emoji && statusText === p.text ? 'var(--primary-500, #6366f1)' : 'var(--rule, #e5e5e5)',
                  background: statusEmoji === p.emoji && statusText === p.text ? 'rgba(99,102,241,0.07)' : 'transparent',
                  color: 'var(--ink-2, #444)',
                }}
              >
                {p.emoji} {p.text}
              </button>
            ))}
          </div>

          {/* Custom emoji + text */}
          <div className="flex gap-2">
            <input
              className="input w-16 text-center text-lg"
              value={statusEmoji}
              onChange={e => setStatusEmoji(e.target.value)}
              placeholder="😊"
              maxLength={4}
              style={{ fontSize: 20, padding: '4px 6px' }}
            />
            <input
              className="input flex-1"
              value={statusText}
              onChange={e => setStatusText(e.target.value)}
              placeholder="What's your status?"
              maxLength={80}
              onKeyDown={e => e.key === 'Enter' && handleSetStatus()}
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleSetStatus}
              disabled={statusSaving}
              className="btn-primary text-xs px-3 py-1.5"
            >
              {statusSaving ? 'Saving…' : statusSaved ? 'Set!' : 'Set status'}
            </button>
            {hasStatus && (
              <button
                onClick={handleClearStatus}
                disabled={statusSaving}
                className="btn-ghost text-xs px-3 py-1.5"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 mx-6" />

        {/* Profile fields */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />Display name</span>
            </label>
            <input
              className="input w-full"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Mobile number</span>
            </label>
            <input
              className="input w-full"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              placeholder="+1 555 000 0000"
              maxLength={30}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Working hours</span>
            </label>
            <input
              className="input w-full"
              value={workingHours}
              onChange={e => setWorkingHours(e.target.value)}
              placeholder="e.g. Mon–Fri, 9am–5pm (UTC+0)"
              maxLength={80}
            />
            <p className="mt-1 text-xs text-gray-400">Helps teammates know when you're available.</p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-ghost text-sm px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 py-2 min-w-[80px]">
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
