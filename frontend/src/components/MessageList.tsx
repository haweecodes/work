import MessageBubble, { type InlineTaskPrefill } from './MessageBubble';
import type { Message, Reaction, Task } from '../types';

const CONTINUATION_MS = 5 * 60 * 1000;

interface Props {
  messages: Message[];
  typingUsers?: Record<string, string>;
  onCreateTask: (msg: Message, prefill?: InlineTaskPrefill) => void;
  onTaskLinked: (msgId: string, task: Task) => void;
  onMessageUpdated: (msgId: string, content: string, editedAt?: string) => void;
  onMessageDeleted: (msgId: string) => void;
  onReply?: (msg: Message) => void;
  onReactionToggle: (msgId: string, reactions: Reaction[]) => void;
  onShare: (msg: Message) => void;
}

export default function MessageList({ messages, typingUsers = {}, ...cb }: Props) {
  return (
    <>
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];

        const isContinuation = !!prev
          && !msg.is_system && !prev.is_system
          && !msg.deleted  && !prev.deleted
          && msg.sender_id === prev.sender_id
          && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < CONTINUATION_MS;

        // End of a group when the next message is NOT a continuation of this one
        const isGroupEnd = !next
          || !!next.is_system || !!next.deleted
          || next.sender_id !== msg.sender_id
          || !!msg.is_system  || !!msg.deleted
          || (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) >= CONTINUATION_MS;

        return (
          <MessageBubble
            key={msg.id}
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
        );
      })}

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
