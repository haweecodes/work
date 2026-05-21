import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db, task_update_requests, task_update_responses, tasks, task_assignees, workspace_members, boards, notifications, users } from '../db';

export async function canRequestUpdates(userId: string, workspaceId: string, boardCreatedBy: string | null) {
  if (userId === boardCreatedBy) return true;
  const member = await db.query.workspace_members.findFirst({
    where: and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)),
    columns: { role: true },
  });
  return member?.role === 'admin';
}

export async function getBoardWithCreator(boardId: string, workspaceId: string) {
  return db.query.boards.findFirst({
    where: and(eq(boards.id, boardId), eq(boards.workspace_id, workspaceId)),
    columns: { id: true, created_by: true },
  });
}

export async function getTasksForScope(boardId: string, scope: string, taskId?: string, columnId?: string) {
  if (scope === 'task' && taskId) {
    const t = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.board_id, boardId)),
      columns: { id: true, title: true, task_key: true },
    });
    return t ? [t] : [];
  }
  if (scope === 'column' && columnId) {
    return db.select({ id: tasks.id, title: tasks.title, task_key: tasks.task_key })
      .from(tasks)
      .where(and(eq(tasks.column_id, columnId), eq(tasks.board_id, boardId)));
  }
  return db.select({ id: tasks.id, title: tasks.title, task_key: tasks.task_key })
    .from(tasks)
    .where(eq(tasks.board_id, boardId));
}

export async function createRequest(boardId: string, scope: string, requestedBy: string, workspaceId: string, taskId?: string, columnId?: string) {
  const id = uuidv4();
  const [req] = await db.insert(task_update_requests)
    .values({ id, board_id: boardId, scope, task_id: taskId ?? null, column_id: columnId ?? null, requested_by: requestedBy, workspace_id: workspaceId })
    .returning();
  return req;
}

export async function getAssigneesForTask(taskId: string) {
  return db.select({ user_id: task_assignees.user_id })
    .from(task_assignees)
    .where(eq(task_assignees.task_id, taskId));
}

export async function createUpdateRequestNotification(userId: string, type: string, referenceId: string, message: string, extraId: string, workspaceId: string) {
  const id = uuidv4();
  await db.insert(notifications).values({ id, user_id: userId, type, reference_id: referenceId, reference_type: 'update_request', message, extra_id: extraId, workspace_id: workspaceId, is_read: 0 });
  return id;
}

export async function getRequestById(requestId: string, workspaceId: string) {
  return db.query.task_update_requests.findFirst({
    where: and(eq(task_update_requests.id, requestId), eq(task_update_requests.workspace_id, workspaceId)),
  });
}

export async function isTaskAssignee(taskId: string, userId: string) {
  const row = await db.query.task_assignees.findFirst({
    where: and(eq(task_assignees.task_id, taskId), eq(task_assignees.user_id, userId)),
  });
  return !!row;
}

export async function upsertResponse(requestId: string, taskId: string, userId: string, status: string, reason?: string) {
  const existing = await db.query.task_update_responses.findFirst({
    where: and(
      eq(task_update_responses.request_id, requestId),
      eq(task_update_responses.task_id, taskId),
      eq(task_update_responses.user_id, userId),
    ),
    columns: { id: true },
  });

  if (existing) {
    await db.update(task_update_responses)
      .set({ status, reason: reason ?? null, created_at: new Date() })
      .where(eq(task_update_responses.id, existing.id));
    return existing.id;
  }

  const id = uuidv4();
  await db.insert(task_update_responses).values({ id, request_id: requestId, task_id: taskId, user_id: userId, status, reason: reason ?? null });
  return id;
}

export async function markRequestNotificationRead(userId: string, requestId: string) {
  await db.update(notifications)
    .set({ is_read: 1 })
    .where(and(
      eq(notifications.user_id, userId),
      eq(notifications.type, 'task_update_request'),
      eq(notifications.reference_id, requestId),
    ));
}

export async function getUserName(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } });
  return user?.name ?? 'Someone';
}

export async function getTaskKeyAndTitle(taskId: string) {
  return db.query.tasks.findFirst({ where: eq(tasks.id, taskId), columns: { task_key: true, title: true } });
}

