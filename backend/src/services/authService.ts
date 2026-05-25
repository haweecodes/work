import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db, users, workspace_members } from '../db';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function findUserByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

export async function createUser(name: string, email: string, password: string) {
  const id = uuidv4();
  const password_hash = await bcrypt.hash(password, 10);
  const avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
  const [user] = await db.insert(users).values({ id, name, email, password_hash, avatar_url }).returning();
  return user;
}

export async function findUserById(id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export async function updateUserProfile(id: string, fields: { name?: string; mobile_number?: string; working_hours?: string }) {
  const [user] = await db.update(users).set(fields).where(eq(users.id, id)).returning();
  return user;
}

export async function setUserStatus(id: string, status_emoji: string | null, status_text: string | null) {
  const [user] = await db.update(users).set({ status_emoji, status_text }).where(eq(users.id, id)).returning();
  return user;
}

export async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await db.select({ workspace_id: workspace_members.workspace_id })
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId));
  return rows.map(r => r.workspace_id);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signToken(userId: string) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}
