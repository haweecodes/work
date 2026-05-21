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
