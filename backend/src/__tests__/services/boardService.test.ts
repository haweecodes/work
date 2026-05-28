jest.mock('drizzle-orm', () => ({
  eq: jest.fn().mockReturnValue({}),
  and: jest.fn().mockReturnValue({}),
  or: jest.fn().mockReturnValue({}),
  sql: Object.assign(jest.fn().mockReturnValue({}), { raw: jest.fn() }),
  inArray: jest.fn().mockReturnValue({}),
  desc: jest.fn().mockReturnValue({}),
  asc: jest.fn().mockReturnValue({}),
}));

const mockFindFirstBoards = jest.fn();
const mockWhere = jest.fn().mockResolvedValue([]);
const mockInnerJoinWhere = jest.fn().mockResolvedValue([]);
const mockInnerJoin = jest.fn().mockReturnValue({ where: mockInnerJoinWhere });
const mockFrom = jest.fn().mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin });
const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
const mockValues = jest.fn().mockResolvedValue(undefined);
const mockOnConflict = jest.fn().mockResolvedValue(undefined);
const mockInsertValues = jest.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });
const mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
const mockDelete = jest.fn().mockReturnValue({ where: mockDeleteWhere });
const mockExecute = jest.fn();

jest.mock('../../db', () => ({
  db: {
    execute: (...args: any[]) => mockExecute(...args),
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    delete: (...args: any[]) => mockDelete(...args),
    query: {
      boards: { findFirst: (...args: any[]) => mockFindFirstBoards(...args) },
    },
  },
  boards:          { id: {}, workspace_id: {}, created_by: {}, is_private: {}, channel_id: {}, team_id: {} },
  board_members:   { board_id: {}, user_id: {} },
  channels:        { id: {}, is_private: {} },
  channel_members: { channel_id: {}, user_id: {} },
  team_members:    { team_id: {}, user_id: {} },
  workspace_members: { workspace_id: {}, user_id: {}, role: {} },
  users:           { id: {}, name: {}, avatar_url: {} },
}));

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('generated-uuid') }));

import * as boardSvc from '../../services/boardService';

beforeEach(() => {
  jest.clearAllMocks();
  mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin });
  mockInnerJoin.mockReturnValue({ where: mockInnerJoinWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
  mockInsert.mockReturnValue({ values: mockInsertValues });
  mockInsertValues.mockReturnValue({ onConflictDoNothing: mockOnConflict });
  mockOnConflict.mockResolvedValue(undefined);
  mockDelete.mockReturnValue({ where: mockDeleteWhere });
  mockDeleteWhere.mockResolvedValue(undefined);
  mockWhere.mockResolvedValue([]);
  mockInnerJoinWhere.mockResolvedValue([]);
});

// ── isBoardAccessible ────────────────────────────────────────────────────────

