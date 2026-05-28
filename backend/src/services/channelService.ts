import { v4 as uuidv4 } from 'uuid';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { db, channels, channel_members, messages, message_reactions, users, workspace_members, notifications, tasks, task_assignees, team_members, board_members } from '../db';
import { enrichMessages } from '../lib/messageEnrich';

export async function getChannelsByWorkspace(workspaceId: string, userId: string) {
  return db.select({ channel: channels })
    .from(channels)
    .innerJoin(channel_members, eq(channels.id, channel_members.channel_id))
    .where(and(eq(channels.workspace_id, workspaceId), eq(channel_members.user_id, userId)))
    .orderBy(channels.created_at)
    .then(rows => rows.map(r => r.channel));
}

export async function getChannelById(channelId: string, workspaceId: string) {
  return db.query.channels.findFirst({
    where: and(eq(channels.id, channelId), eq(channels.workspace_id, workspaceId)),
  });
}

export async function isChannelMember(channelId: string, userId: string) {
  const row = await db.query.channel_members.findFirst({
    where: and(eq(channel_members.channel_id, channelId), eq(channel_members.user_id, userId)),
  });
  return !!row;
}

export async function createChannel(workspaceId: string, name: string, isPrivate: boolean, createdBy: string) {
  const id = uuidv4();
  const channelName = name.toLowerCase().replace(/\s+/g, '-');

  if (isPrivate) {
    await db.insert(channels).values({ id, workspace_id: workspaceId, name: channelName, is_private: 1, created_by: createdBy });
    await db.insert(channel_members).values({ channel_id: id, user_id: createdBy });
  } else {
    await db.insert(channels).values({ id, workspace_id: workspaceId, name: channelName, is_private: 0, created_by: createdBy });
    const members = await db.select({ user_id: workspace_members.user_id })
      .from(workspace_members)
      .where(eq(workspace_members.workspace_id, workspaceId));
    if (members.length > 0) {
      await db.insert(channel_members).values(members.map(m => ({ channel_id: id, user_id: m.user_id }))).onConflictDoNothing();
    }
  }

  return db.query.channels.findFirst({ where: eq(channels.id, id) });
}

export async function archiveChannel(channelId: string) {
  await db.update(channels).set({ is_archived: 1 }).where(eq(channels.id, channelId));
}

export async function getChannelMembers(channelId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatar_url: users.avatar_url,
      status_emoji: users.status_emoji,
      status_text: users.status_text,
    })
    .from(channel_members)
    .innerJoin(users, eq(channel_members.user_id, users.id))
    .where(eq(channel_members.channel_id, channelId))
    .orderBy(users.name);
}

export async function getChannelMemberIds(channelId: string) {
  const rows = await db.select({ user_id: channel_members.user_id })
    .from(channel_members)
    .where(eq(channel_members.channel_id, channelId));
  return rows.map(r => r.user_id);
}

export async function getWorkspaceMemberIds(workspaceId: string) {
  const rows = await db.select({ user_id: workspace_members.user_id })
    .from(workspace_members)
    .where(eq(workspace_members.workspace_id, workspaceId));
  return rows.map(r => r.user_id);
}

export async function getMessages(channelId: string, limit = 50, before?: string) {
  const beforeFilter = before ? sql`AND m.created_at < ${before}::timestamptz` : sql``;
  const rows = await db.execute(sql`
    SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
           t.id as task_id, t.title as task_title, t.priority as task_priority,
           t.column_id as task_column_id, t.task_key, t.task_number,
           (SELECT COUNT(id)::int FROM messages WHERE parent_message_id = m.id) as reply_count
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN tasks t ON t.id = m.linked_task_id
    WHERE m.channel_id = ${channelId} AND m.parent_message_id IS NULL
    ${beforeFilter}
    ORDER BY m.created_at DESC
    LIMIT ${limit + 1}
  `);
  const all = (rows.rows ?? rows) as any[];
  const hasMore = all.length > limit;
  const messages = await enrichMessages(hasMore ? all.slice(0, limit) : all);
  return { messages, hasMore };
}

