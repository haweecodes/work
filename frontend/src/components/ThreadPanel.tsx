import { useState, useEffect, useContext, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import SocketContext from '../context/SocketContext';
import MessageBubble from './MessageBubble';
import type { Message, Reaction } from '../types';

interface ThreadPanelProps {
  parentMessage: Message;
  onClose: () => void;
  /** For channels: channelId. For DMs: null (use dmThreadId instead) */
  channelId?: string;
  /** For DM threads */
  dmThreadId?: string;
  onCreateTask: (msg: Message) => void;
  onShare: (msg: Message) => void;
}

export default function ThreadPanel({
  parentMessage,
  onClose,
  channelId,
  dmThreadId,
  onCreateTask,
  onShare,
}: ThreadPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  /** The specific thread message being replied to (for nested replies) */
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { user } = useAuthStore();
  const socketRef = useContext(SocketContext);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Refs keyed by message ID so we can scroll to any message in the thread */
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  const handleReactionToggle = (messageId: string, reactions: Reaction[]) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
  };

  // Build thread fetch URL
  const threadUrl = channelId
    ? `/api/channels/messages/${channelId}/thread/${parentMessage.id}`
    : `/api/dms/${dmThreadId}/thread/${parentMessage.id}`;

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setReplyingTo(null);

    client.get<Message[]>(threadUrl)
      .then(({ data }) => {
        setMessages(data);
        setLoading(false);
        setTimeout(scrollToBottom, 100);
      })
      .catch(() => setLoading(false));

    const socket = socketRef?.current;
    if (socket) {
      const handleNewMessage = (msg: Message) => {
        // Accept if channel or DM matches
        const inChannel = channelId && msg.channel_id === channelId;
        const inDm = dmThreadId && msg.dm_thread_id === dmThreadId;
        if (!inChannel && !inDm) return;

        // Use functional setState so we always have the latest messages list
        // (avoids the stale-closure problem with messages.some())
        setMessages(prev => {
          const inThread =
            msg.parent_message_id === parentMessage.id ||
            prev.some(m => m.id === msg.parent_message_id);

          if (!inThread) return prev;
          if (prev.some(m => m.id === msg.id)) return prev; // dedupe

          // Update reply_count on the depth-1 parent if this is a depth-2 reply
          const updated = prev.map(m =>
            m.id === msg.parent_message_id && msg.parent_message_id !== parentMessage.id
              ? { ...m, reply_count: (m.reply_count || 0) + 1 }
              : m
          );
          return [...updated, msg];
        });
        setTimeout(scrollToBottom, 100);
      };

      const eventName = channelId ? 'new_message' : 'new_dm';
      socket.on(eventName, handleNewMessage);

      const handleReactionUpdated = ({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
      };
      socket.on('reaction_updated', handleReactionUpdated);

      return () => {
        socket.off(eventName, handleNewMessage);
        socket.off('reaction_updated', handleReactionUpdated);
      };
    }
  }, [parentMessage.id, channelId, dmThreadId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    const text = content.trim();
    const replyTarget = replyingTo;
    setContent('');
    setReplyingTo(null);

    try {
      if (channelId) {
        await client.post('/api/channels/messages', {
          channel_id: channelId,
          content: text,
          // If replyingTo is set and it's a depth-1 message, reply directly to it;
          // otherwise reply to the root parent
          parent_message_id: replyTarget ? replyTarget.id : parentMessage.id,
        });
      } else {
        await client.post(`/api/dms/${dmThreadId}`, {
          content: text,
          parent_message_id: replyTarget ? replyTarget.id : parentMessage.id,
        });
      }
    } catch {
      setContent(text);
    }
  };

  const handleReplyToMsg = (msg: Message) => {
    // Clicking reply on any depth-0 message sets replyingTo + focuses compose
    setReplyingTo(msg);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  /** Scroll to a specific message in the thread list (used by quoted-card click) */
  const scrollToMsg = (msg: Message) => {
    const el = msgRefs.current[msg.id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Brief highlight flash
      el.classList.add('ring-2', 'ring-primary-300', 'rounded-lg');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary-300', 'rounded-lg'), 1200);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
    if (e.key === 'Escape' && replyingTo) {
      setReplyingTo(null);
    }
  };

  // Determine visual depth for each message
  const getDepth = (msg: Message): 0 | 1 => {
    if (msg.parent_message_id === parentMessage.id) return 0;
    return 1; // parent is a depth-0 reply
  };

  /** For depth-1 messages: find the depth-0 message they're replying to */
  const getReplyTo = (msg: Message): Message | undefined => {
    if (getDepth(msg) !== 1) return undefined;
    return messages.find(m => m.id === msg.parent_message_id);
  };

  const contextLabel = channelId ? `#${channelId}` : 'DM Thread';


  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
        <div>
          <h2 className="font-semibold text-gray-900">Thread</h2>
          <p className="text-xs text-gray-500">{contextLabel}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Root (parent) message */}
        <div className="border-b border-gray-100 pb-2 mb-2 pt-2">
          <MessageBubble
            msg={parentMessage}
            onCreateTask={onCreateTask}
            onShare={onShare}
            inThread
          />
          <div className="mt-2 mx-5 flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <span>{messages.length} {messages.length === 1 ? 'Reply' : 'Replies'}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-0.5 pb-2">
            {messages.map(msg => {
              const depth = getDepth(msg);
              const replyTo = getReplyTo(msg);
              return (
                <div
                  key={msg.id}
                  ref={el => { msgRefs.current[msg.id] = el; }}
                >
                  <MessageBubble
                    msg={msg}
                    depth={depth}
                    inThread
                    replyTo={replyTo}
                    onCreateTask={onCreateTask}
                    onShare={onShare}
                    onReactionToggle={handleReactionToggle}
                    onReply={depth === 0 ? handleReplyToMsg : scrollToMsg}
                  />
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Compose area */}
      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
        {/* Replying-to quote bar */}
        {replyingTo && (
          <div className="flex items-start gap-2 mb-2 px-3 py-2 rounded-lg bg-primary-50 border border-primary-100">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary-700 mb-0.5">
                Replying to {replyingTo.sender?.name}
              </p>
              <p className="text-xs text-primary-600 truncate">{replyingTo.content}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-primary-100 text-primary-400"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="relative">
          <textarea
            ref={inputRef}
            className="input resize-none pr-10 py-2.5 min-h-[40px] max-h-32 text-sm bg-white"
            placeholder={replyingTo ? `Reply to ${replyingTo.sender?.name}…` : 'Reply…'}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            style={{ height: 'auto' }}
            onInput={e => {
              (e.target as HTMLTextAreaElement).style.height = 'auto';
              (e.target as HTMLTextAreaElement).style.height = (e.target as HTMLTextAreaElement).scrollHeight + 'px';
            }}
          />
          <button
            type="submit"
            className="absolute right-2 bottom-2 p-1.5 rounded-md text-primary-600 hover:bg-primary-50 transition-colors"
            disabled={!content.trim()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
