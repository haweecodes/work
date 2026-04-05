import { useState, useRef, useCallback, useEffect } from 'react';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import EmojiPicker from './EmojiPicker';
import type { Message, Reaction } from '../types';

interface MessageActionBarProps {
  msg: Message;
  onReply?: (msg: Message) => void;
  onShare?: (msg: Message) => void;
  onCreateTask: (msg: Message) => void;
  onReactionToggle?: (messageId: string, reactions: Reaction[]) => void;
  depth?: number;
  /** Current effective reactions (kept in sync by parent) */
  reactions: Reaction[];
  onReactionsChange: (reactions: Reaction[]) => void;
  /** Called on mount to hand the toggleReaction fn up to the parent (for reaction pill clicks) */
  onToggleReady?: (toggle: (emoji: string) => void) => void;
}

export default function MessageActionBar({
  msg,
  onReply,
  onShare,
  onCreateTask,
  onReactionToggle,
  depth = 0,
  reactions,
  onReactionsChange,
  onToggleReady,
}: MessageActionBarProps) {
  const user = useAuthStore(s => s.user);
  const [showPicker, setShowPicker] = useState(false);
  const [pendingEmoji, setPendingEmoji] = useState<string | null>(null);
  const pickerAnchorRef = useRef<HTMLButtonElement>(null);

  const toggleReaction = useCallback(async (emoji: string) => {
    if (!user) return;
    setPendingEmoji(emoji);

    const alreadyReacted = reactions.find(r => r.emoji === emoji)?.users.includes(user.id);
    const optimistic: Reaction[] = alreadyReacted
      ? reactions
          .map(r => r.emoji === emoji ? { ...r, count: r.count - 1, users: r.users.filter(u => u !== user.id) } : r)
          .filter(r => r.count > 0)
      : (() => {
          const existing = reactions.find(r => r.emoji === emoji);
          if (existing) {
            return reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, users: [...r.users, user.id] } : r);
          }
          return [...reactions, { emoji, count: 1, users: [user.id] }];
        })();

    onReactionsChange(optimistic);
    onReactionToggle?.(msg.id, optimistic);

    try {
      const { data } = await client.post<Reaction[]>(`/api/channels/messages/${msg.id}/reactions`, { emoji });
      onReactionsChange(data);
      onReactionToggle?.(msg.id, data);
    } catch {
      onReactionsChange(reactions);
    } finally {
      setPendingEmoji(null);
      setShowPicker(false);
    }
  }, [reactions, user, msg.id, onReactionToggle, onReactionsChange]);

  // Hand the toggle fn to the parent so reaction pills can call it
  useEffect(() => { onToggleReady?.(toggleReaction); }, [toggleReaction]);

  return (
    <div
      className={`
        ml-auto flex items-center gap-0.5
        opacity-0 group-hover:opacity-100
        bg-white border border-gray-200 rounded-lg shadow-sm
        px-1 py-0.5
        transition-all duration-150
        ${showPicker ? 'opacity-100' : ''}
      `}
    >
      {/* Emoji reaction */}
      <div className="relative">
        <button
          ref={pickerAnchorRef}
          type="button"
          onClick={() => setShowPicker(p => !p)}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-yellow-500 transition-colors"
          title="Add reaction"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        {showPicker && (
          <EmojiPicker
            onSelect={toggleReaction}
            onClose={() => setShowPicker(false)}
            anchorRef={pickerAnchorRef}
          />
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-3.5 bg-gray-200 mx-0.5" />

      {/* Reply */}
      {onReply && (
        <button
          onClick={() => onReply(msg)}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
          title={depth === 0 ? 'Reply in thread' : 'Reply to this'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
      )}

      {/* Share */}
      {onShare && (
        <button
          onClick={() => onShare(msg)}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-green-600 transition-colors"
          title="Share message"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>
      )}

      {/* Divider */}
      <div className="w-px h-3.5 bg-gray-200 mx-0.5" />

      {/* Convert to task */}
      <button
        onClick={() => onCreateTask(msg)}
        className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
        title="Convert to task"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </button>
    </div>
  );
}
