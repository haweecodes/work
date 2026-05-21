import { v4 as uuidv4 } from 'uuid';
import { eq, and, sql } from 'drizzle-orm';
import { db, workspaces, workspace_members, channels, channel_members, users } from '../db';

export async function getUserWorkspaces(userId: string) {
  return db
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(workspace_members, eq(workspaces.id, workspace_members.workspace_id))
    .where(eq(workspace_members.user_id, userId))
    .orderBy(workspaces.created_at)
    .then(rows => rows.map(r => r.workspace));
}

export async function createWorkspace(name: string, ownerId: string) {
  const id = uuidv4();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + id.slice(0, 6);
  const invite_code = uuidv4().replace(/-/g, '').slice(0, 12);

  const [workspace] = await db.insert(workspaces).values({ id, name, slug, owner_id: ownerId, invite_code }).returning();
  await db.insert(workspace_members).values({ workspace_id: id, user_id: ownerId, role: 'admin' });

  const channelId = uuidv4();
  await db.insert(channels).values({ id: channelId, workspace_id: id, name: 'general', is_private: 0, created_by: ownerId });
  await db.insert(channel_members).values({ channel_id: channelId, user_id: ownerId });

  return workspace;
}

export async function getWorkspaceMembers(workspaceId: string) {
  return db
    .select({
      id: users.id, name: users.name, email: users.email,
      avatar_url: users.avatar_url, role: workspace_members.role,
    })
    .from(workspace_members)
    .innerJoin(users, eq(workspace_members.user_id, users.id))
    .where(eq(workspace_members.workspace_id, workspaceId));
}

export async function findUserByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

export async function isWorkspaceMember(workspaceId: string, userId: string) {
  const row = await db.query.workspace_members.findFirst({
    where: and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)),
  });
  return !!row;
}

export async function addMember(workspaceId: string, userId: string) {
  await db.insert(workspace_members).values({ workspace_id: workspaceId, user_id: userId, role: 'member' });

  const general = await db.query.channels.findFirst({
    where: and(eq(channels.workspace_id, workspaceId), eq(channels.name, 'general')),
  });
  if (general) {
    await db.insert(channel_members).values({ channel_id: general.id, user_id: userId }).onConflictDoNothing();
  }
}

export async function getWorkspaceByInviteCode(code: string) {
  return db.query.workspaces.findFirst({ where: eq(workspaces.invite_code, code) });
}

export async function getMemberPublicData(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, email: true, avatar_url: true },
  });
}
