import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { all, get, run } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
let io: Server | undefined;

export const setIo = (socketIo: Server) => { io = socketIo; };

function sendAssignmentNotification(
  userId: string,
  actorId: string,
  actorName: string,
  taskId: string,
  taskTitle: string,
  boardId: string,
  type: 'task_assigned' | 'task_unassigned'
) {
  const notifId = uuidv4();
  const msg = type === 'task_assigned'
    ? `${actorName} assigned you to "${taskTitle}"`
    : `${actorName} removed you from "${taskTitle}"`;

  run(
    'INSERT INTO notifications (id, user_id, type, reference_id, reference_type, message) VALUES (?, ?, ?, ?, ?, ?)',
    [notifId, userId, type, taskId, 'task', msg]
  );
  if (io) io.to(`user:${userId}`).emit('notification', { id: notifId, type, message: msg });

  // Also send a DM notification if assigned or unassigned
  if ((type === 'task_assigned' || type === 'task_unassigned') && actorId !== userId) {
    const assigneeName = get<{ name: string }>('SELECT name FROM users WHERE id = ?', [userId])?.name || 'A user';
    const payload = JSON.stringify({ type, actorId, actorName, assigneeId: userId, assigneeName, taskTitle });
    
    const board = get('SELECT workspace_id FROM boards WHERE id = ?', [boardId]);
    const creator = get<{ name: string; avatar_url: string }>('SELECT name, avatar_url FROM users WHERE id = ?', [actorId]);
    const taskObj = get('SELECT id, title, priority, task_key, task_number FROM tasks WHERE id = ?', [taskId]);

    if (board?.workspace_id) {
      // 1. Send DM to assignee
      let threadId = get(
        `SELECT dt.id FROM dm_threads dt
         JOIN dm_participants dp1 ON dt.id = dp1.thread_id AND dp1.user_id = ?
         JOIN dm_participants dp2 ON dt.id = dp2.thread_id AND dp2.user_id = ?
         WHERE dt.workspace_id = ? LIMIT 1`,
        [actorId, userId, board.workspace_id]
      )?.id;

      if (!threadId) {
        threadId = uuidv4();
        run('INSERT INTO dm_threads (id, workspace_id) VALUES (?, ?)', [threadId, board.workspace_id]);
        run('INSERT INTO dm_participants (thread_id, user_id) VALUES (?, ?)', [threadId, actorId]);
        run('INSERT INTO dm_participants (thread_id, user_id) VALUES (?, ?)', [threadId, userId]);
      }

      const systemId = uuidv4();
      run(
        'INSERT INTO messages (id, dm_thread_id, sender_id, content, linked_task_id, is_system) VALUES (?, ?, ?, ?, ?, 1)',
        [systemId, threadId, actorId, payload, taskId]
      );

      const systemMsg = {
        id: systemId, dm_thread_id: threadId, sender_id: actorId, content: payload,
        linked_task_id: taskId, linked_task: taskObj, created_at: new Date().toISOString(),
        sender: { id: actorId, name: creator?.name, avatar_url: creator?.avatar_url },
        parent_message_id: null, reply_count: 0, reactions: [], is_system: 1,
      };

      if (io) {
        io.to(`dm:${threadId}`).emit('new_dm', systemMsg);
        io.to(`user:${userId}`).emit('notification', { id: uuidv4(), type: 'dm' });
      }
    }

    // 2. Broadcast to linked channel if exists
    const origin = get<{ channel_id: string | null }>(
      `SELECT m.channel_id FROM tasks t JOIN messages m ON t.linked_message_id = m.id WHERE t.id = ?`,
      [taskId]
    );
    if (origin?.channel_id) {
      const sysIdChannel = uuidv4();
      run(
        'INSERT INTO messages (id, channel_id, sender_id, content, linked_task_id, is_system) VALUES (?, ?, ?, ?, ?, 1)',
        [sysIdChannel, origin.channel_id, actorId, payload, taskId]
      );
      if (io) {
        const channelMsg = {
          id: sysIdChannel, channel_id: origin.channel_id, sender_id: actorId, content: payload,
          linked_task_id: taskId, linked_task: taskObj, created_at: new Date().toISOString(),
          sender: { id: actorId, name: creator?.name, avatar_url: creator?.avatar_url },
          parent_message_id: null, reply_count: 0, reactions: [], is_system: 1,
        };
        io.to(`channel:${origin.channel_id}`).emit('new_message', channelMsg);
      }
    }
  }
}