describe('isBoardAccessible', () => {
  it('returns true for a public board', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', is_private: 0, created_by: 'other', workspace_id: 'ws1' });
    const result = await boardSvc.isBoardAccessible('b1', 'user1', 'ws1');
    expect(result).toBe(true);
  });

  it('returns true when user is the board creator', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', is_private: 1, created_by: 'user1', workspace_id: 'ws1', team_id: null, channel_id: null });
    const result = await boardSvc.isBoardAccessible('b1', 'user1', 'ws1');
    expect(result).toBe(true);
  });

  it('returns false when board not found', async () => {
    mockFindFirstBoards.mockResolvedValue(undefined);
    const result = await boardSvc.isBoardAccessible('missing', 'user1', 'ws1');
    expect(result).toBe(false);
  });

  it('returns true when user is a board_member of a private board', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', is_private: 1, created_by: 'other', workspace_id: 'ws1', team_id: null, channel_id: null });
    // board_members check
    mockWhere
      .mockResolvedValueOnce([]) // workspace admin check
      .mockResolvedValueOnce([{ board_id: 'b1', user_id: 'user1' }]); // board_members check
    const result = await boardSvc.isBoardAccessible('b1', 'user1', 'ws1');
    expect(result).toBe(true);
  });

  it('returns true when user is a workspace admin', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', is_private: 1, created_by: 'other', workspace_id: 'ws1', team_id: null, channel_id: null });
    mockWhere.mockResolvedValueOnce([{ role: 'admin' }]); // admin check returns a row
    const result = await boardSvc.isBoardAccessible('b1', 'user1', 'ws1');
    expect(result).toBe(true);
  });

  it('returns true when user is a team member and board has that team', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', is_private: 1, created_by: 'other', workspace_id: 'ws1', team_id: 'team1', channel_id: null });
    mockWhere
      .mockResolvedValueOnce([]) // admin check returns nothing
      .mockResolvedValueOnce([]) // board_members check returns nothing
      .mockResolvedValueOnce([{ user_id: 'user1' }]); // team_members check
    const result = await boardSvc.isBoardAccessible('b1', 'user1', 'ws1');
    expect(result).toBe(true);
  });

  it('returns true when user is a channel member of the linked channel', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', is_private: 1, created_by: 'other', workspace_id: 'ws1', team_id: null, channel_id: 'ch1' });
    mockWhere
      .mockResolvedValueOnce([]) // admin check
      .mockResolvedValueOnce([]) // board_members check
      .mockResolvedValueOnce([{ channel_id: 'ch1', user_id: 'user1' }]); // channel_members check
    const result = await boardSvc.isBoardAccessible('b1', 'user1', 'ws1');
    expect(result).toBe(true);
  });

  it('returns false when private board and user has no access', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', is_private: 1, created_by: 'other', workspace_id: 'ws1', team_id: null, channel_id: null });
    mockWhere.mockResolvedValue([]); // all checks return empty
    const result = await boardSvc.isBoardAccessible('b1', 'user1', 'ws1');
    expect(result).toBe(false);
  });
});

// ── getBoardMembers ───────────────────────────────────────────────────────────

describe('getBoardMembers', () => {
  it('returns an empty array when board has no members', async () => {
    mockInnerJoinWhere.mockResolvedValue([]);
    const result = await boardSvc.getBoardMembers('b1');
    expect(result).toEqual([]);
  });

  it('returns member list with id, name, avatar_url', async () => {
    mockInnerJoinWhere.mockResolvedValue([
      { id: 'u1', name: 'Alice', avatar_url: null },
      { id: 'u2', name: 'Bob', avatar_url: 'https://img' },
    ]);
    const result = await boardSvc.getBoardMembers('b1');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
  });
});

// ── addBoardMember ────────────────────────────────────────────────────────────

describe('addBoardMember', () => {
  it('inserts into board_members', async () => {
    // board has no linked channel
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', channel_id: null, workspace_id: 'ws1' });
    await boardSvc.addBoardMember('b1', 'u2');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledWith({ board_id: 'b1', user_id: 'u2' });
  });

  it('also inserts into channel_members when board has a private linked channel', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', channel_id: 'ch1', workspace_id: 'ws1' });
    // channel is private
    mockWhere.mockResolvedValueOnce([{ id: 'ch1', is_private: 1 }]);
    await boardSvc.addBoardMember('b1', 'u2');
    // board_members insert + channel_members insert
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('does not insert into channel_members when linked channel is public', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', channel_id: 'ch1', workspace_id: 'ws1' });
    mockWhere.mockResolvedValueOnce([{ id: 'ch1', is_private: 0 }]);
    await boardSvc.addBoardMember('b1', 'u2');
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});

// ── removeBoardMember ─────────────────────────────────────────────────────────

describe('removeBoardMember', () => {
  it('deletes from board_members', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', channel_id: null, workspace_id: 'ws1' });
    await boardSvc.removeBoardMember('b1', 'u2');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });

  it('also removes from channel_members when board has a private linked channel', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', channel_id: 'ch1', workspace_id: 'ws1' });
    mockWhere.mockResolvedValueOnce([{ id: 'ch1', is_private: 1 }]);
    await boardSvc.removeBoardMember('b1', 'u2');
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it('does not remove from channel_members when linked channel is public', async () => {
    mockFindFirstBoards.mockResolvedValue({ id: 'b1', channel_id: 'ch1', workspace_id: 'ws1' });
    mockWhere.mockResolvedValueOnce([{ id: 'ch1', is_private: 0 }]);
    await boardSvc.removeBoardMember('b1', 'u2');
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
