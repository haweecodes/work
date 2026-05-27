import request from 'supertest';
import { makeApp } from '../helpers/makeApp';

// Mock all service modules before any imports load them
jest.mock('../../services/taskService');
jest.mock('../../services/boardService');
jest.mock('../../services/channelService');

import * as taskSvc from '../../services/taskService';
import * as boardSvc from '../../services/boardService';
import * as channelSvc from '../../services/channelService';

const app = makeApp();

const TASK = {
  id: 'task-1',
  title: 'Test Task',
  description: '',
  priority: 'medium',
  due_date: null,
  overdue_notified_at: null,
  column_id: 'col-1',
  board_id: 'board-1',
  parent_task_id: null,
  task_key: 'TST-1',
  task_number: 1,
  position: 0,
  assignees: [],
  column_title: 'To Do',
};

beforeEach(() => {
  jest.mocked(taskSvc.boardBelongsToWorkspace).mockResolvedValue(true);
  jest.mocked(taskSvc.columnBelongsToBoard).mockResolvedValue(true);
  jest.mocked(taskSvc.getNextTaskSequence).mockResolvedValue(1);
  jest.mocked(taskSvc.getColumnCount).mockResolvedValue(0);
  jest.mocked(taskSvc.createTask).mockResolvedValue('task-1');
  jest.mocked(taskSvc.linkMessageToTask).mockResolvedValue(undefined);
  jest.mocked(taskSvc.getUserName).mockResolvedValue('Alice');
  jest.mocked(taskSvc.addAssignee).mockResolvedValue(undefined);
  jest.mocked(taskSvc.removeAssignee).mockResolvedValue(undefined);
  jest.mocked(taskSvc.createAssignmentNotification).mockResolvedValue('notif-1');
  jest.mocked(taskSvc.getEnrichedTask).mockResolvedValue(TASK as any);
  jest.mocked(taskSvc.getActorInfo).mockResolvedValue({ name: 'Alice', avatar_url: null });
  jest.mocked(taskSvc.insertTaskHistory).mockResolvedValue(undefined);
  jest.mocked(taskSvc.getBoardTeamMembers).mockResolvedValue([]);
  jest.mocked(taskSvc.getTaskById).mockResolvedValue(TASK as any);
  jest.mocked(taskSvc.getTaskForDetail).mockResolvedValue(TASK as any);
  jest.mocked(taskSvc.getTaskDetailForNotification).mockResolvedValue(null);
  jest.mocked(taskSvc.deleteTaskCascade).mockResolvedValue(undefined);
  jest.mocked(taskSvc.updateTask).mockResolvedValue(undefined);
  jest.mocked(taskSvc.getTaskAssignees).mockResolvedValue([]);
  jest.mocked(taskSvc.getTasksByParent).mockResolvedValue([]);
  jest.mocked(taskSvc.moveTask).mockResolvedValue(undefined);
  jest.mocked(taskSvc.getLastColumnId).mockResolvedValue('col-done');
  jest.mocked(taskSvc.checkOverdueNotified).mockResolvedValue(false);
  jest.mocked(taskSvc.markOverdueNotified).mockResolvedValue(undefined);
  jest.mocked(taskSvc.resolveTaskByKey).mockResolvedValue({ task_id: 'task-1', board_id: 'board-1', workspace_id: 'ws-1' });
  jest.mocked(taskSvc.getTaskHistory).mockResolvedValue([]);
  jest.mocked(taskSvc.getColumnTitle).mockResolvedValue('To Do');
  jest.mocked(taskSvc.getBoardName).mockResolvedValue('My Board');
  jest.mocked(taskSvc.getTasksForUser).mockResolvedValue([]);
  jest.mocked(taskSvc.listComments).mockResolvedValue([]);
  jest.mocked(boardSvc.getBoardChannel).mockResolvedValue(undefined);
  jest.mocked(channelSvc.getChannelById).mockResolvedValue(null as any);
  jest.mocked(channelSvc.createSystemMessage).mockResolvedValue(null as any);
});

// ── POST /api/tasks ────────────────────────────────────────────────────────────

