# Domain: Notifications

## Overview
In-app notification system. Notifications are created server-side by domain events (task assignments, mentions, DMs). Delivered in real-time via Socket.IO and fetched on login.

## Key Files
| File | Role |
|---|---|
| `backend/src/routes/notifications.ts` | Fetch + mark-read endpoints |
| `frontend/src/store/notificationStore.ts` | Client state |
| `frontend/src/components/NotificationPanel.tsx` | Notification dropdown UI |

## Data Model
```
notifications: id, user_id → users, type, reference_id (nullable), reference_type (nullable),
               message (human-readable text), is_read (0|1), created_at
```

### Notification Types
| `type` | Trigger | `reference_type` |
|---|---|---|
| `'mention'` | `@username` in channel message | `'message'` |
| `'dm'` | New DM root message received | `'message'` |
| `'task_assigned'` | Assignee added to task | `'task'` |
| `'task_unassigned'` | Assignee removed from task | `'task'` |

## API Endpoints
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notifications/:userId` | Fetch all notifications for user (newest first) |
| `PATCH` | `/api/notifications/read` | Mark read — body `{ ids: string[] }` marks specific; omit `ids` to mark all |

## Frontend State (`notificationStore`)
```ts
{
  notifications: Notification[],
  unreadCount: number,
}
```
- `fetchNotifications(userId)` — called by `AppLayout` on mount when `user` is set
- `addNotification(notif)` — called by `SocketContext` on `notification` socket event; prepends to list and increments `unreadCount`
- `markAllRead(userId)` — calls `PATCH /api/notifications/read`, sets all `is_read = 1`, resets `unreadCount = 0`
- `markRead(id)` — marks single notification read

## Socket Delivery
- Backend emits `notification` to `user:{userId}` room after inserting the row
- Payload: `{ id, type, message }` (lightweight — full data fetched via REST on next open)
- `SocketContext` calls `notificationStore.addNotification` on receipt

## Notification Panel
- Toggled from the Sidebar footer button
- Renders all `notifications` from store
- Has "Mark all read" action
- `reference_id` + `reference_type` can be used to navigate to the relevant item (not always implemented)

## Constraints
- Notifications are **user-scoped** — always insert with the target `user_id`, never the actor's
- Never notify the actor of their own actions (check `actorId !== userId` before inserting)
- `is_read` is `integer` (0|1), not boolean — compare accordingly
- Notification panel is cleared on workspace switch (`notificationStore` state reset in `setCurrentWorkspace`)
