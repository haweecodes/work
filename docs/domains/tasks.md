# Domain: Tasks

## Overview
Cards on a Kanban board column. Tasks have titles, descriptions, priority, due dates, assignees, subtask relationships, message links, and auto-generated shareable keys.

## Key Files
| File | Role |
|---|---|
| `backend/src/routes/tasks.ts` | Task CRUD + move + resolve + assignee management |
| `frontend/src/components/TaskDetailPanel.tsx` | Slide-in task detail drawer |
| `frontend/src/components/CreateTaskModal.tsx` | Task creation modal |
| `frontend/src/components/InlineTaskCard.tsx` | Compact task chip (used in messages) |
| `frontend/src/pages/TaskRedirect.tsx` | Deep-link resolver (`/t/:taskKey`) |
| `frontend/src/store/boardStore.ts` | `selectedTask`, `updateTaskInColumn`, `addTaskToColumn` |

## Data Model
```
tasks: id, board_id, column_id, title, description, priority ('low'|'medium'|'high'|'critical'),
       due_date, created_by → users, position (0-based int),
       task_number (int, auto via board.task_sequence),
       task_key (text, e.g. 'FW-42'),
       linked_message_id → messages (nullable),
       parent_task_id → tasks (nullable, for subtasks),
       created_at

task_assignees: task_id, user_id  [composite PK]
```

## Task Key Generation
```sql
UPDATE boards SET task_sequence = task_sequence + 1 WHERE id = ?;
-- then read back task_sequence
task_key = `${board.project_key}-${task_sequence}`  -- e.g. 'FW-42'
```
- Keys are unique per board, never reused
- `task_key` is stored uppercase; resolve endpoint calls `UPPER(t.task_key)`

## API Endpoints
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tasks` | Create task (with optional `assignee_ids`, `linked_message_id`, `parent_task_id`) |
| `PATCH` | `/api/tasks/:id` | Update task fields + assignees (diff-based: adds/removes) |
| `PATCH` | `/api/tasks/:id/move` | Move to different column + position |
| `DELETE` | `/api/tasks/:id` | Delete task (cascades assignees, nullifies linked_message_id) |
| `GET` | `/api/tasks/:boardId` | All tasks for board (flat, with assignees) |
| `GET` | `/api/tasks/task/:id` | Single task by ID |
| `GET` | `/api/tasks/resolve/:taskKey?workspace_id=` | Resolve task key to `{ task_id, board_id, workspace_id }` |

## Task Creation Side Effects
1. Increments `boards.task_sequence` and generates `task_key`
2. Inserts `task_assignees` for each `assignee_id`
3. For each non-self assignee: calls `sendAssignmentNotification` (notification row + DM system message + channel system message if linked)
4. If `linked_message_id`: updates `messages.linked_task_id` to link the message to this task
5. If task created from a message: posts a system message `"🗂️ Task created: **<title>**"` in the originating channel/DM thread
6. Emits `task_updated { type: 'created', task }` to `board:{board_id}`

## Assignee Management (`PATCH /:id`)
- Diff-based: compares `assignee_ids` (new desired state) against current `task_assignees`
- Adds new assignees: insert + send notification
- Removes removed assignees: delete + send unassignment notification
- Notifications are skipped if assignee === actor

## Assignment Notifications
- Inserts `notifications` row
- Emits `notification` to `user:{assigneeId}`
- Also creates/reuses a DM thread between actor and assignee, posts a system message there
- If task has `linked_message_id` in a channel: posts system message to that channel too

## Task Deep Link
- URL format: `/t/:taskKey` → `TaskRedirect` page
- Resolves via `GET /api/tasks/resolve/:taskKey?workspace_id=<id>`
- Navigates to `/board/:boardId?taskKey=<key>` on success
- `workspace_id` query param is **required** — 400 without it

## Frontend Task Detail Panel
- Opened by setting `boardStore.selectedTask`
- Closed by setting `boardStore.selectedTask = null`
- `AppLayout` clears `selectedTask` on route change (`location.pathname` effect)
- On desktop: right-panel slide-in (240px → `w-96`); on mobile: full-screen overlay (z-40)

## Socket Events
| Event | Room | Payload |
|---|---|---|
| `task_updated` | `board:{boardId}` | `{ type: 'created'|'updated'|'moved'|'deleted', task?, task_id? }` |

Frontend `boardStore.updateTaskInColumn` handles all types:
- `created` → `addTaskToColumn`
- `updated` → updates in-place or moves between columns
- `moved` → same as updated
- `deleted` → `removeTask`

## Constraints
- `board_id`, `column_id`, `title` are required to create a task
- `task_sequence` must only increment — never reset or set manually
- `parent_task_id` cannot reference the task itself — backend guards `parsedParentId = parent_task_id === req.params.id ? null : parent_task_id`
- `workspace_id` is required for task key resolution
- Default priority is `'medium'` if not provided
