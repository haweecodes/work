import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BoardMember } from '../../types';

vi.mock('../../api/client', () => ({
  default: {
    get:    vi.fn(),
    post:   vi.fn(),
    delete: vi.fn(),
  },
}));

import client from '../../api/client';
import useBoardStore from '../../store/boardStore';

const MOCK_MEMBERS: BoardMember[] = [
  { id: 'u1', name: 'Alice', avatar_url: null },
  { id: 'u2', name: 'Bob',   avatar_url: null },
];

beforeEach(() => {
  useBoardStore.setState({
    boards: [
      { id: 'b1', workspace_id: 'ws1', name: 'Design', is_private: 1, created_by: 'u1', members: [] },
    ],
    columns: [],
    selectedTask: null,
  });
  vi.clearAllMocks();
});

// ── fetchBoardMembers ─────────────────────────────────────────────────────────

describe('fetchBoardMembers', () => {
  it('returns the member list from the API', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: MOCK_MEMBERS });
    const result = await useBoardStore.getState().fetchBoardMembers('b1');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
  });

  it('stores members on the matching board', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: MOCK_MEMBERS });
    await useBoardStore.getState().fetchBoardMembers('b1');
    const board = useBoardStore.getState().boards.find(b => b.id === 'b1');
    expect(board?.members).toHaveLength(2);
  });

  it('calls the correct endpoint', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: [] });
    await useBoardStore.getState().fetchBoardMembers('b1');
    expect(client.get).toHaveBeenCalledWith('/api/boards/b1/members');
  });
});

// ── addBoardMember ────────────────────────────────────────────────────────────

describe('addBoardMember', () => {
  it('calls the correct endpoint with user_id', async () => {
    vi.mocked(client.post).mockResolvedValue({ data: { success: true } });
    await useBoardStore.getState().addBoardMember('b1', 'u3');
    expect(client.post).toHaveBeenCalledWith('/api/boards/b1/members', { user_id: 'u3' });
  });
});

// ── removeBoardMember ─────────────────────────────────────────────────────────

describe('removeBoardMember', () => {
  it('calls the correct DELETE endpoint', async () => {
    vi.mocked(client.delete).mockResolvedValue({ data: { success: true } });
    await useBoardStore.getState().removeBoardMember('b1', 'u2');
    expect(client.delete).toHaveBeenCalledWith('/api/boards/b1/members/u2');
  });

  it('removes the member from local store state', async () => {
    useBoardStore.setState({
      boards: [
        { id: 'b1', workspace_id: 'ws1', name: 'Design', is_private: 1, created_by: 'u1', members: MOCK_MEMBERS },
      ],
    });
    vi.mocked(client.delete).mockResolvedValue({ data: { success: true } });
    await useBoardStore.getState().removeBoardMember('b1', 'u2');
    const board = useBoardStore.getState().boards.find(b => b.id === 'b1');
    expect(board?.members?.find(m => m.id === 'u2')).toBeUndefined();
  });
});
