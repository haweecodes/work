import { lazy, Suspense, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import useUIStore from '../store/uiStore';
import useBoardStore from '../store/boardStore';
import useAuthStore from '../store/authStore';
import NotificationPanel from './NotificationPanel';
import BoardUpdatesPanel from './BoardUpdatesPanel';
import TaskUpdatePanel from './TaskUpdatePanel';
import TaskTray from './TaskTray';
import ChannelInfoPanel from './ChannelInfoPanel';

const TaskDetailPanel = lazy(() => import('./TaskDetailPanel'));
const ThreadPanel     = lazy(() => import('./ThreadPanel'));
const ShareModal      = lazy(() => import('./ShareModal'));

const SIDEBAR_STYLE: React.CSSProperties = {
  position: 'fixed',
  right: 0,
  top: 0,
  height: '100vh',
  width: 380,
  zIndex: 200,
  background: 'var(--paper)',
  borderLeft: '1px solid var(--rule)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const SKELETON = (
  <div className="animate-pulse p-6 space-y-3">
    <div className="h-4 bg-gray-200 rounded w-3/4" />
    <div className="h-3 bg-gray-100 rounded w-1/2" />
  </div>
);

export default function RightSidebarPanel() {
  const activeSidebar  = useUIStore(s => s.activeSidebar);
  const closeSidebar   = useUIStore(s => s.closeSidebar);
  const openShareModal = useUIStore(s => s.openShareModal);
  const closeShareModal = useUIStore(s => s.closeShareModal);
  const shareMessage   = useUIStore(s => s.shareMessage);
  const selectedTask   = useBoardStore(s => s.selectedTask);
  const boards         = useBoardStore(s => s.boards);
  const columns        = useBoardStore(s => s.columns);
  const user = useAuthStore(s => s.user);
  const [, setSearchParams] = useSearchParams();

  // Clear ?taskKey from URL when a non-task panel opens so BoardView's
  // searchParams effect can't re-select the task while the panel is open.
  useEffect(() => {
    if (activeSidebar) setSearchParams({}, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSidebar?.type]);

  const showNotifications = activeSidebar?.type === 'notifications';
  const showUpdates       = activeSidebar?.type === 'board-updates';
  const showThread        = activeSidebar?.type === 'thread';
  const showTasks         = activeSidebar?.type === 'tasks';
  const showTaskUpdates   = activeSidebar?.type === 'task-updates';
  const showChannelInfo   = activeSidebar?.type === 'channel-info';
  // Task detail shows only when no other panel has been explicitly opened.
  const showTask = !!selectedTask && !showNotifications && !showUpdates && !showThread && !showTasks && !showTaskUpdates && !showChannelInfo;

  if (!showTask && !showNotifications && !showUpdates && !showThread && !showTasks && !showTaskUpdates && !showChannelInfo) return null;

  return (
    <>
      {/* Transparent backdrop — only for non-task panels so clicking away closes them */}
      {activeSidebar && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 199 }}
          onClick={closeSidebar}
        />
      )}
      <div className="animate-slide-in" style={SIDEBAR_STYLE}>
        {showTask && (
          <Suspense fallback={SKELETON}>
            <TaskDetailPanel />
          </Suspense>
        )}
        {showNotifications && (
          <NotificationPanel onClose={closeSidebar} />
        )}
        {activeSidebar?.type === 'board-updates' && (
          <BoardUpdatesPanel
            boardId={activeSidebar.boardId}
            canRequest={activeSidebar.canRequest}
            onClose={closeSidebar}
          />
        )}
        {activeSidebar?.type === 'thread' && (
          <Suspense fallback={SKELETON}>
            <ThreadPanel
              parentMessage={activeSidebar.message}
              channelId={activeSidebar.channelId}
              dmThreadId={activeSidebar.dmThreadId}
              onClose={closeSidebar}
              onCreateTask={() => {}}
              onShare={openShareModal}
              onMessageUpdated={() => {}}
              onMessageDeleted={() => {}}
            />
          </Suspense>
        )}
        {showTasks && (
          <TaskTray
            columns={columns}
            userId={user?.id ?? ''}
            boardId={boards[0]?.id}
            onClose={closeSidebar}
          />
        )}
        {showTaskUpdates && (
          <TaskUpdatePanel onClose={closeSidebar} />
        )}
        {showChannelInfo && activeSidebar?.type === 'channel-info' && (
          <ChannelInfoPanel channelId={activeSidebar.channelId} onClose={closeSidebar} />
        )}
      </div>

      {/* Global ShareModal — rendered outside the sidebar div so it stacks above it */}
      {shareMessage && (
        <Suspense fallback={null}>
          <ShareModal message={shareMessage} onClose={closeShareModal} />
        </Suspense>
      )}
    </>
  );
}
