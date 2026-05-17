# FlowWork — Claude Code Context

FlowWork is a full-stack team collaboration app (think Slack + Linear) with real-time messaging, Kanban boards, DMs, threaded replies, priority alerts, and workspace management.

---

## Repository Layout

```
flowwork/
├── frontend/          # Vite + React 18 + TypeScript + Tailwind CSS
└── backend/           # Node.js + Express + Socket.IO + Drizzle ORM → Neon PostgreSQL
```

Both packages run concurrently in dev:

```bash
# Frontend  — http://localhost:5173
cd frontend && yarn dev

# Backend   — http://localhost:3001
cd backend  && yarn dev
```

---

## Frontend

### Stack
| Concern | Library |
|---|---|
| Framework | React 18 (Vite) |
| Language | TypeScript (strict) |
| Routing | React Router v6 |
| State | Zustand (5 stores) |
| Styling | Tailwind CSS v3 + custom tokens |
| HTTP | Axios (`src/api/client.ts`) |
| Real-time | Socket.IO client (`src/context/SocketContext.tsx`) |

### Directory Structure

```
frontend/src/
├── api/
│   └── client.ts                 # Axios instance (baseURL from VITE_API_URL)
│                                 # Interceptor sends Authorization + x-workspace-id headers
├── components/
│   ├── Sidebar/
│   │   └── Sidebar.tsx           # Dark sidebar — DM Sans, #7C3AED accent, rgba borders
│   ├── MessageBubble.tsx         # Message with reactions, thread opener, share, edit/delete
│   ├── MessageActionBar.tsx      # Hover action bar: react, reply, share, edit, delete
│   ├── TaskDetailPanel.tsx       # Slide-in task drawer (right panel)
│   ├── ThreadPanel.tsx           # Inline thread reply panel (max 2-level nesting)
│   ├── CreateTaskModal.tsx
│   ├── CreateBoardModal.tsx
│   ├── InviteModal.tsx
│   ├── ShareModal.tsx            # Share message to channel or DM with privacy checks
│   ├── NotificationPanel.tsx     # Notification feed (mentions, task assignments, alerts)
│   ├── PriorityAlertBanner.tsx   # Persistent banner for unresolved priority alerts
│   ├── SendPriorityAlertModal.tsx # Compose + send priority alerts to workspace members
│   ├── EmojiPicker.tsx
│   ├── InlineTaskCard.tsx
│   └── Skeleton.tsx
├── context/
│   └── SocketContext.tsx         # Global Socket.IO connection + workspace room mgmt
├── layouts/
│   └── AppLayout.tsx             # Shell: PriorityAlertBanner + Sidebar + Outlet + TaskDetailPanel + modals
├── pages/
│   ├── Auth/                     # LoginPage, RegisterPage
│   ├── BoardView.tsx             # Kanban board (drag-and-drop columns & cards)
│   ├── ChannelView.tsx           # Public/private channel chat
│   ├── DMView.tsx                # 1-on-1 direct messages
│   ├── WorkspaceCreate.tsx
│   ├── JoinWorkspace.tsx         # Invite-code join flow
│   └── TaskRedirect.tsx          # /t/:taskKey deep-link resolver
├── store/
│   ├── authStore.ts              # user, token, login/logout
│   ├── workspaceStore.ts         # workspaces, channels, members, dmThreads, role
│   ├── boardStore.ts             # boards, columns, tasks, selectedTask
│   ├── uiStore.ts                # modals, unread counts, activeThreadId
│   └── notificationStore.ts      # notifications + priorityAlerts, resolveAlert()
├── types.ts                      # All shared TS interfaces (User, Workspace, Channel, Task, Message …)
├── App.tsx                       # Router + lazy pages + guards
└── index.css                     # Tailwind base + custom components + DM Sans import
```

### Routing

```
/login               → LoginPage
/register            → RegisterPage
/join/:code          → JoinWorkspace (invite link)
/workspace/create    → WorkspaceCreate
/t/:taskKey          → TaskRedirect (resolve task key → board URL)

/ (AppLayout shell)
  /                  → DefaultRedirect → first channel or board
  /channel/:id       → ChannelView
  /dm/:threadId      → DMView
  /board/:boardId    → BoardView
```

All routes under `/` are behind a `PrivateRoute` guard (checks `authStore.token`).

### Zustand Stores

**`authStore`** — `{ user, token }` — persisted to `localStorage` via `fw_token`.

