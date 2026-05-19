# FlowWork Backend — Architecture & Design

## Overview

The FlowWork backend is a Node.js + Express API server with real-time capabilities via Socket.IO, backed by a Neon (serverless PostgreSQL) database. It serves a single-page React frontend and is designed around three core principles: **workspace isolation**, **layered access control**, and **minimal surface area**.

---

## Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js + TypeScript (`tsx` watch) |
| Framework | Express 4 |
| Real-time | Socket.IO 4 |
| Database | Neon (PostgreSQL serverless) via raw parameterised queries |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` password hashing |
| Schema | Self-migrating via `initDb()` on startup |

---

## Directory Structure

```
backend/src/
├── index.ts              # App assembly, startup validation, route mounting
├── db.ts                 # Neon client + query helpers + schema migrations
├── socket.ts             # Socket.IO init, JWT auth on connect, room management
├── types.ts              # Express request augmentation (req.user, req.workspaceId)
├── middleware/
│   ├── auth.ts           # JWT Bearer token verification → req.user
│   └── workspace.ts      # Workspace + channel + DM membership guards
├── routes/
│   ├── auth.ts           # Register, login
│   ├── workspaces.ts     # Workspace CRUD, members, invite codes
│   ├── channels.ts       # Channels, messages, reactions, threads, shares
│   ├── boards.ts         # Boards, columns
│   ├── tasks.ts          # Tasks, assignees, subtasks, cross-board moves
│   ├── dms.ts            # DM threads and messages
│   ├── notifications.ts  # Notifications, priority alerts
│   ├── taskUpdates.ts    # Async status update requests and responses
│   └── search.ts         # Full-text search across messages and tasks
└── lib/
    └── messageEnrich.ts  # Shared batch enrichment (reactions, shared previews)
```

---

## Database Design

### Schema philosophy

All tables use string UUIDs as primary keys (generated with `uuid` package). Boolean-like columns (`is_private`, `is_read`, `is_resolved`) are stored as integers (0/1) for SQLite compatibility, but the database is PostgreSQL.

The `db.ts` helper wraps the Neon driver and converts `?` placeholders to `$1, $2, …` automatically, so queries read like SQLite but run on Postgres.

### Key tables

```
users                    id, name, email, password_hash, avatar_url
workspaces               id, name, slug, owner_id
workspace_members        workspace_id, user_id, role ('admin'|'member')

channels                 id, workspace_id, name, is_private, is_archived, created_by
channel_members          channel_id, user_id

dm_threads               id, workspace_id
dm_participants          thread_id, user_id

boards                   id, workspace_id, name, project_key, task_sequence, created_by
columns                  id, board_id, title, position
tasks                    id, board_id, column_id, title, description, priority,
                         due_date, created_by, position, task_number, task_key,
                         linked_message_id, parent_task_id
task_assignees           task_id, user_id

messages                 id, channel_id?, dm_thread_id?, sender_id, content,
                         linked_task_id?, parent_message_id?, shared_message_id?,
                         is_system, edited_at?, importance, mention_priorities?
message_reactions        message_id, user_id, emoji

notifications            id, user_id, type, reference_id, reference_type, message,
                         is_read, is_resolved, sender_name, sender_avatar,
                         workspace_id, priority, extra_id

task_update_requests     id, board_id, scope, task_id?, column_id?,
                         requested_by, workspace_id
task_update_responses    id, request_id, task_id, user_id, status, reason?
```

### Schema migrations

Migrations run on startup via `initDb()` using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. They are idempotent — safe to run on every boot without manual version tracking.

---

## Security Model

Security is enforced in three layers. A request must pass all three before touching data.

### Layer 1 — Router-level guard

All routes except `/api/auth` and `/api/workspaces` are mounted behind a shared middleware stack:

```ts
const protect = [authMiddleware, requireWorkspace()];
app.use('/api/channels',     ...protect, channelRoutes);
app.use('/api/boards',       ...protect, boardRoutes);
// …etc
```

`authMiddleware` verifies the JWT Bearer token and sets `req.user`.

`requireWorkspace()` resolves the workspace ID from the `x-workspace-id` request header (sent by every Axios request on the frontend), checks the workspace exists, checks the user is a member, and sets `req.workspaceId`. Requests that fail any check are rejected with 401/403/404 before any route handler runs.

### Layer 2 — Route-level guards

Sub-resources (channels, DM threads) have their own membership guards applied per-route:

```ts
router.get('/messages/:channelId',
  requireChannelMember('channelId'),  // must be a member of this channel
  handler
);

