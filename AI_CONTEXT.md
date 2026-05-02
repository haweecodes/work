# AI_CONTEXT.md — FlowWork

> Routing index for AI agents. Load only sections relevant to the task.

---

## Project Summary

- **App**: Team collaboration — real-time messaging, Kanban boards, DMs, threads, notifications
- **Analogy**: Slack (messaging) + Linear (tasks/boards) in one app
- **Monorepo**: `frontend/` (React) + `backend/` (Node.js)

### Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + React Router v6 + Zustand + Tailwind CSS v3 |
| Backend | Node.js + Express 4 + Socket.IO 4 + Drizzle ORM |
| Database | Neon (PostgreSQL serverless) |
| Auth | JWT + bcryptjs |
| HTTP client | Axios (`frontend/src/api/client.ts`) |

---

## Documentation Routing Rules

| Task involves… | Load |
|---|---|
| App-wide architecture, stack, conventions | `CLAUDE.md` |
| This routing index | `AI_CONTEXT.md` |
| Auth / session / JWT | `docs/domains/auth.md` |
| Workspace, members, roles, invites | `docs/domains/workspace.md` |
| Channels, archiving, channel members | `docs/domains/channels.md` |
| Messages, threads, reactions, sharing | `docs/domains/messaging.md` |
| Direct messages, DM threads | `docs/domains/direct_messages.md` |
| Kanban boards, columns | `docs/domains/boards.md` |
| Tasks, assignees, task keys, subtasks | `docs/domains/tasks.md` |
| In-app notifications | `docs/domains/notifications.md` |
| Sidebar navigation component | `docs/domains/sidebar.md` |
| App shell, layout, modals, socket init | `docs/domains/layout.md` |
| Database schema / tables | `backend/src/db/schema.ts` |
| Frontend component structure | `CLAUDE.md` → Frontend › Directory Structure |
| Styling / design tokens | `tailwind.config.js` + `frontend/src/index.css` |
| Routing / navigation | `frontend/src/App.tsx` |
| Env vars | `CLAUDE.md` → Environment Variables |

---

## Domain Map

| Domain | Description | Key Files |
|---|---|---|
| **Auth** | Register, login, JWT session | `backend/src/routes/auth.ts`, `frontend/src/store/authStore.ts`, `frontend/src/pages/Auth/` |
| **Workspace** | Multi-tenant orgs; members, roles, invite codes | `backend/src/routes/workspaces.ts`, `frontend/src/store/workspaceStore.ts` |
| **Channels** | Public/private group chat, archiving | `backend/src/routes/channels.ts`, `frontend/src/pages/ChannelView.tsx` |
| **Messaging** | Messages, thread replies, reactions, shares | `backend/src/routes/channels.ts` + `dms.ts`, `frontend/src/components/MessageBubble.tsx` |
| **Direct Messages** | 1-on-1 DM threads per workspace | `backend/src/routes/dms.ts`, `frontend/src/pages/DMView.tsx` |
| **Boards** | Kanban boards scoped to workspace | `backend/src/routes/boards.ts`, `frontend/src/pages/BoardView.tsx` |
| **Tasks** | Cards on boards; assignees, priority, subtasks, task keys | `backend/src/routes/tasks.ts`, `frontend/src/components/TaskDetailPanel.tsx` |
| **Notifications** | In-app; pushed via socket to `user:{id}` room | `backend/src/routes/notifications.ts`, `frontend/src/store/notificationStore.ts` |
| **Sidebar** | Dark nav: workspace switcher, channels, DMs, boards | `frontend/src/components/Sidebar/Sidebar.tsx` |
| **Layout** | Shell: sidebar + outlet + task panel + global modals | `frontend/src/layouts/AppLayout.tsx` |

---

## Engineering Rules

### General
- All IDs are UUIDs (string), generated with `uuid` on the backend
- All workspace-scoped queries **must** include `workspace_id` — enforced by backend guards
- Backend routes are `async`/`await`; use `db.run()`, `db.all<T>()`, `db.get<T>()` helpers (not raw Drizzle query builder in most routes)
- `?` placeholders in SQL are auto-converted to `$1, $2…` by `db.ts` `toPg()` — never write `$n` manually

### Frontend State
- Use **Zustand** stores, not local state, for anything shared across routes
- Access store state inside event handlers via `useXStore.getState()` (not hooks) to avoid stale closures
- `setCurrentWorkspace()` always resets ALL workspace-scoped state before loading new workspace — never skip it
- `selectedTask = null` closes `TaskDetailPanel`; `activeThreadId = null` closes `ThreadPanel`