**`workspaceStore`** — `{ workspaces, currentWorkspace, channels, dmThreads, members, role, isInitialized }`.
- `setCurrentWorkspace(ws)` resets all workspace-scoped state (boards, UI, notifications) before loading the new workspace's data.
- `currentWorkspace` is persisted to `localStorage` (`fw_workspace`) so it survives refresh.
- `role` is derived from `workspace_members.role`; `isAdmin(userId)` returns true if role=`'admin'` OR user is the workspace owner.

**`boardStore`** — `{ boards, columns, tasks (per column), selectedTask }`.
- `selectedTask` drives the `TaskDetailPanel` slide-in; setting it to `null` closes the drawer.

**`uiStore`** — Modal flags (`showCreateBoard`, `showInvite`), unread badge counters (`channelUnread`, `dmUnread`, `threadUnread`), and `activeThreadId`.

**`notificationStore`** — `{ notifications, priorityAlerts }`. Fetched on workspace load. `priorityAlerts` are `type='priority_alert'` rows with `is_resolved=0`; `resolveAlert(id)` calls `PATCH /api/notifications/:id/resolve`.

### Design System

- **Primary accent**: `#6366f1` (indigo-500) — buttons, focus rings.
- **Sidebar accent**: `#7C3AED` (violet) — active nav items, badges, workspace avatar.
- **Sidebar background**: `#111118` with `rgba(255,255,255,0.08)` borders.
- **Sidebar typeface**: DM Sans (`font-dm` utility class).
- **App background**: `#F9F9F8` (`surface`).
- **Component classes**: `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.input`, `.card` defined in `index.css` `@layer components`.
- **Tailwind config**: `tailwind.config.js` — extends `primary.*`, `sidebar.*`, `surface`, `dm` font, custom `boxShadow` (`card`, `panel`, `dropdown`), and keyframe animations (`slide-in`, `fade-in`).

---

## Backend

### Stack
| Concern | Library |
|---|---|
| Runtime | Node.js + TypeScript (tsx watch) |
| Framework | Express 4 |
| Real-time | Socket.IO 4 |
| ORM | Drizzle ORM |
| Database | Neon (PostgreSQL serverless) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |

### Directory Structure

```
backend/src/
├── middleware/
│   ├── auth.ts         # JWT authMiddleware — verifies Bearer token, sets req.user
│   └── workspace.ts    # Access-control guards (see Security Convention below)
├── routes/
│   ├── auth.ts         # POST /api/auth/register, /login
│   ├── workspaces.ts   # CRUD workspaces + members + invite codes
│   ├── channels.ts     # CRUD channels, messages, reactions, threads, share, edit, delete
│   ├── boards.ts       # CRUD boards + columns
│   ├── tasks.ts        # CRUD tasks + assignees + task links + resolve by key
│   ├── dms.ts          # DM threads + messages + threads
│   ├── notifications.ts # Notifications + priority alerts
│   └── search.ts       # Full-text search across messages and tasks
├── db.ts               # Neon client wrapper: run(), all<T>(), get<T>() + schema migrations
├── socket.ts           # Socket.IO init + room join/leave event handlers
├── index.ts            # Express app assembly + server start
└── types.ts            # Express request augmentation (req.user, req.workspaceId)
```

---

## Backend Security Convention

**Every route must verify identity and scope before touching data.** The enforcement is layered:

### Layer 1 — Router-level guard (applied in `index.ts`)

All routes except `/api/auth` and `/api/workspaces` are mounted behind a shared middleware stack:

```ts
const protect = [authMiddleware, requireWorkspace()];
app.use('/api/channels',      ...protect, channelRoutes);
app.use('/api/boards',        ...protect, boardRoutes);
app.use('/api/tasks',         ...protect, taskRoutes);
app.use('/api/dms',           ...protect, dmRoutes);
app.use('/api/notifications', ...protect, notificationRoutes);
app.use('/api/search',        ...protect, searchRoutes);
```

`requireWorkspace()` (in `middleware/workspace.ts`) does all of the following before any handler runs:
1. Rejects if `req.user` is not set (no valid JWT).
2. Resolves `workspaceId` from: `x-workspace-id` header → `req.params.workspaceId` → `req.query.workspace_id`.
3. Returns 400 if no workspace ID present.
4. Returns 404 if the workspace does not exist.
5. Returns 403 if the authenticated user is not a member of that workspace.
6. Sets `req.workspaceId` for downstream handlers.

