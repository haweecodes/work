import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useBoardStore from '../store/boardStore';

export default function TaskRedirect() {
  const { taskKey } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  const { setCurrentWorkspace, fetchWorkspaces } = useWorkspaceStore();

  useEffect(() => {
    async function resolve() {
      if (!taskKey) return;
      try {
        const currentWorkspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        const qs = currentWorkspaceId ? `?workspace_id=${currentWorkspaceId}` : '';
        const { data } = await client.get(`/api/tasks/resolve/${taskKey}${qs}`);
        
        // 1. Ensure we have the target workspace selected
        const workspaces = await fetchWorkspaces(); // get latest list
        const targetWs = workspaces.find(w => w.id === data.workspace_id);
        if (targetWs) {
          useWorkspaceStore.getState().setCurrentWorkspace(targetWs);
          await useBoardStore.getState().fetchBoards(targetWs.id);
        }

        // 2. Redirect to the board with the specified taskKey
        navigate(`/board/${data.board_id}?taskKey=${taskKey.toUpperCase()}`, { replace: true });
        
      } catch (err) {
        setError(true);
      }
    }
    resolve();
  }, [taskKey, navigate, fetchWorkspaces, setCurrentWorkspace]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-800">
        <h2 className="text-xl font-bold mb-2">Task Not Found</h2>
        <p className="text-gray-500 mb-6">The task URL you followed doesn't exist or you don't have access.</p>
        <button 
          onClick={() => navigate('/', { replace: true })}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-gray-500 animate-pulse">Locating {taskKey}...</p>
      </div>
    </div>
  );
}
