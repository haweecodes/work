import { Request, Response } from 'express';
import * as authService from '../services/authService';

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
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url }, token });
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
    res.json({ user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url }, token });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