The Axios client always sends the `x-workspace-id` header from `workspaceStore.currentWorkspace.id`.

### Layer 2 — Route-level guards (applied per-router)

Use these when a route needs membership in a sub-resource (channel or DM thread):

| Guard | File | Checks |
|---|---|---|
| `requireChannelMember(paramName?)` | `middleware/workspace.ts` | `channel_members` row for `req.params[paramName]` and `req.user.id` |
| `requireDmParticipant(paramName?)` | `middleware/workspace.ts` | `dm_participants` row for `req.params[paramName]` and `req.user.id` |
| `requireWorkspaceMember(paramName?)` | `middleware/workspace.ts` | `workspace_members` row for `req.params[paramName]` and `req.user.id` |

Example usage in `channels.ts`:
```ts
router.get('/messages/:channelId', authMiddleware, requireChannelMember('channelId'), handler);
```

### Layer 3 — Handler-level scope enforcement

Even with router guards in place, every query that touches workspace-scoped data must include the workspace scope to prevent cross-workspace data leakage:

```ts
// Correct — scoped by workspace
const board = await get('SELECT * FROM boards WHERE id = ? AND workspace_id = ?', [boardId, req.workspaceId]);

// Wrong — returns boards from any workspace
const board = await get('SELECT * FROM boards WHERE id = ?', [boardId]);
```

For message operations (send, react) that arrive without a route-level channel/DM guard, perform an inline membership check:
```ts
const isMember = await get('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?', [channel_id, req.user.id]);
if (!isMember) return res.status(403).json({ error: 'You are not a member of this channel' });
```

---

### Database (Neon PostgreSQL)

Key tables and relationships:

```
users                    id, name, email, password_hash, avatar_url
workspaces               id, name, slug, owner_id → users
workspace_members        workspace_id, user_id, role ('admin'|'member')
channels                 id, workspace_id, name, is_private, is_archived, created_by → users
channel_members          channel_id, user_id
dm_threads               id, workspace_id
dm_participants          thread_id, user_id
boards                   id, workspace_id, name, project_key, task_sequence
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
                         workspace_id, priority
```

**Schema notes:**
- `task_key` = `{project_key}-{task_number}` (e.g. `FW-42`) — used for shareable deep links `/t/:taskKey`.
- `is_private` / `is_archived` / `is_system` / `is_read` / `is_resolved` are stored as `integer` (0/1).
- `messages.importance` — `'normal'` (default) or `'urgent'`; controls visual treatment in the UI.
- `messages.mention_priorities` — JSON array `[{ name, userId, priority }]` set at send time by the composer.
- `messages.edited_at` — set to `NOW()` when a message is edited; `null` means never edited.
- `notifications.type` — `'mention'`, `'task_assigned'`, `'task_unassigned'`, `'dm'`, `'priority_alert'`, `'system'`.
- `notifications.is_resolved` — used exclusively by `priority_alert` rows; 0 = pending, 1 = acknowledged.
- `notifications.workspace_id` — scopes priority alerts so dedup/cap logic is per-workspace.
- `notifications.extra_id` — used by `task_update_request` notifications to carry the `request_id` alongside the `reference_id` (task ID).
- `boards.created_by` — set at creation time; used by `canRequestUpdates()` in `taskUpdates.ts` to allow the board creator (or workspace admins) to request status updates.
- `task_update_requests` — one row per update request: `id, board_id, scope, task_id?, column_id?, requested_by, workspace_id`.
- `task_update_responses` — one row per assignee response: `id, request_id, task_id, user_id, status, reason?`.
- `db.ts` exposes `run()`, `all<T>()`, `get<T>()`, `returning<T>()`, `runTransaction()` helpers that convert `?` placeholders to `$1, $2, …` for Postgres.
- Schema migrations run on startup via `initDb()` in `db.ts` using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (idempotent).

---

### API Routes

All routes except `/api/auth/*` require a valid JWT and workspace membership (see Security Convention).

**Auth**
| Method + Path | Description |
|---|---|
| `POST /api/auth/register` | Register user |
| `POST /api/auth/login` | JWT login |

**Workspaces**
| Method + Path | Description |
|---|---|
| `GET /api/workspaces` | List user's workspaces |
| `POST /api/workspaces` | Create workspace |
| `GET /api/workspaces/:id/members` | Workspace members |

