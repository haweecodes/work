# Domain: Workspace

## Overview
Multi-tenant top-level container. Each user can belong to many workspaces. All other domain entities (channels, boards, DMs, tasks) are scoped to a workspace.

## Key Files
| File | Role |
|---|---|
| `backend/src/routes/workspaces.ts` | API endpoints + Socket.IO emitter |
| `backend/src/middleware/workspace.ts` | `requireWorkspaceMember` / `requireChannelMember` / `requireDmParticipant` guards |
| `frontend/src/store/workspaceStore.ts` | Client state: workspaces, channels, members, DM threads, role |
| `frontend/src/pages/WorkspaceCreate.tsx` | Create workspace UI |
| `frontend/src/pages/JoinWorkspace.tsx` | Invite-link join UI |

## Data Model
```
workspaces:        id, name, slug (unique), owner_id → users, invite_code (12-char alphanumeric), created_at
workspace_members: workspace_id, user_id, role ('admin' | 'member')  [composite PK]
```
- `slug` = `name.toLower().replace(non-alphanumeric, '-') + '-' + id.slice(0,6)`
- `invite_code` = `uuid().replace(/-/g,'').slice(0,12)`

## API Endpoints
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workspaces` | List workspaces current user belongs to |
| `POST` | `/api/workspaces` | Create workspace (auto-creates `general` channel + adds creator as admin) |
| `GET` | `/api/workspaces/:id/members` | List members with role — requires workspace membership |
| `POST` | `/api/workspaces/:id/invite` | Invite by email (user must already be registered) |
| `GET` | `/api/workspaces/join/:code` | Look up workspace by invite code (no auth) |
| `POST` | `/api/workspaces/join/:code` | Join workspace via invite code |

## Workspace Creation Side Effects
1. Inserts `workspace_members` row with `role = 'admin'`
2. Creates a `general` channel (public)
3. Adds creator to `channel_members` for `general`

## Invite Flow
- **Email invite** (`POST /:id/invite`): user must already exist; adds to `workspace_members` + `general` channel; emits `member_joined` to `workspace:{id}`
- **Invite link** (`POST /join/:code`): same side effects; new member gets `role = 'member'`

## Frontend State (`workspaceStore`)
```ts
{
  workspaces: Workspace[],
  currentWorkspace: Workspace | null,   // persisted to localStorage 'fw_workspace'
  channels: Channel[],
  dmThreads: DmThread[],
  members: Member[],                    // includes role field
  role: 'admin' | 'member' | null,
  isInitialized: boolean,
}
```
- `setCurrentWorkspace(ws)` resets ALL workspace-scoped stores (boards, UI, notifications) then fetches channels, members, dmThreads for the new workspace
- `isAdmin(userId)` returns `true` if `role === 'admin'` OR user is `currentWorkspace.owner_id`
- Never call `setCurrentWorkspace` twice concurrently — it clears state mid-flight

## Socket Events
| Event | Room | Payload |
|---|---|---|
| `member_joined` | `workspace:{id}` | `Member` object with role |

## Constraints
- Every other domain query **must** include `workspace_id` — never query across workspaces
- `requireWorkspaceMember(paramName)` middleware must guard all workspace-scoped routes
- Owner is always admin regardless of `workspace_members.role`
