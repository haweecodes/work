import { useState } from 'react';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';

export default function InviteModal({ onClose }: { onClose: () => void }) {
  const { currentWorkspace } = useWorkspaceStore();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace?.id) return;
    setLoading(true);
    setError(''); setMessage('');
    try {
      await client.post(`/api/workspaces/${currentWorkspace.id}/invite`, { email });
      setMessage(`✓ ${email} has been added to the workspace`);
      setEmail('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to invite');
    } finally {
      setLoading(false);
    }
  };

  const inviteCode = currentWorkspace?.invite_code;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-panel w-full max-w-md p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900 text-lg">Invite teammates</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleInvite} className="space-y-3 mb-5">
          <div>
            <label className="label">Invite by email</label>
            <div className="flex gap-2">
              <input className="input flex-1" type="email" placeholder="colleague@example.com"
                value={email} onChange={e => setEmail(e.target.value)} />
              <button type="submit" className="btn-primary whitespace-nowrap" disabled={loading}>
                {loading ? '...' : 'Invite'}
              </button>
            </div>
          </div>
          {message && <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">{message}</p>}
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </form>

        <div className="pt-4 border-t border-gray-100">
          <label className="label">Shareable invite link</label>
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
            <code className="flex-1 text-xs text-gray-600 truncate">
              {window.location.origin}/join/{inviteCode}
            </code>
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${inviteCode}`)}
              className="text-xs text-primary-600 font-medium hover:underline whitespace-nowrap">
              Copy
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Anyone with this link can join the workspace</p>
        </div>
      </div>
    </div>
  );
}