### Styling
- Use **Tailwind classes** for all styling; inline `style={}` only for dynamic values not expressible in classes
- `ringColor` is NOT a valid CSS property — use `ring-white/10` etc. instead
- Sidebar uses `#111118` bg, `rgba(255,255,255,0.08)` borders, `#7C3AED` accent, DM Sans (`font-dm`)
- App-wide accent: `#6366f1` (primary-500); use `.btn-primary`, `.btn-ghost`, `.input`, `.card` component classes
- Never use hardcoded hex in className — use Tailwind tokens from `tailwind.config.js`

### Components
- Heavy components (`TaskDetailPanel`, `InviteModal`, `CreateBoardModal`) are `React.lazy()` — keep them lazy
- Pages are all lazy-loaded in `App.tsx`
- Mobile breakpoint: sidebar is fixed overlay below `md`; task panel is full-screen overlay on mobile

### Socket
- Routes call `io.to(room).emit(event, payload)` after DB mutations
- Clients join rooms on mount and leave on unmount
- Never emit to wrong workspace room — always scope to `workspace:{id}`, `channel:{id}`, etc.

### Task Keys
- Format: `{project_key}-{task_number}` (e.g. `FW-42`)
- Generated by: `UPDATE boards SET task_sequence = task_sequence + 1` → read back → format
- Deep-link route: `GET /t/:taskKey?workspace_id=…` → `TaskRedirect` page resolves and navigates

---

## Important Constraints

- **Workspace isolation is mandatory**: every query must be scoped to `workspace_id`; never leak data across workspaces
- **JWT required** on all non-auth routes; frontend sends `Authorization: Bearer <token>` via Axios interceptor
- **`is_private` / `is_archived` / `is_system` / `is_read`** are stored as `integer` (0/1), not boolean — always compare `=== 0` / `=== 1` or use truthiness carefully in SQL
- **`project_key` is NOT NULL** on the `boards` table — always provide it when creating a board
- **Default columns** must be created alongside a new board (backend auto-creates them)
- **`currentWorkspace` persists to `localStorage`** (`fw_workspace`) — clearing it logs user out of workspace context
- **CORS origins** are env-driven — never hardcode `localhost` origins in code; read from `process.env.CORS_ORIGIN`
- **Do not use Tailwind v4 syntax** — project is on Tailwind CSS v3

---

## Common Task Routing

| Task | Load these files |
|---|---|
| Add backend API endpoint | `backend/src/routes/<domain>.ts` + `backend/src/db/schema.ts` + `CLAUDE.md › API Routes` |
| Add DB table/column | `backend/src/db/schema.ts` → run `yarn db:push` in `backend/` |
| Add real-time event | `backend/src/socket.ts` + relevant route file + `frontend/src/context/SocketContext.tsx` |
| Add frontend page | `frontend/src/pages/` + `frontend/src/App.tsx` (add lazy Route) |
| Add Zustand store action | relevant `frontend/src/store/*.ts` |
| Add sidebar nav item | `frontend/src/components/Sidebar/Sidebar.tsx` |
| Change design token/color | `tailwind.config.js` + `frontend/src/index.css` |
| Add global modal | `frontend/src/store/uiStore.ts` (flag) + `frontend/src/layouts/AppLayout.tsx` (render) |
| Add unread badge | `frontend/src/store/uiStore.ts` (increment/clear) + socket handler in `SocketContext.tsx` |
| Fix TypeScript error in style prop | Replace invalid CSS-in-JS key with Tailwind class; see Engineering Rules › Styling |
| Task deep-link / sharing | `frontend/src/pages/TaskRedirect.tsx` + `backend/src/routes/tasks.ts` |
| Workspace invite flow | `backend/src/routes/workspaces.ts` + `frontend/src/pages/JoinWorkspace.tsx` |
| Auth / session | `backend/src/routes/auth.ts` + `frontend/src/store/authStore.ts` |

---

## Context Loading Strategy

1. **Start with this file** to identify the domain and relevant files
2. **Load only the files listed** for that task — do not scan the full codebase
3. **For schema changes**: always read `backend/src/db/schema.ts` first to understand existing relations
4. **For frontend features**: read the relevant store + page/component; load `AppLayout.tsx` only if adding global UI
5. **For socket features**: read both the backend route (emitter) and `SocketContext.tsx` (listener) together
6. **`CLAUDE.md`** is the full reference — use it when routing rules above are insufficient
7. **Avoid loading**: `node_modules/`, `dist/`, `*.lock`, `.git/`, migration files unless debugging DB issues
