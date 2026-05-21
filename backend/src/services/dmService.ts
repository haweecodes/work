import { v4 as uuidv4 } from 'uuid';
import { eq, and, sql } from 'drizzle-orm';
import { db, dm_threads, dm_participants, messages, users, workspace_members, type NewMessage } from '../db';
import { enrichMessages } from '../lib/messageEnrich';

export async function getDmThreads(workspaceId: string, userId: string) {
  const threads = await db.select().from(dm_threads)
    .innerJoin(dm_participants, eq(dm_threads.id, dm_participants.thread_id))
    .where(and(eq(dm_participants.user_id, userId), eq(dm_threads.workspace_id, workspaceId)))
    .then(rows => rows.map(r => r.dm_threads));

  return Promise.all(threads.map(async t => {
    const participants = await db
      .select({ id: users.id, name: users.name, avatar_url: users.avatar_url })
      .from(dm_participants)
      .innerJoin(users, eq(dm_participants.user_id, users.id))
      .where(eq(dm_participants.thread_id, t.id));

    const lastMsg = await db.query.messages.findFirst({
      where: and(eq(messages.dm_thread_id, t.id), sql`${messages.parent_message_id} IS NULL`),
      orderBy: sql`${messages.created_at} DESC`,
      columns: { content: true, created_at: true },
    });

    return { ...t, participants, last_message: lastMsg ?? null };
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

export async function getMessages(threadId: string) {
  const rows = await db.execute(sql`
    SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
           t.id as task_id, t.title as task_title, t.priority as task_priority,
           t.column_id as task_column_id, t.task_key, t.task_number,
           (SELECT COUNT(id)::int FROM messages WHERE parent_message_id = m.id) as reply_count
    FROM messages m LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN tasks t ON t.id = m.linked_task_id
    WHERE m.dm_thread_id = ${threadId} AND m.parent_message_id IS NULL
    ORDER BY m.created_at ASC LIMIT 200
  `);
  return enrichMessages((rows.rows ?? rows) as any[]);
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
      WHERE m.dm_thread_id = ${threadId} AND m.parent_message_id = ANY(${depth1Ids}::text[])
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
