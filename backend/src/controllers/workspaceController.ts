import { Request, Response } from 'express';
import { Server } from 'socket.io';
import * as ws from '../services/workspaceService';

let io: Server | undefined;
export const setIo = (s: Server) => { io = s; };

export async function list(req: Request, res: Response) {
  const workspaces = await ws.getUserWorkspaces(req.user.id);
  res.json(workspaces);
}

export async function create(req: Request, res: Response) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const workspace = await ws.createWorkspace(name, req.user.id);
    res.status(201).json(workspace);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getMembers(req: Request, res: Response) {
  const members = await ws.getWorkspaceMembers(req.params.id);
  res.json(members);
}

export async function invite(req: Request, res: Response) {
  try {
    const { email } = req.body;
    const user = await ws.findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'User not found. They need to register first.' });

    const isMember = await ws.isWorkspaceMember(req.params.id, user.id);
    if (isMember) return res.status(409).json({ error: 'User is already a member' });

    await ws.addMember(req.params.id, user.id);

    if (io) {
      const newMember = await ws.getMemberPublicData(user.id);
      if (newMember) io.to(`workspace:${req.params.id}`).emit('member_joined', { ...newMember, role: 'member' });
    }
    res.json({ message: 'User invited successfully' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getByCode(req: Request, res: Response) {
  try {
    const workspace = await ws.getWorkspaceByInviteCode(req.params.code);
    if (!workspace) return res.status(404).json({ error: 'Invalid invite code' });
    res.json({ id: workspace.id, name: workspace.name });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function joinByCode(req: Request, res: Response) {
  try {
    const workspace = await ws.getWorkspaceByInviteCode(req.params.code);
    if (!workspace) return res.status(404).json({ error: 'Invalid invite code' });

    const isMember = await ws.isWorkspaceMember(workspace.id, req.user.id);
    if (isMember) return res.status(409).json({ error: 'Already a member' });

    await ws.addMember(workspace.id, req.user.id);

    if (io) {
      const newMember = await ws.getMemberPublicData(req.user.id);
      if (newMember) io.to(`workspace:${workspace.id}`).emit('member_joined', { ...newMember, role: 'member' });
    }
    res.json(workspace);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
