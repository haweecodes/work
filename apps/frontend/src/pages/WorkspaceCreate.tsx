import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useWorkspaceStore from '../store/workspaceStore';
import client from '../api/client';
import type { Workspace } from '../types';

export default function WorkspaceCreate() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { setCurrentWorkspace } = useWorkspaceStore();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post<Workspace>('/api/workspaces', { name: name.trim() });
      await setCurrentWorkspace(data);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-500 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Create your workspace</h1>
          <p className="text-gray-500 mt-1 text-sm">Hi {user?.name}! Set up a place for your team.</p>
        </div>

        <div className="card p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">Workspace name</label>
              <input
                className="input" type="text" placeholder="e.g. Acme Corp, My Team..."
                value={name} onChange={e => setName(e.target.value)} required autoFocus
              />
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Creating…' : 'Create workspace →'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-gray-400">or join an existing one</span>
            </div>
          </div>

          <JoinByCode navigate={navigate} setCurrentWorkspace={setCurrentWorkspace} />
        </div>
      </div>
    </div>
  );
}

function JoinByCode({ navigate, setCurrentWorkspace }: { navigate: ReturnType<typeof useNavigate>, setCurrentWorkspace: (ws: Workspace) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const { data } = await client.post<Workspace>(`/api/workspaces/join/${code.trim()}`);
      await setCurrentWorkspace(data);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleJoin} className="flex gap-2">
      <input
        className="input flex-1" type="text" placeholder="Enter invite code"
        value={code} onChange={e => setCode(e.target.value)}
      />
      <button type="submit" className="btn-ghost border border-gray-200 whitespace-nowrap" disabled={loading}>
        {loading ? '...' : 'Join'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1 w-full">{error}</p>}
    </form>
  );
}
