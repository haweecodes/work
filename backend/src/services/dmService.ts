import { v4 as uuidv4 } from 'uuid';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { db, dm_threads, dm_participants, messages, users, workspace_members, type NewMessage } from '../db';
import { enrichMessages } from '../lib/messageEnrich';

export async function getDmThreads(workspaceId: string, userId: string) {
  const threads = await db.select().from(dm_threads)
    .innerJoin(dm_participants, eq(dm_threads.id, dm_participants.thread_id))
    .where(and(eq(dm_participants.user_id, userId), eq(dm_threads.workspace_id, workspaceId)))
    .then(rows => rows.map(r => r.dm_threads));

  if (threads.length === 0) return [];

  const threadIds = threads.map(t => t.id);

  // Batch-fetch all participants in one query
  const allParticipants = await db
    .select({ thread_id: dm_participants.thread_id, id: users.id, name: users.name, avatar_url: users.avatar_url })
    .from(dm_participants)
    .innerJoin(users, eq(dm_participants.user_id, users.id))
    .where(inArray(dm_participants.thread_id, threadIds));

  const participantsByThread: Record<string, Array<{ id: string; name: string; avatar_url: string | null }>> = {};
  for (const p of allParticipants) {
    if (!participantsByThread[p.thread_id]) participantsByThread[p.thread_id] = [];
    participantsByThread[p.thread_id].push({ id: p.id, name: p.name, avatar_url: p.avatar_url });
  }

  // Batch-fetch last message per thread using DISTINCT ON.
  // Use inArray() inside the sql template — passing a JS array directly causes
  // "cannot cast type record to text[]" with the Neon driver.
  const lastMsgRows = await db.execute(sql`
    SELECT DISTINCT ON (dm_thread_id) dm_thread_id, content, created_at
    FROM messages
    WHERE ${inArray(messages.dm_thread_id, threadIds)} AND parent_message_id IS NULL
    ORDER BY dm_thread_id, created_at DESC
  `);
  const lastMsgByThread: Record<string, { content: string; created_at: string }> = {};
  for (const row of ((lastMsgRows.rows ?? lastMsgRows) as any[])) {
    lastMsgByThread[row.dm_thread_id] = { content: row.content, created_at: row.created_at };
  }

  return threads.map(t => ({
    ...t,
    participants: participantsByThread[t.id] ?? [],
    last_message: lastMsgByThread[t.id] ?? null,
  }));
}

export async function isWorkspaceMember(workspaceId: string, userId: string) {
  const row = await db.query.workspace_members.findFirst({
    where: and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)),
  });
  return !!row;
}

export async function findExistingThread(workspaceId: string, userId: string, otherId: string) {
  const result = await db.execute(sql`
    SELECT dt.id FROM dm_threads dt
    JOIN dm_participants dp1 ON dt.id = dp1.thread_id AND dp1.user_id = ${userId}
    JOIN dm_participants dp2 ON dt.id = dp2.thread_id AND dp2.user_id = ${otherId}
    WHERE dt.workspace_id = ${workspaceId}
    LIMIT 1
  `);
  const rows = (result.rows ?? result) as any[];
  return rows[0] ?? null;
}

export async function createThread(workspaceId: string, userId: string, otherId: string) {
  const id = uuidv4();
  await db.insert(dm_threads).values({ id, workspace_id: workspaceId });
  await db.insert(dm_participants).values([
    { thread_id: id, user_id: userId },
    { thread_id: id, user_id: otherId },
  ]);
  return id;
}

export async function getThreadParticipants(threadId: string) {
  return db.select({ id: users.id, name: users.name, avatar_url: users.avatar_url })
    .from(dm_participants)
    .innerJoin(users, eq(dm_participants.user_id, users.id))
    .where(eq(dm_participants.thread_id, threadId));
}

export async function getMessages(threadId: string, limit = 50, before?: string) {
  const beforeFilter = before ? sql`AND m.created_at < ${before}::timestamptz` : sql``;
  const rows = await db.execute(sql`
    SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
           t.id as task_id, t.title as task_title, t.priority as task_priority,
           t.column_id as task_column_id, t.task_key, t.task_number,
           (SELECT COUNT(id)::int FROM messages WHERE parent_message_id = m.id) as reply_count
    FROM messages m LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN tasks t ON t.id = m.linked_task_id
    WHERE m.dm_thread_id = ${threadId} AND m.parent_message_id IS NULL
    ${beforeFilter}
    ORDER BY m.created_at DESC
    LIMIT ${limit + 1}
  `);
  const all = (rows.rows ?? rows) as any[];
  const hasMore = all.length > limit;
  const msgs = await enrichMessages(hasMore ? all.slice(0, limit) : all);
  return { messages: msgs, hasMore };
}

export async function getThreadReplies(threadId: string, messageId: string) {
  const depth1Rows = await db.execute(sql`
    SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
           t.id as task_id, t.title as task_title, t.priority as task_priority,
           t.column_id as task_column_id, t.task_key, t.task_number,
           (SELECT COUNT(id)::int FROM messages WHERE parent_message_id = m.id) as reply_count
    FROM messages m LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN tasks t ON t.id = m.linked_task_id
    WHERE m.dm_thread_id = ${threadId} AND m.parent_message_id = ${messageId}
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
      WHERE m.dm_thread_id = ${threadId} AND ${inArray(messages.parent_message_id, depth1Ids)}
      ORDER BY m.created_at ASC
    `);
    depth2 = (depth2Rows.rows ?? depth2Rows) as any[];
  }

  const all_msgs = [...depth1, ...depth2].sort((a: any, b: any) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return enrichMessages(all_msgs);
}

export async function createMessage(data: Omit<NewMessage, 'id'>) {
  const id = uuidv4();
  await db.insert(messages).values({ id, ...data });
  return id;
}

export async function getUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, avatar_url: true },
  });
}

export async function getParentMessageId(messageId: string) {
  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
    columns: { parent_message_id: true },
  });
  return msg?.parent_message_id ?? null;
}

export async function getThreadParticipantIds(rootId: string) {
  const rows = await db.execute(sql`
    SELECT DISTINCT sender_id FROM messages WHERE id = ${rootId} OR parent_message_id = ${rootId}
  `);
  return ((rows.rows ?? rows) as any[]).map((r: any) => r.sender_id as string);
}

export async function getDmParticipantIds(threadId: string) {
  const rows = await db.select({ user_id: dm_participants.user_id })
    .from(dm_participants)
    .where(eq(dm_participants.thread_id, threadId));
  return rows.map(r => r.user_id);
}
