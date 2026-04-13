import { useEffect, useState, lazy, Suspense } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import useNotificationStore from '../store/notificationStore';
import useBoardStore from '../store/boardStore';
import useUIStore from '../store/uiStore';
import Sidebar from '../components/Sidebar/Sidebar';

// Only loaded when user opens a task — keeps initial bundle smaller
const TaskDetailPanel = lazy(() => import('../components/TaskDetailPanel'));
const InviteModal     = lazy(() => import('../components/InviteModal'));
const CreateBoardModal = lazy(() => import('../components/CreateBoardModal'));

export default function AppLayout() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { currentWorkspace, fetchWorkspaces, setCurrentWorkspace } = useWorkspaceStore();
  const { fetchNotifications } = useNotificationStore();
  const { fetchBoards } = useBoardStore();
  const selectedTask = useBoardStore(s => s.selectedTask);
  const { showInvite, closeInvite, showCreateBoard, closeCreateBoard } = useUIStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Clear the task detail drawer whenever the user navigates to a different route.
  // Without this, selectedTask persists in the global store and the drawer lingers
  // (and flickers) across channel/DM/board page transitions.
  useEffect(() => {
    const { setSelectedTask } = useBoardStore.getState();
    setSelectedTask(null);
  }, [location.pathname]);

  useEffect(() => {
    (async () => {
      const workspaces = await fetchWorkspaces();
      let ws = currentWorkspace;
      
      if (!ws && workspaces.length === 0) { 
        useWorkspaceStore.setState({ isInitialized: true });
        navigate('/workspace/create'); 
        return; 
      }
      
      if (!ws && workspaces.length > 0) ws = workspaces[0];
      
      if (ws) {
        await setCurrentWorkspace(ws);
        await fetchBoards(ws.id);
      }

      
      useWorkspaceStore.setState({ isInitialized: true });
    })();
  }, []);

  useEffect(() => {
    if (user) fetchNotifications(user.id);
  }, [user?.id]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-30 md:z-auto h-full
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="flex md:hidden items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-semibold text-sm text-gray-900">FlowWork</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>

      {/* Task detail panel — sidebar on desktop, full-screen overlay on mobile */}
      {selectedTask && (
        <>
          {/* Desktop: sidebar panel */}
          <div className="hidden lg:block w-96 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto animate-slide-in">
            <Suspense fallback={<div className="animate-pulse p-6 space-y-3"><div className="h-4 bg-gray-200 rounded w-3/4" /><div className="h-3 bg-gray-100 rounded w-1/2" /></div>}>
              <TaskDetailPanel />
            </Suspense>
          </div>

          {/* Mobile: full-screen overlay (z-40 sits above thread panel z-10) */}
          <div className="lg:hidden fixed inset-0 z-40 bg-white flex flex-col animate-slide-in">
            {/* Mobile close bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <button
                onClick={() => useBoardStore.getState().setSelectedTask(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="font-semibold text-sm text-gray-900 truncate">
                {selectedTask.task_key ? `${selectedTask.task_key} ` : ''}
                {selectedTask.title}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Suspense fallback={<div className="animate-pulse p-6 space-y-3"><div className="h-4 bg-gray-200 rounded w-3/4" /><div className="h-3 bg-gray-100 rounded w-1/2" /></div>}>
                <TaskDetailPanel />
              </Suspense>
            </div>
          </div>
        </>
      )}

      {/* Global modals */}
      {showInvite && (
        <Suspense fallback={null}>
          <InviteModal onClose={closeInvite} />
        </Suspense>
      )}
      {showCreateBoard && (
        <Suspense fallback={null}>
          <CreateBoardModal onClose={closeCreateBoard} />
        </Suspense>
      )}
    </div>
  );
}
