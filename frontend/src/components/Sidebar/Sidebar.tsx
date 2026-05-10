import { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useWorkspaceStore from '../../store/workspaceStore';
import useBoardStore from '../../store/boardStore';
import useUIStore from '../../store/uiStore';
import useNotificationStore from '../../store/notificationStore';
import NotificationPanel from '../NotificationPanel';
import client from '../../api/client';
import type { Workspace, Channel, DmThread } from '../../types';

/* ─── tiny helpers ───────────────────────────────────────────────────── */

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-auto flex-shrink-0 min-w-[16px] h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1"
      style={{ background: '#D97706' }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-dm text-[10px] font-semibold uppercase tracking-widest select-none"
      style={{ color: 'rgba(255,255,255,0.28)' }}
    >
      {children}
    </span>
  );
}

function PlusBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-0.5 rounded transition-colors"
      style={{ color: 'rgba(255,255,255,0.3)' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  );
}

/* ─── nav item ───────────────────────────────────────────────────────── */

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  title?: string;
  unread?: number;
}

function NavItem({ to, icon, label, title, unread = 0 }: NavItemProps) {
  return (
    <NavLink
      to={to}
      title={title}
      className={({ isActive }) =>
        [
          'group flex items-center gap-2 px-2 py-[5px] rounded-md text-[13px] font-dm transition-all duration-100',
          isActive
            ? 'font-medium'
            : 'hover:bg-[rgba(255,255,255,0.06)]',
        ].join(' ')
      }
      style={({ isActive }) =>
        isActive
          ? { background: 'rgba(124,58,237,0.18)', color: '#a78bfa' }
          : { color: 'rgba(255,255,255,0.65)' }
      }
    >
      {({ isActive }) => (
        <>
          <span
            className="flex-shrink-0 flex items-center justify-center w-4"
            style={{ color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.35)' }}
          >
            {icon}
          </span>
          <span className={`truncate flex-1 ${unread > 0 ? 'font-semibold' : 'font-normal'}`}
            style={{ color: unread > 0 && !isActive ? 'rgba(255,255,255,0.9)' : undefined }}
          >
            {label}
          </span>
          <UnreadBadge count={unread} />
        </>
      )}
    </NavLink>
  );
}

/* ─── icons ──────────────────────────────────────────────────────────── */

const IconHash = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
  </svg>
);
const IconLock = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);
const IconBoard = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
  </svg>
);
const IconArchive = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
  </svg>
);
const IconChevron = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);
const IconBell = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);
const IconInvite = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
  </svg>
);
const IconSignOut = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);
const IconDoc = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconCalendar = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

/* ─── bottom action button ───────────────────────────────────────────── */

function FooterBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-2 px-2 py-[5px] rounded-md text-[13px] font-dm transition-colors duration-100"
      style={{
        background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: hovered ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)',
      }}
    >
      <span className="flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}

