import { Request, Response } from 'express';
import { Server } from 'socket.io';
import * as taskSvc from '../services/taskService';

let io: Server | undefined;
export const setIo = (s: Server) => { io = s; };

export async function listByBoard(req: Request, res: Response) {
  // Thin wrapper — board columns endpoint covers the enriched version
  res.json([]);
}

export async function create(req: Request, res: Response) {
  try {
    const { board_id, column_id, title, description, priority, due_date, assignee_ids, linked_message_id, parent_task_id } = req.body;
    if (!board_id || !column_id || !title) return res.status(400).json({ error: 'board_id, column_id, title required' });
    if (typeof title !== 'string' || title.trim().length === 0 || title.length > 500) {
      return res.status(400).json({ error: 'Task title must be between 1 and 500 characters' });
    }

    const boardOk = await taskSvc.boardBelongsToWorkspace(board_id, req.workspaceId!);
    if (!boardOk) return res.status(404).json({ error: 'Board not found' });

    const task_sequence = await taskSvc.getNextTaskSequence(board_id);
    const task_key = `${board_id.slice(0, 3).toUpperCase()}-${task_sequence}`;

    const posCount = await taskSvc.getColumnCount(column_id);
    const id = await taskSvc.createTask({
      board_id, column_id, title: title.trim(), description: description ?? '',
      priority: priority ?? 'medium', due_date: due_date ? new Date(due_date) : null,
      created_by: req.user.id, linked_message_id: linked_message_id ?? null,
      parent_task_id: parent_task_id ?? null, position: posCount,
      task_number: task_sequence, task_key,
    });

    if (linked_message_id) await taskSvc.linkMessageToTask(linked_message_id, id);

    const actorName = await taskSvc.getUserName(req.user.id);
    if (Array.isArray(assignee_ids)) {
      for (const uid of assignee_ids) {
        await taskSvc.addAssignee(id, uid);
        if (uid !== req.user.id) {
          const msg = `${actorName} assigned you to "${title}"`;
          const notifId = await taskSvc.createAssignmentNotification(uid, 'task_assigned', id, msg, req.workspaceId!);
          if (io) io.to(`user:${uid}`).emit('notification', { id: notifId, type: 'task_assigned', message: msg, reference_id: id, reference_type: 'task', workspace_id: req.workspaceId });
        }
      }
    }

    const task = await taskSvc.getEnrichedTask(id);
    if (io) io.to(`board:${board_id}`).emit('task_updated', { type: 'created', task });
    res.status(201).json(task);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getById(req: Request, res: Response) {
  const task = await taskSvc.getTaskForDetail(req.params.id, req.workspaceId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
}

export async function getDetailForNotification(req: Request, res: Response) {
  const task = await taskSvc.getTaskDetailForNotification(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
}

export async function update(req: Request, res: Response) {
  try {
    const { title, description, priority, due_date, assignee_ids, column_id, board_id, parent_task_id } = req.body;

    const task = await taskSvc.getTaskById(req.params.id, req.workspaceId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const resolvedBoardId = board_id && board_id !== task.board_id ? board_id : task.board_id;

    if (board_id && board_id !== task.board_id) {
      if (task.parent_task_id) return res.status(400).json({ error: 'Subtasks cannot be moved to a different board than their parent task' });

      const boardOk = await taskSvc.boardBelongsToWorkspace(board_id, req.workspaceId!);
      if (!boardOk) return res.status(400).json({ error: 'Target board not found in this workspace' });

      if (!column_id) return res.status(400).json({ error: 'A column in the target board must be selected when moving between boards' });

      const colOk = await taskSvc.columnBelongsToBoard(column_id, board_id);
      if (!colOk) return res.status(400).json({ error: 'Column does not belong to the target board' });
    }

    const resolvedColumnId = column_id ?? task.column_id;
    let newPosition = task.position;
    if (resolvedColumnId !== task.column_id || resolvedBoardId !== task.board_id) {
      newPosition = await taskSvc.getColumnCount(resolvedColumnId);
    }

    const resolvedParentId = parent_task_id !== undefined
      ? (parent_task_id === req.params.id ? null : (parent_task_id || null))
      : task.parent_task_id;

    await taskSvc.updateTask(req.params.id, {
      title: title ?? task.title,
      description: description ?? task.description,
      priority: priority ?? task.priority,
      due_date: due_date !== undefined ? (due_date ? new Date(due_date) : null) : task.due_date,
      column_id: resolvedColumnId,
      board_id: resolvedBoardId,
      parent_task_id: resolvedParentId,
      position: newPosition,
    });

    // Migrate subtasks if board changed
    if (board_id && board_id !== task.board_id) {
      const subtasks = await taskSvc.getTasksByParent(req.params.id);
      for (const st of subtasks) {
        await taskSvc.migrateSubtask(st.id, resolvedBoardId, resolvedColumnId);
        if (io) {
          io.to(`board:${task.board_id}`).emit('task_updated', { type: 'deleted', task_id: st.id });
          const movedSt = await taskSvc.getEnrichedTask(st.id);
          io.to(`board:${resolvedBoardId}`).emit('task_updated', { type: 'created', task: movedSt });
        }
      }
    }

    // Assignee diff
    if (Array.isArray(assignee_ids)) {
      const actorName = await taskSvc.getUserName(req.user.id);
      const currentAssignees = await taskSvc.getTaskAssignees(req.params.id);
      const currentIds = new Set(currentAssignees.map(a => a.user_id));
      const newIds = new Set<string>(assignee_ids);

      for (const uid of newIds) {
        if (!currentIds.has(uid)) {
          await taskSvc.addAssignee(req.params.id, uid);
          if (uid !== req.user.id) {
            const msg = `${actorName} assigned you to "${title ?? task.title}"`;
            const notifId = await taskSvc.createAssignmentNotification(uid, 'task_assigned', req.params.id, msg, req.workspaceId!);
            if (io) io.to(`user:${uid}`).emit('notification', { id: notifId, type: 'task_assigned', message: msg, reference_id: req.params.id, reference_type: 'task', workspace_id: req.workspaceId });
          }
        }
      }
      for (const uid of currentIds) {
        if (!newIds.has(uid)) {
          await taskSvc.removeAssignee(req.params.id, uid);
          if (uid !== req.user.id) {
            const msg = `${actorName} removed you from "${title ?? task.title}"`;
            const notifId = await taskSvc.createAssignmentNotification(uid, 'task_unassigned', req.params.id, msg, req.workspaceId!);
            if (io) io.to(`user:${uid}`).emit('notification', { id: notifId, type: 'task_unassigned', message: msg, reference_id: req.params.id, reference_type: 'task', workspace_id: req.workspaceId });
          }
        }
      }
    }

    const updated = await taskSvc.getEnrichedTask(req.params.id);
    if (io) {
      if (board_id && board_id !== task.board_id) {
        io.to(`board:${task.board_id}`).emit('task_updated', { type: 'deleted', task_id: req.params.id });
      }
      io.to(`board:${resolvedBoardId}`).emit('task_updated', { type: 'updated', task: updated });
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function move(req: Request, res: Response) {
  try {
    const { column_id, position } = req.body;
    const task = await taskSvc.getTaskById(req.params.id, req.workspaceId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await taskSvc.moveTask(req.params.id, column_id ?? task.column_id, position ?? task.position);
    const updated = await taskSvc.getEnrichedTask(req.params.id);
    if (io) io.to(`board:${updated!.board_id}`).emit('task_updated', { type: 'moved', task: updated });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function resolveByKey(req: Request, res: Response) {
  try {
    const task = await taskSvc.resolveTaskByKey(req.params.taskKey, req.workspaceId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteTask(req: Request, res: Response) {
  try {
    const task = await taskSvc.getTaskById(req.params.id, req.workspaceId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const subtaskCount = await taskSvc.getSubtaskCount(req.params.id);
    if (subtaskCount > 0) {
      return res.status(400).json({ error: `Cannot delete a task that has ${subtaskCount} subtask${subtaskCount > 1 ? 's' : ''}. Delete or reassign the subtasks first.` });
    }

    await taskSvc.deleteTask(req.params.id);
    if (io) io.to(`board:${task.board_id}`).emit('task_updated', { type: 'deleted', task_id: req.params.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
