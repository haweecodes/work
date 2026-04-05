import { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useWorkspaceStore from '../../store/workspaceStore';
import useBoardStore from '../../store/boardStore';
import useUIStore from '../../store/uiStore';
import NotificationPanel from '../NotificationPanel';
import client from '../../api/client';
import type { Workspace, Channel, DmThread } from '../../types';

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function NavItem({ to, icon, label, unread = 0 }: { to: string, icon: React.ReactNode, label: string, unread?: number }) {
  return (
    <NavLink to={to}
      className={({ isActive: active }) =>
        `flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors duration-100 group
         ${active ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
      }>
      <span className="text-gray-400 group-hover:text-gray-600 flex-shrink-0">{icon}</span>
      <span className={`truncate flex-1 ${unread > 0 ? 'font-semibold text-gray-900' : ''}`}>{label}</span>
      <UnreadBadge count={unread} />
    </NavLink>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { workspaces, currentWorkspace, channels, dmThreads, members, setCurrentWorkspace, addChannel, fetchDmThreads } = useWorkspaceStore();
  const { boards, fetchBoards, setCurrentBoard } = useBoardStore();
  const { openCreateBoard, openInvite, channelUnread, dmUnread } = useUIStore();
  const [showNotif, setShowNotif] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

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
      other_user_id: memberId
    });
    await fetchDmThreads(currentWorkspace.id);
    navigate(`/dm/${data.id}`);
    onClose?.();
  };

  return (
    <div className="w-64 h-full bg-white border-r border-gray-200 flex flex-col select-none">
      <div className="relative px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => setShowWorkspaces(!showWorkspaces)}
          className="w-full flex items-center gap-2.5 hover:bg-gray-50 rounded-lg p-1.5 -ml-1.5 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-primary-500 flex-shrink-0 flex items-center justify-center">
            <span className="text-white font-bold text-xs">
              {currentWorkspace?.name?.[0]?.toUpperCase() || 'F'}
            </span>
          </div>
          <span className="flex-1 text-left font-semibold text-sm text-gray-900 truncate">
            {currentWorkspace?.name || 'FlowWork'}
          </span>
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showWorkspaces && (
          <div className="absolute left-4 right-4 top-14 z-50 bg-white rounded-xl shadow-dropdown border border-gray-100 p-1.5 animate-fade-in">
            {workspaces.map(ws => (
              <button key={ws.id} onClick={() => handleSwitchWorkspace(ws)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
                  ${ws.id === currentWorkspace?.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50 text-gray-700'}`}
              >
                <div className="w-5 h-5 rounded-md bg-primary-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">{ws.name[0].toUpperCase()}</span>
                </div>
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button onClick={() => navigate('/workspace/create')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New workspace
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
        <section>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Channels</span>
            <button onClick={() => setAddingChannel(true)}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          {addingChannel && (
            <form onSubmit={handleAddChannel} className="px-2 mb-2 space-y-1.5">
              <input autoFocus className="input text-xs py-1.5" placeholder="channel-name"
                value={newChannelName} onChange={e => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                onBlur={() => { if (!newChannelName) { setAddingChannel(false); setIsPrivate(false); } }}
              />
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setIsPrivate(p => !p)}
                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors
                  ${isPrivate ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
              >
                {isPrivate ? (
                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>Private — invite only</>
                ) : (
                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>Public — all members</>                )}
              </button>
            </form>
          )}
          <div className="space-y-0.5">
            {channels.map(ch => (
              <NavItem key={ch.id} to={`/channel/${ch.id}`}
                icon={
                  ch.is_archived
                    ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                    : ch.is_private
                      ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      : <span className="text-sm font-light">#</span>
                }
                label={ch.name}
                unread={channelUnread[ch.id] || 0}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Direct Messages</span>
          </div>
          <div className="space-y-0.5">
            {members.filter(m => m.id !== user?.id).map(m => {
              const thread = dmThreads.find(t => t.participants?.some(p => p.id === m.id) && t.participants?.some(p => p.id === user?.id));
              return thread ? (
                <NavItem key={thread.id} to={`/dm/${thread.id}`}
                  icon={<img src={m.avatar_url} className="w-4 h-4 rounded-full" />}
                  label={m.name}
                  unread={dmUnread[thread.id] || 0}
                />
              ) : (
                <button key={m.id} onClick={() => handleStartDM(m.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                  <img src={m.avatar_url} className="w-4 h-4 rounded-full flex-shrink-0" />
                  <span className="truncate">{m.name}</span>
                </button>
              );
            })}
            {members.filter(m => m.id !== user?.id).length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-1.5 italic">No teammates yet</p>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Boards</span>
            <button onClick={() => openCreateBoard()}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <div className="space-y-0.5">
            {boards.map(b => (
              <NavItem key={b.id} to={`/board/${b.id}`}
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                  </svg>
                }
                label={b.name}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="border-t border-gray-100 p-2 space-y-0.5">
        <button onClick={() => openInvite()}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Invite teammates
        </button>

        <div className="relative">
          <button onClick={() => setShowNotif(!showNotif)}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Notifications
          </button>
          {showNotif && (
            <div className="absolute bottom-10 left-0 right-0 z-50">
              <NotificationPanel onClose={() => setShowNotif(false)} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 px-3 py-2 mt-1">
          <img src={user?.avatar_url} className="w-6 h-6 rounded-full flex-shrink-0" />
          <span className="flex-1 text-sm text-gray-700 font-medium truncate">{user?.name}</span>
          <button onClick={() => { logout(); navigate('/login'); }}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Sign out">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  );
}
