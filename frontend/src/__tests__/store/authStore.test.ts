import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '../../types';

vi.mock('../../api/client', () => ({
  default: {
    patch: vi.fn(),
  },
}));

import client from '../../api/client';
import useAuthStore from '../../store/authStore';

const MOCK_USER: User = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
};

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ user: null, token: null });
  vi.clearAllMocks();
});

// ── login ─────────────────────────────────────────────────────────────────────

describe('login', () => {
  it('sets user and token in state', () => {
    useAuthStore.getState().login(MOCK_USER, 'jwt-token');
    const { user, token } = useAuthStore.getState();
    expect(user).toEqual(MOCK_USER);
    expect(token).toBe('jwt-token');
  });

  it('persists token to localStorage', () => {
    useAuthStore.getState().login(MOCK_USER, 'jwt-token');
    expect(localStorage.getItem('fw_token')).toBe('jwt-token');
  });

  it('persists user to localStorage', () => {
    useAuthStore.getState().login(MOCK_USER, 'jwt-token');
    expect(JSON.parse(localStorage.getItem('fw_user')!)).toEqual(MOCK_USER);
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('clears user and token from state', () => {
    useAuthStore.getState().login(MOCK_USER, 'jwt-token');
    useAuthStore.getState().logout();
    const { user, token } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(token).toBeNull();
  });

  it('removes token from localStorage', () => {
    useAuthStore.getState().login(MOCK_USER, 'jwt-token');
    useAuthStore.getState().logout();
    expect(localStorage.getItem('fw_token')).toBeNull();
  });

  it('removes user from localStorage', () => {
    useAuthStore.getState().login(MOCK_USER, 'jwt-token');
    useAuthStore.getState().logout();
    expect(localStorage.getItem('fw_user')).toBeNull();
  });
});

// ── updateUser ────────────────────────────────────────────────────────────────

describe('updateUser', () => {
  it('merges API response into stored user', async () => {
    useAuthStore.getState().login(MOCK_USER, 'token');
    vi.mocked(client.patch).mockResolvedValue({
      data: { user: { ...MOCK_USER, name: 'Alice Updated' } },
    });

    await useAuthStore.getState().updateUser({ name: 'Alice Updated' });

    expect(useAuthStore.getState().user?.name).toBe('Alice Updated');
  });

  it('persists updated user to localStorage', async () => {
    useAuthStore.getState().login(MOCK_USER, 'token');
    vi.mocked(client.patch).mockResolvedValue({
      data: { user: { ...MOCK_USER, name: 'Alice Updated' } },
    });

    await useAuthStore.getState().updateUser({ name: 'Alice Updated' });

    expect(JSON.parse(localStorage.getItem('fw_user')!).name).toBe('Alice Updated');
  });
});
