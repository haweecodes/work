# Domain: Layout

## Overview
The app shell. Wraps all authenticated views. Manages sidebar visibility, task detail panel, global modals, socket initialization, and workspace bootstrapping.

## Key Files
| File | Role |
|---|---|
| `frontend/src/layouts/AppLayout.tsx` | Main shell component |
| `frontend/src/App.tsx` | Router + `<Route path="/">` uses `AppLayout` as element |
| `frontend/src/context/SocketContext.tsx` | Socket.IO client connection + event listeners |
| `frontend/src/components/TaskDetailPanel.tsx` | Task drawer (lazy) |
| `frontend/src/components/InviteModal.tsx` | Invite modal (lazy) |
| `frontend/src/components/CreateBoardModal.tsx` | Create board modal (lazy) |

## Structure
```
AppLayout
├── Mobile overlay (backdrop, md:hidden)
├── Sidebar (fixed on mobile, static on md+)
└── Main content area
    ├── Mobile header (hamburger + logo, md:hidden)
    ├── <Outlet /> (ChannelView | DMView | BoardView)
    └── TaskDetailPanel (desktop: right panel w-96; mobile: z-40 overlay)
    
Global modals (portal-style, rendered at AppLayout level):
├── InviteModal (when uiStore.showInvite)
└── CreateBoardModal (when uiStore.showCreateBoard)
```

## Workspace Bootstrap Sequence
On mount (single `useEffect`):
1. `fetchWorkspaces()` — get all user's workspaces
2. If no workspaces → navigate to `/workspace/create`
3. If no `currentWorkspace` → default to `workspaces[0]`
4. `setCurrentWorkspace(ws)` — loads channels, members, dmThreads
5. `fetchBoards(ws.id)`
6. Set `isInitialized = true`

- `isInitialized` gates the `DefaultRedirect` component from rendering prematurely

## Task Detail Panel
- Controlled by `boardStore.selectedTask`
- **Desktop** (`lg+`): `w-96` flex-shrink-0 panel on the right, `border-l border-gray-200 bg-white`
- **Mobile** (`<lg`): `fixed inset-0 z-40` full-screen overlay with back button
- Route change clears `selectedTask` via `useEffect` on `location.pathname`
- Both lazy-loaded with `<Suspense>` fallback skeleton

## Global Modals
- `showInvite` / `showCreateBoard` flags live in `uiStore`
- Opened via `openInvite()` / `openCreateBoard()` from anywhere
- Closed via `closeInvite()` / `closeCreateBoard()` — passed as `onClose` prop
- Both lazy-loaded with `<Suspense fallback={null}>`

## Mobile Sidebar
- `sidebarOpen` local state controls `translate-x` on the sidebar wrapper
- Backdrop `div.fixed.inset-0.z-20.bg-black/30` closes sidebar on click
- Sidebar receives `onClose={() => setSidebarOpen(false)}` — called after navigation

## DefaultRedirect
```tsx
// Rendered at route index "/"
// Waits for isInitialized
if (channels.length > 0) → /channel/:firstChannelId
if (boards.length > 0)   → /board/:firstBoardId
else                      → /workspace/create
```

## SocketContext
- Wraps the entire `<Routes>` tree in `App.tsx`
- Establishes single Socket.IO connection to `VITE_API_URL`
- Joins `workspace:{id}` room and `user:{userId}` room on workspace/user change
- Listens for all domain events and dispatches to appropriate stores
- On workspace switch: leaves old workspace room, joins new one

## Lazy Loading
All pages and heavy components use `React.lazy()`:
- `AppLayout`, `ChannelView`, `DMView`, `BoardView`, `LoginPage`, `RegisterPage`, `WorkspaceCreate`, `JoinWorkspace`, `TaskRedirect`
- `TaskDetailPanel`, `InviteModal`, `CreateBoardModal` (within AppLayout)
- Each has a domain-appropriate `<Suspense>` fallback (skeleton or spinner)

## Constraints
- Never put workspace data-fetching logic inside page components — it belongs in `AppLayout` mount effect
- `selectedTask` must be cleared on route change — the `location.pathname` effect in `AppLayout` handles this
- Adding a new global modal: add flag to `uiStore` + render at `AppLayout` level (not inside pages)
- Do not add socket listeners inside page components — all listeners belong in `SocketContext`
