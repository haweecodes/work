import { v4 as uuidv4 } from 'uuid';
import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import { db, tasks, task_assignees, boards, columns, messages, users, notifications, teams, team_members, type NewTask } from '../db';

export async function getTaskById(id: string, workspaceId: string) {
  const rows = await db.execute(sql`
    SELECT t.*, c.title as column_title,
           m.channel_id as linked_channel_id,
           m.parent_message_id as linked_parent_message_id,
           m.dm_thread_id as linked_dm_thread_id
    FROM tasks t
    JOIN boards b ON t.board_id = b.id
    LEFT JOIN columns c ON t.column_id = c.id
    LEFT JOIN messages m ON t.linked_message_id = m.id
    WHERE t.id = ${id} AND b.workspace_id = ${workspaceId}
  `);
  const task = ((rows.rows ?? rows) as any[])[0] ?? null;
  if (!task) return null;

  const assignees = await db
    .select({ id: users.id, name: users.name, avatar_url: users.avatar_url })
    .from(task_assignees)
    .innerJoin(users, eq(task_assignees.user_id, users.id))
    .where(eq(task_assignees.task_id, id));

  return { ...task, assignees };
}

export async function getTaskForDetail(id: string, workspaceId: string) {
  const rows = await db.execute(sql`
    SELECT t.*, c.title as column_title,
           m.channel_id as linked_channel_id,
           m.parent_message_id as linked_parent_message_id,
           m.dm_thread_id as linked_dm_thread_id
    FROM tasks t
    JOIN boards b ON t.board_id = b.id
    LEFT JOIN columns c ON t.column_id = c.id
    LEFT JOIN messages m ON t.linked_message_id = m.id
    WHERE t.id = ${id} AND b.workspace_id = ${workspaceId}
  `);
  const task = ((rows.rows ?? rows) as any[])[0] ?? null;
  if (!task) return null;

  const assignees = await db
    .select({ id: users.id, name: users.name, avatar_url: users.avatar_url })
    .from(task_assignees)
    .innerJoin(users, eq(task_assignees.user_id, users.id))
    .where(eq(task_assignees.task_id, id));

  return { ...task, assignees };
}

export async function resolveTaskByKey(taskKey: string, workspaceId: string) {
  const rows = await db.execute(sql`
    SELECT t.id as task_id, t.board_id, b.workspace_id
    FROM tasks t JOIN boards b ON t.board_id = b.id
    WHERE UPPER(t.task_key) = ${taskKey.toUpperCase()} AND b.workspace_id = ${workspaceId}
  `);
  return ((rows.rows ?? rows) as any[])[0] ?? null;
}

export async function getTaskDetailForNotification(id: string) {
  const rows = await db.execute(sql`
    SELECT t.board_id, t.task_key FROM tasks t WHERE t.id = ${id}
  `);
  return ((rows.rows ?? rows) as any[])[0] ?? null;
}

export async function getNextTaskSequence(boardId: string) {
  const rows = await db.execute(sql`
    UPDATE boards SET task_sequence = task_sequence + 1 WHERE id = ${boardId} RETURNING task_sequence
  `);
  const result = ((rows.rows ?? rows) as any[])[0];
  return Number(result.task_sequence);
}

export async function createTask(data: Omit<NewTask, 'id'>) {
  const id = uuidv4();
  await db.insert(tasks).values({ id, ...data });
  return id;
}

export async function linkMessageToTask(messageId: string, taskId: string) {
  await db.update(messages).set({ linked_task_id: taskId }).where(eq(messages.id, messageId));
}

export async function getEnrichedTask(id: string) {
  const rows = await db.execute(sql`
    SELECT t.*, c.title as column_title,
           m.channel_id as linked_channel_id,
           m.parent_message_id as linked_parent_message_id,
           m.dm_thread_id as linked_dm_thread_id
    FROM tasks t
    LEFT JOIN columns c ON t.column_id = c.id
    LEFT JOIN messages m ON t.linked_message_id = m.id
    WHERE t.id = ${id}
  `);
  const task = ((rows.rows ?? rows) as any[])[0] ?? null;
  if (!task) return null;

  const assignees = await db
    .select({ id: users.id, name: users.name, avatar_url: users.avatar_url })
    .from(task_assignees)
    .innerJoin(users, eq(task_assignees.user_id, users.id))
    .where(eq(task_assignees.task_id, id));

  return { ...task, assignees };
}

