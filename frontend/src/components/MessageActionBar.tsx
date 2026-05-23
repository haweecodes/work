import { useState, useRef, useCallback, useEffect, forwardRef } from 'react';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import EmojiPicker from './EmojiPicker';
import type { Message, Reaction } from '../types';

interface MessageActionBarProps {
  msg: Message;
  onReply?: (msg: Message) => void;
  onShare?: (msg: Message) => void;
  onTask?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReactionToggle?: (messageId: string, reactions: Reaction[]) => void;
  onAlert?: () => void;
  reactions: Reaction[];
  onReactionsChange: (reactions: Reaction[]) => void;
  onToggleReady?: (toggle: (emoji: string) => void) => void;
  isOwn?: boolean;
}

export default function MessageActionBar({
  msg,
  onReply,
  onShare,
  onTask,
  onEdit,
  onDelete,
  onReactionToggle,
  onAlert,
  reactions,
  onReactionsChange,
  onToggleReady,
  isOwn = false,
}: MessageActionBarProps) {
  const user = useAuthStore(s => s.user);
  const [showPicker, setShowPicker] = useState(false);
  const reactBtnRef = useRef<HTMLButtonElement>(null);

  const toggleReaction = useCallback(async (emoji: string) => {
    if (!user) return;

    const alreadyReacted = reactions.find(r => r.emoji === emoji)?.users.includes(user.id);
    const optimistic: Reaction[] = alreadyReacted
      ? reactions
          .map(r => r.emoji === emoji ? { ...r, count: r.count - 1, users: r.users.filter(u => u !== user.id) } : r)
          .filter(r => r.count > 0)
      : (() => {
          const existing = reactions.find(r => r.emoji === emoji);
          if (existing) return reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, users: [...r.users, user.id] } : r);
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
      setShowPicker(false);
    }
  }, [reactions, user, msg.id, onReactionToggle, onReactionsChange]);

  useEffect(() => { onToggleReady?.(toggleReaction); }, [toggleReaction]);

  return (
    <div className="relative">
      {showPicker && (
        <EmojiPicker
          onSelect={toggleReaction}
          onClose={() => setShowPicker(false)}
          anchorRef={reactBtnRef}
        />
      )}

      <div className="flex items-center gap-4"
        style={{ background: 'var(--paper)', paddingLeft: 8 }}>
        <ActionBtn ref={reactBtnRef} label="React"
          onClick={() => setShowPicker(v => !v)}
          active={showPicker} />

        {onAlert && <ActionBtn label="Alert" onClick={onAlert} />}
        {onShare && <ActionBtn label="Share" onClick={() => onShare(msg)} />}
        {onTask  && <ActionBtn label="Task"  onClick={onTask} />}
        {onReply && <ActionBtn label="Reply" onClick={() => onReply(msg)} />}

        {isOwn && onEdit && (
          <>
            <ActionBtn label="Edit"   onClick={onEdit} />
            <ActionBtn label="Delete" onClick={onDelete ?? (() => {})} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared button atom ────────────────────────────────────────────────────────
const ActionBtn = forwardRef<HTMLButtonElement, {
  label: string;
  onClick: () => void;
  active?: boolean;
}>(function ActionBtn({ label, onClick, active = false }, ref) {
  const [hovered, setHovered] = useState(false);
  const isHighlighted = hovered || active;
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: isHighlighted ? 'var(--ink)' : 'var(--muted)',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
});
