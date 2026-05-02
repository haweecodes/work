# FlowWork — Claude Code Context

FlowWork is a full-stack team collaboration app (think Slack + Linear) with real-time messaging, Kanban boards, DMs, threaded replies, and workspace management.

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
│   └── client.ts           # Axios instance (baseURL from VITE_API_URL)
├── components/
│   ├── Sidebar/
│   │   └── Sidebar.tsx     # Dark sidebar — DM Sans, #7C3AED accent, rgba borders
│   ├── MessageBubble.tsx   # Message with reactions, thread opener, share
│   ├── MessageActionBar.tsx
│   ├── TaskDetailPanel.tsx # Slide-in task drawer (right panel)
│   ├── ThreadPanel.tsx     # Inline thread reply panel
│   ├── CreateTaskModal.tsx
│   ├── CreateBoardModal.tsx
│   ├── InviteModal.tsx
│   ├── ShareModal.tsx
│   ├── NotificationPanel.tsx
│   ├── EmojiPicker.tsx
│   ├── InlineTaskCard.tsx
│   └── Skeleton.tsx
├── context/
│   └── SocketContext.tsx   # Global Socket.IO connection + workspace room mgmt
├── layouts/
│   └── AppLayout.tsx       # Shell: Sidebar + Outlet + TaskDetailPanel + modals
├── pages/
│   ├── Auth/               # LoginPage, RegisterPage
│   ├── BoardView.tsx       # Kanban board (drag-and-drop columns & cards)
│   ├── ChannelView.tsx     # Public/private channel chat
│   ├── DMView.tsx          # 1-on-1 direct messages
│   ├── WorkspaceCreate.tsx
│   ├── JoinWorkspace.tsx   # Invite-code join flow
│   └── TaskRedirect.tsx    # /t/:taskKey deep-link resolver
├── store/
│   ├── authStore.ts        # user, token, login/logout
│   ├── workspaceStore.ts   # workspaces, channels, members, dmThreads, role
│   ├── boardStore.ts       # boards, columns, tasks, selectedTask
│   ├── uiStore.ts          # modals, unread counts, activeThreadId
│   └── notificationStore.ts
├── types.ts                # All shared TS interfaces (User, Workspace, Channel, Task, Message …)
├── App.tsx                 # Router + lazy pages + guards
└── index.css               # Tailwind base + custom components + DM Sans import
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

**`notificationStore`** — In-app notifications fetched on mount.

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
├── db/
│   └── schema.ts       # Drizzle table definitions (all tables)
├── middleware/          # JWT auth middleware
├── routes/
│   ├── auth.ts         # POST /api/auth/register, /login
│   ├── workspaces.ts   # CRUD workspaces + members
│   ├── channels.ts     # CRUD channels + messages + reactions + threads
│   ├── boards.ts       # CRUD boards + columns
│   ├── tasks.ts        # CRUD tasks + assignees + task links
│   ├── dms.ts          # DM threads + messages
│   └── notifications.ts
├── db.ts               # Neon client wrapper: run(), all<T>(), get<T>()
├── socket.ts           # Socket.IO init + room join/leave event handlers
├── index.ts            # Express app assembly + server start
└── types.ts            # Backend-only types
```

### Database (Neon PostgreSQL)

Key tables and relationships:

```
users                    id, name, email, password_hash, avatar_url
workspaces               id, name, slug, owner_id → users
workspace_members        workspace_id, user_id, role ('admin'|'member')
channels                 id, workspace_id, name, is_private, is_archived
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
                         linked_task_id?, parent_message_id?, shared_message_id?, is_system
message_reactions        message_id, user_id, emoji
notifications            id, user_id, type, reference_id, reference_type, is_read
```

- `task_key` = `{project_key}-{task_number}` (e.g. `FW-42`) — used for shareable deep links `/t/:taskKey`.
- `is_private` / `is_archived` / `is_system` / `is_read` are stored as `integer` (0/1) for SQLite compat, now on Postgres.
- `db.ts` exposes `run()`, `all<T>()`, `get<T>()` helpers that convert `?` placeholders to `$1, $2, …` for Postgres.

### API Routes

| Prefix | Description |
|---|---|
| `POST /api/auth/register` | Register user |
| `POST /api/auth/login` | JWT login |
| `GET/POST /api/workspaces` | List / create workspaces |
| `GET /api/workspaces/:id/members` | Workspace members |
| `GET/POST /api/channels/:workspaceId` | List / create channels |
| `GET/POST /api/channels/:id/messages` | Channel messages + send |
| `POST /api/channels/:id/messages/:msgId/reactions` | Toggle reaction |
| `GET /api/boards/:workspaceId` | List boards |
| `POST /api/boards` | Create board (auto-creates default columns) |
| `GET/POST /api/tasks/:boardId` | List / create tasks |
| `PATCH /api/tasks/:id` | Update task (move, edit, assign) |
| `GET /api/dms/threads/:workspaceId` | List DM threads |
| `POST /api/dms/threads` | Start DM thread |
| `GET/POST /api/dms/threads/:threadId/messages` | DM messages |
| `GET /api/notifications/:userId` | User notifications |
| `GET /api/resolve/:taskKey` | Resolve task key → task (requires `workspace_id` query param) |

### Socket.IO Rooms & Events

Clients join rooms after navigating:

| Room | Join event |
|---|---|
| `workspace:{id}` | `join_workspace` |
| `channel:{id}` | `join_channel` |
| `dm:{threadId}` | `join_dm` |
| `board:{id}` | `join_board` |
| `user:{id}` | `join_user` |

Key server→client events emitted by routes:
- `new_message` — channel or DM message
- `message_reaction` — reaction toggle
- `new_thread_reply` — thread reply
- `task_created`, `task_updated`, `task_moved` — board changes
- `column_created`, `column_updated`, `column_deleted`
- `new_notification` — pushed to `user:{id}` room

---

## Key Conventions

- **All IDs** are UUIDs (string), generated with the `uuid` package on the backend.
- **Auth**: JWT stored in `localStorage` (`fw_token`); sent as `Authorization: Bearer <token>` header via Axios interceptor.
- **Workspace isolation**: All queries are scoped by `workspace_id`. Backend membership guards prevent cross-workspace access.
- **Task keys**: Auto-incremented via `UPDATE boards SET task_sequence = task_sequence + 1` then formatted as `{project_key}-{n}`.
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
