import { Request, Response } from 'express';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import * as svc from '../services/taskUpdateService';
import * as notifService from '../services/notificationService';
import { getWorkspaceSettings } from '../services/workspaceSettingsService';

let io: Server | undefined;
export const setIo = (s: Server) => { io = s; };

export async function requestUpdate(req: Request, res: Response) {
  try {
    const { board_id, scope, task_id, column_id } = req.body;
    if (!board_id || !scope || !['task', 'column', 'board'].includes(scope)) {
      return res.status(400).json({ error: 'board_id and scope (task|column|board) required' });
    }
    if (scope === 'task' && !task_id) return res.status(400).json({ error: 'task_id required for task scope' });
    if (scope === 'column' && !column_id) return res.status(400).json({ error: 'column_id required for column scope' });

    const board = await svc.getBoardWithCreator(board_id, req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (!await svc.canRequestUpdates(req.user.id, req.workspaceId!, board.created_by)) {
      return res.status(403).json({ error: 'Only the board creator or workspace admins can request updates' });
    }

    const tasks = await svc.getTasksForScope(board_id, scope, task_id, column_id);
    if (tasks.length === 0) return res.status(400).json({ error: 'No tasks found in the specified scope' });

    const request = await svc.createRequest(board_id, scope, req.user.id, req.workspaceId!, task_id, column_id);
    const requesterName = await svc.getUserName(req.user.id);

    const notifiedUsers = new Set<string>();
    for (const task of tasks) {
      const assignees = await svc.getAssigneesForTask(task.id);
      for (const { user_id } of assignees) {
        if (user_id === req.user.id || notifiedUsers.has(`${task.id}:${user_id}`)) continue;
        notifiedUsers.add(`${task.id}:${user_id}`);
        const notifMsg = `${requesterName} is asking for an update on "${task.title}"`;
        const notifId = await svc.createUpdateRequestNotification(user_id, 'task_update_request', task.id, notifMsg, request.id, req.workspaceId!);
        if (io) io.to(`user:${user_id}`).emit('notification', { id: notifId, type: 'task_update_request', message: notifMsg, reference_id: task.id, extra_id: request.id });
      }
    }

    const requestRow = { ...request, requester_name: requesterName, responses: [] };
    if (io) io.to(`board:${board_id}`).emit('task_update_requested', requestRow);
    res.status(201).json(requestRow);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function respond(req: Request, res: Response) {
  try {
    const { task_id, status, reason } = req.body;
    if (!task_id || !status) return res.status(400).json({ error: 'task_id and status required' });

    const request = await svc.getRequestById(req.params.requestId, req.workspaceId!);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Validate status against workspace-configured statuses
    const wsSettings = await getWorkspaceSettings(request.workspace_id);
    const validValues = wsSettings.task_update_statuses.map(s => s.value);
    if (!validValues.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Valid options: ${validValues.join(', ')}` });
    }

    if (!await svc.isTaskAssignee(task_id, req.user.id)) {
      return res.status(403).json({ error: 'You are not an assignee of this task' });
    }

    const responseId = await svc.upsertResponse(request.id, task_id, req.user.id, status, reason);
    await svc.markRequestNotificationRead(req.user.id, request.id);

    const responderName = await svc.getUserName(req.user.id);
    const task = await svc.getTaskKeyAndTitle(task_id);
    const statusLabel: Record<string, string> = { on_track: 'On Track', delayed: 'Delayed', finished: 'Finished', cancelled: 'Cancelled' };
    const notifMsg = `${responderName}: ${task?.task_key} — ${statusLabel[status] ?? status}${reason ? ` (${reason})` : ''}`;
    const notifId = uuidv4();
    await notifService.createNotification({ id: notifId, user_id: request.requested_by, type: 'task_update_response', reference_id: request.id, reference_type: 'update_request', message: notifMsg, workspace_id: req.workspaceId, is_read: 0 });
    if (io) io.to(`user:${request.requested_by}`).emit('notification', { id: notifId, type: 'task_update_response', message: notifMsg, reference_id: request.id });

    const responseRow = { id: responseId, request_id: request.id, task_id, task_key: task?.task_key, task_title: task?.title, user_id: req.user.id, user_name: responderName, status, reason: reason ?? null, created_at: new Date().toISOString() };
    if (io) io.to(`board:${request.board_id}`).emit('task_update_responded', { request_id: request.id, response: responseRow });
    res.json(responseRow);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getHistory(req: Request, res: Response) {
  try {
    const result = await svc.getUpdateHistory(req.params.boardId, req.workspaceId!);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getPending(req: Request, res: Response) {
  try {
    const pending = await svc.getPendingForUser(req.user.id, req.workspaceId!);
    res.json(pending);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getNotificationTask(req: Request, res: Response) {
  try {
    const task = await svc.getTaskForNotification(req.params.taskId, req.workspaceId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ board_id: task.board_id, task_key: task.task_key });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
