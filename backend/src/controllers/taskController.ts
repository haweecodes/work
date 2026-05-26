import { Request, Response } from 'express';
import { Server } from 'socket.io';
import * as taskSvc from '../services/taskService';
import * as boardSvc from '../services/boardService';
import * as channelSvc from '../services/channelService';

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

    // Record creation history
    const actor = await taskSvc.getActorInfo(req.user.id);
    await taskSvc.insertTaskHistory({
      task_id: id, actor_id: req.user.id,
      actor_name: actor.name, actor_avatar: actor.avatar_url,
      action: 'created',
    });

    // Post system message to board channel and auto-add assignees to private channel
    const boardCh = await boardSvc.getBoardChannel(board_id);
    if (boardCh?.channel_id) {
      const chInfo = await channelSvc.getChannelById(boardCh.channel_id, boardCh.workspace_id);
      const msg = await channelSvc.createSystemMessage(boardCh.channel_id, req.user.id, `[${task_key}] "${title.trim()}" was created`);
      if (io && msg) io.to(`channel:${boardCh.channel_id}`).emit('new_message', msg);
      if (chInfo?.is_private && Array.isArray(assignee_ids)) {
        for (const uid of assignee_ids) {
          await channelSvc.addChannelMemberSafe(boardCh.channel_id, uid);
          if (uid !== req.user.id) {
            const updatedChannel = await channelSvc.getChannelById(boardCh.channel_id, boardCh.workspace_id);
            if (io && updatedChannel) io.to(`user:${uid}`).emit('channel_created', updatedChannel);
          }
        }
      }
    }

    // Notify team members of the new task
    const teamMembers = await taskSvc.getBoardTeamMembers(board_id);
    const actorNameForTeam = actorName;
    for (const { user_id } of teamMembers) {
      if (user_id === req.user.id) continue;
      if (Array.isArray(assignee_ids) && assignee_ids.includes(user_id)) continue; // already notified as assignee
      const msg = `${actorNameForTeam} created "${title}" on your team's board`;
      const notifId = await taskSvc.createAssignmentNotification(user_id, 'task_assigned', id, msg, req.workspaceId!);
      if (io) io.to(`user:${user_id}`).emit('notification', { id: notifId, type: 'task_assigned', message: msg, reference_id: id, reference_type: 'task', workspace_id: req.workspaceId });
    }

    res.status(201).json(task);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getById(req: Request, res: Response) {
  const task = await taskSvc.getTaskForDetail(String(req.params.id), req.workspaceId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
}

export async function getDetailForNotification(req: Request, res: Response) {
  const task = await taskSvc.getTaskDetailForNotification(String(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
}

export async function update(req: Request, res: Response) {
  try {
    const { title, description, priority, due_date, assignee_ids, column_id, board_id, parent_task_id } = req.body;

    const task = await taskSvc.getTaskById(String(req.params.id), req.workspaceId!);
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
      ? (parent_task_id === String(req.params.id) ? null : (parent_task_id || null))
      : task.parent_task_id;

    await taskSvc.updateTask(String(req.params.id), {
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
      const subtasks = await taskSvc.getTasksByParent(String(req.params.id));
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
    const addedAssigneeIds: string[] = [];
    if (Array.isArray(assignee_ids)) {
      const actorName = await taskSvc.getUserName(req.user.id);
      const currentAssignees = await taskSvc.getTaskAssignees(String(req.params.id));
      const currentIds = new Set(currentAssignees.map(a => a.user_id));
      const newIds = new Set<string>(assignee_ids);

      const assigneeActor = await taskSvc.getActorInfo(req.user.id);
      for (const uid of newIds) {
        if (!currentIds.has(uid)) {
          addedAssigneeIds.push(uid);
          await taskSvc.addAssignee(String(req.params.id), uid);
          const assigneeName = await taskSvc.getUserName(uid);
          await taskSvc.insertTaskHistory({
            task_id: String(req.params.id), actor_id: req.user.id,
            actor_name: assigneeActor.name, actor_avatar: assigneeActor.avatar_url,
            action: 'assignee_added', field: 'assignees', old_value: null, new_value: assigneeName,
          });
          if (uid !== req.user.id) {
            const msg = `${actorName} assigned you to "${title ?? task.title}"`;
            const notifId = await taskSvc.createAssignmentNotification(uid, 'task_assigned', String(req.params.id), msg, req.workspaceId!);
            if (io) io.to(`user:${uid}`).emit('notification', { id: notifId, type: 'task_assigned', message: msg, reference_id: String(req.params.id), reference_type: 'task', workspace_id: req.workspaceId });
          }
        }
      }
      for (const uid of currentIds) {
        if (!newIds.has(uid)) {
          await taskSvc.removeAssignee(String(req.params.id), uid);
          const assigneeName = await taskSvc.getUserName(uid);
          await taskSvc.insertTaskHistory({
            task_id: String(req.params.id), actor_id: req.user.id,
            actor_name: assigneeActor.name, actor_avatar: assigneeActor.avatar_url,
            action: 'assignee_removed', field: 'assignees', old_value: assigneeName, new_value: null,
          });
          if (uid !== req.user.id) {
            const msg = `${actorName} removed you from "${title ?? task.title}"`;
            const notifId = await taskSvc.createAssignmentNotification(uid, 'task_unassigned', String(req.params.id), msg, req.workspaceId!);
            if (io) io.to(`user:${uid}`).emit('notification', { id: notifId, type: 'task_unassigned', message: msg, reference_id: String(req.params.id), reference_type: 'task', workspace_id: req.workspaceId });
          }
        }
      }
    }

    const updated = await taskSvc.getEnrichedTask(String(req.params.id));

    // Record field-level history
    const histActor = await taskSvc.getActorInfo(req.user.id);
    const histEntries: Array<{ field: string; old_value: string | null; new_value: string | null }> = [];
    if (title !== undefined && title !== task.title) histEntries.push({ field: 'title', old_value: task.title, new_value: title });
    if (description !== undefined && description !== task.description) histEntries.push({ field: 'description', old_value: null, new_value: null });
    if (priority !== undefined && priority !== task.priority) histEntries.push({ field: 'priority', old_value: task.priority ?? null, new_value: priority });
    if (due_date !== undefined) {
      const oldDate = task.due_date ? String(task.due_date).slice(0, 10) : null;
      const newDate = due_date ? String(due_date).slice(0, 10) : null;
      if (oldDate !== newDate) histEntries.push({ field: 'due_date', old_value: oldDate, new_value: newDate });
    }
    if (resolvedColumnId !== task.column_id) {
      const oldCol = await taskSvc.getColumnTitle(task.column_id);
      const newCol = await taskSvc.getColumnTitle(resolvedColumnId);
      histEntries.push({ field: 'column', old_value: oldCol, new_value: newCol });
    }
    if (resolvedBoardId !== task.board_id) {
      const oldBoard = await taskSvc.getBoardName(task.board_id);
      const newBoard = await taskSvc.getBoardName(resolvedBoardId);
      histEntries.push({ field: 'board', old_value: oldBoard, new_value: newBoard });
    }
    for (const entry of histEntries) {
      await taskSvc.insertTaskHistory({
        task_id: String(req.params.id), actor_id: req.user.id,
        actor_name: histActor.name, actor_avatar: histActor.avatar_url,
        action: 'updated', ...entry,
      });
    }

    if (io) {
      if (board_id && board_id !== task.board_id) {
        io.to(`board:${task.board_id}`).emit('task_updated', { type: 'deleted', task_id: String(req.params.id) });
      }
      io.to(`board:${resolvedBoardId}`).emit('task_updated', { type: 'updated', task: updated });
    }

    // Post system message and auto-add new assignees to private board channel
    const boardCh = await boardSvc.getBoardChannel(resolvedBoardId);
    if (boardCh?.channel_id) {
      const chInfo = await channelSvc.getChannelById(boardCh.channel_id, boardCh.workspace_id);
      const msg = await channelSvc.createSystemMessage(boardCh.channel_id, req.user.id, `[${updated?.task_key ?? task.task_key}] "${updated?.title ?? task.title}" was updated`);
      if (io && msg) io.to(`channel:${boardCh.channel_id}`).emit('new_message', msg);
      if (chInfo?.is_private && addedAssigneeIds.length > 0) {
        for (const uid of addedAssigneeIds) {
          await channelSvc.addChannelMemberSafe(boardCh.channel_id, uid);
          if (uid !== req.user.id) {
            if (io) io.to(`user:${uid}`).emit('channel_created', chInfo);
          }
        }
      }
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function move(req: Request, res: Response) {
  try {
    const { column_id, position } = req.body;
    const task = await taskSvc.getTaskById(String(req.params.id), req.workspaceId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const targetColumnId = column_id ?? task.column_id;
    const oldColumnTitle = await taskSvc.getColumnTitle(task.column_id);
    await taskSvc.moveTask(String(req.params.id), targetColumnId, position ?? task.position);
    const updated = await taskSvc.getEnrichedTask(String(req.params.id));
    if (io) io.to(`board:${updated!.board_id}`).emit('task_updated', { type: 'moved', task: updated });

    if (targetColumnId !== task.column_id) {
      const moveActor = await taskSvc.getActorInfo(req.user.id);
      await taskSvc.insertTaskHistory({
        task_id: String(req.params.id), actor_id: req.user.id,
        actor_name: moveActor.name, actor_avatar: moveActor.avatar_url,
        action: 'moved', field: 'column',
        old_value: oldColumnTitle, new_value: updated?.column_title ?? targetColumnId,
      });
    }

    // Notify team members when task is moved to the last (done) column
    const lastColId = await taskSvc.getLastColumnId(updated!.board_id);
    const isCompleted = !!(lastColId && targetColumnId === lastColId && task.column_id !== targetColumnId);
    if (isCompleted) {
      const teamMembers = await taskSvc.getBoardTeamMembers(updated!.board_id);
      if (teamMembers.length > 0) {
        const actorName = await taskSvc.getUserName(req.user.id);
        const boardName = await taskSvc.getBoardName(updated!.board_id);
        const msg = `${task.task_key} was completed on ${boardName}`;
        for (const { user_id } of teamMembers) {
          if (user_id === req.user.id) continue;
          const notifId = await taskSvc.createAssignmentNotification(user_id, 'task_assigned', String(req.params.id), msg, req.workspaceId!);
          if (io) io.to(`user:${user_id}`).emit('notification', { id: notifId, type: 'task_assigned', message: msg, reference_id: String(req.params.id), reference_type: 'task', workspace_id: req.workspaceId });
        }
      }
    }

    // Post system message to board channel
    const boardCh = await boardSvc.getBoardChannel(updated!.board_id);
    if (boardCh?.channel_id) {
      const colTitle = updated?.column_title ?? targetColumnId;
      const content = isCompleted
        ? `[${updated?.task_key}] "${updated?.title}" was completed ✓`
        : `[${updated?.task_key}] "${updated?.title}" → ${colTitle}`;
      const sysMsg = await channelSvc.createSystemMessage(boardCh.channel_id, req.user.id, content);
      if (io && sysMsg) io.to(`channel:${boardCh.channel_id}`).emit('new_message', sysMsg);
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function resolveByKey(req: Request, res: Response) {
  try {
    const task = await taskSvc.resolveTaskByKey(String(req.params.taskKey), req.workspaceId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getHistory(req: Request, res: Response) {
  try {
    const history = await taskSvc.getTaskHistory(String(req.params.id), req.workspaceId!);
    res.json(history);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteTask(req: Request, res: Response) {
  try {
    const task = await taskSvc.getTaskById(String(req.params.id), req.workspaceId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await taskSvc.deleteTaskCascade(String(req.params.id));
    if (io) io.to(`board:${task.board_id}`).emit('task_updated', { type: 'deleted', task_id: String(req.params.id) });

    const boardCh = await boardSvc.getBoardChannel(task.board_id);
    if (boardCh?.channel_id) {
      const sysMsg = await channelSvc.createSystemMessage(boardCh.channel_id, req.user.id, `[${task.task_key}] "${task.title}" was deleted`);
      if (io && sysMsg) io.to(`channel:${boardCh.channel_id}`).emit('new_message', sysMsg);
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
