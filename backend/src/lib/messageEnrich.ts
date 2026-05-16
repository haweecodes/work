import { all, get } from '../db';

/** Generate an IN-clause placeholder string: `?, ?, ?` */
export const ph = (arr: any[]) => arr.map(() => '?').join(', ');

/** Fetch and aggregate reactions for a single message (used in single-message responses). */
export async function getReactionsForMessage(messageId: string) {
  const rows = await all<{ emoji: string; user_id: string }>(
    `SELECT emoji, user_id FROM message_reactions WHERE message_id = ? ORDER BY created_at ASC`,
    [messageId]
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.user_id);
  }
  return Object.entries(map).map(([emoji, users]) => ({ emoji, count: users.length, users }));
}

/** Fetch a shared-message preview for a single share (used in share-message response). */
export async function getSharedMessagePreview(sharedMessageId: string | null | undefined) {
  if (!sharedMessageId) return null;
  const sm = await get<any>(
    `SELECT m.id, m.content, m.created_at, m.channel_id, m.dm_thread_id, m.parent_message_id,
            u.name as sender_name, u.avatar_url as sender_avatar, c.name as channel_name
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN channels c ON c.id = m.channel_id
     WHERE m.id = ?`,
    [sharedMessageId]
  );
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
 * Fires 4 queries regardless of list length instead of N×4.
 * Works for both channel and DM messages — nullable fields (channel_id,
 * dm_thread_id, edited_at) are always included and will be null when absent.
 */
export async function enrichMessages(rows: any[]): Promise<any[]> {
  if (rows.length === 0) return [];

  const msgIds    = rows.map(m => m.id);
  const taskIds   = [...new Set(rows.filter(m => m.task_id).map(m => m.task_id))];
  const colIds    = [...new Set(rows.filter(m => m.task_column_id).map(m => m.task_column_id))];
  const sharedIds = [...new Set(rows.filter(m => m.shared_message_id).map(m => m.shared_message_id))];

  // 1. All reactions
  const allReactions = await all<{ message_id: string; emoji: string; user_id: string }>(
    `SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN (${ph(msgIds)}) ORDER BY created_at ASC`,
    msgIds
  );
  const reactionsByMsg: Record<string, Array<{ emoji: string; user_id: string }>> = {};
  for (const r of allReactions) {
    if (!reactionsByMsg[r.message_id]) reactionsByMsg[r.message_id] = [];
    reactionsByMsg[r.message_id].push(r);
  }

  // 2. All task assignees
  const assigneesByTask: Record<string, any[]> = {};
  if (taskIds.length > 0) {
    const assigneeRows = await all<any>(
      `SELECT ta.task_id, u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id IN (${ph(taskIds)})`,
      taskIds
    );
    for (const r of assigneeRows) {
      if (!assigneesByTask[r.task_id]) assigneesByTask[r.task_id] = [];
      assigneesByTask[r.task_id].push({ id: r.id, name: r.name, avatar_url: r.avatar_url });
    }
  }

  // 3. All column titles for linked tasks
  const titleByCol: Record<string, string> = {};
  if (colIds.length > 0) {
    const cols = await all<{ id: string; title: string }>(
      `SELECT id, title FROM columns WHERE id IN (${ph(colIds)})`,
      colIds
    );
    for (const c of cols) titleByCol[c.id] = c.title;
  }

  // 4. All shared message previews
  const previewById: Record<string, any> = {};
  if (sharedIds.length > 0) {
    const previews = await all<any>(
      `SELECT m.id, m.content, m.created_at, m.channel_id, m.dm_thread_id, m.parent_message_id,
              u.name as sender_name, u.avatar_url as sender_avatar, c.name as channel_name
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN channels c ON c.id = m.channel_id
       WHERE m.id IN (${ph(sharedIds)})`,
      sharedIds
    );
    for (const p of previews) {
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
