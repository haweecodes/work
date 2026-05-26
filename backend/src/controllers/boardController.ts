import { Request, Response } from 'express';
import { Server } from 'socket.io';
import * as boardService from '../services/boardService';
import * as channelSvc from '../services/channelService';

let io: Server | undefined;
export const setIo = (s: Server) => { io = s; };

export async function list(req: Request, res: Response) {
  const boards = await boardService.getBoardsByWorkspace(String(req.params.workspaceId));
  res.json(boards);
}

export async function create(req: Request, res: Response) {
  try {
    const { name, columns, channel } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    let baseKey = name.split(/\s+/).map((w: string) => w[0]?.toUpperCase()).join('').substring(0, 5).replace(/[^A-Z]/g, '');
    if (!baseKey) baseKey = 'BRD';

    let projectKey = baseKey;
    let counter = 1;
    while (await boardService.projectKeyExists(req.workspaceId!, projectKey)) {
      projectKey = `${baseKey}${counter++}`;
    }

    const colTitles: string[] = Array.isArray(columns) && columns.length > 0
      ? columns
      : ['To Do', 'In Progress', 'In Review', 'Done'];

    const board = await boardService.createBoard(req.workspaceId!, name, projectKey, req.user.id, colTitles);

    if (channel && typeof channel === 'object') {
      const isPrivate = !!channel.is_private;
      const createdChannel = await channelSvc.createBoardChannel(
        req.workspaceId!, board.id, name, isPrivate, req.user.id, null,
      );
      if (createdChannel) {
        await boardService.setBoardChannel(board.id, createdChannel.id);
        board.channel_id = createdChannel.id;

        if (io) {
          if (isPrivate) {
            io.to(`user:${req.user.id}`).emit('channel_created', createdChannel);
          } else {
            const memberIds = await channelSvc.getWorkspaceMemberIds(req.workspaceId!);
            memberIds.forEach(uid => io!.to(`user:${uid}`).emit('channel_created', createdChannel));
          }
        }
      }
    }

    res.status(201).json(board);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function rename(req: Request, res: Response) {
  try {
    const { name, team_id } = req.body;

    const board = await boardService.getBoardById(String(req.params.id), req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'name required' });
      await boardService.updateBoardName(String(req.params.id), String(name).trim());
    }

    if (team_id !== undefined) {
      await boardService.updateBoardTeam(String(req.params.id), team_id ?? null);
    }

    const updated = await boardService.getBoardById(String(req.params.id), req.workspaceId!);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getColumns(req: Request, res: Response) {
  const board = await boardService.getBoardById(String(req.params.boardId), req.workspaceId!);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const columns = await boardService.getColumnsWithTasks(String(req.params.boardId));
  res.json(columns);
}

export async function addColumn(req: Request, res: Response) {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const board = await boardService.getBoardById(String(req.params.boardId), req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const col = await boardService.addColumn(String(req.params.boardId), title);
    res.status(201).json(col);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getBoardChannelHandler(req: Request, res: Response) {
  try {
    const board = await boardService.getBoardById(String(req.params.boardId), req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!board.channel_id) return res.status(404).json({ error: 'No channel linked to this board' });

    const channel = await channelSvc.getChannelById(board.channel_id, req.workspaceId!);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json(channel);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createBoardChannelHandler(req: Request, res: Response) {
  try {
    const { is_private } = req.body;
    const board = await boardService.getBoardById(String(req.params.boardId), req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (board.channel_id) return res.status(409).json({ error: 'Board already has a channel' });

    const isPrivate = !!is_private;
    const channel = await channelSvc.createBoardChannel(
      req.workspaceId!, board.id, board.name, isPrivate, req.user.id, board.team_id ?? null,
    );
    if (!channel) return res.status(500).json({ error: 'Failed to create channel' });

    await boardService.setBoardChannel(board.id, channel.id);

    // For private channels, also add current task assignees
    if (isPrivate) {
      const assigneeIds = await channelSvc.getTaskAssigneesForBoard(board.id);
      for (const uid of assigneeIds) {
        await channelSvc.addChannelMemberSafe(channel.id, uid);
      }
    }

    if (io) {
      const memberIds = await channelSvc.getChannelMemberIds(channel.id);
      memberIds.forEach(uid => io!.to(`user:${uid}`).emit('channel_created', channel));
    }

    res.status(201).json(channel);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
