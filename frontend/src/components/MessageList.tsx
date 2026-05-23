import { useMemo } from 'react';
import { isSameDay, format } from 'date-fns';
import MessageBubble, { type InlineTaskPrefill } from './MessageBubble';
import type { Message, Reaction, Task } from '../types';

const CONTINUATION_MS = 5 * 60 * 1000;

interface Props {
  messages: Message[];
  typingUsers?: Record<string, string>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onCreateTask?: (msg: Message, prefill?: InlineTaskPrefill) => void;
  onTaskLinked: (msgId: string, task: Task) => void;
  onMessageUpdated: (msgId: string, content: string, editedAt?: string) => void;
  onMessageDeleted: (msgId: string) => void;
  onReply?: (msg: Message) => void;
  onReactionToggle: (msgId: string, reactions: Reaction[]) => void;
  onShare: (msg: Message) => void;
}

function DateSeparator({ date }: { date: Date }) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const label = isSameDay(date, today) ? 'Today'
    : isSameDay(date, yesterday) ? 'Yesterday'
    : format(date, 'MMMM d, yyyy');
  return (
    <div className="flex items-center gap-3 px-6 py-3">
      <div style={{ flex: 1, height: 1, background: 'var(--rule-2, rgba(0,0,0,0.1))' }} />
      <span style={{ fontSize: 11, color: 'var(--faint, #9ca3af)', fontWeight: 500, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--rule-2, rgba(0,0,0,0.1))' }} />
    </div>
  );
}

export default function MessageList({ messages, typingUsers = {}, hasMore, loadingMore, onLoadMore, ...cb }: Props) {
  const grouped = useMemo(() =>
    messages.map((msg, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const prevDate = prev ? new Date(prev.created_at) : null;
      const msgDate = new Date(msg.created_at);
      const showDateSep = !prev || !isSameDay(msgDate, prevDate!);
      const isContinuation = !!prev
        && !msg.is_system && !prev.is_system
        && !msg.deleted   && !prev.deleted
        && msg.sender_id === prev.sender_id
        && isSameDay(msgDate, prevDate!)
        && (msgDate.getTime() - prevDate!.getTime()) < CONTINUATION_MS;
      const isGroupEnd = !next
        || !!next.is_system || !!next.deleted
        || next.sender_id !== msg.sender_id
        || !!msg.is_system  || !!msg.deleted
        || !isSameDay(new Date(next.created_at), msgDate)
        || (new Date(next.created_at).getTime() - msgDate.getTime()) >= CONTINUATION_MS;
      return { msg, isContinuation, isGroupEnd, showDateSep };
    }),
    [messages]
  );

  return (
    <>
      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            disabled={loadingMore}
            onClick={onLoadMore}
            style={{ fontSize: 12, color: 'var(--muted, #6b7280)', fontFamily: 'inherit', background: 'none', border: 'none', cursor: loadingMore ? 'default' : 'pointer', padding: '4px 8px' }}
            onMouseEnter={e => { if (!loadingMore) (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink, #111)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted, #6b7280)'; }}
          >
            {loadingMore ? 'Loading…' : '↑ Load earlier messages'}
          </button>
        </div>
      )}

      {grouped.map(({ msg, isContinuation, isGroupEnd, showDateSep }) => (
        <div key={msg.id}>
          {showDateSep && <DateSeparator date={new Date(msg.created_at)} />}
          <MessageBubble
            msg={msg}
            isContinuation={isContinuation}
            isGroupEnd={isGroupEnd}
            onCreateTask={cb.onCreateTask}
            onTaskLinked={cb.onTaskLinked}
            onMessageUpdated={cb.onMessageUpdated}
            onMessageDeleted={cb.onMessageDeleted}
            onReply={cb.onReply}
            onReactionToggle={cb.onReactionToggle}
            onShare={cb.onShare}
          />
        </div>
      ))}

      {/* Typing indicator */}
      {Object.keys(typingUsers).length > 0 && (
        <div className="flex items-center gap-2 px-6 py-1 text-[12px] text-gray-400">
          <span className="flex gap-0.5">
            {[0, 1, 2].map(j => (
              <span key={j} className="w-1 h-1 rounded-full bg-gray-400 animate-bounce"
                style={{ animationDelay: `${j * 0.15}s` }} />
            ))}
          </span>
          <span>
            {Object.values(typingUsers).join(', ')}
            {Object.keys(typingUsers).length === 1 ? ' is' : ' are'} typing…
          </span>
        </div>
      )}
    </>
  );
}
