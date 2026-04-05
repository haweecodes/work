import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';

interface WorkspacePreview {
  id: string;
  name: string;
}

export default function JoinWorkspace() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  
  const [workspace, setWorkspace] = useState<WorkspacePreview | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const fetchWorkspaceInfo = async () => {
      try {
        const response = await client.get(`/api/workspaces/join/${code}`);
        setWorkspace(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load workspace information');
      } finally {
        setLoading(false);
      }
    };

    if (code) {
      fetchWorkspaceInfo();
    }
  }, [code]);

  const handleJoin = async () => {
    if (!token) return;
    setJoining(true);
    setError('');
    
    try {
      await client.post(`/api/workspaces/join/${code}`);
      await fetchWorkspaces();
      navigate('/');
    } catch (err: any) {
      if (err.response?.status === 409) {
        // Already a member! Just refresh workspaces and go home.
        await fetchWorkspaces();
        navigate('/');
      } else {
        setError(err.response?.data?.error || 'Failed to join workspace');
        setJoining(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="animate-pulse flex items-center gap-2 text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm font-medium">Loading invitation...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-100 text-primary-600 mb-4 shadow-sm border border-primary-200">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">
          Join Workspace
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-card sm:rounded-2xl sm:px-10 border border-gray-100 animate-slide-in">
          
          {error && !workspace ? (
            <div className="text-center space-y-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                {error}
              </div>
              <Link to="/" className="block text-sm font-medium text-primary-600 hover:text-primary-500">
                Return home
              </Link>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-500 font-medium mb-1">
                  {error === 'Already a member' ? 'You are already a member of' : 'You\'ve been invited to join'}
                </p>
                <div className="text-xl font-semibold text-gray-900">{workspace?.name}</div>
              </div>

              {error && error !== 'Already a member' && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 text-left">
                  {error}
                </div>
              )}

              {token ? (
                error === 'Already a member' ? (
                  <Link
                    to="/"
                    className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all"
                  >
                    Open Workspace
                  </Link>
                ) : (
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {joining ? 'Joining Workspace...' : `Join ${workspace?.name}`}
                  </button>
                )
              ) : (
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-gray-500 bg-orange-50 p-3 rounded-lg border border-orange-100">
                    You need to be logged in to accept this invitation.
                  </p>
                  <div className="flex gap-3">
                    <Link
                      to={`/login?redirect=/join/${code}`}
                      className="flex-1 flex justify-center py-2.5 px-4 border border-gray-300 rounded-xl shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all text-center"
                    >
                      Log in
                    </Link>
                    <Link
                      to={`/register?redirect=/join/${code}`}
                      className="flex-1 flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all text-center"
                    >
                      Sign up
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