export async function updateTask(id: string, values: Partial<typeof tasks.$inferInsert>) {
  await db.update(tasks).set(values).where(eq(tasks.id, id));
}

export async function getColumnCount(columnId: string) {
  const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.column_id, columnId));
  return rows.length;
}

export async function getTasksByParent(parentId: string) {
  return db.select({ id: tasks.id, board_id: tasks.board_id })
    .from(tasks)
    .where(eq(tasks.parent_task_id, parentId));
}

export async function migrateSubtask(subtaskId: string, boardId: string, columnId: string) {
  await db.update(tasks).set({ board_id: boardId, column_id: columnId }).where(eq(tasks.id, subtaskId));
}

export async function getSubtaskCount(parentId: string) {
  const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parent_task_id, parentId));
  return rows.length;
}

export async function getTaskAssignees(taskId: string) {
  return db.select({ user_id: task_assignees.user_id })
    .from(task_assignees)
    .where(eq(task_assignees.task_id, taskId));
}

export async function addAssignee(taskId: string, userId: string) {
  await db.insert(task_assignees).values({ task_id: taskId, user_id: userId }).onConflictDoNothing();
}

export async function removeAssignee(taskId: string, userId: string) {
  await db.delete(task_assignees)
    .where(and(eq(task_assignees.task_id, taskId), eq(task_assignees.user_id, userId)));
}

export async function deleteTask(id: string) {
  await db.delete(task_assignees).where(eq(task_assignees.task_id, id));
  await db.update(messages).set({ linked_task_id: null }).where(eq(messages.linked_task_id, id));
  await db.delete(tasks).where(eq(tasks.id, id));
}

export async function deleteTaskCascade(id: string) {
  const subtasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parent_task_id, id));
  if (subtasks.length > 0) {
    const subtaskIds = subtasks.map(s => s.id);
    await db.delete(task_assignees).where(inArray(task_assignees.task_id, subtaskIds));
    await db.update(messages).set({ linked_task_id: null }).where(inArray(messages.linked_task_id, subtaskIds));
    await db.delete(tasks).where(inArray(tasks.id, subtaskIds));
  }
  await db.delete(task_assignees).where(eq(task_assignees.task_id, id));
  await db.update(messages).set({ linked_task_id: null }).where(eq(messages.linked_task_id, id));
  await db.delete(tasks).where(eq(tasks.id, id));
}

export async function moveTask(id: string, columnId: string, position: number) {
  await db.update(tasks).set({ column_id: columnId, position }).where(eq(tasks.id, id));
}

export async function getUserName(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } });
  return user?.name ?? 'A user';
}

export async function createAssignmentNotification(userId: string, type: string, taskId: string, message: string, workspaceId: string) {
  const id = uuidv4();
  await db.insert(notifications).values({ id, user_id: userId, type, reference_id: taskId, reference_type: 'task', message, workspace_id: workspaceId, is_read: 0 });
  return id;
}

export async function columnBelongsToBoard(columnId: string, boardId: string) {
  const row = await db.query.columns.findFirst({
    where: and(eq(columns.id, columnId), eq(columns.board_id, boardId)),
  });
  return !!row;
}

export async function boardBelongsToWorkspace(boardId: string, workspaceId: string) {
  const row = await db.query.boards.findFirst({
    where: and(eq(boards.id, boardId), eq(boards.workspace_id, workspaceId)),
  });
  return !!row;
}

export async function getBoardTeamMembers(boardId: string): Promise<Array<{ user_id: string }>> {
  const rows = await db.execute(sql`
    SELECT tm.user_id
    FROM boards b
    JOIN team_members tm ON tm.team_id = b.team_id
    WHERE b.id = ${boardId} AND b.team_id IS NOT NULL
  `);
  return (rows.rows ?? rows) as Array<{ user_id: string }>;
}

export async function getLastColumnId(boardId: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT id FROM columns WHERE board_id = ${boardId} ORDER BY position DESC LIMIT 1
  `);
  const row = ((rows.rows ?? rows) as any[])[0];
  return row?.id ?? null;
}

export async function getBoardName(boardId: string): Promise<string> {
  const row = await db.query.boards.findFirst({ where: eq(boards.id, boardId), columns: { name: true } });
  return row?.name ?? 'a board';
}