/* ─── main component ─────────────────────────────────────────────────── */

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

  const [showNotif, setShowNotif]         = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivate, setIsPrivate]         = useState(false);

  /* handlers */
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
    setShowNotif(false);
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

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div
      className="w-60 h-full flex flex-col select-none font-dm"
      style={{
        background: '#111118',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* ── Workspace header ── */}
      <div
        className="relative px-3 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={() => setShowWorkspaces(!showWorkspaces)}
          className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-100"
          style={{ color: 'rgba(255,255,255,0.85)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {/* workspace avatar */}
          <div
            className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
            style={{ background: '#7C3AED' }}
          >
            {currentWorkspace?.name?.[0]?.toUpperCase() || 'F'}
          </div>
          <span className="flex-1 text-left text-[13px] font-semibold truncate">
            {currentWorkspace?.name || 'FlowWork'}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>
            <IconChevron />
          </span>
        </button>

        {/* workspace switcher dropdown */}
        {showWorkspaces && (
          <div
            className="absolute left-3 right-3 top-12 z-50 rounded-xl p-1.5 animate-fade-in"
            style={{
              background: '#1c1c26',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            }}
          >
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => handleSwitchWorkspace(ws)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] font-dm transition-colors"
                style={
                  ws.id === currentWorkspace?.id
                    ? { background: 'rgba(124,58,237,0.2)', color: '#c4b5fd' }
                    : { color: 'rgba(255,255,255,0.65)' }
                }
                onMouseEnter={e => {
                  if (ws.id !== currentWorkspace?.id)
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={e => {
                  if (ws.id !== currentWorkspace?.id)
                    e.currentTarget.style.background = 'transparent';
                }}
              >
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold"
                  style={{ background: '#7C3AED' }}
                >
                  {ws.name[0].toUpperCase()}
                </div>
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0' }} />
            <button
              onClick={() => navigate('/workspace/create')}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-dm transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New workspace
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable nav body ── */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-3">

        {/* Channels */}
        <section>
          <div className="flex items-center justify-between px-2 mb-0.5">
            <SectionLabel>Channels</SectionLabel>
            <PlusBtn onClick={() => setAddingChannel(true)} />
          </div>

          {addingChannel && (
            <form onSubmit={handleAddChannel} className="px-1 mb-1.5 space-y-1">
              <input
                autoFocus
                className="w-full px-2.5 py-1.5 rounded-md text-[12px] font-dm outline-none"
                placeholder="channel-name"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.85)',
                }}
                value={newChannelName}
                onChange={e => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                onBlur={() => { if (!newChannelName) { setAddingChannel(false); setIsPrivate(false); } }}
              />
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setIsPrivate(p => !p)}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-dm transition-colors"
                style={
                  isPrivate
                    ? { background: 'rgba(245,158,11,0.15)', color: 'rgb(251,191,36)', border: '1px solid rgba(245,158,11,0.25)' }
                    : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)' }
                }
              >
                {isPrivate ? (
                  <><IconLock />Private — invite only</>
                ) : (
                  <><IconHash />Public — all members</>
                )}
              </button>
            </form>
          )}

          <div className="space-y-px">
            {channels.map(ch => (
              <NavItem
                key={ch.id}
                to={`/channel/${ch.id}`}
                icon={ch.is_archived ? <IconArchive /> : ch.is_private ? <IconLock /> : <IconHash />}
                label={ch.name}
                unread={channelUnread[ch.id] || 0}
              />
            ))}
          </div>
        </section>

        {/* Direct Messages */}
        <section>
          <div className="flex items-center justify-between px-2 mb-0.5">
            <SectionLabel>Direct Messages</SectionLabel>
          </div>

          <div className="space-y-px">
            {members.filter(m => m.id !== user?.id).map(m => {
              const thread = dmThreads.find(
                t =>
                  t.participants?.some(p => p.id === m.id) &&
                  t.participants?.some(p => p.id === user?.id),
              );
              const hasUnread = thread ? (dmUnread[thread.id] || 0) > 0 : false;

              const inner = (isActive = false) => (
                <>
                  <img
                    src={m.avatar_url}
                    className="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-white/10"
                    alt={m.name}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className="truncate text-[13px] leading-tight"
                      style={{
                        fontWeight: hasUnread ? 600 : 400,
                        color: isActive
                          ? '#a78bfa'
                          : hasUnread
                          ? 'rgba(255,255,255,0.9)'
                          : 'rgba(255,255,255,0.65)',
                      }}
                    >
                      {m.name}
                    </span>
                    {m.email && (
                      <span
                        className="truncate text-[10px] leading-tight"
                        style={{ color: 'rgba(255,255,255,0.28)' }}
                      >
                        {m.email}
                      </span>
                    )}
                  </div>
                  {thread && <UnreadBadge count={dmUnread[thread.id] || 0} />}
                </>
              );

              return thread ? (
                <NavLink
                  key={thread.id}
                  to={`/dm/${thread.id}`}
                  title={m.email}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-2 px-2 py-[5px] rounded-md transition-all duration-100',
                      isActive ? '' : 'hover:bg-[rgba(255,255,255,0.06)]',
                    ].join(' ')
                  }
                  style={({ isActive }) =>
                    isActive ? { background: 'rgba(124,58,237,0.18)' } : {}
                  }
                >
                  {({ isActive }) => inner(isActive)}
                </NavLink>
              ) : (
                <button
                  key={m.id}
                  onClick={() => handleStartDM(m.id)}
                  title={m.email}
                  className="w-full flex items-center text-left gap-2 px-2 py-[5px] rounded-md transition-colors duration-100"
                  style={{ color: 'rgba(255,255,255,0.65)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {inner()}
                </button>
              );
            })}

            {members.filter(m => m.id !== user?.id).length === 0 && (
              <p
                className="text-[11px] px-2 py-1.5 italic font-dm"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              >
                No teammates yet
              </p>
            )}
          </div>
        </section>

        {/* Workspace tools */}
        <section>
          <div className="flex items-center justify-between px-2 mb-0.5">
            <SectionLabel>Workspace</SectionLabel>
          </div>
          <div className="space-y-px">
            <NavItem to="/docs"     icon={<IconDoc />}      label="Docs"     />
            <NavItem to="/calendar" icon={<IconCalendar />} label="Calendar" />
          </div>
        </section>

        {/* Boards */}
        <section>
          <div className="flex items-center justify-between px-2 mb-0.5">
            <SectionLabel>Boards</SectionLabel>
            <PlusBtn onClick={() => openCreateBoard()} />
          </div>
          <div className="space-y-px">
            {boards.map(b => (
              <NavItem
                key={b.id}
                to={`/board/${b.id}`}
                icon={<IconBoard />}
                label={b.name}
              />
            ))}
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <div
        className="px-2 py-2 space-y-px"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <FooterBtn icon={<IconInvite />} label="Invite teammates" onClick={() => openInvite()} />

        <div className="relative">
          <button
            onClick={() => setShowNotif(!showNotif)}
            className="w-full flex items-center gap-2 px-2 py-[5px] rounded-md text-[13px] font-dm transition-colors duration-100"
            style={{ color: notifUnread > 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span
              className="flex-shrink-0 w-4 flex items-center justify-center"
              style={{ color: notifUnread > 0 ? '#f87171' : 'inherit' }}
            >
              <IconBell />
            </span>
            <span className="flex-1 text-left">Notifications</span>
            {notifUnread > 0 && (
              <span
                className="ml-auto flex-shrink-0 min-w-[16px] h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1"
                style={{ background: '#f87171' }}
              >
                {notifUnread > 9 ? '9+' : notifUnread}
              </span>
            )}
          </button>

          {showNotif && (
            <div className="absolute bottom-10 left-0 right-0 z-50">
              <NotificationPanel onClose={() => setShowNotif(false)} />
            </div>
          )}
        </div>

        {/* User row */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 mt-0.5 rounded-md"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}
        >
          <img
            src={user?.avatar_url}
            className="w-6 h-6 rounded-full flex-shrink-0"
            alt={user?.name}
          />
          <span
            className="flex-1 text-[13px] font-dm font-medium truncate"
            style={{ color: 'rgba(255,255,255,0.75)' }}
          >
            {user?.name}
          </span>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="p-1 rounded transition-colors"
            title="Sign out"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            <IconSignOut />
          </button>
        </div>
      </div>
    </div>
  );
}
