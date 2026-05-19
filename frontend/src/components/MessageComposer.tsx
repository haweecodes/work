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

/* ─── Content serialization ──────────────────────────────────────────────── */

function serializeNode(node: Node): string {
  let out = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? '';
    } else if (child instanceof HTMLElement) {
      if (child.dataset.mentionName) {
        out += `@${child.dataset.mentionName}`;
      } else if (child.tagName === 'BR') {
        out += '\n';
      } else if (child.tagName === 'DIV') {
        // Chrome wraps each new line in a div when pressing Enter in contenteditable
        out += '\n' + serializeNode(child);
      } else {
        out += serializeNode(child);
      }
    }
  });
  return out;
}

function serializeContent(div: HTMLDivElement): string {
  return serializeNode(div);
}

/* ─── Importance prefix strip ───────────────────────────────────────────── */

function stripPrefixFromDiv(div: HTMLDivElement, prefixLen: number) {
  const firstNode = div.firstChild;
  if (!firstNode || firstNode.nodeType !== Node.TEXT_NODE) return;
  const t = firstNode as Text;
  t.textContent = (t.textContent ?? '').slice(prefixLen);
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    range.setStart(t, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/* ─── @mention detection (Selection API) ────────────────────────────────── */

function getMentionQueryFromCaret(_div: HTMLDivElement): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const { startContainer, startOffset } = range;
  if (startContainer.nodeType !== Node.TEXT_NODE) return null;
  const textBefore = (startContainer.textContent ?? '').slice(0, startOffset);
  const atIdx = textBefore.lastIndexOf('@');
  if (atIdx === -1) return null;
  if (atIdx > 0 && !/\s/.test(textBefore[atIdx - 1])) return null;
  return textBefore.slice(atIdx + 1);
}

/* ─── Mention chip insertion ─────────────────────────────────────────────── */

function insertMentionChip(member: Member) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
  const textNode = range.startContainer as Text;
  const textBefore = (textNode.textContent ?? '').slice(0, range.startOffset);
  const atIdx = textBefore.lastIndexOf('@');
  if (atIdx === -1) return;

  const chip = document.createElement('span');
  chip.className = 'mention-chip';
  chip.dataset.mentionName = member.name;
  chip.dataset.userId = member.id;
  chip.setAttribute('contenteditable', 'false');
  chip.textContent = `@${member.name}`;

  const beforeText = document.createTextNode(textBefore.slice(0, atIdx));
  // Space after the chip so the cursor has a text node to land in
  const afterText = document.createTextNode(' ' + (textNode.textContent ?? '').slice(range.startOffset));

  const parent = textNode.parentNode!;
  parent.insertBefore(beforeText, textNode);
  parent.insertBefore(chip, textNode);
  parent.insertBefore(afterText, textNode);
  parent.removeChild(textNode);

  const newRange = document.createRange();
  newRange.setStart(afterText, 1); // position caret after the space
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
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
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
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
    const divRef = useRef<HTMLDivElement>(null);
    const lastSerializedRef = useRef('');
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);

    useImperativeHandle(ref, () => ({
      focus: () => divRef.current?.focus(),
    }));

    // Ctrl+/ / Cmd+/ — global shortcut to focus this composer
    useEffect(() => {
      const handler = () => divRef.current?.focus();
      window.addEventListener('fw:focus-composer', handler);
      return () => window.removeEventListener('fw:focus-composer', handler);
    }, []);

    // When parent clears value (e.g. after submit), clear the div DOM
    useEffect(() => {
      if (value === '' && divRef.current) {
        const current = serializeContent(divRef.current);
        if (current !== '') {
          divRef.current.innerHTML = '';
          lastSerializedRef.current = '';
        }
      }
    }, [value]);

    const filteredMembers = mentionQuery !== null
      ? members.filter(m => m.name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6)
      : [];

    const showMention = filteredMembers.length > 0;

    const selectMention = (member: Member, priority = 'normal') => {
      if (!divRef.current) return;
      insertMentionChip(member);
      setMentionQuery(null);
      if (priority !== 'normal') {
        onMentionPrioritySet?.(member.name, member.id, priority);
      }
      const serialized = serializeContent(divRef.current);
      lastSerializedRef.current = serialized;
      onChange(serialized);
      requestAnimationFrame(() => divRef.current?.focus());
    };

    const handleInput = () => {
      if (!divRef.current) return;
      const serialized = serializeContent(divRef.current);

      // Prefix shorthand: `!! ` → urgent, `! ` → important (strip prefix from DOM)
      if (onImportanceChange) {
        if (serialized.startsWith('!! ')) {
          onImportanceChange('urgent');
          stripPrefixFromDiv(divRef.current, 3);
          const stripped = serializeContent(divRef.current);
          lastSerializedRef.current = stripped;
          onChange(stripped);
          setMentionQuery(null);
          return;
        }
        if (serialized.startsWith('! ') && !serialized.startsWith('!! ')) {
          onImportanceChange('important');
          stripPrefixFromDiv(divRef.current, 2);
          const stripped = serializeContent(divRef.current);
          lastSerializedRef.current = stripped;
          onChange(stripped);
          setMentionQuery(null);
          return;
        }
      }

      lastSerializedRef.current = serialized;
      onChange(serialized);
      const query = getMentionQueryFromCaret(divRef.current);
      setMentionQuery(query);
      setMentionIndex(0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (showMention) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMembers.length - 1)); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(filteredMembers[mentionIndex]); return; }
        if (e.key === 'Escape') { setMentionQuery(null); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!showMention) onSubmit(e as unknown as React.FormEvent);
        return;
      }
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        document.execCommand('insertLineBreak');
        return;
      }
      onKeyDown?.(e);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand('insertText', false, text);
    };

    useEffect(() => { setMentionIndex(0); }, [mentionQuery]);

    // Mirrors the same accent/bg used by MessageBubble for received messages
    const importanceAccent =
      importance === 'urgent'    ? 'var(--danger)' :
      importance === 'important' ? '#C47B2A'       : null;
    const importanceBg =
      importance === 'urgent'    ? 'rgba(168,51,42,0.07)'   :
      importance === 'important' ? 'rgba(196,123,42,0.06)'  : undefined;

    const baseEditableStyle: React.CSSProperties = {
      fontSize: 15,
      color: 'var(--ink)',
      letterSpacing: '-0.005em',
      background: 'transparent',
      outline: 'none',
      width: '100%',
      minHeight: 36,
      maxHeight: 128,
      overflowY: 'auto',
      lineHeight: 1.5,
      fontFamily: 'inherit',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    };

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

    /* ── inline variant (ThreadPanel) ──────────────────────────────────── */
    if (variant === 'inline') {
      return (
        <form onSubmit={onSubmit} className={`relative ${className}`}
          style={{
            borderLeft: `3px solid ${importanceAccent ?? 'transparent'}`,
            paddingLeft: importanceAccent ? 8 : 0,
            background: importanceBg,
            transition: 'border-left-color 0.15s, background 0.15s, padding 0.15s',
          }}>
          {mentionDropdown}
          <div className="flex items-baseline gap-3" style={{ borderBottom: '1px solid var(--rule)' }}
            onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--ink)')}
            onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--rule)')}>
            <div
              ref={divRef}
              contentEditable
              role="textbox"
              spellCheck
              aria-multiline="true"
              aria-placeholder={placeholder}
              data-placeholder={placeholder}
              className="composer-input"
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              style={{ ...baseEditableStyle, flex: 1, padding: '6px 0' }}
            />
            {importanceAccent && (
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--paper)', background: importanceAccent,
                padding: '2px 7px', flexShrink: 0,
              }}>{importance}</span>
            )}
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
      <form onSubmit={onSubmit} className={`relative ${className}`}
        style={{
          borderLeft: `3px solid ${importanceAccent ?? 'transparent'}`,
          paddingLeft: importanceAccent ? 10 : 0,
          background: importanceBg,
          transition: 'border-left-color 0.15s, background 0.15s, padding 0.15s',
        }}>
        {mentionDropdown}
        <div className="flex items-baseline gap-4"
          style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 10 }}>
          <div
            ref={divRef}
            contentEditable
            role="textbox"
            spellCheck
            aria-multiline="true"
            aria-placeholder={placeholder}
            data-placeholder={placeholder}
            className="composer-input"
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            style={{ ...baseEditableStyle, flex: 1, padding: '4px 0' }}
          />
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
          {' '}for newline · <kbd style={{ fontFamily: 'inherit', fontSize: 10, border: '1px solid var(--rule)', padding: '1px 5px', color: 'var(--muted)' }}>! </kbd>
          {' '}/{' '}<kbd style={{ fontFamily: 'inherit', fontSize: 10, border: '1px solid var(--rule)', padding: '1px 5px', color: 'var(--muted)' }}>!! </kbd>
          {' '}for priority
          {importanceAccent && (
            <span style={{ marginLeft: 8 }}>·{' '}
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--paper)', background: importanceAccent,
                padding: '2px 7px',
              }}>{importance}</span>
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
