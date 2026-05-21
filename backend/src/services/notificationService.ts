import { v4 as uuidv4 } from 'uuid';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db, notifications, users, type NewNotification } from '../db';

export async function getNotifications(userId: string, workspaceId: string) {
  return db.select().from(notifications)
    .where(and(
      eq(notifications.user_id, userId),
      eq(notifications.workspace_id, workspaceId),
      ne(notifications.type, 'dm'),
    ))
    .orderBy(sql`${notifications.created_at} DESC`)
    .limit(50);
}

export async function markRead(ids: string[], userId: string) {
  for (const id of ids) {
    await db.update(notifications)
      .set({ is_read: 1 })
      .where(and(eq(notifications.id, id), eq(notifications.user_id, userId)));
  }
}

export async function markAllRead(userId: string, workspaceId: string) {
  await db.update(notifications)
    .set({ is_read: 1 })
    .where(and(eq(notifications.user_id, userId), eq(notifications.workspace_id, workspaceId)));
}

export async function createNotification(data: NewNotification) {
  const [notif] = await db.insert(notifications).values(data).returning();
  return notif;
}

export async function getPendingAlertToRecipient(recipientId: string, senderId: string, workspaceId: string) {
  return db.query.notifications.findFirst({
    where: and(
      eq(notifications.user_id, recipientId),
      eq(notifications.type, 'priority_alert'),
      eq(notifications.is_resolved, 0),
      eq(notifications.reference_id, senderId),
      eq(notifications.workspace_id, workspaceId),
    ),
  });
}

export async function countUnresolvedAlerts(recipientId: string, workspaceId: string) {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(notifications)
    .where(and(
      eq(notifications.user_id, recipientId),
      eq(notifications.type, 'priority_alert'),
      eq(notifications.is_resolved, 0),
      eq(notifications.workspace_id, workspaceId),
    ));
  return Number(rows[0]?.count ?? 0);
}

export async function resolveAlertsByReference(userId: string, referenceId: string, workspaceId: string) {
  await db.update(notifications)
    .set({ is_resolved: 1, is_read: 1 })
    .where(and(
      eq(notifications.user_id, userId),
      eq(notifications.type, 'priority_alert'),
      eq(notifications.reference_id, referenceId),
      eq(notifications.workspace_id, workspaceId),
      eq(notifications.is_resolved, 0),
    ));
}

export async function resolveAlertById(notifId: string, userId: string) {
  await db.update(notifications)
    .set({ is_resolved: 1, is_read: 1 })
    .where(and(eq(notifications.id, notifId), eq(notifications.user_id, userId)));
}

export async function getSenderInfo(senderId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, senderId),
    columns: { name: true, avatar_url: true },
  });
}
