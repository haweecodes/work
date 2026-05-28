import { v4 as uuidv4 } from 'uuid';
import { eq, and, asc, inArray, or } from 'drizzle-orm';
import { db, boards, columns, tasks, task_assignees, users, board_members, channels, channel_members, workspace_members, team_members } from '../db';

export async function getBoardsByWorkspace(workspaceId: string, userId: string) {
  // Public boards are visible to all workspace members.
  // Private boards are visible only when: user is creator, workspace admin,
  // explicit board_member, team member (if team_id set), or channel member (if channel_id set).
  const allBoards = await db.select().from(boards)
    .where(eq(boards.workspace_id, workspaceId))
    .orderBy(asc(boards.created_at));

  const adminRows = await db.select({ role: workspace_members.role })
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)));
  const isAdmin = adminRows.some(r => r.role === 'admin');

  const boardIds = allBoards.map(b => b.id);
  if (boardIds.length === 0) return [];

  const memberRows = await db.select({ board_id: board_members.board_id })
    .from(board_members)
    .where(and(eq(board_members.user_id, userId)));

  const memberBoardIds = new Set(memberRows.map(r => r.board_id));

  const accessible: typeof allBoards = [];
  for (const board of allBoards) {
    if (!board.is_private) { accessible.push(board); continue; }
    if (board.created_by === userId) { accessible.push(board); continue; }
    if (isAdmin) { accessible.push(board); continue; }
    if (memberBoardIds.has(board.id)) { accessible.push(board); continue; }
    if (board.team_id) {
      const teamRow = await db.select({ user_id: team_members.user_id })
        .from(team_members)
        .where(and(eq(team_members.team_id, board.team_id), eq(team_members.user_id, userId)));
      if (teamRow.length > 0) { accessible.push(board); continue; }
    }
    if (board.channel_id) {
      const chMember = await db.select({ user_id: channel_members.user_id })
        .from(channel_members)
        .where(and(eq(channel_members.channel_id, board.channel_id), eq(channel_members.user_id, userId)));
      if (chMember.length > 0) { accessible.push(board); continue; }
    }
  }
  return accessible;
}

export async function isBoardAccessible(boardId: string, userId: string, workspaceId: string): Promise<boolean> {
  const board = await db.query.boards.findFirst({
    where: and(eq(boards.id, boardId), eq(boards.workspace_id, workspaceId)),
  });
  if (!board) return false;
  if (!board.is_private) return true;
  if (board.created_by === userId) return true;

  const adminRows = await db.select({ role: workspace_members.role })
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)));
  if (adminRows.some(r => r.role === 'admin')) return true;

  const memberRow = await db.select({ board_id: board_members.board_id })
    .from(board_members)
    .where(and(eq(board_members.board_id, boardId), eq(board_members.user_id, userId)));
  if (memberRow.length > 0) return true;

  if (board.team_id) {
    const teamRow = await db.select({ user_id: team_members.user_id })
      .from(team_members)
      .where(and(eq(team_members.team_id, board.team_id), eq(team_members.user_id, userId)));
    if (teamRow.length > 0) return true;
  }

  if (board.channel_id) {
    const chRow = await db.select({ user_id: channel_members.user_id })
      .from(channel_members)
      .where(and(eq(channel_members.channel_id, board.channel_id), eq(channel_members.user_id, userId)));
    if (chRow.length > 0) return true;
  }

  return false;
}

export async function getBoardMembers(boardId: string) {
  return db.select({ id: users.id, name: users.name, avatar_url: users.avatar_url })
    .from(board_members)
    .innerJoin(users, eq(board_members.user_id, users.id))
    .where(eq(board_members.board_id, boardId));
}

export async function addBoardMember(boardId: string, userId: string) {
  await db.insert(board_members).values({ board_id: boardId, user_id: userId }).onConflictDoNothing();
  const board = await db.query.boards.findFirst({ where: eq(boards.id, boardId) });
  if (board?.channel_id) {
    const channel = await db.select({ id: channels.id, is_private: channels.is_private })
      .from(channels)
      .where(eq(channels.id, board.channel_id));
    if (channel[0]?.is_private) {
      await db.insert(channel_members).values({ channel_id: board.channel_id, user_id: userId }).onConflictDoNothing();
    }
  }
}

export async function removeBoardMember(boardId: string, userId: string) {
  await db.delete(board_members).where(and(eq(board_members.board_id, boardId), eq(board_members.user_id, userId)));
  const board = await db.query.boards.findFirst({ where: eq(boards.id, boardId) });
  if (board?.channel_id) {
    const channel = await db.select({ id: channels.id, is_private: channels.is_private })
      .from(channels)
      .where(eq(channels.id, board.channel_id));
    if (channel[0]?.is_private) {
      await db.delete(channel_members).where(and(eq(channel_members.channel_id, board.channel_id), eq(channel_members.user_id, userId)));
    }
  }
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

export async function createBoard(workspaceId: string, name: string, projectKey: string, createdBy: string, colTitles: string[], isPrivate = false) {
  const id = uuidv4();
  const [board] = await db.insert(boards)
    .values({ id, workspace_id: workspaceId, name, project_key: projectKey, created_by: createdBy, is_private: isPrivate ? 1 : 0 })
    .returning();

  const colValues = colTitles.map((title, i) => ({ id: uuidv4(), board_id: id, title, position: i }));
  await db.insert(columns).values(colValues);

  // Creator is always a board member so they can manage the board
  await db.insert(board_members).values({ board_id: id, user_id: createdBy }).onConflictDoNothing();

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

export async function getBoardChannel(boardId: string) {
  return db.query.boards.findFirst({
    where: eq(boards.id, boardId),
    columns: { channel_id: true, workspace_id: true },
  });
}

export async function setBoardChannel(boardId: string, channelId: string) {
  await db.update(boards).set({ channel_id: channelId }).where(eq(boards.id, boardId));
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