**Channels** (all require workspace guard; message/reaction routes also require channel membership)
| Method + Path | Description |
|---|---|
| `GET /api/channels/:workspaceId` | List channels the user is a member of |
| `POST /api/channels` | Create channel (public: auto-adds all members; private: creator only) |
| `PATCH /api/channels/:channelId/archive` | Archive channel (owner or channel creator only) |
| `GET /api/channels/messages/:channelId` | Fetch channel messages (top-level only, limit 200) |
| `POST /api/channels/messages` | Send message (inline channel membership check) |
| `PATCH /api/channels/messages/:id` | Edit own message (sets `edited_at`) |
| `DELETE /api/channels/messages/:id` | Delete own message (cascades reactions) |
| `GET /api/channels/messages/:channelId/thread/:messageId` | Fetch thread replies (depth 1 + depth 2) |
| `POST /api/channels/messages/:messageId/share` | Share message to channel or DM (privacy-checked) |
| `GET /api/channels/messages/:messageId/reactions` | Get reactions for a message |
| `POST /api/channels/messages/:messageId/reactions` | Toggle emoji reaction (membership-checked) |

**Boards** (all require workspace guard)
| Method + Path | Description |
|---|---|
| `GET /api/boards/:workspaceId` | List boards in workspace |
| `POST /api/boards` | Create board (auto-generates `project_key`, creates default columns) |
| `PATCH /api/boards/:id` | Rename board |
| `GET /api/boards/:boardId/columns` | List columns with enriched tasks + assignees |
| `POST /api/boards/:boardId/columns` | Add a column |

**Tasks** (all require workspace guard; queries always scope by `req.workspaceId` via JOIN to boards)
| Method + Path | Description |
|---|---|
| `GET /api/tasks/:boardId` | List all tasks for a board |
| `POST /api/tasks` | Create task (auto-increments `task_sequence`, generates `task_key`) |
| `GET /api/tasks/task/:id` | Get single task with assignees |
| `PATCH /api/tasks/:id` | Update task fields + assignees (diff-based, sends assignment notifications) |
| `PATCH /api/tasks/:id/move` | Move task to column + position |
| `DELETE /api/tasks/:id` | Delete task (clears assignees + message link) |
| `GET /api/tasks/resolve/:taskKey` | Resolve task key → `{ task_id, board_id, workspace_id }` |

**Task Update Requests** (all require workspace guard; board creator and workspace admins only for POST)
| Method + Path | Description |
|---|---|
| `POST /api/task-updates/request` | Ask assignees for a status update — scope: `task` \| `column` \| `board` |
| `POST /api/task-updates/:requestId/respond` | Assignee responds with `on_track` \| `delayed` \| `finished` \| `cancelled` |
| `GET /api/task-updates/:boardId` | Full update request history for a board (with responses + pending) |
| `GET /api/task-updates/pending/me` | Pending update requests directed at the current user |
| `GET /api/task-updates/notification/:taskId` | Resolve task ID → `{ board_id, task_key }` for notification navigation |

**DMs** (all require workspace guard; message routes also require DM participant guard)
| Method + Path | Description |
|---|---|
| `GET /api/dms/threads/:workspaceId` | List DM threads with participants + last message |
| `POST /api/dms/threads` | Start or retrieve existing DM thread (verifies other user is workspace member) |
| `GET /api/dms/:threadId` | Fetch DM messages (top-level, limit 200) |
| `POST /api/dms/:threadId` | Send DM message + notify recipient |
| `GET /api/dms/:threadId/thread/:messageId` | Fetch DM thread replies (depth 1 + depth 2) |

**Notifications** (all require workspace guard)
| Method + Path | Description |
|---|---|
| `GET /api/notifications` | List workspace notifications for current user (excludes DM type, limit 50) |
| `PATCH /api/notifications/read` | Mark notifications read — body `{ ids?: string[] }` (all if omitted) |
| `POST /api/notifications/priority` | Send priority alert to one or more recipients (see guards below) |
| `PATCH /api/notifications/:id/resolve` | Recipient acknowledges a priority alert |

**Priority alert guards** (enforced inside `POST /api/notifications/priority`):
- **Dedup**: skips if sender already has a pending (`is_resolved=0`) alert to that recipient in this workspace.
- **Cap**: skips if recipient already has ≥ 5 unresolved priority alerts in this workspace.
- Both skips emit a `'system'` notification back to the sender with an explanation.