export async function getUpdateHistory(boardId: string, workspaceId: string) {
  const requestRows = await db.execute(sql`
    SELECT r.*, u.name as requester_name
    FROM task_update_requests r
    JOIN users u ON u.id = r.requested_by
    WHERE r.board_id = ${boardId} AND r.workspace_id = ${workspaceId}
    ORDER BY r.created_at DESC
  `);
  const requests = (requestRows.rows ?? requestRows) as any[];
  if (requests.length === 0) return [];

  const requestIds = requests.map((r: any) => r.id);
  // Use Drizzle query builder for responses (safe inArray)
  const responses = await db
    .select({
      id: task_update_responses.id,
      request_id: task_update_responses.request_id,
      task_id: task_update_responses.task_id,
      user_id: task_update_responses.user_id,
      status: task_update_responses.status,
      reason: task_update_responses.reason,
      created_at: task_update_responses.created_at,
      task_key: tasks.task_key,
      task_title: tasks.title,
      user_name: users.name,
    })
    .from(task_update_responses)
    .innerJoin(tasks, eq(task_update_responses.task_id, tasks.id))
    .innerJoin(users, eq(task_update_responses.user_id, users.id))
    .where(inArray(task_update_responses.request_id, requestIds))
    .orderBy(task_update_responses.created_at);

  // Use sql.join() to safely build IN clause for the complex pending query
  const idInClause = sql.join(requestIds.map(id => sql`${id}`), sql`, `);
  const pendingRows = await db.execute(sql`
    SELECT r.id as request_id, t.id as task_id, t.task_key, t.title as task_title,
           ta.user_id, u.name as user_name
    FROM task_update_requests r
    JOIN tasks t ON (
      (r.scope = 'task'   AND t.id = r.task_id)   OR
      (r.scope = 'column' AND t.column_id = r.column_id AND t.board_id = r.board_id) OR
      (r.scope = 'board'  AND t.board_id = r.board_id)
    )
    JOIN task_assignees ta ON ta.task_id = t.id
    JOIN users u ON u.id = ta.user_id
    WHERE r.id IN (${idInClause})
  `);
  const pending = (pendingRows.rows ?? pendingRows) as any[];

  const responsesByRequest: Record<string, any[]> = {};
  for (const r of responses) {
    if (!responsesByRequest[r.request_id]) responsesByRequest[r.request_id] = [];
    responsesByRequest[r.request_id].push(r);
  }

  const respondedKeys = new Set(responses.map((r: any) => `${r.request_id}:${r.task_id}:${r.user_id}`));
  const pendingByRequest: Record<string, any[]> = {};
  for (const p of pending) {
    const key = `${p.request_id}:${p.task_id}:${p.user_id}`;
    if (!respondedKeys.has(key)) {
      if (!pendingByRequest[p.request_id]) pendingByRequest[p.request_id] = [];
      pendingByRequest[p.request_id].push({ ...p, status: 'pending' });
    }
  }

  return requests.map((r: any) => ({
    ...r,
    responses: [...(responsesByRequest[r.id] ?? []), ...(pendingByRequest[r.id] ?? [])],
  }));
}

export async function getPendingForUser(userId: string, workspaceId: string) {
  const rows = await db.execute(sql`
    SELECT n.id as notification_id, n.extra_id as request_id,
           n.reference_id as task_id, r.board_id,
           u.name as requester_name
    FROM notifications n
    JOIN task_update_requests r ON r.id = n.extra_id
    JOIN users u ON u.id = r.requested_by
    WHERE n.user_id = ${userId} AND n.type = 'task_update_request'
      AND n.workspace_id = ${workspaceId} AND n.is_read = 0
  `);
  return (rows.rows ?? rows) as any[];
}

export async function getTaskForNotification(taskId: string, workspaceId: string) {
  const rows = await db.execute(sql`
    SELECT t.task_key, t.board_id FROM tasks t
    JOIN boards b ON b.id = t.board_id
    WHERE t.id = ${taskId} AND b.workspace_id = ${workspaceId}
  `);
  const result = ((rows.rows ?? rows) as any[])[0];
  return result ?? null;
}
