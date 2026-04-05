import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import useWorkspaceStore from '../store/workspaceStore';
import useAuthStore from '../store/authStore';
import type { Message } from '../types';

interface ShareModalProps {
  message: Message;
  onClose: () => void;
}

type TargetType = 'channel' | 'dm';

export default function ShareModal({ message, onClose }: ShareModalProps) {
  const { channels, dmThreads } = useWorkspaceStore();
  const { user } = useAuthStore();
  const [targetType, setTargetType] = useState<TargetType>('channel');
  const [selectedId, setSelectedId] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Filter out archived channels
  const activeChannels = channels.filter(c => !c.is_archived);
  const dmOptions = dmThreads.map(t => ({
    id: t.id,
    label: t.participants?.filter(p => p.id !== user?.id).map(p => p.name).join(', ') || 'Direct Message',
    avatar: t.participants?.find(p => p.id !== user?.id)?.avatar_url,
  }));

  // Pre-select first option
  useEffect(() => {
    if (targetType === 'channel' && activeChannels.length > 0) {
      setSelectedId(activeChannels[0].id);
    } else if (targetType === 'dm' && dmOptions.length > 0) {
      setSelectedId(dmOptions[0].id);
    } else {
      setSelectedId('');
    }
  }, [targetType]);

  const handleShare = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError('');
    try {
      await client.post(`/api/channels/messages/${message.id}/share`, {
        target_channel_id: targetType === 'channel' ? selectedId : undefined,
        target_dm_thread_id: targetType === 'dm' ? selectedId : undefined,
        comment: comment.trim() || undefined,
      });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to share message.';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeInScale_0.15s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </div>
            <h2 className="font-semibold text-gray-900">Share Message</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Original message preview */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <img
                src={message.sender?.avatar_url}
                className="w-5 h-5 rounded-full"
                alt={message.sender?.name}
              />
              <span className="text-xs font-semibold text-gray-700">{message.sender?.name}</span>
              <span className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{message.content}</p>
          </div>

          {/* Target type toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Share to
            </label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => { setTargetType('channel'); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                  targetType === 'channel'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                Channel
              </button>
              <button
                type="button"
                onClick={() => { setTargetType('dm'); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                  targetType === 'dm'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Direct Message
              </button>
            </div>
          </div>

          {/* Target selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {targetType === 'channel' ? 'Select channel' : 'Select conversation'}
            </label>
            {targetType === 'channel' ? (
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="input w-full text-sm"
              >
                {activeChannels.length === 0 && <option value="">No channels available</option>}
                {activeChannels.map(c => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
            ) : (
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="input w-full text-sm"
              >
                {dmOptions.length === 0 && <option value="">No DMs available</option>}
                {dmOptions.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Optional comment */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Add a comment <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <textarea
              className="input w-full resize-none text-sm"
              rows={2}
              placeholder="Add context or a note..."
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-red-700 leading-snug">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={!selectedId || loading || done}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {done ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Shared!
                </>
              ) : loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
