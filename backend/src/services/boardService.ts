import { v4 as uuidv4 } from 'uuid';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { db, boards, columns, tasks, task_assignees, users } from '../db';

export async function getBoardsByWorkspace(workspaceId: string) {
  return db.select().from(boards)
    .where(eq(boards.workspace_id, workspaceId))
    .orderBy(asc(boards.created_at));
}

export async function getBoardById(boardId: string, workspaceId: string) {
  return db.query.boards.findFirst({
    where: and(eq(boards.id, boardId), eq(boards.workspace_id, workspaceId)),
  });
}

export async function projectKeyExists(workspaceId: string, key: string) {
  const row = await db.query.boards.findFirst({
    where: and(eq(boards.workspace_id, workspaceId), eq(boards.project_key, key)),
  });
  return !!row;
}

export async function createBoard(workspaceId: string, name: string, projectKey: string, createdBy: string, colTitles: string[]) {
  const id = uuidv4();
  const [board] = await db.insert(boards)
    .values({ id, workspace_id: workspaceId, name, project_key: projectKey, created_by: createdBy })
    .returning();

  const colValues = colTitles.map((title, i) => ({ id: uuidv4(), board_id: id, title, position: i }));
  await db.insert(columns).values(colValues);

  return board;
}

export async function updateBoardName(boardId: string, name: string) {
  const [board] = await db.update(boards).set({ name }).where(eq(boards.id, boardId)).returning();
  return board;
}

export async function updateBoardTeam(boardId: string, teamId: string | null) {
  const [board] = await db.update(boards).set({ team_id: teamId }).where(eq(boards.id, boardId)).returning();
  return board;
}

export async function getColumnsWithTasks(boardId: string) {
  const cols = await db.select().from(columns)
    .where(eq(columns.board_id, boardId))
    .orderBy(asc(columns.position));

  const taskRows = await db.select().from(tasks)
    .where(eq(tasks.board_id, boardId))
    .orderBy(asc(tasks.position));

  const taskIds = taskRows.map(t => t.id);
  const assigneeRows = taskIds.length > 0
    ? await db.select({ task_id: task_assignees.task_id, id: users.id, name: users.name, avatar_url: users.avatar_url })
        .from(task_assignees)
        .innerJoin(users, eq(task_assignees.user_id, users.id))
        .where(inArray(task_assignees.task_id, taskIds))
    : [];

  const assigneesByTask: Record<string, { id: string; name: string; avatar_url: string | null }[]> = {};
  for (const a of assigneeRows) {
    if (!assigneesByTask[a.task_id]) assigneesByTask[a.task_id] = [];
    assigneesByTask[a.task_id].push({ id: a.id, name: a.name, avatar_url: a.avatar_url });
  }

  const tasksByCol: Record<string, typeof taskRows> = {};
  for (const t of taskRows) {
    if (!tasksByCol[t.column_id]) tasksByCol[t.column_id] = [];
    tasksByCol[t.column_id].push({ ...t, assignees: assigneesByTask[t.id] ?? [] } as any);
  }

  return cols.map(col => ({ ...col, tasks: tasksByCol[col.id] ?? [] }));
}

export async function addColumn(boardId: string, title: string) {
  const existing = await db.select({ id: columns.id }).from(columns).where(eq(columns.board_id, boardId));
  const id = uuidv4();
  const [col] = await db.insert(columns)
    .values({ id, board_id: boardId, title, position: existing.length })
    .returning();
  return col;
}
