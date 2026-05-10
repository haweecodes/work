import { useState, useEffect, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import SocketContext from '../context/SocketContext';
import MessageBubble from './MessageBubble';
import MessageComposer, { type MessageComposerHandle } from './MessageComposer';
import type { Message, Reaction } from '../types';

interface ThreadPanelProps {
  parentMessage: Message;
  onClose: () => void;
  channelId?: string;
  dmThreadId?: string;
  onCreateTask: (msg: Message) => void;
  onShare: (msg: Message) => void;
  /** Notify parent list when a message is edited so both views stay in sync */
  onMessageUpdated?: (msgId: string, content: string, editedAt?: string) => void;
  /** Notify parent list when a message is deleted */
  onMessageDeleted?: (msgId: string) => void;
}

export default function ThreadPanel({
  parentMessage,
  onClose,
  channelId,
  dmThreadId,
  onCreateTask,
  onShare,
  onMessageUpdated,
  onMessageDeleted,
}: ThreadPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  /** The specific thread message being replied to (for nested replies) */
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { user } = useAuthStore();
  const socketRef = useContext(SocketContext);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<MessageComposerHandle>(null);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  const handleReactionToggle = (messageId: string, reactions: Reaction[]) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
  };

  // Update local thread state and notify the parent message list
  const handleMsgUpdated = (msgId: string, content: string, editedAt?: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content, edited_at: editedAt ?? new Date().toISOString() } : m));
    onMessageUpdated?.(msgId, content, editedAt);
  };

  const handleMsgDeleted = (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted: true } : m));
    onMessageDeleted?.(msgId);
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
        setTimeout(() => {
          if (highlightId) {
            const el = document.querySelector(`[data-msg-id="${highlightId}"]`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('msg-highlight');
              setTimeout(() => el.classList.remove('msg-highlight'), 3000);
              return;
            }
          }
          scrollToBottom();
        }, 100);
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

      const handleMessageUpdated = ({ messageId, content: c, editedAt }: { messageId: string; content: string; editedAt?: string }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: c, edited_at: editedAt ?? new Date().toISOString() } : m));
      };

      const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true } : m));
      };

      socket.on('reaction_updated',  handleReactionUpdated);
      socket.on('message_updated',   handleMessageUpdated);
      socket.on('message_deleted',   handleMessageDeleted);

      return () => {
        socket.off(eventName,          handleNewMessage);
        socket.off('reaction_updated', handleReactionUpdated);
        socket.off('message_updated',  handleMessageUpdated);
        socket.off('message_deleted',  handleMessageDeleted);
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
    setTimeout(() => composerRef.current?.focus(), 50);
  };

  /** Scroll to a specific message in the thread list (used by quoted-card click) */
  const scrollToMsg = (msg: Message) => {
    const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-highlight');
      setTimeout(() => el.classList.remove('msg-highlight'), 3000);
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



  return (
    <div className="flex flex-col h-full" style={{ background: '#FFFFFF' }}>

      {/* ── Header — matches right-panel style ── */}
      <div
        className="flex items-center justify-between px-4 py-3.5 border-b flex-shrink-0"
        style={{ borderColor: '#E5E7EB' }}
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: '#9CA3AF', flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <h3 className="text-[14px] font-semibold text-gray-900">Thread</h3>
          {messages.length > 0 && (
            <span className="text-[12px]" style={{ color: '#9CA3AF' }}>
              {messages.length} {messages.length === 1 ? 'reply' : 'replies'}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md transition-colors"
          style={{ color: '#9CA3AF' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F3F4F6'; e.currentTarget.style.color = '#374151'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>

        {/* Root message — lightly tinted */}
        <div className="border-b pb-1 pt-1" style={{ borderColor: '#F3F4F6', background: '#FAFAFA' }}>
          <MessageBubble
            msg={parentMessage}
            onCreateTask={onCreateTask}
            onShare={onShare}
            onMessageUpdated={handleMsgUpdated}
            onMessageDeleted={handleMsgDeleted}
            inThread
          />
        </div>

        {/* Reply count divider */}
        {messages.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
              {messages.length} {messages.length === 1 ? 'Reply' : 'Replies'}
            </span>
            <div className="flex-1 h-px" style={{ background: '#F3F4F6' }} />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#E5E7EB', borderTopColor: '#7C3AED' }} />
          </div>
        ) : (
          <div className="space-y-0 pb-2">
            {messages.map((msg, i) => {
              const depth = getDepth(msg);
              const replyTo = getReplyTo(msg);
              const prev = messages[i - 1];
              const isContinuation = !!prev
                && !msg.is_system && !prev.is_system
                && !msg.deleted && !prev.deleted
                && msg.sender_id === prev.sender_id
                && depth === getDepth(prev)
                && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000;
              return (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  depth={depth}
                  inThread
                  replyTo={replyTo}
                  isContinuation={isContinuation}
                  onCreateTask={onCreateTask}
                  onShare={onShare}
                  onMessageUpdated={handleMsgUpdated}
                  onMessageDeleted={handleMsgDeleted}
                  onReactionToggle={handleReactionToggle}
                  onReply={depth === 0 ? handleReplyToMsg : scrollToMsg}
                />
              );
            })}
            {messages.length === 0 && !loading && (
              <p className="text-center text-[13px] py-6" style={{ color: '#9CA3AF' }}>
                No replies yet — be the first!
              </p>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* ── Compose area ── */}
      <div
        className="px-4 py-3 border-t flex-shrink-0"
        style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }}
      >
        {/* Replying-to bar */}
        {replyingTo && (
          <div
            className="flex items-start gap-2 mb-2 px-3 py-2 rounded-lg border"
            style={{ background: '#EDE9FE', borderColor: '#C4B5FD' }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold mb-0.5" style={{ color: '#7C3AED' }}>
                Replying to {replyingTo.sender?.name}
              </p>
              <p className="text-[11.5px] truncate" style={{ color: '#6D28D9' }}>
                {replyingTo.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="flex-shrink-0 p-0.5 rounded transition-colors"
              style={{ color: '#A78BFA' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#7C3AED')}
              onMouseLeave={e => (e.currentTarget.style.color = '#A78BFA')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <MessageComposer
          ref={composerRef}
          variant="inline"
          compact
          value={content}
          onChange={setContent}
          onSubmit={handleSend}
          placeholder={replyingTo ? `Reply to ${replyingTo.sender?.name}…` : 'Reply in thread…'}
          onKeyDown={e => { if (e.key === 'Escape' && replyingTo) setReplyingTo(null); }}
        />
      </div>
    </div>
  );
}
