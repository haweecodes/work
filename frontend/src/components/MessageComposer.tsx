import { useRef, forwardRef, useImperativeHandle, useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Link2, Smile } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import type { Member } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const MENTION_PRIORITY_COLORS: Record<string, string> = {
  low: 'var(--faint)', normal: 'var(--ink)', high: '#C47B2A', urgent: 'var(--danger)',
};

const IMPORTANCE_STATES = [
  { value: 'normal',    label: '',   color: 'var(--faint)' },
  { value: 'important', label: '!',  color: '#C47B2A' },
  { value: 'urgent',    label: '!!', color: 'var(--danger)' },
] as const;

// ── Serialization: Tiptap JSON → plain text with markdown markers ─────────────

function serializeNode(node: any): string {
  if (node.type === 'text') {
    let text: string = node.text ?? '';
    const marks: any[] = node.marks ?? [];
    const isBold   = marks.some(m => m.type === 'bold');
    const isItalic = marks.some(m => m.type === 'italic');
    const isCode   = marks.some(m => m.type === 'code');
    const link     = marks.find(m => m.type === 'link');
    if (isCode)   text = `\`${text}\``;
    if (isBold)   text = `**${text}**`;
    if (isItalic) text = `*${text}*`;
    if (link)     text = `[${text}](${link.attrs.href})`;
    return text;
  }
  if (node.type === 'mention') return `@${node.attrs.label ?? node.attrs.id ?? ''}`;
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'paragraph') {
    return (node.content ?? []).map(serializeNode).join('');
  }
  if (node.type === 'doc') {
    return (node.content ?? []).map((n: any, i: number) =>
      i === 0 ? serializeNode(n) : '\n' + serializeNode(n)
    ).join('');
  }
  return (node.content ?? []).map(serializeNode).join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MessageComposerHandle { focus: () => void; }

type Variant = 'row' | 'inline';

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder?: string;
  variant?: Variant;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
  compact?: boolean;
  members?: Member[];
  importance?: string;
  onImportanceChange?: (v: string) => void;
  onMentionPrioritySet?: (name: string, userId: string, priority: string) => void;
  onPriorityAlertMentionAdd?: (userId: string, name: string) => void;
  priorityAlertRecipients?: Array<{ name: string }>;
}

// ── Component ─────────────────────────────────────────────────────────────────