**Search** (requires workspace guard)
| Method + Path | Description |
|---|---|
| `GET /api/search?q=…` | Search messages (channels + DMs the user is in) and tasks by title (ILIKE, limit 20 each) |

---

### Socket.IO Rooms & Events

Clients join rooms after navigating:

| Room | Join event |
|---|---|
| `workspace:{id}` | `join_workspace` |
| `channel:{id}` | `join_channel` |
| `dm:{threadId}` | `join_dm` |
| `board:{id}` | `join_board` |
| `user:{id}` | `join_user` |

Server→client events:

| Event | Room | Description |
|---|---|---|
| `new_message` | `channel:{id}` or `user:{id}` (thread) | New channel message or thread reply |
| `message_updated` | `channel:{id}` or `dm:{id}` | Message content edited |
| `message_deleted` | `channel:{id}` or `dm:{id}` | Message deleted |
| `reaction_updated` | `channel:{id}` or `dm:{id}` | Reaction toggled (full reactions array) |
| `new_dm` | `dm:{id}` or `user:{id}` (thread) | New DM message or DM thread reply |
| `task_updated` | `board:{id}` | Task created / updated / moved / deleted (`type` field) |
| `task_update_requested` | `board:{id}` | New update request sent to the board |
| `task_update_responded` | `board:{id}` | Assignee responded to an update request (`request_id` + `response`) |
| `channel_created` | `user:{id}` | Channel created (all workspace members for public; creator for private) |
| `channel_archived` | `user:{id}` | Channel archived (all channel members) |
| `notification` | `user:{id}` | Mention, assignment, DM, or system notification |
| `priority_alert` | `user:{id}` | Persistent priority alert requiring acknowledgment |

---

## Key Conventions

- **All IDs** are UUIDs (string), generated with the `uuid` package on the backend.
- **Auth**: JWT stored in `localStorage` (`fw_token`); sent as `Authorization: Bearer <token>` header via Axios interceptor.
- **Workspace header**: Axios interceptor also sends `x-workspace-id` from `workspaceStore.currentWorkspace.id` on every request.
- **Workspace isolation**: All queries are scoped by `workspace_id`. The `requireWorkspace()` guard sets `req.workspaceId`; handlers must use it in every query that is workspace-scoped.
- **Channel privacy**: Public channels auto-add all workspace members on creation. Private channels are invite-only (creator is the only initial member). Messages from private channels cannot be shared to public channels.
- **Thread nesting**: Max 2 levels deep enforced on both channel messages and DMs. A reply to a reply is allowed; a reply to a reply-of-a-reply is rejected (400).
- **Message ownership**: Only the message sender can edit or delete their own messages. System messages (`is_system=1`) cannot be edited or deleted.
- **Task keys**: Auto-incremented via `UPDATE boards SET task_sequence = task_sequence + 1` then formatted as `{project_key}-{n}`.
- **Subtask completion**: "Done" is determined by the last column by position (`ORDER BY position DESC LIMIT 1`), not a hardcoded title. This is used in both `TaskCard` (board view) and `TaskDetailPanel` to compute `completedCount/totalCount`.
- **Task update requests**: Board creator or workspace admins (`role='admin'`) can request status updates via `POST /api/task-updates/request`. Responses (`on_track | delayed | finished | cancelled`) are stored in `task_update_responses` and surfaced inline in `TaskDetailPanel` for assignees. `BoardUpdatesPanel` shows full history.
- **Priority alerts**: One pending alert per sender-recipient pair per workspace. Recipients see a `PriorityAlertBanner` at the top of the app until they acknowledge. Resolving clears all pending alerts from that sender in one operation.
- **Unread counts**: Managed entirely in `uiStore` on the frontend; incremented on incoming socket events, cleared on navigation.
- **Lazy loading**: All pages and heavy modals (`TaskDetailPanel`, `InviteModal`, `CreateBoardModal`) are `React.lazy()` split.
- **Mobile**: Sidebar slides in as a fixed overlay on `<md` breakpoints; `TaskDetailPanel` goes full-screen overlay on mobile.

---

## Environment Variables

**Backend** (`backend/.env`):
```
DATABASE_URL=postgres://...   # Neon connection string
JWT_SECRET=...
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

**Frontend** (`frontend/.env`):
```
VITE_API_URL=http://localhost:3001
```