router.post('/', authMiddleware, (req: Request, res: Response) => {
  try {
    const { board_id, column_id, title, description, priority, due_date, assignee_ids, linked_message_id, parent_task_id } = req.body;
    if (!board_id || !column_id || !title) {
      return res.status(400).json({ error: 'board_id, column_id, title required' });
    }
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const board = get('SELECT id, project_key FROM boards WHERE id = ?', [board_id]);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    run('UPDATE boards SET task_sequence = task_sequence + 1 WHERE id = ?', [board_id]);
    const updatedBoard = get<{ task_sequence: number }>('SELECT task_sequence FROM boards WHERE id = ?', [board_id]);
    const task_number = updatedBoard!.task_sequence;
    const task_key = `${board.project_key}-${task_number}`;

    const existing = all('SELECT id FROM tasks WHERE column_id = ?', [column_id]);
    const id = uuidv4();
    run(
      'INSERT INTO tasks (id, board_id, column_id, title, description, priority, due_date, created_by, linked_message_id, parent_task_id, position, task_number, task_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, board_id, column_id, title, description || '', priority || 'medium', due_date || null, req.user.id, linked_message_id || null, parent_task_id || null, existing.length, task_number, task_key]
    );

    if (linked_message_id) {
      run('UPDATE messages SET linked_task_id = ? WHERE id = ?', [id, linked_message_id]);
    }

    if (assignee_ids && Array.isArray(assignee_ids)) {
      const actorName = get<{ name: string }>('SELECT name FROM users WHERE id = ?', [req.user?.id])?.name || 'A user';
      assignee_ids.forEach(uid => {
        run('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)', [id, uid]);
        // Notify everyone assigned except the person who just created the task
        if (uid !== req.user?.id) {
          sendAssignmentNotification(uid, req.user!.id, actorName, id, title, board_id, 'task_assigned');
        }
      });
    }

    const task = get('SELECT t.*, c.title as column_title, m.channel_id as linked_channel_id, m.parent_message_id as linked_parent_message_id, m.dm_thread_id as linked_dm_thread_id FROM tasks t LEFT JOIN columns c ON t.column_id = c.id LEFT JOIN messages m ON t.linked_message_id = m.id WHERE t.id = ?', [id]);
    const assignees = all(
      `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
      [id]
    );
    const result = { ...task, assignees };
    if (io) io.to(`board:${board_id}`).emit('task_updated', { type: 'created', task: result });

    // ── Post a system notification message to the origin channel/thread or DM ──
    if (linked_message_id && io) {
      const origin = get<{
        channel_id: string | null;
        dm_thread_id: string | null;
        parent_message_id: string | null;
      }>('SELECT channel_id, dm_thread_id, parent_message_id FROM messages WHERE id = ?', [linked_message_id]);

      if (origin) {
        const systemContent = `🗂️ Task created: **${title}**`;
        const systemId = uuidv4();
        const creator = get<{ name: string; avatar_url: string }>('SELECT name, avatar_url FROM users WHERE id = ?', [req.user.id]);

        if (origin.channel_id) {
          // Insert as a thread reply if the linked message is itself a thread reply,
          // otherwise post to the channel itself.
          const postParentId = origin.parent_message_id ?? linked_message_id;

          run(
            'INSERT INTO messages (id, channel_id, sender_id, content, linked_task_id, parent_message_id, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [systemId, origin.channel_id, req.user.id, systemContent, id, postParentId]
          );

          const systemMsg = {
            id: systemId,
            channel_id: origin.channel_id,
            sender_id: req.user.id,
            content: systemContent,
            linked_task_id: id,
            linked_task: { id, title, priority: priority || 'medium', task_key, task_number },
            created_at: new Date().toISOString(),
            sender: { id: req.user.id, name: creator?.name, avatar_url: creator?.avatar_url },
            parent_message_id: postParentId,
            reply_count: 0,
            reactions: [],
            is_system: 1,
          };

          if (origin.parent_message_id) {
            // It was a thread reply — notify thread participants only
            const participants = all<{ sender_id: string }>(
              'SELECT DISTINCT sender_id FROM messages WHERE id = ? OR parent_message_id = ?',
              [postParentId, postParentId]
            );
            const notified = new Set<string>();
            participants.forEach(p => {
              io!.to(`user:${p.sender_id}`).emit('new_message', systemMsg);
              notified.add(p.sender_id);
            });
            if (!notified.has(req.user.id)) io.to(`user:${req.user.id}`).emit('new_message', systemMsg);
          } else {
            // Root channel message — broadcast to channel room
            io.to(`channel:${origin.channel_id}`).emit('new_message', systemMsg);
          }

        } else if (origin.dm_thread_id) {
          run(
            'INSERT INTO messages (id, dm_thread_id, sender_id, content, linked_task_id, parent_message_id, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [systemId, origin.dm_thread_id, req.user.id, systemContent, id, origin.parent_message_id || null]
          );

          const systemMsg = {
            id: systemId,
            dm_thread_id: origin.dm_thread_id,
            sender_id: req.user.id,
            content: systemContent,
            linked_task_id: id,
            linked_task: { id, title, priority: priority || 'medium', task_key, task_number },
            created_at: new Date().toISOString(),
            sender: { id: req.user.id, name: creator?.name, avatar_url: creator?.avatar_url },
            parent_message_id: origin.parent_message_id || null,
            reply_count: 0,
            reactions: [],
            is_system: 1,
          };

          io.to(`dm:${origin.dm_thread_id}`).emit('new_dm', systemMsg);
        }
      }
    }

    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});


router.patch('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const { title, description, priority, due_date, assignee_ids, column_id, parent_task_id } = req.body;
    const task = get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    let newPosition = task.position;
    if (column_id && column_id !== task.column_id) {
      const existing = all('SELECT id FROM tasks WHERE column_id = ?', [column_id]);
      newPosition = existing.length;
    }

    // prevent cyclic parenting: task cannot be its own parent
    const parsedParentId = parent_task_id === req.params.id ? null : (parent_task_id ?? task.parent_task_id);

    run(
      'UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, column_id = ?, parent_task_id = ?, position = ? WHERE id = ?',
      [title ?? task.title, description ?? task.description, priority ?? task.priority, due_date ?? task.due_date, column_id ?? task.column_id, parsedParentId, newPosition, req.params.id]
    );

    if (assignee_ids && Array.isArray(assignee_ids)) {
      const ids = assignee_ids as string[];
      const actorName = get<{ name: string }>('SELECT name FROM users WHERE id = ?', [req.user?.id])?.name || 'A user';
      const currentAssignees = all<{ user_id: string }>('SELECT user_id FROM task_assignees WHERE task_id = ?', [req.params.id]);
      const currentIds = new Set<string>(currentAssignees.map(a => a.user_id));
      const newIds = new Set<string>(ids);

      // Newly added members
      for (const uid of newIds) {
        if (!currentIds.has(uid)) {
          run('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)', [req.params.id, uid]);
          if (uid !== req.user?.id) {
            sendAssignmentNotification(String(uid), req.user!.id, actorName, String(req.params.id), String(task.title), task.board_id, 'task_assigned');
          }
        }
      }

      // Removed members
      for (const uid of currentIds) {
        if (!newIds.has(uid)) {
          run('DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?', [req.params.id, uid]);
          if (uid !== req.user?.id) {
            sendAssignmentNotification(String(uid), req.user!.id, actorName, String(req.params.id), String(task.title), task.board_id, 'task_unassigned');
          }
        }
      }

    }
    const updated = get('SELECT t.*, c.title as column_title, m.channel_id as linked_channel_id, m.parent_message_id as linked_parent_message_id, m.dm_thread_id as linked_dm_thread_id FROM tasks t LEFT JOIN columns c ON t.column_id = c.id LEFT JOIN messages m ON t.linked_message_id = m.id WHERE t.id = ?', [req.params.id]);
    const assignees = all(
      `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
      [req.params.id]
    );
    const result = { ...updated, assignees };
    if (io) io.to(`board:${updated.board_id}`).emit('task_updated', { type: 'updated', task: result });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/move', authMiddleware, (req: Request, res: Response) => {
  try {
    const { column_id, position } = req.body;
    const task = get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    run('UPDATE tasks SET column_id = ?, position = ? WHERE id = ?',
      [column_id ?? task.column_id, position ?? task.position, req.params.id]);

    const updated = get('SELECT t.*, c.title as column_title, m.channel_id as linked_channel_id, m.parent_message_id as linked_parent_message_id, m.dm_thread_id as linked_dm_thread_id FROM tasks t LEFT JOIN columns c ON t.column_id = c.id LEFT JOIN messages m ON t.linked_message_id = m.id WHERE t.id = ?', [req.params.id]);
    if (io) io.to(`board:${updated.board_id}`).emit('task_updated', { type: 'moved', task: updated });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve short task link like WEB-12 to its full routing context
router.get('/resolve/:taskKey', authMiddleware, (req: Request, res: Response) => {
  try {
    const taskKey = String(req.params.taskKey).toUpperCase();
    const workspaceId = req.query.workspace_id;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspace_id is required' });
    }

    const task = get(
      `SELECT t.id as task_id, t.board_id, b.workspace_id 
       FROM tasks t 
       JOIN boards b ON t.board_id = b.id 
       WHERE UPPER(t.task_key) = ? AND b.workspace_id = ?`,
      [taskKey, workspaceId]
    );
    
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single task by ID with full joined message data
router.get('/task/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const task = get(
      `SELECT t.*, c.title as column_title,
        m.channel_id as linked_channel_id,
        m.parent_message_id as linked_parent_message_id,
        m.dm_thread_id as linked_dm_thread_id
       FROM tasks t
       LEFT JOIN columns c ON t.column_id = c.id
       LEFT JOIN messages m ON t.linked_message_id = m.id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const assignees = all(
      `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
      [req.params.id]
    );
    res.json({ ...task, assignees });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const task = get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    run('DELETE FROM task_assignees WHERE task_id = ?', [req.params.id]);
    run('UPDATE messages SET linked_task_id = NULL WHERE linked_task_id = ?', [req.params.id]);
    run('DELETE FROM tasks WHERE id = ?', [req.params.id]);

    if (io) io.to(`board:${task.board_id}`).emit('task_updated', { type: 'deleted', task_id: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:boardId', authMiddleware, (req: Request, res: Response) => {
  const tasks = all(
    'SELECT t.*, c.title as column_title, m.channel_id as linked_channel_id, m.parent_message_id as linked_parent_message_id, m.dm_thread_id as linked_dm_thread_id FROM tasks t LEFT JOIN columns c ON t.column_id = c.id LEFT JOIN messages m ON t.linked_message_id = m.id WHERE t.board_id = ? ORDER BY t.position ASC', 
    [req.params.boardId]
  );
  const enriched = tasks.map((t: any) => ({
    ...t,
    assignees: all(
      `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
      [t.id]
    )
  }));
  res.json(enriched);
});

export default router;
export { router as taskRouter };
