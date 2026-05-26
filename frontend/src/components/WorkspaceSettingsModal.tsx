import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useAuthStore from '../store/authStore';
import UserAvatar from './UserAvatar';
import type { StatusConfig, Team, Member } from '../types';

// ── Statuses tab helpers ──────────────────────────────────────────────────────

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

type Tab = 'statuses' | 'teams' | 'members';

// ── Main modal ────────────────────────────────────────────────────────────────

export default function WorkspaceSettingsModal({ onClose }: { onClose: () => void }) {
  const currentWorkspace      = useWorkspaceStore(s => s.currentWorkspace);
  const taskUpdateStatuses    = useWorkspaceStore(s => s.taskUpdateStatuses);
  const setTaskUpdateStatuses = useWorkspaceStore(s => s.setTaskUpdateStatuses);
  const storeTeams            = useWorkspaceStore(s => s.teams);
  const setStoreTeams         = useWorkspaceStore(s => s.setTeams);
  const members               = useWorkspaceStore(s => s.members);
  const isAdmin               = useWorkspaceStore(s => s.isAdmin);
  const user                  = useAuthStore(s => s.user);
  const canEdit               = !!user && isAdmin(user.id);
  const isOwner               = currentWorkspace?.owner_id === user?.id;

  const [activeTab, setActiveTab] = useState<Tab>('statuses');

  // ── Statuses state ────────────────────────────────────────────────────────
  const [statuses, setStatuses] = useState<StatusConfig[]>([...taskUpdateStatuses]);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0].value);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved]       = useState(false);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    const value = toValue(label);
    if (statuses.some(s => s.value === value)) return;
    setStatuses(prev => [...prev, { value, label, color: newColor, requiresReason: false }]);
    setNewLabel('');
    setNewColor(COLOR_PRESETS[0].value);
  };

  const handleDeleteStatus = (value: string) => setStatuses(prev => prev.filter(s => s.value !== value));
  const toggleRequiresReason = (value: string) =>
    setStatuses(prev => prev.map(s => s.value === value ? { ...s, requiresReason: !s.requiresReason } : s));
  const changeColor = (value: string, color: string) =>
    setStatuses(prev => prev.map(s => s.value === value ? { ...s, color } : s));

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true); setSaveError('');
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

  // ── Teams state ───────────────────────────────────────────────────────────
  const [teams, setTeams] = useState<Team[]>(storeTeams);
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState<string | null>(null);
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [addMemberQuery, setAddMemberQuery]   = useState('');

  const handleCreateTeam = async () => {
    const name = newTeamName.trim();
    if (!name || !currentWorkspace) return;
    setCreatingTeam(true);
    try {
      const { data } = await client.post<Team>('/api/teams', { name });
      const updated = [...teams, data];
      setTeams(updated);
      setStoreTeams(updated);
      setNewTeamName('');
    } catch { /* ignore */ } finally {
      setCreatingTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      await client.delete(`/api/teams/${teamId}`);
      const updated = teams.filter(t => t.id !== teamId);
      setTeams(updated);
      setStoreTeams(updated);
      setConfirmDeleteTeam(null);
      if (expandedTeam === teamId) setExpandedTeam(null);
    } catch { /* ignore */ }
  };

  const handleAddMember = async (teamId: string, memberId: string) => {
    try {
      const { data: newMember } = await client.post(`/api/teams/${teamId}/members`, { userId: memberId });
      const updated = teams.map(t =>
        t.id === teamId ? { ...t, members: [...t.members, newMember] } : t
      );
      setTeams(updated);
      setStoreTeams(updated);
    } catch { /* ignore */ }
    setAddMemberTeamId(null);
    setAddMemberQuery('');
  };

  const handleRemoveMember = async (teamId: string, userId: string) => {
    try {
      await client.delete(`/api/teams/${teamId}/members/${userId}`);
      const updated = teams.map(t =>
        t.id === teamId ? { ...t, members: t.members.filter(m => m.id !== userId) } : t
      );
      setTeams(updated);
      setStoreTeams(updated);
    } catch { /* ignore */ }
  };

  // ── Members state ─────────────────────────────────────────────────────────
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>(
    Object.fromEntries(members.map(m => [m.id, m.role ?? 'member']))
  );
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);

  const handleRoleChange = async (memberId: string, role: string) => {
    if (!currentWorkspace) return;
    setRoleUpdating(memberId);
    try {
      await client.patch(`/api/workspaces/${currentWorkspace.id}/members/${memberId}/role`, { role });
      setMemberRoles(prev => ({ ...prev, [memberId]: role }));
      useWorkspaceStore.setState(s => ({
        members: s.members.map(m => m.id === memberId ? { ...m, role: role as 'admin' | 'member' } : m),
      }));
    } catch { /* ignore */ } finally {
      setRoleUpdating(null);
    }
  };

  // ── Tab label helper ──────────────────────────────────────────────────────
  const TAB_LABELS: Record<Tab, string> = { statuses: 'Statuses', teams: 'Teams', members: 'Members' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(23,23,27,0.35)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg animate-fade-in"
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="flex items-baseline justify-between flex-shrink-0"
          style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--rule)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)', paddingBottom: 16 }}>
            Workspace Settings
          </span>
          <button onClick={onClose}
            style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--faint)', paddingBottom: 16 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
            Close
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--rule)', padding: '0 28px' }}>
          {(['statuses', 'teams', 'members'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: 12, fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? 'var(--ink)' : 'var(--faint)',
                padding: '10px 0', marginRight: 24, background: 'none', border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--ink)' : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em',
                transition: 'color 0.1s',
              }}
              onMouseEnter={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--ink-2)'; }}
              onMouseLeave={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--faint)'; }}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '20px 28px', scrollbarWidth: 'thin' }}>

          {/* ── Statuses tab ── */}
          {activeTab === 'statuses' && (
            <>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 14 }}>
                Task Update Statuses
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                These are the options assignees can choose when responding to a status update request.
              </p>
              <div className="space-y-1 mb-6">
                {statuses.map(s => (
                  <div key={s.value} className="flex items-center gap-3 py-2"
                    style={{ borderBottom: '1px solid var(--rule-2)' }}>
                    <div className="relative flex-shrink-0">
                      <div style={{ width: 14, height: 14, borderRadius: 2, background: s.color, cursor: canEdit ? 'pointer' : 'default', border: '1px solid rgba(0,0,0,0.08)' }} title="Change color" />
                      {canEdit && (
                        <select value={s.color} onChange={e => changeColor(s.value, e.target.value)}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}>
                          {COLOR_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      )}
                    </div>
                    <span style={{ fontSize: 14, color: 'var(--ink)', flex: 1 }}>{s.label}</span>
                    {canEdit ? (
                      <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                        <input type="checkbox" checked={!!s.requiresReason} onChange={() => toggleRequiresReason(s.value)} style={{ accentColor: 'var(--ink)', cursor: 'pointer' }} />
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reason</span>
                      </label>
                    ) : s.requiresReason ? (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reason required</span>
                    ) : null}
                    {canEdit && (
                      <button type="button" onClick={() => handleDeleteStatus(s.value)}
                        style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>Add Status</p>
                  <div className="flex items-center gap-3">
                    <input className="input flex-1" placeholder="Status label…" value={newLabel}
                      onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ fontSize: 13 }} />
                    <select value={newColor} onChange={e => setNewColor(e.target.value)} className="input" style={{ fontSize: 12, width: 'auto', flexShrink: 0 }}>
                      {COLOR_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <button type="button" onClick={handleAdd} disabled={!newLabel.trim() || statuses.length >= 10} className="btn-primary flex-shrink-0">Add →</button>
                  </div>
                  {statuses.length >= 10 && <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>Maximum 10 statuses</p>}
                </div>
              )}
            </>
          )}

          {/* ── Teams tab ── */}
          {activeTab === 'teams' && (
            <>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 14 }}>
                Teams · {teams.length}
              </p>

              {teams.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--faint)', marginBottom: 20 }}>No teams yet.</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
                {teams.map(team => {
                  const isExpanded = expandedTeam === team.id;
                  const availableToAdd = members.filter(m => !team.members.some(tm => tm.id === m.id));
                  const filtered = availableToAdd.filter(m => m.name.toLowerCase().includes(addMemberQuery.toLowerCase()));

                  return (
                    <div key={team.id} style={{ border: '1px solid var(--rule)', marginBottom: 4 }}>
                      {/* Team row header */}
                      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 8 }}>
                        <button onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', display: 'flex', alignItems: 'center', padding: 0 }}>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{team.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--faint)' }}>{team.members.length} member{team.members.length !== 1 ? 's' : ''}</span>
                        {canEdit && (
                          confirmDeleteTeam === team.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: 'var(--danger)' }}>Delete?</span>
                              <button onClick={() => handleDeleteTeam(team.id)}
                                style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Yes</button>
                              <button onClick={() => setConfirmDeleteTeam(null)}
                                style={{ fontSize: 11, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>No</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteTeam(team.id)}
                              style={{ fontSize: 11, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>Delete</button>
                          )
                        )}
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--rule)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {team.members.length === 0 && (
                            <p style={{ fontSize: 12, color: 'var(--faint)' }}>No members yet.</p>
                          )}
                          {team.members.map(m => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <UserAvatar src={m.avatar_url} name={m.name} size={22} />
                              <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{m.name}</span>
                              {canEdit && (
                                <button onClick={() => handleRemoveMember(team.id, m.id)}
                                  style={{ fontSize: 11, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>✕</button>
                              )}
                            </div>
                          ))}

                          {/* Add member */}
                          {canEdit && (
                            addMemberTeamId === team.id ? (
                              <div style={{ marginTop: 6 }}>
                                <input
                                  autoFocus
                                  className="input"
                                  placeholder="Search members…"
                                  value={addMemberQuery}
                                  onChange={e => setAddMemberQuery(e.target.value)}
                                  style={{ fontSize: 12, width: '100%', marginBottom: 4 }}
                                  onKeyDown={e => { if (e.key === 'Escape') { setAddMemberTeamId(null); setAddMemberQuery(''); } }}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
                                  {filtered.slice(0, 8).map(m => (
                                    <button key={m.id}
                                      onClick={() => handleAddMember(team.id, m.id)}
                                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', borderRadius: 4 }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                      <UserAvatar src={m.avatar_url} name={m.name} size={20} />
                                      <span style={{ fontSize: 12, color: 'var(--ink)' }}>{m.name}</span>
                                    </button>
                                  ))}
                                  {filtered.length === 0 && <p style={{ fontSize: 11, color: 'var(--faint)', padding: '4px 6px' }}>No matches</p>}
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAddMemberTeamId(team.id); setAddMemberQuery(''); }}
                                style={{ fontSize: 11, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: '4px 0', marginTop: 2 }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
                                + Add member
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Create team */}
              {canEdit && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>
                    Create Team
                  </p>
                  <div className="flex items-center gap-3">
                    <input className="input flex-1" placeholder="Team name…" value={newTeamName}
                      onChange={e => setNewTeamName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
                      style={{ fontSize: 13 }} />
                    <button type="button" onClick={handleCreateTeam}
                      disabled={!newTeamName.trim() || creatingTeam}
                      className="btn-primary flex-shrink-0">
                      {creatingTeam ? 'Creating…' : 'Create →'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Members tab ── */}
          {activeTab === 'members' && (
            <>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 14 }}>
                Members · {members.length}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {members.map(m => {
                  const isOwnerMember = m.id === currentWorkspace?.owner_id;
                  const isSelf        = m.id === user?.id;
                  const currentRole   = memberRoles[m.id] ?? m.role ?? 'member';

                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--rule-2)' }}>
                      <UserAvatar src={m.avatar_url} name={m.name} size={28} statusEmoji={m.status_emoji} statusText={m.status_text} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {m.name}
                          {isSelf && <span style={{ fontSize: 10, color: 'var(--faint)', border: '1px solid var(--rule)', padding: '1px 5px' }}>you</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                      </div>

                      {/* Role */}
                      {isOwnerMember ? (
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--paper)', background: '#7C3AED', padding: '2px 8px', flexShrink: 0 }}>Owner</span>
                      ) : isOwner && !isSelf ? (
                        <select
                          value={currentRole}
                          disabled={roleUpdating === m.id}
                          onChange={e => handleRoleChange(m.id, e.target.value)}
                          className="input"
                          style={{ fontSize: 11, width: 'auto', flexShrink: 0, padding: '3px 6px' }}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span style={{
                          fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: currentRole === 'admin' ? 'var(--paper)' : 'var(--muted)',
                          background: currentRole === 'admin' ? '#6366f1' : 'transparent',
                          border: currentRole === 'admin' ? 'none' : '1px solid var(--rule)',
                          padding: '2px 8px', flexShrink: 0,
                        }}>
                          {currentRole}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer — only for statuses save */}
        {activeTab === 'statuses' && canEdit && (
          <div className="flex items-baseline gap-6 flex-shrink-0"
            style={{ padding: '14px 28px 18px', borderTop: '1px solid var(--rule)' }}>
            <button onClick={handleSave} disabled={saving} className="btn-primary"
              style={saved ? { color: 'var(--ink)' } : {}}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes →'}
            </button>
            {saveError && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{saveError}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