export async function getThreadReplies(channelId: string, messageId: string) {
  const depth1Rows = await db.execute(sql`
    SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
           t.id as task_id, t.title as task_title, t.priority as task_priority,
           t.column_id as task_column_id, t.task_key, t.task_number,
           (SELECT COUNT(id)::int FROM messages WHERE parent_message_id = m.id) as reply_count
    FROM messages m LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN tasks t ON t.id = m.linked_task_id
    WHERE m.channel_id = ${channelId} AND m.parent_message_id = ${messageId}
    ORDER BY m.created_at ASC
  `);
  const depth1 = (depth1Rows.rows ?? depth1Rows) as any[];
  const depth1Ids = depth1.map((m: any) => m.id);

  let depth2: any[] = [];
  if (depth1Ids.length > 0) {
    const depth2Rows = await db.execute(sql`
      SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
             t.id as task_id, t.title as task_title, t.priority as task_priority,
             t.column_id as task_column_id, t.task_key, t.task_number,
             0 as reply_count
      FROM messages m LEFT JOIN users u ON u.id = m.sender_id
      LEFT JOIN tasks t ON t.id = m.linked_task_id
      WHERE m.channel_id = ${channelId} AND ${inArray(messages.parent_message_id, depth1Ids)}
      ORDER BY m.created_at ASC
    `);
    depth2 = (depth2Rows.rows ?? depth2Rows) as any[];
  }

  const all_msgs = [...depth1, ...depth2].sort((a: any, b: any) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return enrichMessages(all_msgs);
}

export async function createMessage(channelId: string, senderId: string, content: string, linkedTaskId: string | null, parentMessageId: string | null, importance: string, mentionPriorities: string | null) {
  const id = uuidv4();
  await db.insert(messages).values({
    id, channel_id: channelId, sender_id: senderId, content,
    linked_task_id: linkedTaskId, parent_message_id: parentMessageId,
    importance, mention_priorities: mentionPriorities,
  });
  return id;
}

export async function getMessageById(id: string) {
  return db.query.messages.findFirst({ where: eq(messages.id, id) });
}

export async function editMessage(id: string, content: string, senderId: string) {
  const msg = await db.query.messages.findFirst({ where: eq(messages.id, id) });
  if (!msg || msg.sender_id !== senderId || msg.is_system) return null;
  await db.update(messages).set({ content, edited_at: new Date() }).where(eq(messages.id, id));
  return db.query.messages.findFirst({ where: eq(messages.id, id) });
}

export async function deleteMessage(id: string, senderId: string) {
  const msg = await db.query.messages.findFirst({ where: eq(messages.id, id) });
  if (!msg || msg.sender_id !== senderId || msg.is_system) return null;
  await db.delete(message_reactions).where(eq(message_reactions.message_id, id));
  await db.delete(messages).where(eq(messages.id, id));
  return msg;
}

export async function shareMessage(messageId: string, channelId: string | null, dmThreadId: string | null, senderId: string, content: string) {
  const id = uuidv4();
  await db.insert(messages).values({
    id, channel_id: channelId, dm_thread_id: dmThreadId,
    sender_id: senderId, content, shared_message_id: messageId,
  });
  return id;
}

export async function getReactions(messageId: string) {
  const rows = await db.select().from(message_reactions).where(eq(message_reactions.message_id, messageId));
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.user_id);
  }
  return Object.entries(map).map(([emoji, users]) => ({ emoji, count: users.length, users }));
}

export async function toggleReaction(messageId: string, userId: string, emoji: string) {
  const existing = await db.query.message_reactions.findFirst({
    where: and(eq(message_reactions.message_id, messageId), eq(message_reactions.user_id, userId), eq(message_reactions.emoji, emoji)),
  });
  if (existing) {
    await db.delete(message_reactions)
      .where(and(eq(message_reactions.message_id, messageId), eq(message_reactions.user_id, userId), eq(message_reactions.emoji, emoji)));
  } else {
    await db.insert(message_reactions).values({ message_id: messageId, user_id: userId, emoji });
  }
  return getReactions(messageId);
}

export async function getMessageNestDepth(messageId: string): Promise<number> {
  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
    columns: { parent_message_id: true },
  });
  if (!msg?.parent_message_id) return 0;
  const parent = await db.query.messages.findFirst({
    where: eq(messages.id, msg.parent_message_id),
    columns: { parent_message_id: true },
  });
  if (parent?.parent_message_id) return 2;
  return 1;
}

