import { Request, Response } from 'express';
import { Server } from 'socket.io';
import * as authService from '../services/authService';
import { authMiddleware } from '../middleware/auth';

let io: Server | undefined;
export const setIo = (s: Server) => { io = s; };

export async function register(req: Request, res: Response) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  try {
    const existing = await authService.findUserByEmail(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const user = await authService.createUser(name, email, password);
    const token = authService.signToken(user.id);
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url, mobile_number: user.mobile_number, working_hours: user.working_hours, status_emoji: user.status_emoji, status_text: user.status_text }, token });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  try {
    const user = await authService.findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await authService.verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = authService.signToken(user.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url, mobile_number: user.mobile_number, working_hours: user.working_hours, status_emoji: user.status_emoji, status_text: user.status_text }, token });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export const setStatus = [
  authMiddleware,
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { status_emoji, status_text } = req.body;

    const emoji = (status_emoji ?? '').trim() || null;
    const text  = (status_text  ?? '').trim() || null;

    try {
      const user = await authService.setUserStatus(userId, emoji, text);

      // Broadcast to all workspaces the user is in
      if (io) {
        const workspaceIds = await authService.getUserWorkspaceIds(userId);
        const payload = { userId, status_emoji: user.status_emoji, status_text: user.status_text };
        workspaceIds.forEach(wsId => io!.to(`workspace:${wsId}`).emit('user_status_changed', payload));
      }

      res.json({ user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url, mobile_number: user.mobile_number, working_hours: user.working_hours, status_emoji: user.status_emoji, status_text: user.status_text } });
    } catch {
      res.status(500).json({ error: 'Server error' });
    }
  },
];

export const updateProfile = [
  authMiddleware,
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { name, mobile_number, working_hours } = req.body;

    const updates: { name?: string; mobile_number?: string; working_hours?: string } = {};
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });
      updates.name = trimmed;
    }
    if (mobile_number !== undefined) updates.mobile_number = (mobile_number ? mobile_number.trim() : null) || null as any;
    if (working_hours !== undefined) updates.working_hours = (working_hours ? working_hours.trim() : null) || null as any;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

    try {
      const user = await authService.updateUserProfile(userId, updates);
      res.json({ user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url, mobile_number: user.mobile_number, working_hours: user.working_hours } });
    } catch {
      res.status(500).json({ error: 'Server error' });
    }
  },
];
