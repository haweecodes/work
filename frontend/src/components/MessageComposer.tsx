import { useRef, forwardRef, useImperativeHandle } from 'react';

/* ─── Icons ──────────────────────────────────────────────────────────────── */

const SendIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

/* ─── Auto-resize helper ──────────────────────────────────────────────────── */

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface MessageComposerHandle {
  /** Imperatively focus the textarea (used by ThreadPanel) */
  focus: () => void;
}

type Variant = 'row' | 'inline';

interface MessageComposerProps {
  /** Controlled value */
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder?: string;

  /**
   * 'row'    — textarea + send button side-by-side (ChannelView / DMView)
   * 'inline' — send button overlaid inside textarea (ThreadPanel)
   * @default 'row'
   */
  variant?: Variant;

  /** Extra key handler merged with the built-in Enter-to-submit (e.g. Escape to cancel reply) */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;

  /** Extra className on the wrapper element */
  className?: string;

  /** Smaller text + padding for the thread compose area */
  compact?: boolean;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(
  function MessageComposer(
    {
      value,
      onChange,
      onSubmit,
      placeholder = 'Write a message…',
      variant = 'row',
      className = '',
      compact = false,
      onKeyDown,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit(e as unknown as React.FormEvent);
      }
      onKeyDown?.(e);
    };

    const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
      autoResize(e.currentTarget);
    };

    const canSend = value.trim().length > 0;

    /* ── inline variant (ThreadPanel) ──────────────────────────────────── */
    if (variant === 'inline') {
      return (
        <form onSubmit={onSubmit} className={`relative ${className}`}>
          <textarea
            ref={textareaRef}
            className={`input resize-none w-full bg-whitepr-12 py-3 min-h-[44px] max-h-32`}
            placeholder={placeholder}
            value={value}
            rows={1}
            style={{ height: 'auto' }}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
          />
          <button
            type="submit"
            disabled={!canSend}
            className={`absolute ${compact ? 'right-2 bottom-2 p-1.5' : 'right-2.5 bottom-2.5 p-1.5'} rounded-md text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <SendIcon />
          </button>
        </form>
      );
    }

    /* ── row variant (ChannelView / DMView) ─────────────────────────────── */
    return (
      <form onSubmit={onSubmit} className={`flex items-center gap-3 ${className}`}>
        <textarea
          ref={textareaRef}
          className="input flex-1 resize-none py-3 min-h-[44px] max-h-32"
          placeholder={placeholder}
          value={value}
          rows={1}
          style={{ height: 'auto', minHeight: '44px' }}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
        />

        <button
          type="submit"
          disabled={!canSend}
          className="btn-primary px-4 py-2.5 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SendIcon />
        </button>
      </form>
    );
  },
);

export default MessageComposer;
