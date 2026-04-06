import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import useAuthStore from './store/authStore';
import useWorkspaceStore from './store/workspaceStore';
import useBoardStore from './store/boardStore';
import type { ReactNode } from 'react';
import { MessageListSkeleton, BoardSkeleton } from './components/Skeleton';

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
const LoginPage       = lazy(() => import('./pages/Auth/LoginPage'));
const RegisterPage    = lazy(() => import('./pages/Auth/RegisterPage'));
const WorkspaceCreate = lazy(() => import('./pages/WorkspaceCreate'));
const AppLayout       = lazy(() => import('./layouts/AppLayout'));
const ChannelView     = lazy(() => import('./pages/ChannelView'));
const DMView          = lazy(() => import('./pages/DMView'));
const BoardView       = lazy(() => import('./pages/BoardView'));
const JoinWorkspace   = lazy(() => import('./pages/JoinWorkspace'));
const TaskRedirect    = lazy(() => import('./pages/TaskRedirect'));

// ── Fallbacks ─────────────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}

function ChannelLoader() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="px-6 py-3.5 border-b border-gray-200 bg-white">
        <div className="animate-pulse space-y-1">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-3 w-20 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <MessageListSkeleton count={8} />
      </div>
    </div>
  );
}

function BoardLoader() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3.5 border-b border-gray-200 bg-white">
        <div className="animate-pulse space-y-1">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="flex-1 overflow-x-auto">
        <BoardSkeleton columns={3} />
      </div>
    </div>
  );
}

// ── Guards ────────────────────────────────────────────────────────────────────

function PrivateRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore(s => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <Routes>
          <Route path="/login" element={
            <Suspense fallback={<PageLoader />}><LoginPage /></Suspense>
          } />
          <Route path="/register" element={
            <Suspense fallback={<PageLoader />}><RegisterPage /></Suspense>
          } />
          <Route path="/join/:code" element={
            <Suspense fallback={<PageLoader />}><JoinWorkspace /></Suspense>
          } />
          <Route path="/workspace/create" element={
            <PrivateRoute>
              <Suspense fallback={<PageLoader />}><WorkspaceCreate /></Suspense>
            </PrivateRoute>
          } />
          
          {/* Deep link short router */}
          <Route path="/t/:taskKey" element={
            <PrivateRoute>
              <Suspense fallback={<PageLoader />}><TaskRedirect /></Suspense>
            </PrivateRoute>
          }/>

          {/* App shell */}
          <Route path="/" element={
            <PrivateRoute>
              <Suspense fallback={<PageLoader />}>
                <AppLayout />
              </Suspense>
            </PrivateRoute>
          }>
            <Route index element={<DefaultRedirect />} />
            <Route path="channel/:channelId" element={
              <Suspense fallback={<ChannelLoader />}><ChannelView /></Suspense>
            } />
            <Route path="dm/:threadId" element={
              <Suspense fallback={<ChannelLoader />}><DMView /></Suspense>
            } />
            <Route path="board/:boardId" element={
              <Suspense fallback={<BoardLoader />}><BoardView /></Suspense>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SocketProvider>
    </BrowserRouter>
  );
}

function DefaultRedirect() {
  const isInitialized = useWorkspaceStore(s => s.isInitialized);
  const channels = useWorkspaceStore(s => s.channels);
  const boards = useBoardStore(s => s.boards);

  if (!isInitialized) return null;
  if (channels.length > 0) return <Navigate to={`/channel/${channels[0].id}`} replace />;
  if (boards.length > 0) return <Navigate to={`/board/${boards[0].id}`} replace />;
  return <Navigate to="/workspace/create" replace />;
}
