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
  /** Icon-only mode — used in narrow contexts like ThreadPanel to prevent overflow */
  compact?: boolean;
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
  compact = false,
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
      <div
        className="flex items-center gap-0.5 rounded-lg border bg-white px-1 py-0.5"
        style={{
          borderColor: '#E5E7EB',
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        }}
      >
        {/* React — ref used as anchor for the quick strip */}
        <ActionBtn
          ref={reactBtnRef}
          label="React"
          hoverBg="#FEF9C3"
          hoverColor="#CA8A04"
          onClick={() => { setShowQuickEmoji(v => !v); setShowPicker(false); }}
          active={showQuickEmoji}
          compact={compact}
          icon={
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth={3} strokeLinecap="round" />
              <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth={3} strokeLinecap="round" />
            </svg>
          }
        />

        {/* Share */}
        {onShare && (
          <ActionBtn
            label="Share"
            hoverBg="#EFF6FF"
            hoverColor="#2563EB"
            onClick={() => onShare(msg)}
            compact={compact}
            icon={
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            }
          />
        )}

        {/* Task */}
        {onTask && (
          <ActionBtn
            label="Task"
            defaultColor="#0D9488"
            hoverBg="#F0FDFA"
            hoverColor="#0D9488"
            onClick={onTask}
            compact={compact}
            icon={
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                <path d="M14 2H2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V3a1 1 0 00-1-1zM6.5 10.5l-3-3 1-1 2 2 4-4 1 1-5 5z" />
              </svg>
            }
          />
        )}

        {/* Reply */}
        {onReply && (
          <ActionBtn
            label="Reply"
            hoverBg="#EDE9FE"
            hoverColor="#7C3AED"
            onClick={() => onReply(msg)}
            compact={compact}
            icon={
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            }
          />
        )}

        {/* Edit — own messages only */}
        {isOwn && onEdit && (
          <>
            <div className="w-px h-3.5 mx-0.5" style={{ background: '#E5E7EB' }} />
            <ActionBtn
              label="Edit"
              hoverBg="#F0F9FF"
              hoverColor="#0284C7"
              onClick={onEdit}
              compact={compact}
              icon={
                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
            />
            <ActionBtn
              label="Delete"
              hoverBg="#FEF2F2"
              hoverColor="#DC2626"
              onClick={onDelete ?? (() => {})}
              compact={compact}
              icon={
                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              }
            />
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
  icon: React.ReactNode;
  onClick: () => void;
  hoverBg: string;
  hoverColor: string;
  defaultColor?: string;
  active?: boolean;
  compact?: boolean;
}>(function ActionBtn({ label, icon, onClick, hoverBg, hoverColor, defaultColor = '#6B7280', active = false, compact = false }, ref) {
  const [hovered, setHovered] = useState(false);
  const isHighlighted = hovered || active;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={compact ? label : undefined}
      className={`flex items-center ${compact ? 'justify-center w-7 h-7' : 'gap-1 px-2 py-1'} rounded-md text-[12px] font-medium transition-all duration-100`}
      style={{
        background: isHighlighted ? hoverBg : 'transparent',
        color: isHighlighted ? hoverColor : defaultColor,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {icon}
      {!compact && label}
    </button>
  );
});
