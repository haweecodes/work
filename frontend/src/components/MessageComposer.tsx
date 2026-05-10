import { useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import type { Member } from '../types';

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

/* ─── @mention detection ─────────────────────────────────────────────────── */

function getMentionQuery(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor);
  const match = before.match(/@(\w*)$/);
  return match ? match[1] : null;
}

function replaceMention(value: string, cursor: number, name: string): { text: string; newCursor: number } {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const replaced = before.replace(/@\w*$/, `@${name} `);
  return { text: replaced + after, newCursor: replaced.length };
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface MessageComposerHandle {
  focus: () => void;
}

type Variant = 'row' | 'inline';

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder?: string;
  variant?: Variant;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
  compact?: boolean;
  /** Workspace members to power @mention autocomplete */
  members?: Member[];
}

/* ─── Component ──────────────────────────────────────────────────────────── */

const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(
  function MessageComposer(
    { value, onChange, onSubmit, placeholder = 'Write a message…', variant = 'row',
      className = '', compact = false, onKeyDown, members = [] },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    const filteredMembers = mentionQuery !== null
      ? members.filter(m => m.name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6)
      : [];

    const showMention = filteredMembers.length > 0;

    const selectMention = (member: Member) => {
      const el = textareaRef.current;
      if (!el) return;
      const { text, newCursor } = replaceMention(value, el.selectionStart, member.name);
      onChange(text);
      setMentionQuery(null);
      // Restore cursor after React re-render
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(newCursor, newCursor);
        autoResize(el);
      });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showMention) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMembers.length - 1)); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(filteredMembers[mentionIndex]); return; }
        if (e.key === 'Escape') { setMentionQuery(null); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!showMention) onSubmit(e as unknown as React.FormEvent);
      }
      onKeyDown?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      onChange(val);
      autoResize(e.target);
      const query = getMentionQuery(val, e.target.selectionStart);
      setMentionQuery(query);
      setMentionIndex(0);
    };

    // Reset mention index when query changes
    useEffect(() => { setMentionIndex(0); }, [mentionQuery]);

    const mentionDropdown = showMention && (
      <div
        className="absolute bottom-full left-0 mb-1.5 w-56 rounded-xl border bg-white shadow-lg overflow-hidden z-20 animate-fade-in"
        style={{ borderColor: '#E5E7EB' }}
      >
        {filteredMembers.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onMouseDown={e => { e.preventDefault(); selectMention(m); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
            style={{
              background: i === mentionIndex ? '#EDE9FE' : 'transparent',
              color: i === mentionIndex ? '#7C3AED' : '#374151',
            }}
            onMouseEnter={() => setMentionIndex(i)}
          >
            {m.avatar_url
              ? <img src={m.avatar_url} className="w-6 h-6 rounded-full flex-shrink-0" alt={m.name} />
              : <div className="w-6 h-6 rounded-full flex-shrink-0 bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600">{m.name[0]}</div>
            }
            <span className="text-[13px] font-medium truncate">{m.name}</span>
          </button>
        ))}
      </div>
    );

    /* ── inline variant (ThreadPanel) ──────────────────────────────────── */
    if (variant === 'inline') {
      return (
        <form onSubmit={onSubmit} className={`relative ${className}`}>
          {mentionDropdown}
          <textarea
            ref={textareaRef}
            className={`input resize-none w-full bg-white pr-12 py-3 min-h-[44px] max-h-32`}
            placeholder={placeholder}
            value={value}
            rows={1}
            style={{ height: 'auto' }}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className={`absolute ${compact ? 'right-2 bottom-2 p-1.5' : 'right-2.5 bottom-2.5 p-1.5'} rounded-md text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <SendIcon />
          </button>
        </form>
      );
    }

    /* ── row variant (ChannelView / DMView) ─────────────────────────────── */
    return (
      <form onSubmit={onSubmit} className={`relative flex items-center gap-3 ${className}`}>
        {mentionDropdown}
        <textarea
          ref={textareaRef}
          className="input flex-1 resize-none py-3 min-h-[44px] max-h-32"
          placeholder={placeholder}
          value={value}
          rows={1}
          style={{ height: 'auto', minHeight: '44px' }}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="btn-primary px-4 py-2.5 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SendIcon />
        </button>
      </form>
    );
  },
);

export default MessageComposer;
