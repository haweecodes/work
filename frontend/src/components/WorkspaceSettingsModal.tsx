import { useState } from 'react';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useAuthStore from '../store/authStore';
import type { StatusConfig } from '../types';

const COLOR_PRESETS = [
  { label: 'Ink',    value: 'var(--ink)'    },
  { label: 'Amber',  value: '#C47B2A'       },
  { label: 'Red',    value: 'var(--danger)' },
  { label: 'Teal',   value: '#0D9488'       },
  { label: 'Violet', value: '#7C3AED'       },
  { label: 'Faint',  value: 'var(--faint)'  },
];

function toValue(label: string) {
  return label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export default function WorkspaceSettingsModal({ onClose }: { onClose: () => void }) {
  const { currentWorkspace, taskUpdateStatuses, setTaskUpdateStatuses, isAdmin } = useWorkspaceStore();
  const user = useAuthStore(s => s.user);
  const canEdit = !!user && isAdmin(user.id);

  const [statuses, setStatuses] = useState<StatusConfig[]>([...taskUpdateStatuses]);
  const [newLabel, setNewLabel]   = useState('');
  const [newColor, setNewColor]   = useState(COLOR_PRESETS[0].value);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved]         = useState(false);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    const value = toValue(label);
    if (statuses.some(s => s.value === value)) return;
    setStatuses(prev => [...prev, { value, label, color: newColor, requiresReason: false }]);
    setNewLabel('');
    setNewColor(COLOR_PRESETS[0].value);
  };

  const handleDelete = (value: string) => {
    setStatuses(prev => prev.filter(s => s.value !== value));
  };

  const toggleRequiresReason = (value: string) => {
    setStatuses(prev => prev.map(s =>
      s.value === value ? { ...s, requiresReason: !s.requiresReason } : s
    ));
  };

  const changeColor = (value: string, color: string) => {
    setStatuses(prev => prev.map(s => s.value === value ? { ...s, color } : s));
  };

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    setSaveError('');
    try {
      const { data } = await client.put<{ task_update_statuses: StatusConfig[] }>(
        `/api/workspaces/${currentWorkspace.id}/settings`,
        { task_update_statuses: statuses }
      );
      setTaskUpdateStatuses(data.task_update_statuses);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(23,23,27,0.35)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg animate-fade-in"
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="flex items-baseline justify-between flex-shrink-0"
          style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--rule)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>
            Workspace Settings
          </span>
          <button onClick={onClose}
            style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--faint)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
            Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '20px 28px', scrollbarWidth: 'thin' }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 14 }}>
            Task Update Statuses
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
            These are the options assignees can choose when responding to a status update request.
          </p>

          {/* Status list */}
          <div className="space-y-1 mb-6">
            {statuses.map(s => (
              <div key={s.value} className="flex items-center gap-3 py-2"
                style={{ borderBottom: '1px solid var(--rule-2)' }}>
                {/* Color swatch / picker */}
                <div className="relative flex-shrink-0">
                  <div
                    style={{ width: 14, height: 14, borderRadius: 2, background: s.color, cursor: canEdit ? 'pointer' : 'default', border: '1px solid rgba(0,0,0,0.08)' }}
                    title="Change color"
                  />
                  {canEdit && (
                    <select
                      value={s.color}
                      onChange={e => changeColor(s.value, e.target.value)}
                      style={{
                        position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
                        width: '100%', height: '100%',
                      }}
                    >
                      {COLOR_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Label */}
                <span style={{ fontSize: 14, color: 'var(--ink)', flex: 1 }}>{s.label}</span>

                {/* Requires reason */}
                {canEdit ? (
                  <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={!!s.requiresReason}
                      onChange={() => toggleRequiresReason(s.value)}
                      style={{ accentColor: 'var(--ink)', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reason</span>
                  </label>
                ) : s.requiresReason ? (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reason required</span>
                ) : null}

                {/* Delete */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(s.value)}
                    style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}
                    title="Remove status"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add new status */}
          {canEdit && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>
                Add Status
              </p>
              <div className="flex items-center gap-3">
                <input
                  className="input flex-1"
                  placeholder="Status label…"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  style={{ fontSize: 13 }}
                />
                <select
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  className="input"
                  style={{ fontSize: 12, width: 'auto', flexShrink: 0 }}
                >
                  {COLOR_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newLabel.trim() || statuses.length >= 10}
                  className="btn-primary flex-shrink-0"
                >
                  Add →
                </button>
              </div>
              {statuses.length >= 10 && (
                <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>Maximum 10 statuses</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="flex items-baseline gap-6 flex-shrink-0"
            style={{ padding: '14px 28px 18px', borderTop: '1px solid var(--rule)' }}>
            <button onClick={handleSave} disabled={saving} className="btn-primary"
              style={saved ? { color: 'var(--ink)' } : {}}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes →'}
            </button>
            {saveError && (
              <span style={{ fontSize: 12, color: 'var(--danger)' }}>{saveError}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