const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(
  function MessageComposer(
    {
      value, onChange, onSubmit,
      placeholder = 'Write a message…',
      variant = 'row',
      className = '',
      members = [],
      importance = 'normal',
      onImportanceChange,
      onMentionPrioritySet,
      onPriorityAlertMentionAdd,
      priorityAlertRecipients = [],
    },
    ref,
  ) {
    // ── Mention suggestion state ─────────────────────────────────────────────
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionItems, setMentionItems] = useState<Member[]>([]);
    const [mentionIndex, setMentionIndex] = useState(0);
    const mentionCommandRef = useRef<((item: { id: string; label: string }) => void) | null>(null);
    const mentionIndexRef   = useRef(0);
    const mentionItemsRef   = useRef<Member[]>([]);

    // Keep refs in sync
    useEffect(() => { mentionIndexRef.current = mentionIndex; }, [mentionIndex]);
    useEffect(() => { mentionItemsRef.current = mentionItems; }, [mentionItems]);

    // ── Toolbar state ────────────────────────────────────────────────────────
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [linkInput, setLinkInput]         = useState('');
    const [showEmoji, setShowEmoji]         = useState(false);
    const emojiButtonRef    = useRef<HTMLButtonElement>(null);
    const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

    // ── Tiptap editor ────────────────────────────────────────────────────────
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false, blockquote: false,
          bulletList: false, orderedList: false, codeBlock: false,
          // Keep: bold, italic, code (inline), hardBreak, history, paragraph
        }),
        Link.configure({ openOnClick: false, autolink: true }),
        Placeholder.configure({ placeholder }),
        Mention.configure({
          HTMLAttributes: { class: 'mention-chip' },
          renderHTML({ node }) {
            const priority = (node.attrs as any).priority ?? 'normal';
            return ['span', {
              class: 'mention-chip',
              'data-mention-name': node.attrs.label,
              'data-user-id': node.attrs.id,
              style: `color:${MENTION_PRIORITY_COLORS[priority] ?? 'var(--ink)'}`,
            }, `@${node.attrs.label ?? ''}`];
          },
          suggestion: {
            items: ({ query }) =>
              members.filter(m => m.name.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6),
            render: () => ({
              onStart(props) {
                mentionCommandRef.current = props.command;
                setMentionItems(props.items as Member[]);
                setMentionIndex(0);
                setShowMentionDropdown(true);
              },
              onUpdate(props) {
                mentionCommandRef.current = props.command;
                setMentionItems(props.items as Member[]);
                setMentionIndex(0);
              },
              onExit() {
                mentionCommandRef.current = null;
                setShowMentionDropdown(false);
              },
              onKeyDown({ event }: { event: KeyboardEvent }) {
                const items = mentionItemsRef.current;
                const idx   = mentionIndexRef.current;
                if (event.key === 'ArrowDown') {
                  setMentionIndex(i => Math.min(i + 1, items.length - 1));
                  return true;
                }
                if (event.key === 'ArrowUp') {
                  setMentionIndex(i => Math.max(i - 1, 0));
                  return true;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  const member = items[idx];
                  if (member && mentionCommandRef.current) {
                    mentionCommandRef.current({ id: member.id, label: member.name });
                  }
                  return true;
                }
                if (event.key === 'Escape') {
                  setShowMentionDropdown(false);
                  return true;
                }
                return false;
              },
            }),
          },
        }),
      ],
      content: '',
      onUpdate({ editor }) {
        // Importance prefix shortcuts: !! → urgent, ! → important
        if (onImportanceChange) {
          const text = editor.getText();
          if (text.startsWith('!! ')) {
            onImportanceChange('urgent');
            editor.chain().deleteRange({ from: 1, to: 4 }).run();
            return;
          }
          if (text.startsWith('! ') && !text.startsWith('!! ')) {
            onImportanceChange('important');
            editor.chain().deleteRange({ from: 1, to: 3 }).run();
            return;
          }
        }
        const serialized = serializeNode(editor.getJSON());
        onChange(serialized);
      },
      editorProps: {
        handleKeyDown(view, event) {
          // Enter (no shift) → submit
          if (event.key === 'Enter' && !event.shiftKey && !showMentionDropdown) {
            event.preventDefault();
            // Fire a synthetic form submit
            const form = (view.dom as HTMLElement).closest('form');
            if (form) {
              const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
              form.dispatchEvent(submitEvent);
            }
            return true;
          }
          return false;
        },
      },
    });

    // ── imperative ref ───────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
    }));

    // Ctrl+/ → focus
    useEffect(() => {
      const handler = () => editor?.commands.focus();
      window.addEventListener('fw:focus-composer', handler);
      return () => window.removeEventListener('fw:focus-composer', handler);
    }, [editor]);

    // Clear editor when parent clears value (after submit)
    useEffect(() => {
      if (value === '' && editor && !editor.isEmpty) {
        editor.commands.clearContent();
      }
    }, [value, editor]);

    // ── Mention selection ────────────────────────────────────────────────────
    const selectMention = useCallback((member: Member, priority = 'normal') => {
      if (mentionCommandRef.current) {
        mentionCommandRef.current({ id: member.id, label: member.name });
      }
      if (priority !== 'normal') {
        onMentionPrioritySet?.(member.name, member.id, priority);
      }
      setShowMentionDropdown(false);
      requestAnimationFrame(() => editor?.commands.focus());
    }, [editor, onMentionPrioritySet]);

    // ── Toolbar actions ──────────────────────────────────────────────────────
    const handleAddLink = () => {
      if (!linkInput.trim() || !editor) return;
      const href = linkInput.startsWith('http') ? linkInput.trim() : `https://${linkInput.trim()}`;
      const sel = savedSelectionRef.current;
      if (sel && sel.from !== sel.to) {
        // Wrap the saved selection with the link mark
        editor.chain().focus().setTextSelection(sel).setLink({ href }).run();
      } else {
        // No selection — insert the URL as link text at the saved (or current) position
        const pos = sel?.from ?? editor.state.selection.from;
        editor.chain().focus().setTextSelection(pos)
          .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
          .run();
      }
      savedSelectionRef.current = null;
      setLinkInput('');
      setShowLinkInput(false);
    };

    const handleEmojiSelect = (emoji: string) => {
      editor?.chain().focus().insertContent(emoji).run();
      setShowEmoji(false);
    };

    // ── Shared render helpers ────────────────────────────────────────────────
    const importanceAccent =
      importance === 'urgent'    ? 'var(--danger)' :
      importance === 'important' ? '#C47B2A'       : null;
    const importanceBg =
      importance === 'urgent'    ? 'rgba(168,51,42,0.07)'  :
      importance === 'important' ? 'rgba(196,123,42,0.06)' : undefined;

    const importanceState = IMPORTANCE_STATES.find(s => s.value === importance) ?? IMPORTANCE_STATES[0];

    const cycleImportance = (e: React.MouseEvent) => {
      e.preventDefault();
      const idx  = IMPORTANCE_STATES.findIndex(s => s.value === importance);
      const next = IMPORTANCE_STATES[(idx + 1) % IMPORTANCE_STATES.length];
      onImportanceChange?.(next.value);
    };

    const isEmpty = editor?.isEmpty ?? true;

    // ── Mention dropdown ─────────────────────────────────────────────────────
    const mentionDropdown = showMentionDropdown && mentionItems.length > 0 && (
      <div
        className="absolute bottom-full left-0 mb-2 overflow-hidden z-20 animate-fade-in"
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)', minWidth: 220 }}
      >
        {mentionItems.map((m, i) => (
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
                onMouseDown={e => { e.preventDefault(); selectMention(m); onPriorityAlertMentionAdd(m.id, m.name); }}
                title="Send as priority alert"
                style={{ fontSize: 10, fontWeight: 600, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 10px', flexShrink: 0, fontFamily: 'inherit', letterSpacing: '0.06em' }}
              >Alert</button>
            )}
          </div>
        ))}
      </div>
    );

    // ── Toolbar (row variant only) ────────────────────────────────────────────
    const toolbar = variant === 'row' && editor && (
      <div className="flex items-center gap-1" style={{ marginTop: 8 }}>
        {/* Format buttons */}
        <button
          type="button"
          title="Bold (Ctrl+B)"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
          style={{
            padding: '2px 5px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            color: editor.isActive('bold') ? 'var(--ink)' : 'var(--faint)',
            background: editor.isActive('bold') ? 'var(--paper-2)' : 'transparent',
            border: '1px solid transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => { if (!editor.isActive('bold')) e.currentTarget.style.color = 'var(--faint)'; }}
        >B</button>

        <button
          type="button"
          title="Italic (Ctrl+I)"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
          style={{
            padding: '2px 5px', fontSize: 12, fontStyle: 'italic', fontFamily: 'inherit', cursor: 'pointer',
            color: editor.isActive('italic') ? 'var(--ink)' : 'var(--faint)',
            background: editor.isActive('italic') ? 'var(--paper-2)' : 'transparent',
            border: '1px solid transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => { if (!editor.isActive('italic')) e.currentTarget.style.color = 'var(--faint)'; }}
        ><em>I</em></button>

        <button
          type="button"
          title="Link"
          onMouseDown={e => {
            e.preventDefault();
            if (editor) {
              const { from, to } = editor.state.selection;
              savedSelectionRef.current = { from, to };
            }
            setShowLinkInput(v => !v);
            setLinkInput('');
          }}
          style={{
            padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center',
            color: (editor.isActive('link') || showLinkInput) ? 'var(--ink)' : 'var(--faint)',
            background: 'transparent', border: '1px solid transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => { if (!editor.isActive('link') && !showLinkInput) e.currentTarget.style.color = 'var(--faint)'; }}
        >
          <Link2 size={13} />
        </button>

        <button
          ref={emojiButtonRef}
          type="button"
          title="Emoji"
          onMouseDown={e => { e.preventDefault(); setShowEmoji(v => !v); }}
          style={{
            padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center',
            color: showEmoji ? 'var(--ink)' : 'var(--faint)',
            background: 'transparent', border: '1px solid transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => { if (!showEmoji) e.currentTarget.style.color = 'var(--faint)'; }}
        >
          <Smile size={13} />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

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
          disabled={isEmpty}
          className="btn-primary flex-shrink-0"
        >
          Send →
        </button>
      </div>
    );

    // ── Link input (inline, below toolbar) ───────────────────────────────────
    const linkInputEl = showLinkInput && (
      <div className="flex items-baseline gap-2 mt-1.5 animate-fade-in">
        <input
          autoFocus
          type="url"
          value={linkInput}
          onChange={e => setLinkInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); }
            if (e.key === 'Escape') { setShowLinkInput(false); setLinkInput(''); }
          }}
          placeholder="https://..."
          style={{
            fontSize: 12, flex: 1, background: 'transparent', border: 'none',
            borderBottom: '1px solid var(--ink)', outline: 'none', fontFamily: 'inherit',
            color: 'var(--ink)', paddingBottom: 2,
          }}
        />
        <button type="button" className="btn-primary" onClick={handleAddLink}
          style={{ fontSize: 11 }}>
          Add →
        </button>
        <button type="button" className="btn-ghost" onClick={() => { setShowLinkInput(false); setLinkInput(''); }}
          style={{ fontSize: 11 }}>
          Cancel
        </button>
      </div>
    );

    // ── Inline variant ────────────────────────────────────────────────────────
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
          <div className="flex items-baseline gap-3" style={{ borderBottom: '1px solid var(--rule)' }}>
            <EditorContent
              editor={editor}
              className="tiptap-wrapper flex-1"
              style={{ minHeight: 36, maxHeight: 128, overflowY: 'auto', padding: '6px 0' }}
            />
            {importanceAccent && (
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--paper)', background: importanceAccent, padding: '2px 7px', flexShrink: 0,
              }}>{importance}</span>
            )}
            <button type="submit" disabled={isEmpty} className="btn-primary flex-shrink-0" style={{ paddingBottom: 8 }}>
              Send →
            </button>
          </div>
        </form>
      );
    }

    // ── Row variant ───────────────────────────────────────────────────────────
    return (
      <form onSubmit={onSubmit} className={`relative ${className}`}
        style={{
          borderLeft: `3px solid ${importanceAccent ?? 'transparent'}`,
          paddingLeft: importanceAccent ? 10 : 0,
          background: importanceBg,
          transition: 'border-left-color 0.15s, background 0.15s, padding 0.15s',
        }}>
        {mentionDropdown}

        {/* Editor */}
        <EditorContent
          editor={editor}
          className="tiptap-wrapper"
          style={{ minHeight: 36, maxHeight: 128, overflowY: 'auto', borderBottom: '1px solid var(--rule)', paddingBottom: 8 }}
        />

        {/* Toolbar row */}
        {toolbar}

        {/* Link input */}
        {linkInputEl}

        {/* Hint row */}
        <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 6, letterSpacing: '0.02em' }}>
          <kbd style={{ fontFamily: 'inherit', fontSize: 10, border: '1px solid var(--rule)', padding: '1px 5px', color: 'var(--muted)' }}>↵</kbd>
          {' '}send ·{' '}
          <kbd style={{ fontFamily: 'inherit', fontSize: 10, border: '1px solid var(--rule)', padding: '1px 5px', color: 'var(--muted)' }}>Shift↵</kbd>
          {' '}newline ·{' '}
          <kbd style={{ fontFamily: 'inherit', fontSize: 10, border: '1px solid var(--rule)', padding: '1px 5px', color: 'var(--muted)' }}>!! </kbd>
          {' '}/{' '}
          <kbd style={{ fontFamily: 'inherit', fontSize: 10, border: '1px solid var(--rule)', padding: '1px 5px', color: 'var(--muted)' }}>! </kbd>
          {' '}priority
          {importanceAccent && (
            <span style={{ marginLeft: 8 }}>·{' '}
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--paper)', background: importanceAccent, padding: '2px 7px',
              }}>{importance}</span>
            </span>
          )}
          {priorityAlertRecipients.length > 0 && (
            <span style={{ marginLeft: 10, color: 'var(--danger)', fontWeight: 500 }}>
              · alert → {priorityAlertRecipients.map(r => r.name).join(', ')}
            </span>
          )}
        </p>

        {/* Emoji picker */}
        {showEmoji && (
          <EmojiPicker
            anchorRef={emojiButtonRef}
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmoji(false)}
          />
        )}
      </form>
    );
  },
);

export default MessageComposer;
