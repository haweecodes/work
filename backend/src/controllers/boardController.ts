import { Request, Response } from 'express';
import { Server } from 'socket.io';
import * as boardService from '../services/boardService';
import * as channelSvc from '../services/channelService';

let io: Server | undefined;
export const setIo = (s: Server) => { io = s; };

export async function list(req: Request, res: Response) {
  const boards = await boardService.getBoardsByWorkspace(req.workspaceId!, req.user.id);
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

    const isPrivate = !!req.body.is_private;
    const board = await boardService.createBoard(req.workspaceId!, name, projectKey, req.user.id, colTitles, isPrivate);

    if (channel && typeof channel === 'object') {
      // Channel always inherits the board's privacy setting
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

  const canAccess = await boardService.isBoardAccessible(String(req.params.boardId), req.user.id, req.workspaceId!);
  if (!canAccess) return res.status(403).json({ error: 'Access denied' });

  const columns = await boardService.getColumnsWithTasks(String(req.params.boardId));
  res.json(columns);
}

export async function getMembers(req: Request, res: Response) {
  try {
    const boardId = String(req.params.boardId);
    const board = await boardService.getBoardById(boardId, req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const canAccess = await boardService.isBoardAccessible(boardId, req.user.id, req.workspaceId!);
    if (!canAccess) return res.status(403).json({ error: 'Access denied' });

    const members = await boardService.getBoardMembers(boardId);
    res.json(members);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function addMember(req: Request, res: Response) {
  try {
    const boardId = String(req.params.boardId);
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const board = await boardService.getBoardById(boardId, req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (board.created_by !== req.user.id) {
      const get = (await import('../db')).get;
      const row = await get<{ role: string }>(
        'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [req.workspaceId, req.user.id]
      );
      if (row?.role !== 'admin') return res.status(403).json({ error: 'Only the board owner can manage members' });
    }

    await boardService.addBoardMember(boardId, String(user_id));

    if (io) {
      const addedUser = await channelSvc.getUserById(String(user_id));
      if (board.channel_id) {
        const ch = await channelSvc.getChannelById(board.channel_id, req.workspaceId!);
        if (ch?.is_private) io.to(`user:${user_id}`).emit('channel_created', ch);
      }
      // Emit board_member_updated so the new member's sidebar refreshes boards
      io.to(`user:${user_id}`).emit('board_member_added', { board_id: boardId });
      // Notify existing board room
      io.to(`board:${boardId}`).emit('board_members_updated', { board_id: boardId });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function removeMember(req: Request, res: Response) {
  try {
    const boardId = String(req.params.boardId);
    const targetUserId = String(req.params.userId);

    const board = await boardService.getBoardById(boardId, req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const isSelf = targetUserId === req.user.id;
    if (!isSelf) {
      if (board.created_by !== req.user.id) {
        const get = (await import('../db')).get;
        const row = await get<{ role: string }>(
          'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
          [req.workspaceId, req.user.id]
        );
        if (row?.role !== 'admin') return res.status(403).json({ error: 'Only the board owner can remove members' });
      }
    }

    await boardService.removeBoardMember(boardId, targetUserId);

    if (io) {
      io.to(`user:${targetUserId}`).emit('board_member_removed', { board_id: boardId });
      io.to(`board:${boardId}`).emit('board_members_updated', { board_id: boardId });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
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

    // Channel always inherits the board's privacy setting
    const isPrivate = !!board.is_private;
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
