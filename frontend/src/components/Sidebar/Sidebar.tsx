import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, NavLink } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useWorkspaceStore from '../../store/workspaceStore';
import useBoardStore from '../../store/boardStore';
import useUIStore from '../../store/uiStore';
import useNotificationStore from '../../store/notificationStore';
import NotificationPanel from '../NotificationPanel';
import client from '../../api/client';
import type { Workspace, Channel, DmThread } from '../../types';

/* ─── helpers ────────────────────────────────────────────── */

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-auto flex-shrink-0"
      style={{
        fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        color: 'var(--paper)', background: 'var(--ink)',
        minWidth: 18, height: 18,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 5px',
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SectionLabel({ children, onAdd }: { children: React.ReactNode; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 500 }}>
        {children}
      </span>
      {onAdd && (
        <button onClick={onAdd} style={{ fontSize: 14, color: 'var(--faint)', lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}>
          +
        </button>
      )}
    </div>
  );
}

/* ─── nav item ───────────────────────────────────────────── */

function NavItem({ to, label, title, unread = 0, prefix }: {
  to: string; label: string; title?: string; unread?: number; prefix?: string;
}) {
  return (
    <NavLink
      to={to}
      title={title}
      className="flex items-center gap-0 py-0.5 w-full text-left"
      style={{ fontSize: 14, lineHeight: 1.5 }}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span style={{ display: 'inline-block', width: 6, height: 1, background: 'var(--ink)', marginRight: 6, verticalAlign: 'middle', transform: 'translateY(-2px)', flexShrink: 0 }} />
          )}
          {prefix && (
            <span style={{ color: isActive ? 'var(--ink)' : 'var(--faint)', marginRight: 3, fontSize: 13, flexShrink: 0 }}>{prefix}</span>
          )}
          <span
            className="truncate flex-1"
            style={{
              color: isActive ? 'var(--ink)' : unread > 0 ? 'var(--ink)' : 'var(--ink-2)',
              fontWeight: isActive || unread > 0 ? 600 : 400,
            }}
          >
            {label}
          </span>
          <UnreadBadge count={unread} />
        </>
      )}
    </NavLink>
  );
}

/* ─── icons ──────────────────────────────────────────────── */

const IconBoard = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
  </svg>
);
const IconSignOut = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

