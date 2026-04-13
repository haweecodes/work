import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import useAuthStore from '../store/authStore';
import useUIStore from '../store/uiStore';
import useBoardStore from '../store/boardStore';
import MessageActionBar from './MessageActionBar';
import type { Message, Reaction } from '../types';


interface MessageBubbleProps {
  msg: Message;
  onCreateTask: (msg: Message) => void;
  onReply?: (msg: Message) => void;
  onShare?: (msg: Message) => void;
  onReactionToggle?: (messageId: string, reactions: Reaction[]) => void;
  depth?: number;
  inThread?: boolean;
  replyTo?: Message;
}

export default function MessageBubble({
  msg,
  onCreateTask,
  onReply,
  onShare,
  onReactionToggle,
  depth = 0,
  inThread = false,
  replyTo,
}: MessageBubbleProps) {
  const user = useAuthStore(s => s.user);
  const { threadUnread, setActiveThreadId } = useUIStore();
  const navigate = useNavigate();
  const { selectedTask, setSelectedTask } = useBoardStore();

  const [reactions, setReactions] = useState<Reaction[]>(msg.reactions ?? []);
  // Give pills access to ActionBar's toggle without prop drilling
  const toggleRef = useRef<(emoji: string) => void>(() => {});

  // Prefer live socket-pushed reactions over local state
  const effectiveReactions = msg.reactions ?? reactions;

  const handleReactionsChange = (next: Reaction[]) => {
    setReactions(next);
    onReactionToggle?.(msg.id, next);
  };

  const renderContent = (content: string) => {
    // Split on **bold** spans and @mentions
    const parts = content.split(/(\*\*[^*]+\*\*|@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      if (/^@\w+/.test(part)) {
        return <span key={i} className="text-primary-600 font-medium bg-primary-50 px-0.5 rounded">{part}</span>;
      }
      return part;
    });
  };

  const handleGoToSource = () => {
    const sm = msg.shared_message;
    if (!sm) return;
    if (sm.channel_id) {
      navigate(`/channel/${sm.channel_id}`);
      if (sm.parent_message_id) setTimeout(() => setActiveThreadId(sm.parent_message_id!), 300);
    } else if (sm.dm_thread_id) {
      navigate(`/dm/${sm.dm_thread_id}`);
      if (sm.parent_message_id) setTimeout(() => setActiveThreadId(sm.parent_message_id!), 300);
    }
  };

  // Render system message (e.g., Task created)
  if (msg.is_system === 1) {
    const isTaskLink = !!msg.linked_task;
    return (
      <div
        data-msg-id={msg.id}
        className="flex gap-3 group px-6 py-2 hover:bg-gray-50/50 transition-colors relative"
      >
        <img
          src={msg.sender?.avatar_url}
          className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 opacity-80"
          alt={msg.sender?.name}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-700">{msg.sender?.name || 'System'}</span>
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium tracking-wide shadow-sm border border-gray-200/50">system</span>
          </div>

          <div
            onClick={() => {
              if (isTaskLink && msg.linked_task && selectedTask?.id !== msg.linked_task.id) {
                setSelectedTask(msg.linked_task);
              }
            }}
            className={`
              mt-1 inline-block border border-gray-100 rounded-lg px-3.5 py-2.5 text-sm text-gray-600 bg-gray-50
              ${isTaskLink ? 'cursor-pointer hover:bg-white hover:border-primary-200 hover:shadow-sm transition-all group/sysbox' : ''}
            `}
          >
            <span>{renderContent((() => {
              if (msg.content.startsWith('{')) {
                try {
                  const p = JSON.parse(msg.content);
                  if (p.type === 'task_assigned') {
                    if (msg.channel_id) return `${p.actorName} assigned a task to **${p.assigneeName}**: **${p.taskTitle}**`;
                    if (p.actorId === user?.id) return `You assigned a task: **${p.taskTitle}**`;
                    return `Assigned you to a task: **${p.taskTitle}**`;
                  }
                  if (p.type === 'task_unassigned') {
                    if (msg.channel_id) return `${p.actorName} removed **${p.assigneeName}** from a task: **${p.taskTitle}**`;
                    if (p.actorId === user?.id) return `You removed them from a task: **${p.taskTitle}**`;
                    return `Removed you from a task: **${p.taskTitle}**`;
                  }
                } catch(e) {}
              }
              return msg.content;
            })())}</span>
            {isTaskLink && (
              <div className="mt-2 flex items-center gap-1.5 text-primary-600 font-semibold text-[11px] border-t border-gray-200/60 pt-2 opacity-80 group-hover/sysbox:opacity-100 group-hover/sysbox:text-primary-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
                View task: <span className="font-medium">{msg.linked_task?.task_key ? `${msg.linked_task.task_key} ` : ''}{msg.linked_task?.title}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-msg-id={msg.id}
      className="flex gap-3 group px-6 py-1.5 hover:bg-gray-50/80 rounded-lg transition-colors relative"
    >
      <img
        src={msg.sender?.avatar_url}
        className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5"
        alt={msg.sender?.name}
      />

      <div className="flex-1 min-w-0">
        {/* Header: name · time · depth badge · action bar */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-gray-900">{msg.sender?.name || 'Former Member'}</span>
          <span className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
          </span>
          {depth === 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-500 font-medium">reply</span>
          )}

          <MessageActionBar
            msg={msg}
            onReply={onReply}
            onShare={onShare}
            onReactionToggle={onReactionToggle}
            depth={depth}
            reactions={effectiveReactions}
            onReactionsChange={handleReactionsChange}
            /** Expose toggle fn so reaction pills can call it too */
            onToggleReady={fn => { toggleRef.current = fn; }}
          />
        </div>

        {/* Reply-to context card */}
        {replyTo && (
          <div
            className="mb-1.5 flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors max-w-xs"
            onClick={() => onReply?.(replyTo)}
            title="Jump to this reply"
          >
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-gray-500">{replyTo.sender?.name}</span>
              <p className="text-xs text-gray-400 truncate leading-snug mt-0.5">
                {replyTo.content.slice(0, 80)}{replyTo.content.length > 80 ? '…' : ''}
              </p>
            </div>
          </div>
        )}

        {/* Shared message preview */}
        {msg.shared_message && (
          <div
            role="button"
            tabIndex={0}
            onClick={handleGoToSource}
            onKeyDown={e => e.key === 'Enter' && handleGoToSource()}
            className="mb-2 rounded-lg border-l-4 border-primary-300 bg-primary-50/60 px-3 py-2 max-w-sm cursor-pointer hover:bg-primary-100/70 transition-colors group/shared"
            title="Click to view original message"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              {msg.shared_message.sender_avatar && (
                <img src={msg.shared_message.sender_avatar} className="w-4 h-4 rounded-full" alt="" />
              )}
              <span className="text-xs font-semibold text-primary-700">{msg.shared_message.sender_name}</span>
              {msg.shared_message.channel_name && (
                <span className="text-xs text-primary-400">in #{msg.shared_message.channel_name}</span>
              )}
              <span className="text-xs text-primary-300">
                {formatDistanceToNow(new Date(msg.shared_message.created_at), { addSuffix: true })}
              </span>
              <svg className="w-3 h-3 text-primary-400 ml-auto opacity-0 group-hover/shared:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
            <p className="text-xs text-primary-800 leading-relaxed line-clamp-3 whitespace-pre-wrap">
              {msg.shared_message.content || <span className="italic text-primary-400">No content</span>}
            </p>
          </div>
        )}

        {/* Message text */}
        {(msg.content || !msg.shared_message) && (
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
            {renderContent(msg.content)}
          </p>
        )}


        {/* Create task — persistent, always-visible pill */}
        <button
          onClick={() => onCreateTask(msg)}
          title="Create task from this message"
          className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-gray-200 text-[11px] font-medium text-gray-400 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-all duration-150 group/task"
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Create task
        </button>

        {/* Reaction pills — clicking calls the same toggle as the action bar */}
        {effectiveReactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {effectiveReactions.map(r => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => toggleRef.current(r.emoji)}
                className={[
                  'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all border select-none',
                  r.users.includes(user?.id ?? '')
                    ? 'bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100',
                ].join(' ')}
              >
                <span className="text-sm leading-none">{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread reply count */}
        {depth === 0 && !inThread && msg.reply_count ? (
          <div className="mt-1.5 flex items-center gap-2">
            {onReply && (
              <button
                onClick={() => onReply(msg)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-50 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors border border-gray-100 hover:border-primary-100"
              >
                <img src={msg.sender?.avatar_url} className="w-4 h-4 rounded-full border border-white" alt="" />
                {msg.reply_count} {msg.reply_count === 1 ? 'reply' : 'replies'}
              </button>
            )}
            {threadUnread[msg.id] > 0 && <span className="flex h-2 w-2 rounded-full bg-red-500" />}
          </div>
        ) : null}
      </div>
    </div>
  );
}
