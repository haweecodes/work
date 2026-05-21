import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db, users, type NewUser } from '../db';

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

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signToken(userId: string) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}