router.post('/:threadId',
  requireDmParticipant('threadId'),   // must be in this DM thread
  handler
);
```

### Layer 3 — Handler-level scope enforcement

Every query that touches workspace-scoped data must include `workspace_id` in the WHERE clause to prevent cross-workspace data leakage:

```ts
// Correct
const board = await get(
  'SELECT * FROM boards WHERE id = ? AND workspace_id = ?',
  [boardId, req.workspaceId]
);

// Wrong — would return data from any workspace
const board = await get('SELECT * FROM boards WHERE id = ?', [boardId]);
```

This is the innermost line of defence. Even if Layer 1 and 2 are bypassed somehow, cross-workspace queries return nothing.

---

## Real-time Architecture

Socket.IO connections are authenticated on the `connection` event by verifying the JWT passed in the socket handshake auth header. Unauthenticated sockets are disconnected immediately.

Clients join named rooms that match the resource they're viewing:

| Room | Joined on event |
|---|---|
| `user:{id}` | `join_user` — joined on app load, always active |
| `workspace:{id}` | `join_workspace` |
| `channel:{id}` | `join_channel` |
| `dm:{threadId}` | `join_dm` |
| `board:{id}` | `join_board` |

The server emits targeted events to specific rooms. Personal notifications (mentions, assignments, alerts) go to `user:{id}` so they're received regardless of which room the client is in.

---

## Task Update Request Flow

This is a purpose-built async status check feature:

1. A board creator or workspace admin sends `POST /api/task-updates/request` with a scope (`task` | `column` | `board`).
2. The backend resolves all relevant (task, assignee) pairs and inserts a `task_update_requests` row.
3. For each assignee, a `task_update_request` notification is inserted and emitted via socket to `user:{assigneeId}`.
4. Assignees respond via `POST /api/task-updates/:requestId/respond` with `on_track | delayed | finished | cancelled` and an optional reason.
5. A `task_update_response` notification is sent back to the requester.
6. Both the `BoardUpdatesPanel` and `TaskDetailPanel` subscribe to socket events (`task_update_requested`, `task_update_responded`) to update in real-time.

The `notifications.extra_id` column carries the `request_id` alongside `reference_id` (task ID) so the notification click handler can navigate to the correct task.

---

## Cross-Board Task Moves

When a task is moved to a different board:

1. The backend verifies the target `column_id` belongs to the target board (not just any column).
2. Subtasks (`parent_task_id IS NOT NULL`) are blocked from cross-board moves independently — they can only follow their parent.
3. When a parent task moves, all direct subtasks are migrated to the same target board and column in the same request.
4. Socket events are emitted to both the old board (`task_updated: deleted`) and the new board (`task_updated: created`) so both views update live.

On the frontend, before the user can save a cross-board move, the task detail panel tries to auto-match the current column by title in the target board. If no match is found, the save button is disabled until the user picks a column manually.

---

## Notification Workspace Isolation

Every notification row includes `workspace_id`. This ensures:

- `GET /api/notifications` returns only notifications for the current workspace.
- `PATCH /api/notifications/read` (mark all read) scopes the UPDATE to `workspace_id`, so it cannot clear notifications across workspaces.
- Priority alerts use both `workspace_id` and `reference_id` (sender ID) for dedup and cap logic — enforced per workspace.

All notification inserts (`sendAssignmentNotification`, mention notifications, DM notifications, priority alert feedback) include `workspace_id`.

---

## Input Validation

All user-supplied string fields are length-checked at the route handler level before hitting the database:

| Field | Limit |
|---|---|
| Channel name | 80 characters |
| Message content | 5,000 characters |
| Task title | 500 characters |
| Task description | 10,000 characters |

---

## Startup Validation

The server refuses to start if required environment variables are missing:

```ts
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}
```

This prevents silent degraded operation (e.g. running with a weak hardcoded fallback secret in production).

---

## Environment Variables

```
DATABASE_URL=postgres://...    # Neon connection string
JWT_SECRET=...                 # Required. Server exits on startup if missing.
PORT=3001                      # Optional, defaults to 3001
CORS_ORIGIN=http://...         # Comma-separated allowed origins
```
