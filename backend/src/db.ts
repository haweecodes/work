import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/** Convert SQLite-style ? placeholders to PostgreSQL $1, $2, … */
function toPg(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

export async function initDb(): Promise<void> {
  try {
    await sql`SELECT 1`;
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

/** No-op: persistence is now handled by Neon */
export function saveDb(): void {}
