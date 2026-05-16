import { useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import type { Member } from '../types';

const MENTION_PRIORITIES = [
  { value: 'low',    label: 'Low',    color: 'var(--faint)' },
  { value: 'normal', label: 'Normal', color: 'var(--ink-2)' },
  { value: 'high',   label: 'High',   color: '#C47B2A' },
  { value: 'urgent', label: 'Urgent', color: 'var(--danger)' },
] as const;

const IMPORTANCE_STATES = [
  { value: 'normal',    label: '',   symbol: '·',  color: 'var(--faint)' },
  { value: 'important', label: '!',  symbol: '!',  color: '#C47B2A' },
  { value: 'urgent',    label: '!!', symbol: '!!', color: 'var(--danger)' },
] as const;

/* ─── Auto-resize helper ──────────────────────────────────────────────────── */

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/* ─── @mention detection ─────────────────────────────────────────────────── */

function getMentionQuery(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  // @ must be at the start or preceded by whitespace (not part of an email)
  if (atIdx > 0 && !/\s/.test(before[atIdx - 1])) return null;
  const query = before.slice(atIdx + 1);
  // Trailing space means the mention was committed — close the dropdown
  if (query.endsWith(' ')) return null;
  return query;
}

function replaceMention(value: string, cursor: number, name: string): { text: string; newCursor: number } {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return { text: value, newCursor: cursor };
  const replaced = `${before.slice(0, atIdx)}@${name} `;
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
  members?: Member[];
  importance?: string;
  onImportanceChange?: (v: string) => void;
  onMentionPrioritySet?: (name: string, userId: string, priority: string) => void;
  onPriorityAlertMentionAdd?: (userId: string, name: string) => void;
  priorityAlertRecipients?: Array<{ name: string }>;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(
  function MessageComposer(
    { value, onChange, onSubmit, placeholder = 'Write a message…', variant = 'row',
      className = '', compact = false, onKeyDown, members = [],
      importance = 'normal', onImportanceChange, onMentionPrioritySet,
      onPriorityAlertMentionAdd, priorityAlertRecipients = [] },
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

    const selectMention = (member: Member, priority = 'normal') => {
      const el = textareaRef.current;
      if (!el) return;
      const { text, newCursor } = replaceMention(value, el.selectionStart, member.name);
      onChange(text);
      setMentionQuery(null);
      if (priority !== 'normal') {
        onMentionPrioritySet?.(member.name, member.id, priority);
      }
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

    useEffect(() => { setMentionIndex(0); }, [mentionQuery]);

    const mentionDropdown = showMention && (
      <div
        className="absolute bottom-full left-0 mb-2 overflow-hidden z-20 animate-fade-in"
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)', minWidth: 220 }}
      >
        {filteredMembers.map((m, i) => (
          <div
            key={m.id}
            className="flex items-center"
            style={{ background: i === mentionIndex ? 'var(--paper-2)' : 'transparent' }}
            onMouseEnter={() => setMentionIndex(i)}
          >
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); selectMention(m); }}
              className="flex items-center gap-2.5 px-3 py-2 flex-1 text-left"
              style={{ color: i === mentionIndex ? 'var(--ink)' : 'var(--ink-2)', background: 'transparent' }}
            >
              {m.avatar_url
                ? <img src={m.avatar_url} className="w-5 h-5 rounded-full flex-shrink-0" alt={m.name} />
                : <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'var(--rule-2)', fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
                    {m.name[0]}
                  </div>
              }
              <span style={{ fontSize: 13, fontWeight: i === mentionIndex ? 500 : 400 }} className="truncate">{m.name}</span>
            </button>
            {onPriorityAlertMentionAdd && (
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault();
                  selectMention(m);
                  onPriorityAlertMentionAdd(m.id, m.name);
                }}
                title="Send as priority alert"
                style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--danger)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '2px 10px', flexShrink: 0, fontFamily: 'inherit',
                  letterSpacing: '0.06em',
                }}
              >Alert</button>
            )}
          </div>
        ))}
      </div>
    );

    const textareaStyle = {
      fontSize: 15,
      color: 'var(--ink)',
      letterSpacing: '-0.005em',
      background: 'transparent',
      border: 'none',
      borderBottom: '1px solid var(--rule)',
      outline: 'none',
      resize: 'none' as const,
      width: '100%',
      minHeight: 36,
      maxHeight: 128,
      padding: '6px 0 10px',
      lineHeight: 1.5,
      fontFamily: 'inherit',
    };

    /* ── inline variant (ThreadPanel) ──────────────────────────────────── */
    if (variant === 'inline') {
      return (
        <form onSubmit={onSubmit} className={`relative ${className}`}>
          {mentionDropdown}
          <div className="flex items-baseline gap-3" style={{ borderBottom: '1px solid var(--rule)' }}
            onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--ink)')}
            onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--rule)')}>
            <textarea
              ref={textareaRef}
              style={{ ...textareaStyle, flex: 1, border: 'none', borderBottom: 'none', padding: '6px 0' }}
              placeholder={placeholder}
              value={value}
              rows={1}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
            />
            <button
              type="submit"
              disabled={!value.trim()}
              className="btn-primary flex-shrink-0"
              style={{ paddingBottom: 8 }}
            >
              Send →
            </button>
          </div>
        </form>
      );
    }

    /* ── row variant (ChannelView / DMView) ─────────────────────────────── */
    const importanceState = IMPORTANCE_STATES.find(s => s.value === importance) ?? IMPORTANCE_STATES[0];

    const cycleImportance = (e: React.MouseEvent) => {
      e.preventDefault();
      const idx = IMPORTANCE_STATES.findIndex(s => s.value === importance);
      const next = IMPORTANCE_STATES[(idx + 1) % IMPORTANCE_STATES.length];
      onImportanceChange?.(next.value);
    };

    return (
      <form onSubmit={onSubmit} className={`relative ${className}`}>
        {mentionDropdown}
        <div className="flex items-baseline gap-4"
          style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 10 }}>
          <textarea
            ref={textareaRef}
            style={{ ...textareaStyle, flex: 1, border: 'none', borderBottom: 'none', padding: '4px 0' }}
            placeholder={placeholder}
            value={value}
            rows={1}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          {/* Importance toggle */}
          {onImportanceChange && (
            <button
              type="button"
              onClick={cycleImportance}
              title="Cycle message importance"
              style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                color: importance === 'normal' ? 'var(--faint)' : 'var(--paper)',
                background: importance === 'normal' ? 'transparent' : importanceState.color,
                border: importance === 'normal' ? '1px solid var(--rule)' : 'none',
                flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit',
                padding: importance === 'normal' ? '2px 6px' : '2px 8px',
              }}
            >
              {importance === 'normal' ? '!' : importanceState.label}
            </button>
          )}
          <button
            type="submit"
            disabled={!value.trim()}
            className="btn-primary flex-shrink-0"
          >
            Send →
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8, letterSpacing: '0.02em' }}>
          <kbd style={{ fontFamily: 'inherit', fontSize: 10, border: '1px solid var(--rule)', padding: '1px 5px', color: 'var(--muted)' }}>↵</kbd>
          {' '}to send · <kbd style={{ fontFamily: 'inherit', fontSize: 10, border: '1px solid var(--rule)', padding: '1px 5px', color: 'var(--muted)' }}>Shift↵</kbd>
          {' '}for newline
          {importance !== 'normal' && (
            <span style={{ marginLeft: 10, color: importanceState.color, fontWeight: 500 }}>
              · marked as {importance}
            </span>
          )}
          {priorityAlertRecipients.length > 0 && (
            <span style={{ marginLeft: 10, color: 'var(--danger)', fontWeight: 500 }}>
              · alert → {priorityAlertRecipients.map(r => r.name).join(', ')}
            </span>
          )}
        </p>
      </form>
    );
  },
);

export default MessageComposer;
