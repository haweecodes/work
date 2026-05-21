import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Hash, Lock, MessageCircle, Kanban, LogOut, type LucideIcon } from 'lucide-react';
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

function SectionLabel({ children, icon: Icon, onAdd }: { children: React.ReactNode; icon?: LucideIcon; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="flex items-center gap-1.5" style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 500 }}>
        {Icon && <Icon size={11} />}
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

function NavItem({ to, label, title, unread = 0, icon: Icon }: {
  to: string; label: string; title?: string; unread?: number; icon?: LucideIcon;
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
          {Icon && (
            <Icon size={12} style={{ color: isActive ? 'var(--ink)' : 'var(--faint)', marginRight: 5, flexShrink: 0 }} />
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

/* ─── main component ─────────────────────────────────────── */

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const workspaces          = useWorkspaceStore(s => s.workspaces);
  const currentWorkspace    = useWorkspaceStore(s => s.currentWorkspace);
  const channels            = useWorkspaceStore(s => s.channels);
  const dmThreads           = useWorkspaceStore(s => s.dmThreads);
  const members             = useWorkspaceStore(s => s.members);
  const setCurrentWorkspace = useWorkspaceStore(s => s.setCurrentWorkspace);
  const addChannel          = useWorkspaceStore(s => s.addChannel);
  const fetchDmThreads      = useWorkspaceStore(s => s.fetchDmThreads);
  const boards              = useBoardStore(s => s.boards);
  const fetchBoards         = useBoardStore(s => s.fetchBoards);
  const openCreateBoard     = useUIStore(s => s.openCreateBoard);
  const openInvite          = useUIStore(s => s.openInvite);
  const openSettings        = useUIStore(s => s.openSettings);
  const isAdmin             = useWorkspaceStore(s => s.isAdmin);
  const channelUnread       = useUIStore(s => s.channelUnread);
  const dmUnread            = useUIStore(s => s.dmUnread);
  const activeSidebar       = useUIStore(s => s.activeSidebar);
  const openSidebar         = useUIStore(s => s.openSidebar);
  const closeSidebar        = useUIStore(s => s.closeSidebar);
  const notifUnread         = useNotificationStore(s => s.unreadCount);
  const showNotif = activeSidebar?.type === 'notifications';
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);

  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const memberThreadMap = useMemo(() => {
    const map = new Map<string, DmThread>();
    dmThreads.forEach(t => {
      const other = t.participants?.find(p => p.id !== user?.id);
      if (other) map.set(other.id, t);
    });
    return map;
  }, [dmThreads, user?.id]);

  const handleAddChannel = useCallback(async (e: React.FormEvent) => {
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
  }, [newChannelName, currentWorkspace, isPrivate, addChannel, navigate]);

  const handleSwitchWorkspace = useCallback(async (ws: Workspace) => {
    if (ws.id === currentWorkspace?.id) { setShowWorkspaces(false); return; }
    setShowWorkspaces(false);
    setAddingChannel(false);
    setNewChannelName('');
    await setCurrentWorkspace(ws);
    await fetchBoards(ws.id);
    navigate('/');
  }, [currentWorkspace?.id, setCurrentWorkspace, fetchBoards, navigate]);

  const handleStartDM = useCallback(async (memberId: string) => {
    if (!user || memberId === user.id || !currentWorkspace) return;
    const { data } = await client.post<DmThread>('/api/dms/threads', {
      workspace_id: currentWorkspace.id,
      other_user_id: memberId,
    });
    await fetchDmThreads(currentWorkspace.id);
    navigate(`/dm/${data.id}`);
    onClose?.();
  }, [user, currentWorkspace, fetchDmThreads, navigate, onClose]);

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
          <SectionLabel icon={Hash} onAdd={() => setAddingChannel(true)}>Channels</SectionLabel>

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
                {isPrivate ? <><Lock className="inline w-3 h-3 mr-1" />Private</> : <><Hash className="inline w-3 h-3 mr-1" />Public</>} — toggle
              </button>
            </form>
          )}

          <div className="space-y-0">
            {channels.map(ch => (
              <NavItem
                key={ch.id}
                to={`/channel/${ch.id}`}
                icon={ch.is_private ? Lock : Hash}
                label={ch.name}
                unread={channelUnread[ch.id] || 0}
              />
            ))}
          </div>
        </section>

        {/* Direct Messages */}
        <section>
          <SectionLabel icon={MessageCircle}>Direct Messages</SectionLabel>

          <div className="space-y-0">
            {members.filter(m => m.id !== user?.id).map(m => {
              const thread = memberThreadMap.get(m.id);
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
            <NavItem to="/docs" label="Docs" />
            <NavItem to="/calendar" label="Calendar" />
          </div>
        </section>

        {/* Boards */}
        <section>
          <SectionLabel icon={Kanban} onAdd={() => openCreateBoard()}>Boards</SectionLabel>
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

        {/* Settings — admins only */}
        {user && isAdmin(user.id) && (
          <button
            onClick={() => openSettings()}
            className="w-full text-left py-1"
            style={{ fontSize: 13, color: 'var(--muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
          >
            Settings
          </button>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => showNotif ? closeSidebar() : openSidebar({ type: 'notifications' })}
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
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
