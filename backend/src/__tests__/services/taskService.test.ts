// Drizzle ORM helper functions are pure JS — no DB connection needed
jest.mock('drizzle-orm', () => ({
  eq: jest.fn().mockReturnValue({}),
  and: jest.fn().mockReturnValue({}),
  sql: Object.assign(jest.fn().mockReturnValue({}), { raw: jest.fn() }),
  inArray: jest.fn().mockReturnValue({}),
  desc: jest.fn().mockReturnValue({}),
  asc: jest.fn().mockReturnValue({}),
}));

// Build a thenable that also chains .onConflictDoNothing()
const makeValuesResult = () => {
  const obj: any = {
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
  };
  obj.then = (resolve: any, reject?: any) => Promise.resolve(undefined).then(resolve, reject);
  obj.catch = (reject: any) => Promise.resolve(undefined).catch(reject);
  return obj;
};

const mockFindFirstBoards = jest.fn();
const mockFindFirstColumns = jest.fn();
const mockFindFirstUsers = jest.fn();
const mockExecute = jest.fn();
const mockWhere = jest.fn().mockResolvedValue([]);
const mockInnerJoinWhere = jest.fn().mockResolvedValue([]);
const mockInnerJoin = jest.fn().mockReturnValue({ where: mockInnerJoinWhere });
const mockFrom = jest.fn().mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin });
const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
const mockValues = jest.fn().mockImplementation(() => makeValuesResult());
const mockInsert = jest.fn().mockReturnValue({ values: mockValues });
const mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
const mockSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
const mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
const mockDelete = jest.fn().mockReturnValue({ where: mockDeleteWhere });

jest.mock('../../db', () => ({
  db: {
    execute: (...args: any[]) => mockExecute(...args),
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
    delete: (...args: any[]) => mockDelete(...args),
    query: {
      boards: { findFirst: (...args: any[]) => mockFindFirstBoards(...args) },
      columns: { findFirst: (...args: any[]) => mockFindFirstColumns(...args) },
      users: { findFirst: (...args: any[]) => mockFindFirstUsers(...args) },
    },
  },
  tasks: { id: {}, board_id: {}, column_id: {}, parent_task_id: {} },
  task_assignees: { task_id: {}, user_id: {} },
  boards: { id: {}, workspace_id: {} },
  columns: { id: {}, board_id: {} },
  messages: { id: {}, linked_task_id: {} },
  users: { id: {}, name: {} },
  notifications: { id: {} },
  teams: {},
  team_members: {},
  task_history: { id: {} },
  task_comments: { id: {}, author_id: {} },
}));

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('generated-uuid') }));

import * as taskSvc from '../../services/taskService';

beforeEach(() => {
  jest.clearAllMocks();
  // Restore default chain returns after clearAllMocks
  mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin });
  mockInnerJoin.mockReturnValue({ where: mockInnerJoinWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
  mockSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockSet });
  mockInsert.mockReturnValue({ values: mockValues });
  mockDelete.mockReturnValue({ where: mockDeleteWhere });
  mockWhere.mockResolvedValue([]);
  mockInnerJoinWhere.mockResolvedValue([]);
  mockUpdateWhere.mockResolvedValue(undefined);
  mockDeleteWhere.mockResolvedValue(undefined);
  mockValues.mockImplementation(() => makeValuesResult());
});

// ── boardBelongsToWorkspace ────────────────────────────────────────────────────

describe('boardBelongsToWorkspace', () => {
  it('returns true when board exists in workspace', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'board-1', workspace_id: 'ws-1' });
    const result = await taskSvc.boardBelongsToWorkspace('board-1', 'ws-1');
    expect(result).toBe(true);
  });

  it('returns false when board not found', async () => {
    mockFindFirstBoards.mockResolvedValue(undefined);
    const result = await taskSvc.boardBelongsToWorkspace('board-x', 'ws-1');
    expect(result).toBe(false);
  });
});