/* ─── main component ─────────────────────────────────────── */

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const {
    workspaces, currentWorkspace, channels, dmThreads, members,
    setCurrentWorkspace, addChannel, fetchDmThreads,
  } = useWorkspaceStore();
  const { boards, fetchBoards } = useBoardStore();
  const { openCreateBoard, openInvite, channelUnread, dmUnread } = useUIStore();
  const notifUnread = useNotificationStore(s => s.unreadCount);

  const [showNotif, setShowNotif] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);

  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivate, setIsPrivate]         = useState(false);

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || !currentWorkspace) return;
    const { data } = await client.post<Channel>('/api/channels', {
      workspace_id: currentWorkspace.id,
      name: newChannelName.trim(),
      is_private: isPrivate,
    });
    addChannel(data);
    setNewChannelName('');
    setIsPrivate(false);
    setAddingChannel(false);
    navigate(`/channel/${data.id}`);
  };

  const handleSwitchWorkspace = async (ws: Workspace) => {
    if (ws.id === currentWorkspace?.id) { setShowWorkspaces(false); return; }
    setShowWorkspaces(false);
    setAddingChannel(false);
    setNewChannelName('');
    await setCurrentWorkspace(ws);
    await fetchBoards(ws.id);
    navigate('/');
  };

  const handleStartDM = async (memberId: string) => {
    if (!user || memberId === user.id || !currentWorkspace) return;
    const { data } = await client.post<DmThread>('/api/dms/threads', {
      workspace_id: currentWorkspace.id,
      other_user_id: memberId,
    });
    await fetchDmThreads(currentWorkspace.id);
    navigate(`/dm/${data.id}`);
    onClose?.();
  };

  return (
    <div
      className="h-full flex flex-col select-none overflow-hidden"
      style={{ width: 232, background: 'var(--paper)', borderRight: '1px solid var(--rule)' }}
    >
      {/* ── Workspace header ── */}
      <div className="relative px-5 pt-7 pb-6">
        <button
          onClick={() => setShowWorkspaces(!showWorkspaces)}
          className="w-full text-left"
        >
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 2 }}>
            {currentWorkspace?.name?.slice(0, 12) || 'Workspace'}
          </div>
          <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            {currentWorkspace?.name || 'FlowWork'}
          </div>
        </button>

        {showWorkspaces && (
          <div
            className="absolute left-5 right-5 top-full z-50 py-1 animate-fade-in"
            style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}
          >
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => handleSwitchWorkspace(ws)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
                style={{
                  fontSize: 14,
                  color: ws.id === currentWorkspace?.id ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: ws.id === currentWorkspace?.id ? 500 : 400,
                  background: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {ws.id === currentWorkspace?.id && (
                  <span style={{ display: 'inline-block', width: 6, height: 1, background: 'var(--ink)', flexShrink: 0, verticalAlign: 'middle', transform: 'translateY(-1px)' }} />
                )}
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
            <div style={{ borderTop: '1px solid var(--rule)', margin: '4px 0' }} />
            <button
              onClick={() => navigate('/workspace/create')}
              className="w-full px-3 py-2 text-left"
              style={{ fontSize: 13, color: 'var(--muted)', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.background = 'var(--paper-2)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
            >
              + New workspace
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable nav ── */}
      <div className="flex-1 overflow-y-auto px-5 space-y-6">

        {/* Channels */}
        <section>
          <SectionLabel onAdd={() => setAddingChannel(true)}>Channels</SectionLabel>

          {addingChannel && (
            <form onSubmit={handleAddChannel} className="mb-2 space-y-1">
              <input
                autoFocus
                style={{ fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--rule)', background: 'transparent', width: '100%', padding: '2px 0', outline: 'none' }}
                onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--ink)')}
                onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--rule)')}
                placeholder="channel-name"
                value={newChannelName}
                onChange={e => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                onKeyDown={e => { if (e.key === 'Escape') { setAddingChannel(false); setIsPrivate(false); } }}
              />
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setIsPrivate(p => !p)}
                style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em' }}
              >
                {isPrivate ? '🔒 Private' : '# Public'} — toggle
              </button>
            </form>
          )}

          <div className="space-y-0">
            {channels.map(ch => (
              <NavItem
                key={ch.id}
                to={`/channel/${ch.id}`}
                prefix={ch.is_private ? '🔒' : '#'}
                label={ch.name}
                unread={channelUnread[ch.id] || 0}
              />
            ))}
          </div>
        </section>

        {/* Direct Messages */}
        <section>
          <SectionLabel>Direct Messages</SectionLabel>

          <div className="space-y-0">
            {members.filter(m => m.id !== user?.id).map(m => {
              const thread = dmThreads.find(
                t => t.participants?.some(p => p.id === m.id) && t.participants?.some(p => p.id === user?.id),
              );
              const unread = thread ? (dmUnread[thread.id] || 0) : 0;

              const content = (isActive = false) => (
                <>
                  {isActive && (
                    <span style={{ display: 'inline-block', width: 6, height: 1, background: 'var(--ink)', marginRight: 6, verticalAlign: 'middle', transform: 'translateY(-2px)', flexShrink: 0 }} />
                  )}
                  <span
                    className="truncate flex-1"
                    style={{
                      fontSize: 14,
                      color: isActive ? 'var(--ink)' : unread > 0 ? 'var(--ink)' : 'var(--ink-2)',
                      fontWeight: isActive || unread > 0 ? 600 : 400,
                    }}
                  >
                    {m.name}
                  </span>
                  {/* DM unread: dot (personal signal) not a count */}
                  {unread > 0 && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink)', flexShrink: 0, display: 'inline-block' }} />
                  )}
                </>
              );

              return thread ? (
                <NavLink
                  key={thread.id}
                  to={`/dm/${thread.id}`}
                  title={m.email}
                  className="flex items-center py-0.5 w-full"
                >
                  {({ isActive }) => content(isActive)}
                </NavLink>
              ) : (
                <button
                  key={m.id}
                  onClick={() => handleStartDM(m.id)}
                  className="flex items-center py-0.5 w-full text-left"
                  style={{ fontSize: 14, color: 'var(--ink-2)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-2)')}
                >
                  {content()}
                </button>
              );
            })}

            {members.filter(m => m.id !== user?.id).length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>No teammates yet</p>
            )}
          </div>
        </section>

        {/* Workspace tools */}
        <section>
          <SectionLabel>Workspace</SectionLabel>
          <div className="space-y-0">
            <NavItem to="/docs"     label="Docs" />
            <NavItem to="/calendar" label="Calendar" />
          </div>
        </section>

        {/* Boards */}
        <section>
          <SectionLabel onAdd={() => openCreateBoard()}>Boards</SectionLabel>
          <div className="space-y-0">
            {boards.map(b => (
              <NavItem key={b.id} to={`/board/${b.id}`} label={b.name} />
            ))}
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--rule)' }}>
        {/* Invite */}
        <button
          onClick={() => openInvite()}
          className="w-full text-left py-1"
          style={{ fontSize: 13, color: 'var(--muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
        >
          Invite teammates
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotif(v => !v)}
            className="w-full flex items-center justify-between py-1"
            style={{ fontSize: 13, color: notifUnread > 0 ? 'var(--ink)' : 'var(--muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = notifUnread > 0 ? 'var(--ink)' : 'var(--muted)')}
          >
            <span>Notifications</span>
            {notifUnread > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                color: 'var(--paper)', background: 'var(--danger)',
                minWidth: 18, height: 18,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 5px',
              }}>
                {notifUnread > 9 ? '9+' : notifUnread}
              </span>
            )}
          </button>
          {showNotif && createPortal(
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                onClick={() => setShowNotif(false)}
              />
              <div style={{
                position: 'fixed', right: 0, top: 0, height: '100vh', width: 360, zIndex: 200,
                background: '#FFFFFF', borderLeft: '1px solid #E5E3DD',
                boxShadow: '-4px 0 24px rgba(23,23,27,0.10)',
                display: 'flex', flexDirection: 'column',
                animation: 'slideIn 0.18s ease-out forwards',
              }}>
                <NotificationPanel onClose={() => setShowNotif(false)} />
              </div>
            </>,
            document.body
          )}
        </div>

        {/* User row */}
        <div className="flex items-center justify-between pt-3 mt-1" style={{ borderTop: '1px solid var(--rule-2)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <img src={user?.avatar_url} className="w-5 h-5 rounded-full flex-shrink-0" alt={user?.name} />
            <span className="truncate" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
              {user?.name}
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2D8A4F', flexShrink: 0, display: 'inline-block' }} />
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            title="Sign out"
            style={{ color: 'var(--faint)', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}
          >
            <IconSignOut />
          </button>
        </div>
      </div>
    </div>
  );
}
