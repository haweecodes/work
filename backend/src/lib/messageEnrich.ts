import { sql, inArray } from 'drizzle-orm';
import { db, message_reactions, task_assignees, columns, messages, users } from '../db';
import { eq } from 'drizzle-orm';

/** Fetch and aggregate reactions for a single message. */
export async function getReactionsForMessage(messageId: string) {
  const rows = await db.select({ emoji: message_reactions.emoji, user_id: message_reactions.user_id })
    .from(message_reactions)
    .where(eq(message_reactions.message_id, messageId))
    .orderBy(message_reactions.created_at);

  const map: Record<string, string[]> = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.user_id);
  }
  return Object.entries(map).map(([emoji, users]) => ({ emoji, count: users.length, users }));
}

/** Fetch a shared-message preview. */
export async function getSharedMessagePreview(sharedMessageId: string | null | undefined) {
  if (!sharedMessageId) return null;
  const rows = await db.execute(sql`
    SELECT m.id, m.content, m.created_at, m.channel_id, m.dm_thread_id, m.parent_message_id,
           u.name as sender_name, u.avatar_url as sender_avatar, c.name as channel_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN channels c ON c.id = m.channel_id
    WHERE m.id = ${sharedMessageId}
  `);
  const sm = ((rows.rows ?? rows) as any[])[0];
  if (!sm) return null;
  return {
    id: sm.id, content: sm.content, created_at: sm.created_at,
    sender_name: sm.sender_name, sender_avatar: sm.sender_avatar,
    channel_id: sm.channel_id ?? undefined, channel_name: sm.channel_name ?? undefined,
    dm_thread_id: sm.dm_thread_id ?? undefined, parent_message_id: sm.parent_message_id ?? undefined,
  };
}

/**
 * Batch-enrich a list of raw message rows.
 * Fires 4 queries regardless of list length.
 */
export async function enrichMessages(rows: any[]): Promise<any[]> {
  if (rows.length === 0) return [];

  const msgIds    = rows.map(m => m.id);
  const taskIds   = [...new Set(rows.filter(m => m.task_id).map(m => m.task_id))];
  const colIds    = [...new Set(rows.filter(m => m.task_column_id).map(m => m.task_column_id))];
  const sharedIds = [...new Set(rows.filter(m => m.shared_message_id).map(m => m.shared_message_id))];

  // 1. Reactions
  const allReactions = msgIds.length > 0
    ? await db.select({ message_id: message_reactions.message_id, emoji: message_reactions.emoji, user_id: message_reactions.user_id })
        .from(message_reactions)
        .where(inArray(message_reactions.message_id, msgIds))
        .orderBy(message_reactions.created_at)
    : [];

  const reactionsByMsg: Record<string, Array<{ emoji: string; user_id: string }>> = {};
  for (const r of allReactions) {
    if (!reactionsByMsg[r.message_id]) reactionsByMsg[r.message_id] = [];
    reactionsByMsg[r.message_id].push(r);
  }

  // 2. Task assignees
  const assigneesByTask: Record<string, any[]> = {};
  if (taskIds.length > 0) {
    const assigneeRows = await db.select({
      task_id: task_assignees.task_id,
      id: users.id, name: users.name, avatar_url: users.avatar_url,
    })
      .from(task_assignees)
      .innerJoin(users, eq(task_assignees.user_id, users.id))
      .where(inArray(task_assignees.task_id, taskIds));

    for (const r of assigneeRows) {
      if (!assigneesByTask[r.task_id]) assigneesByTask[r.task_id] = [];
      assigneesByTask[r.task_id].push({ id: r.id, name: r.name, avatar_url: r.avatar_url });
    }
  }

  // 3. Column titles
  const titleByCol: Record<string, string> = {};
  if (colIds.length > 0) {
    const cols = await db.select({ id: columns.id, title: columns.title })
      .from(columns)
      .where(inArray(columns.id, colIds));
    for (const c of cols) titleByCol[c.id] = c.title;
  }

  // 4. Shared message previews
  const previewById: Record<string, any> = {};
  if (sharedIds.length > 0) {
    const previews = await db.execute(sql`
      SELECT m.id, m.content, m.created_at, m.channel_id, m.dm_thread_id, m.parent_message_id,
             u.name as sender_name, u.avatar_url as sender_avatar, c.name as channel_name
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      LEFT JOIN channels c ON c.id = m.channel_id
      WHERE m.id = ANY(${sharedIds}::text[])
    `);
    for (const p of ((previews.rows ?? previews) as any[])) {
      previewById[p.id] = {
        id: p.id, content: p.content, created_at: p.created_at,
        sender_name: p.sender_name, sender_avatar: p.sender_avatar,
        channel_id: p.channel_id ?? undefined, channel_name: p.channel_name ?? undefined,
        dm_thread_id: p.dm_thread_id ?? undefined, parent_message_id: p.parent_message_id ?? undefined,
      };
    }
  }

  return rows.map(m => {
    const rawReactions = reactionsByMsg[m.id] ?? [];
    const reactionMap: Record<string, string[]> = {};
    for (const r of rawReactions) {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] = [];
      reactionMap[r.emoji].push(r.user_id);
    }
    const reactions = Object.entries(reactionMap).map(([emoji, users]) => ({ emoji, count: users.length, users }));

    const linked_task = m.task_id ? {
      id: m.task_id, title: m.task_title, priority: m.task_priority,
      task_key: m.task_key, task_number: m.task_number,
      column_title: titleByCol[m.task_column_id] ?? '',
      assignees: assigneesByTask[m.task_id] ?? [],
    } : null;

    const shared_message = m.shared_message_id ? (previewById[m.shared_message_id] ?? null) : null;

    let mention_priorities: any[] = [];
    try { mention_priorities = m.mention_priorities ? JSON.parse(m.mention_priorities) : []; } catch {}

    return {
      id: m.id,
      channel_id: m.channel_id ?? null,
      dm_thread_id: m.dm_thread_id ?? null,
      sender_id: m.sender_id,
      content: m.content,
      created_at: m.created_at,
      linked_task_id: m.linked_task_id,
      linked_task,
      sender: { id: m.sender_id, name: m.sender_name, avatar_url: m.sender_avatar },
      parent_message_id: m.parent_message_id ?? null,
      reply_count: m.reply_count != null ? Number(m.reply_count) : 0,
      reactions,
      shared_message_id: m.shared_message_id ?? null,
      shared_message,
      is_system: m.is_system ?? 0,
      edited_at: m.edited_at ?? null,
      importance: m.importance ?? 'normal',
      mention_priorities,
    };
  });
}
