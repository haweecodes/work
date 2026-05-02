# Domain: Direct Messages (DMs)

## Overview
1-on-1 private message threads scoped to a workspace. A thread is created on demand between two users — reuses existing thread if one already exists.

## Key Files
| File | Role |
|---|---|
| `backend/src/routes/dms.ts` | Thread + message endpoints |
| `backend/src/middleware/workspace.ts` | `requireDmParticipant` guard |
| `frontend/src/pages/DMView.tsx` | DM conversation UI |
| `frontend/src/store/workspaceStore.ts` | `dmThreads`, `fetchDmThreads`, `addDmThread` |
| `frontend/src/store/uiStore.ts` | `dmUnread` counters |

## Data Model
```
dm_threads:      id, workspace_id, created_at
dm_participants: thread_id, user_id  [composite PK]
messages:        ... dm_thread_id (nullable), parent_message_id (for thread replies)
```
- A thread always has exactly 2 participants
- Scoped to `workspace_id` — same two users get separate DM threads in different workspaces

## API Endpoints
| Method | Path | Guard | Description |
|---|---|---|---|
| `GET` | `/api/dms/threads/:workspaceId` | auth | List all DM threads for current user in workspace |
| `POST` | `/api/dms/threads` | auth | Create or retrieve existing thread `{ workspace_id, other_user_id }` |
| `GET` | `/api/dms/:threadId` | auth + participant | Fetch messages (last 200, top-level only) |
| `POST` | `/api/dms/:threadId` | auth + participant | Send message |
| `GET` | `/api/dms/:threadId/thread/:messageId` | auth + participant | Fetch thread replies (depth 1 + 2) |

## Thread List
- Response includes `participants: User[]` and `last_message: { content, created_at }`
- Frontend uses `participants` to identify the other user for display in the Sidebar

## Idempotent Thread Creation
- `POST /api/dms/threads` checks if a thread already exists between the two users in the workspace
- Returns existing thread instead of creating a duplicate — safe to call multiple times

## Notifications
- On new DM root message: inserts notification for each non-sender participant; emits `notification` to `user:{id}` room
- On thread reply: no DM notification created (only real-time socket to thread participants)

## Unread Counts
- `uiStore.dmUnread[threadId]` — incremented by `SocketContext` on `new_dm` when user isn't viewing that thread
- Cleared by `DMView` on mount

## Socket Events
| Event | Room | Trigger |
|---|---|---|
| `new_dm` | `dm:{threadId}` | New root DM message |
| `new_dm` | `user:{id}` | New DM thread reply (per thread participant) |
| `reaction_updated` | `dm:{threadId}` | Reaction toggle on DM message |

## Constraints
- `requireDmParticipant` must guard all per-thread routes — only the two participants can read/write
- Never create a DM thread with `other_user_id === req.user.id` (self-DM) — frontend blocks this
- Thread replies follow the same 2-level nesting cap as channel messages
- `workspace_id` is required when creating a thread — cross-workspace DM threads must never exist
