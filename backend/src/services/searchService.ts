import { sql } from 'drizzle-orm';
import { db } from '../db';

export async function searchMessagesAndTasks(q: string, userId: string, workspaceId: string) {
  const pattern = `%${q}%`;

  const messages = await db.execute(sql`
    SELECT m.id, m.content, m.created_at, m.channel_id, m.dm_thread_id,
           u.name as sender_name, u.avatar_url as sender_avatar,
           c.name as channel_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN channels c ON c.id = m.channel_id
    LEFT JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = ${userId}
    LEFT JOIN dm_participants dp ON dp.thread_id = m.dm_thread_id AND dp.user_id = ${userId}
    WHERE m.is_system = 0
      AND m.content ILIKE ${pattern}
      AND (
        (m.channel_id IS NOT NULL AND cm.user_id IS NOT NULL AND c.workspace_id = ${workspaceId})
        OR
        (m.dm_thread_id IS NOT NULL AND dp.user_id IS NOT NULL)
      )
    ORDER BY m.created_at DESC
    LIMIT 20
  `);

  const tasks = await db.execute(sql`
    SELECT t.id, t.title, t.priority, t.task_key, t.due_date, t.column_id,
           b.name as board_name, b.id as board_id,
           col.title as column_title
    FROM tasks t
    JOIN boards b ON b.id = t.board_id
    LEFT JOIN columns col ON col.id = t.column_id
    WHERE b.workspace_id = ${workspaceId}
      AND t.title ILIKE ${pattern}
    ORDER BY t.created_at DESC
    LIMIT 20
  `);

  return { messages: messages.rows ?? messages, tasks: tasks.rows ?? tasks };
}
