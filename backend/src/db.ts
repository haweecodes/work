import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

// Re-export Drizzle instance and schema so `import { db, users, ... } from '../db'` works
export { db } from './db/index';
export * from './db/schema';

const sql = neon(process.env.DATABASE_URL!);

/** Convert SQLite-style ? placeholders to PostgreSQL $1, $2, … */
function toPg(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

export async function initDb(): Promise<void> {
  try {
    await sql`SELECT 1`;
    // Safe schema migrations — IF NOT EXISTS means these are idempotent
    await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`;
    await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_resolved INTEGER DEFAULT 0`;
    await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_name TEXT`;
    await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_avatar TEXT`;
    await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id TEXT`;
    await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT`;
    await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS importance TEXT DEFAULT 'normal'`;
    await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS mention_priorities TEXT`;
    await sql`ALTER TABLE boards ADD COLUMN IF NOT EXISTS created_by TEXT`;
    await sql`CREATE TABLE IF NOT EXISTS task_update_requests (
      id           TEXT PRIMARY KEY,
      board_id     TEXT NOT NULL,
      scope        TEXT NOT NULL,
      task_id      TEXT,
      column_id    TEXT,
      requested_by TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS extra_id TEXT`;
    await sql`CREATE TABLE IF NOT EXISTS task_update_responses (
      id         TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      task_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      status     TEXT NOT NULL,
      reason     TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT PRIMARY KEY,
      task_update_statuses TEXT NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;

    // ── Performance indexes (idempotent) ────────────────────────────────────
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_channel_id      ON messages(channel_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_dm_thread_id    ON messages(dm_thread_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_created_at      ON messages(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_parent          ON messages(parent_message_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_channel_members_channel  ON channel_members(channel_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_channel_members_user     ON channel_members(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_dm_participants_thread   ON dm_participants(thread_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_dm_participants_user     ON dm_participants(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_task_assignees_task      ON task_assignees(task_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_task_assignees_user      ON task_assignees(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_workspace_members_ws     ON workspace_members(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_ws   ON notifications(user_id, workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tasks_column_id         ON tasks(column_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tasks_board_id          ON tasks(board_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_columns_board_id        ON columns(board_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_channels_workspace_id   ON channels(workspace_id)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS working_hours TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS status_emoji TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS status_text TEXT`;

    console.log('✅ Connected to Neon PostgreSQL');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    throw err;
  }
}

export async function run(query: string, params: any[] = []): Promise<void> {
  await sql(toPg(query), params);
}

export async function all<T = any>(query: string, params: any[] = []): Promise<T[]> {
  const rows = await sql(toPg(query), params);
  return rows as unknown as T[];
}

export async function get<T = any>(query: string, params: any[] = []): Promise<T | undefined> {
  const rows = await sql(toPg(query), params);
  return rows[0] as T | undefined;
}

/** UPDATE/INSERT ... RETURNING — returns the affected rows. */
export async function returning<T = any>(query: string, params: any[] = []): Promise<T[]> {
  const rows = await sql(toPg(query), params);
  return rows as unknown as T[];
}

/** Run multiple writes atomically. Rolls back all on any failure. */
export async function runTransaction(
  ops: Array<{ query: string; params?: any[] }>
): Promise<void> {
  await sql.transaction(ops.map(op => sql(toPg(op.query), op.params ?? [])));
}

/** No-op: persistence is now handled by Neon */
export function saveDb(): void {}
