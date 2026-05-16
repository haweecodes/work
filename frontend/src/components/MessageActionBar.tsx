import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import EmojiPicker from './EmojiPicker';
import type { Message, Reaction } from '../types';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '✅', '👀'];

// ── Quick emoji strip — portal-based so it never clips against container edges ─
function QuickEmojiStrip({
  anchorRef,
  onSelect,
  onMoreClick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (emoji: string) => void;
  onMoreClick: () => void;
  onClose: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const strip = stripRef.current;
    if (!anchor || !strip) return;

    const compute = () => {
      const ar = anchor.getBoundingClientRect();
      const sr = strip.getBoundingClientRect();
      const gap = 6;

      // Prefer above the anchor; if no room, go below
      let top = ar.top - sr.height - gap;
      if (top < 8) top = ar.bottom + gap;

      // Align right edge of strip with right edge of anchor; clamp to viewport
      let left = ar.right - sr.width;
      if (left + sr.width > window.innerWidth - 8) left = window.innerWidth - sr.width - 8;
      if (left < 8) left = 8;

      setPos({ top, left });
    };

    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [anchorRef]);

  // Close on outside click or scroll
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (stripRef.current && !stripRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const scroll = () => onClose();
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', scroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', scroll, { capture: true });
    };
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={stripRef}
      className="animate-fade-in"
      style={{
        position: 'fixed',
        top: pos ? pos.top : -9999,
        left: pos ? pos.left : -9999,
        opacity: pos ? 1 : 0,
        zIndex: 99999,
        display: 'flex',
        gap: 4,
        padding: 6,
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        pointerEvents: pos ? 'auto' : 'none',
      }}
    >
      {QUICK_EMOJIS.map(e => (
        <button
          key={e}
          type="button"
          tabIndex={-1}
          onClick={() => { onSelect(e); onClose(); }}
          style={{ fontSize: 18, width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s, background 0.1s' }}
          onMouseEnter={ev => { ev.currentTarget.style.background = '#F3F4F6'; ev.currentTarget.style.transform = 'scale(1.25)'; }}
          onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.transform = 'scale(1)'; }}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        tabIndex={-1}
        onClick={onMoreClick}
        title="More emojis"
        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}
        onMouseEnter={ev => (ev.currentTarget.style.background = '#F3F4F6')}
        onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}

interface MessageActionBarProps {
  msg: Message;
  onReply?: (msg: Message) => void;
  onShare?: (msg: Message) => void;
  onTask?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReactionToggle?: (messageId: string, reactions: Reaction[]) => void;
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
  reactions,
  onReactionsChange,
  onToggleReady,
  isOwn = false,
}: MessageActionBarProps) {
  const user = useAuthStore(s => s.user);
  const [showPicker, setShowPicker] = useState(false);
  const [showQuickEmoji, setShowQuickEmoji] = useState(false);
  const reactBtnRef = useRef<HTMLButtonElement>(null);   // anchor for quick strip
  const pickerAnchorRef = useRef<HTMLButtonElement>(null); // anchor for full picker

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
      setShowQuickEmoji(false);
      setShowPicker(false);
    }
  }, [reactions, user, msg.id, onReactionToggle, onReactionsChange]);

  useEffect(() => { onToggleReady?.(toggleReaction); }, [toggleReaction]);

  return (
    <div className="relative">
      {/* Quick emoji strip — portal-based, viewport-safe */}
      {showQuickEmoji && !showPicker && (
        <QuickEmojiStrip
          anchorRef={reactBtnRef}
          onSelect={toggleReaction}
          onMoreClick={() => { setShowPicker(true); setShowQuickEmoji(false); }}
          onClose={() => setShowQuickEmoji(false)}
        />
      )}

      {/* Full emoji picker portal */}
      {showPicker && (
        <EmojiPicker
          onSelect={toggleReaction}
          onClose={() => setShowPicker(false)}
          anchorRef={pickerAnchorRef}
        />
      )}

      {/* Floating action bar */}
      <div className="flex items-center gap-4"
        style={{ background: 'var(--paper)', paddingLeft: 8 }}>
        <ActionBtn ref={reactBtnRef} label="React"
          onClick={() => { setShowQuickEmoji(v => !v); setShowPicker(false); }}
          active={showQuickEmoji} />

        {onShare && <ActionBtn label="Share" onClick={() => onShare(msg)} />}
        {onTask   && <ActionBtn label="Task"  onClick={onTask} />}
        {onReply  && <ActionBtn label="Reply" onClick={() => onReply(msg)} />}

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
import { forwardRef } from 'react';

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