// ── columnBelongsToBoard ───────────────────────────────────────────────────────

describe('columnBelongsToBoard', () => {
  it('returns true when column exists in board', async () => {
    mockFindFirstColumns.mockResolvedValue({ id: 'col-1', board_id: 'board-1' });
    const result = await taskSvc.columnBelongsToBoard('col-1', 'board-1');
    expect(result).toBe(true);
  });

  it('returns false when column not found', async () => {
    mockFindFirstColumns.mockResolvedValue(undefined);
    const result = await taskSvc.columnBelongsToBoard('col-x', 'board-1');
    expect(result).toBe(false);
  });
});

// ── getUserName ────────────────────────────────────────────────────────────────

describe('getUserName', () => {
  it('returns user name when user exists', async () => {
    mockFindFirstUsers.mockResolvedValue({ name: 'Alice' });
    const name = await taskSvc.getUserName('user-1');
    expect(name).toBe('Alice');
  });

  it('falls back to "A user" when user not found', async () => {
    mockFindFirstUsers.mockResolvedValue(undefined);
    const name = await taskSvc.getUserName('unknown');
    expect(name).toBe('A user');
  });
});

// ── getTaskAssignees ───────────────────────────────────────────────────────────

describe('getTaskAssignees', () => {
  it('returns empty array when task has no assignees', async () => {
    mockWhere.mockResolvedValue([]);
    const assignees = await taskSvc.getTaskAssignees('task-1');
    expect(assignees).toEqual([]);
  });

  it('returns assignees for the task', async () => {
    mockWhere.mockResolvedValue([{ user_id: 'user-2' }, { user_id: 'user-3' }]);
    const assignees = await taskSvc.getTaskAssignees('task-1');
    expect(assignees).toHaveLength(2);
    expect(assignees[0].user_id).toBe('user-2');
  });
});

// ── createTask ────────────────────────────────────────────────────────────────

describe('createTask', () => {
  const taskData = {
    board_id: 'board-1',
    column_id: 'col-1',
    title: 'New Task',
    description: '',
    priority: 'medium' as const,
    due_date: null,
    created_by: 'user-1',
    linked_message_id: null,
    parent_task_id: null,
    position: 0,
    task_number: 1,
    task_key: 'TST-1',
  };

  it('returns a UUID string', async () => {
    const id = await taskSvc.createTask(taskData);
    expect(typeof id).toBe('string');
    expect(id).toBe('generated-uuid');
  });

  it('calls db.insert with the task data', async () => {
    await taskSvc.createTask(taskData);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'generated-uuid', title: 'New Task', board_id: 'board-1' }),
    );
  });
});

// ── addAssignee ───────────────────────────────────────────────────────────────

describe('addAssignee', () => {
  it('inserts without throwing for a new assignee', async () => {
    await expect(taskSvc.addAssignee('task-1', 'user-2')).resolves.toBeUndefined();
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith({ task_id: 'task-1', user_id: 'user-2' });
  });
});

// ── removeAssignee ─────────────────────────────────────────────────────────────

describe('removeAssignee', () => {
  it('calls db.delete with the correct task and user', async () => {
    await taskSvc.removeAssignee('task-1', 'user-2');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });
});

// ── getActorInfo ──────────────────────────────────────────────────────────────

describe('getActorInfo', () => {
  it('returns name and avatar_url for an existing user', async () => {
    mockExecute.mockResolvedValue([{ name: 'Alice', avatar_url: 'https://img' }]);
    const actor = await taskSvc.getActorInfo('user-1');
    expect(actor.name).toBe('Alice');
    expect(actor.avatar_url).toBe('https://img');
  });

  it('falls back to defaults when user not found', async () => {
    mockExecute.mockResolvedValue([]);
    const actor = await taskSvc.getActorInfo('unknown');
    expect(actor.name).toBe('A user');
    expect(actor.avatar_url).toBeNull();
  });
});