describe('POST /api/tasks', () => {
  it('returns 400 when board_id is missing', async () => {
    const res = await request(app).post('/api/tasks').send({ column_id: 'col-1', title: 'My Task' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/board_id/);
  });

  it('returns 400 when column_id is missing', async () => {
    const res = await request(app).post('/api/tasks').send({ board_id: 'board-1', title: 'My Task' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app).post('/api/tasks').send({ board_id: 'board-1', column_id: 'col-1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when title is empty whitespace', async () => {
    const res = await request(app).post('/api/tasks').send({ board_id: 'board-1', column_id: 'col-1', title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns 400 when title exceeds 500 characters', async () => {
    const res = await request(app).post('/api/tasks').send({
      board_id: 'board-1', column_id: 'col-1', title: 'A'.repeat(501),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns 404 when board does not belong to workspace', async () => {
    jest.mocked(taskSvc.boardBelongsToWorkspace).mockResolvedValueOnce(false);
    const res = await request(app).post('/api/tasks').send({
      board_id: 'board-other', column_id: 'col-1', title: 'My Task',
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/board/i);
  });

  it('returns 201 with enriched task on success', async () => {
    const res = await request(app).post('/api/tasks').send({
      board_id: 'board-1', column_id: 'col-1', title: 'My Task',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('task-1');
    expect(taskSvc.createTask).toHaveBeenCalledTimes(1);
  });

  it('sends assignment notification when assigning another user', async () => {
    const res = await request(app).post('/api/tasks').send({
      board_id: 'board-1', column_id: 'col-1', title: 'My Task',
      assignee_ids: ['user-2'],
    });
    expect(res.status).toBe(201);
    expect(taskSvc.createAssignmentNotification).toHaveBeenCalledWith(
      'user-2', 'task_assigned', 'task-1', expect.stringContaining('assigned'), 'ws-1',
    );
  });

  it('does not send notification when self-assigning', async () => {
    const res = await request(app).post('/api/tasks').send({
      board_id: 'board-1', column_id: 'col-1', title: 'My Task',
      assignee_ids: ['user-1'],
    });
    expect(res.status).toBe(201);
    expect(taskSvc.createAssignmentNotification).not.toHaveBeenCalled();
  });

  it('trims whitespace from title before saving', async () => {
    await request(app).post('/api/tasks').send({
      board_id: 'board-1', column_id: 'col-1', title: '  Padded Title  ',
    });
    expect(taskSvc.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Padded Title' }),
    );
  });
});

// ── GET /api/tasks/task/:id ────────────────────────────────────────────────────

describe('GET /api/tasks/task/:id', () => {
  it('returns 404 when task not found', async () => {
    jest.mocked(taskSvc.getTaskForDetail).mockResolvedValueOnce(null);
    const res = await request(app).get('/api/tasks/task/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/task not found/i);
  });

  it('returns 200 with task data when found', async () => {
    const res = await request(app).get('/api/tasks/task/task-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('task-1');
    expect(res.body.title).toBe('Test Task');
  });

  it('skips overdue check when due_date is null', async () => {
    await request(app).get('/api/tasks/task/task-1');
    expect(taskSvc.checkOverdueNotified).not.toHaveBeenCalled();
  });

  it('fires overdue notifications when task is past due and not in done column', async () => {
    const overdueTask = {
      ...TASK,
      due_date: '2020-01-01T00:00:00Z',
      overdue_notified_at: null,
      column_id: 'col-1',
    };
    jest.mocked(taskSvc.getTaskForDetail).mockResolvedValueOnce(overdueTask as any);
    jest.mocked(taskSvc.getLastColumnId).mockResolvedValueOnce('col-done');
    jest.mocked(taskSvc.checkOverdueNotified).mockResolvedValueOnce(false);
    jest.mocked(taskSvc.getTaskAssignees).mockResolvedValueOnce([{ user_id: 'user-2' }]);

    await request(app).get('/api/tasks/task/task-1');

    expect(taskSvc.markOverdueNotified).toHaveBeenCalledWith('task-1');
    expect(taskSvc.createAssignmentNotification).toHaveBeenCalledWith(
      'user-2', 'system', 'task-1', expect.stringContaining('overdue'), 'ws-1',
    );
  });

  it('skips overdue notifications when task is already in done column', async () => {
    const overdueTask = {
      ...TASK,
      due_date: '2020-01-01T00:00:00Z',
      overdue_notified_at: null,
      column_id: 'col-done',  // same as lastColId
    };
    jest.mocked(taskSvc.getTaskForDetail).mockResolvedValueOnce(overdueTask as any);
    jest.mocked(taskSvc.getLastColumnId).mockResolvedValueOnce('col-done');

    await request(app).get('/api/tasks/task/task-1');

    expect(taskSvc.markOverdueNotified).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/tasks/:id ──────────────────────────────────────────────────────

describe('DELETE /api/tasks/:id', () => {
  it('returns 404 when task not found', async () => {
    jest.mocked(taskSvc.getTaskById).mockResolvedValueOnce(null);
    const res = await request(app).delete('/api/tasks/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/task not found/i);
  });

  it('returns 200 and calls cascade delete', async () => {
    const res = await request(app).delete('/api/tasks/task-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(taskSvc.deleteTaskCascade).toHaveBeenCalledWith('task-1');
  });
});

// ── PATCH /api/tasks/:id ───────────────────────────────────────────────────────

describe('PATCH /api/tasks/:id', () => {
  it('returns 404 when task not found', async () => {
    jest.mocked(taskSvc.getTaskById).mockResolvedValueOnce(null);
    const res = await request(app).patch('/api/tasks/nonexistent').send({ title: 'New Title' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/task not found/i);
  });

  it('returns 400 when moving a subtask to a different board', async () => {
    jest.mocked(taskSvc.getTaskById).mockResolvedValueOnce({ ...TASK, parent_task_id: 'parent-1' } as any);
    const res = await request(app).patch('/api/tasks/task-1').send({
      board_id: 'board-other', column_id: 'col-other',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subtask/i);
  });

  it('returns 400 when moving to board without specifying column', async () => {
    const res = await request(app).patch('/api/tasks/task-1').send({ board_id: 'board-other' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/column/i);
  });

  it('returns 400 when target board is not in workspace', async () => {
    jest.mocked(taskSvc.boardBelongsToWorkspace).mockResolvedValueOnce(false);
    const res = await request(app).patch('/api/tasks/task-1').send({
      board_id: 'board-other', column_id: 'col-other',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/board/i);
  });

  it('returns 400 when column does not belong to target board', async () => {
    jest.mocked(taskSvc.columnBelongsToBoard).mockResolvedValueOnce(false);
    const res = await request(app).patch('/api/tasks/task-1').send({
      board_id: 'board-other', column_id: 'col-other',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/column/i);
  });

  it('returns 200 with updated task when title changes', async () => {
    const updated = { ...TASK, title: 'New Title' };
    jest.mocked(taskSvc.getEnrichedTask).mockResolvedValueOnce(updated as any);

    const res = await request(app).patch('/api/tasks/task-1').send({ title: 'New Title' });

    expect(res.status).toBe(200);
    expect(taskSvc.updateTask).toHaveBeenCalledWith('task-1',
      expect.objectContaining({ title: 'New Title' }),
    );
  });

  it('records title change in history', async () => {
    await request(app).patch('/api/tasks/task-1').send({ title: 'New Title' });
    expect(taskSvc.insertTaskHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'updated', field: 'title', new_value: 'New Title' }),
    );
  });

  it('sends unassigned notification when removing an assignee', async () => {
    jest.mocked(taskSvc.getTaskAssignees).mockResolvedValueOnce([{ user_id: 'user-2' }]);

    await request(app).patch('/api/tasks/task-1').send({ assignee_ids: [] });

    expect(taskSvc.createAssignmentNotification).toHaveBeenCalledWith(
      'user-2', 'task_unassigned', 'task-1', expect.stringContaining('removed'), 'ws-1',
    );
  });
});

// ── GET /api/tasks?scope=mine ──────────────────────────────────────────────────

describe('GET /api/tasks (listMine)', () => {
  it('returns 400 when scope query param is missing', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scope=mine/);
  });

  it('returns 400 when scope is not "mine"', async () => {
    const res = await request(app).get('/api/tasks?scope=all');
    expect(res.status).toBe(400);
  });

  it('returns user tasks when scope=mine', async () => {
    jest.mocked(taskSvc.getTasksForUser).mockResolvedValueOnce([TASK] as any);
    const res = await request(app).get('/api/tasks?scope=mine');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(taskSvc.getTasksForUser).toHaveBeenCalledWith('user-1', 'ws-1');
  });
});

// ── GET /api/tasks/resolve/:taskKey ───────────────────────────────────────────

describe('GET /api/tasks/resolve/:taskKey', () => {
  it('returns 404 when task key does not exist', async () => {
    jest.mocked(taskSvc.resolveTaskByKey).mockResolvedValueOnce(null);
    const res = await request(app).get('/api/tasks/resolve/FW-999');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/task not found/i);
  });

  it('returns task resolution data for a valid key', async () => {
    const res = await request(app).get('/api/tasks/resolve/TST-1');
    expect(res.status).toBe(200);
    expect(res.body.task_id).toBe('task-1');
    expect(res.body.board_id).toBe('board-1');
    expect(taskSvc.resolveTaskByKey).toHaveBeenCalledWith('TST-1', 'ws-1');
  });
});

// ── GET /api/tasks/:id/history ─────────────────────────────────────────────────

describe('GET /api/tasks/:id/history', () => {
  it('returns empty array when no history', async () => {
    const res = await request(app).get('/api/tasks/task-1/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns history entries', async () => {
    const history = [{ id: 'h1', action: 'created', actor_name: 'Alice' }];
    jest.mocked(taskSvc.getTaskHistory).mockResolvedValueOnce(history as any);
    const res = await request(app).get('/api/tasks/task-1/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(taskSvc.getTaskHistory).toHaveBeenCalledWith('task-1', 'ws-1');
  });
});
