import { lazy, Suspense, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import useUIStore from '../store/uiStore';
import useBoardStore from '../store/boardStore';
import useAuthStore from '../store/authStore';
import NotificationPanel from './NotificationPanel';
import BoardUpdatesPanel from './BoardUpdatesPanel';
import TaskTray from './TaskTray';
import PipelinePanel from './PipelinePanel';

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
  const { activeSidebar, closeSidebar, openShareModal, closeShareModal, shareMessage,
          pipelineDeals, addPipelineDeal } = useUIStore();
  const selectedTask = useBoardStore(s => s.selectedTask);
  const { boards, columns } = useBoardStore();
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
  const showPipeline      = activeSidebar?.type === 'pipeline';
  // Task detail shows only when no other panel has been explicitly opened.
  const showTask = !!selectedTask && !showNotifications && !showUpdates && !showThread && !showTasks && !showPipeline;

  if (!showTask && !showNotifications && !showUpdates && !showThread && !showTasks && !showPipeline) return null;

  return (
    <>
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
        {showPipeline && (
          <PipelinePanel
            deals={pipelineDeals}
            onAddDeal={() => addPipelineDeal({
              id: `p-${Date.now()}`,
              company: 'New Opportunity',
              detail: 'Detected from conversation',
              value: 'TBD',
              prob: 'New lead',
              stage: 'lead',
            })}
            onClose={closeSidebar}
          />
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
