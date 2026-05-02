# Domain: Channels

## Overview
Public and private group chat rooms scoped to a workspace. Each channel has members and messages.

## Key Files
| File | Role |
|---|---|
| `backend/src/routes/channels.ts` | All channel + message + reaction + share endpoints |
| `backend/src/middleware/workspace.ts` | `requireChannelMember` guard |
| `frontend/src/pages/ChannelView.tsx` | Main channel UI |
| `frontend/src/components/Sidebar/Sidebar.tsx` | Channel list + add channel form |
| `frontend/src/store/workspaceStore.ts` | `channels` array, `addChannel`, `updateChannel` |
| `frontend/src/store/uiStore.ts` | `channelUnread` counters |

## Data Model
```
channels:        id, workspace_id, name (lowercase-hyphenated), description, is_private (0|1), is_archived (0|1), created_by → users, created_at
channel_members: channel_id, user_id  [composite PK]
```
- `is_private` and `is_archived` are `integer` — compare with `=== 0` / `=== 1`, not `=== false`/`true`

## API Endpoints
| Method | Path | Guard | Description |
|---|---|---|---|
| `GET` | `/api/channels/:workspaceId` | auth | List channels current user is a member of |
| `POST` | `/api/channels` | auth | Create channel |
| `PATCH` | `/api/channels/:channelId/archive` | auth | Archive (owner or channel creator only) |
| `GET` | `/api/channels/messages/:channelId` | auth + member | Fetch messages (last 200, top-level only) |
| `POST` | `/api/channels/messages` | auth | Send message |
| `GET` | `/api/channels/messages/:channelId/thread/:messageId` | auth + member | Fetch thread replies (depth 1 + 2) |
| `POST` | `/api/channels/messages/:messageId/share` | auth | Share message to channel or DM |
| `GET` | `/api/channels/messages/:messageId/reactions` | auth | Get reactions |
| `POST` | `/api/channels/messages/:messageId/reactions` | auth | Toggle reaction (add or remove) |

## Channel Creation Side Effects
- **Public**: all current `workspace_members` are auto-added to `channel_members`; `channel_created` emitted to each member's `user:{id}` room
- **Private**: only creator added to `channel_members`; `channel_created` emitted only to creator's room

## Archive
- Sets `is_archived = 1`
- Emits `channel_archived` to all channel members' `user:{id}` rooms
- Only workspace owner or channel creator can archive

## Unread Counts
- Managed in `uiStore.channelUnread[channelId]`
- Incremented by `SocketContext` on `new_message` when user is not currently viewing that channel
- Cleared by `ChannelView` on mount / focus

## Socket Events
| Event | Room | Payload |
|---|---|---|
| `channel_created` | `user:{memberId}` | `Channel` object |
| `channel_archived` | `user:{memberId}` | `{ channelId }` |
| `new_message` | `channel:{id}` (or `user:{id}` for thread replies) | `Message` object |
| `reaction_updated` | `channel:{id}` | `{ messageId, reactions }` |

## Constraints
- Channel names are always lowercase and hyphen-separated — enforce in both UI and backend
- `requireChannelMember` must guard all message-fetch routes to prevent data leakage from private channels
- Thread nesting capped at 2 levels deep — backend rejects deeper nesting with 400
- Cannot share a private channel message to a public channel
