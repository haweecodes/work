# Domain: Boards

## Overview
Kanban boards scoped to a workspace. Each board has ordered columns, and each column holds ordered tasks. Boards are the primary productivity surface.

## Key Files
| File | Role |
|---|---|
| `backend/src/routes/boards.ts` | Board + column CRUD |
| `frontend/src/pages/BoardView.tsx` | Kanban UI (drag-and-drop) |
| `frontend/src/store/boardStore.ts` | Client state: boards, columns (with tasks), selectedTask |
| `frontend/src/components/CreateBoardModal.tsx` | Create board modal |
| `frontend/src/components/Sidebar/Sidebar.tsx` | Board list in nav |

## Data Model
```
boards:  id, workspace_id, name, project_key (NOT NULL, unique per workspace), task_sequence (auto-increment counter), created_at
columns: id, board_id, title, position (int, 0-based), created_at
```
- `project_key` = uppercase initials of board name (max 5 chars), e.g. "My Board" → "MB"; de-duped with numeric suffix if collision
- `task_sequence` is atomically incremented to generate `task_key` for each new task

## API Endpoints
| Method | Path | Guard | Description |
|---|---|---|---|
| `GET` | `/api/boards/:workspaceId` | auth + member | List all boards in workspace |
| `POST` | `/api/boards` | auth | Create board |
| `GET` | `/api/boards/:boardId/columns` | auth + member | Fetch columns with tasks + assignees |
| `POST` | `/api/boards/:boardId/columns` | auth | Add custom column |

## Board Creation Side Effects
1. Generates unique `project_key`
2. Auto-creates 4 default columns: `['To Do', 'In Progress', 'In Review', 'Done']` at positions 0–3

## Column Fetch (`GET /:boardId/columns`)
Returns `Column[]` where each column includes:
```ts
{ id, board_id, title, position, tasks: Task[] }
```
- Tasks are ordered by `position ASC`
- Each task includes `assignees: TaskAssignee[]`
- This is the primary data-loading call for `BoardView`

## Frontend State (`boardStore`)
```ts
{
  boards: Board[],
  currentBoard: { id } | null,
  columns: Column[],      // each Column has tasks: Task[]
  selectedTask: Task | null,
}
```
- `fetchColumns(boardId)` loads all columns+tasks and sets `currentBoard`
- `selectedTask !== null` opens `TaskDetailPanel`; set to `null` to close
- `moveTaskLocally(taskId, fromColId, toColId, newIndex)` — optimistic drag-and-drop update
- `updateTaskInColumn(task)` — handles socket `task_updated` events; moves task between columns if `column_id` changed
- `addColumn(col)` — called on socket `column_created`

## Socket Events
| Event | Room | Payload |
|---|---|---|
| `task_updated` | `board:{id}` | `{ type: 'created'|'updated'|'moved'|'deleted', task? Task, task_id? string }` |
| `column_created` | `board:{id}` | `Column` object |

## Constraints
- `project_key` is NOT NULL in schema — always provide it when inserting boards
- `task_sequence` must only be incremented via `UPDATE boards SET task_sequence = task_sequence + 1 WHERE id = ?` — never set directly
- Column `position` is 0-based integer — maintain ordering when adding/reordering
- Board membership is implicit via `workspace_members` — no separate board membership table