export async function getThreadParticipantIds(rootId: string) {
  const rows = await db.execute(sql`
    SELECT DISTINCT sender_id FROM messages WHERE id = ${rootId} OR parent_message_id = ${rootId}
  `);
  return ((rows.rows ?? rows) as any[]).map((r: any) => r.sender_id as string);
}

export async function getParentMessageId(messageId: string) {
  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
    columns: { parent_message_id: true },
  });
  return msg?.parent_message_id ?? null;
}

export async function getWorkspaceForChannel(channelId: string) {
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { workspace_id: true } });
  return ch?.workspace_id ?? null;
}

export async function createMentionNotification(userId: string, channelId: string, message: string, priority: string, workspaceId: string) {
  const id = uuidv4();
  await db.insert(notifications).values({ id, user_id: userId, type: 'mention', reference_id: channelId, reference_type: 'channel', message, priority, workspace_id: workspaceId, is_read: 0 });
  return id;
}

export async function getUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, avatar_url: true },
  });
}

export async function addChannelMemberSafe(channelId: string, userId: string) {
  await db.insert(channel_members).values({ channel_id: channelId, user_id: userId }).onConflictDoNothing();
  // Sync: if this channel is linked to a board, also add the user to board_members
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { board_id: true } });
  if (ch?.board_id) {
    await db.insert(board_members).values({ board_id: ch.board_id, user_id: userId }).onConflictDoNothing();
  }
}

export async function getTaskAssigneesForBoard(boardId: string) {
  const rows = await db
    .selectDistinct({ user_id: task_assignees.user_id })
    .from(task_assignees)
    .innerJoin(tasks, eq(task_assignees.task_id, tasks.id))
    .where(eq(tasks.board_id, boardId));
  return rows.map(r => r.user_id);
}

export async function createBoardChannel(
  workspaceId: string,
  boardId: string,
  name: string,
  isPrivate: boolean,
  createdBy: string,
  teamId?: string | null,
) {
  const id = uuidv4();
  const channelName = name.toLowerCase().replace(/\s+/g, '-');

  await db.insert(channels).values({
    id,
    workspace_id: workspaceId,
    name: channelName,
    is_private: isPrivate ? 1 : 0,
    created_by: createdBy,
    board_id: boardId,
  });

  if (isPrivate) {
    await db.insert(channel_members).values({ channel_id: id, user_id: createdBy }).onConflictDoNothing();
    if (teamId) {
      const teamRows = await db
        .select({ user_id: team_members.user_id })
        .from(team_members)
        .where(eq(team_members.team_id, teamId));
      if (teamRows.length > 0) {
        await db.insert(channel_members)
          .values(teamRows.map(r => ({ channel_id: id, user_id: r.user_id })))
          .onConflictDoNothing();
      }
    }
  } else {
    const members = await db
      .select({ user_id: workspace_members.user_id })
      .from(workspace_members)
      .where(eq(workspace_members.workspace_id, workspaceId));
    if (members.length > 0) {
      await db.insert(channel_members)
        .values(members.map(m => ({ channel_id: id, user_id: m.user_id })))
        .onConflictDoNothing();
    }
  }

  return db.query.channels.findFirst({ where: eq(channels.id, id) });
}

export async function removeChannelMember(channelId: string, userId: string) {
  await db.delete(channel_members).where(
    and(eq(channel_members.channel_id, channelId), eq(channel_members.user_id, userId))
  );
  // Sync: if this channel is linked to a board, also remove the user from board_members
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { board_id: true } });
  if (ch?.board_id) {
    await db.delete(board_members).where(
      and(eq(board_members.board_id, ch.board_id), eq(board_members.user_id, userId))
    );
  }
}

export async function createSystemMessage(channelId: string, senderId: string, content: string) {
  const id = uuidv4();
  const now = new Date();
  await db.insert(messages).values({
    id,
    channel_id: channelId,
    sender_id: senderId,
    content,
    is_system: 1,
    importance: 'normal',
  });
  return { id, channel_id: channelId, sender_id: senderId, content, created_at: now.toISOString(), is_system: 1 };
}
