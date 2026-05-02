# Domain: Sidebar

## Overview
The primary navigation component. Dark-themed, compact. Shows workspace switcher, channel list, DM list, and board list. Also houses footer actions (invite, notifications, user/logout).

## Key Files
| File | Role |
|---|---|
| `frontend/src/components/Sidebar/Sidebar.tsx` | Entire sidebar implementation |
| `frontend/src/store/workspaceStore.ts` | Data: channels, dmThreads, members, workspaces |
| `frontend/src/store/boardStore.ts` | Data: boards |
| `frontend/src/store/uiStore.ts` | Unread counts, modal triggers |
| `frontend/src/layouts/AppLayout.tsx` | Renders Sidebar; handles mobile toggle |

## Visual Design
| Token | Value |
|---|---|
| Background | `#111118` |
| Border | `rgba(255,255,255,0.08)` |
| Active item bg | `rgba(124,58,237,0.18)` |
| Active item text | `#a78bfa` (violet-400) |
| Unread badge bg | `#7C3AED` |
| Workspace avatar | `#7C3AED` |
| Default text | `rgba(255,255,255,0.65)` |
| Muted text | `rgba(255,255,255,0.28)` |
| Hover bg | `rgba(255,255,255,0.06)` |
| Typeface | DM Sans (`font-dm` class) |
| Nav item padding | `px-2 py-[5px]` (compact) |

## Layout Sections (top to bottom)
1. **Workspace header** — avatar + name + chevron → opens workspace switcher dropdown
2. **Scrollable body**
   - Channels section (section label + `+` button + channel nav items)
   - Inline add-channel form (shown when `addingChannel = true`)
   - Direct Messages section (member list → click to start DM or navigate to existing thread)
   - Boards section (section label + `+` button + board nav items)
3. **Footer**
   - Invite teammates button
   - Notifications button + `NotificationPanel` popover
   - User row (avatar + name + logout button)

## Key Behaviours
- **Active nav items**: `NavLink` `isActive` prop drives active style via inline `style={}` (not className) for dynamic colors
- **Unread badges**: `UnreadBadge` renders a `#7C3AED` pill; sourced from `uiStore.channelUnread` / `dmUnread`
- **DM list**: shows all workspace members except self; clicking a member with an existing thread navigates to it, otherwise calls `POST /api/dms/threads` to create one
- **Workspace switcher**: dropdown rendered absolutely within the header `<div>` with `z-50`
- **Add channel form**: inline `<form>` with input + public/private toggle button (not a modal)

## Width & Mobile
- Fixed width: `w-60` (240px)
- Mobile: `AppLayout` wraps it in `fixed z-30 h-full` with `translate-x` transition; overlay backdrop closes it
- `onClose` prop: callback from `AppLayout` to close mobile sidebar after navigation

## Component Helpers (internal)
| Component | Purpose |
|---|---|
| `UnreadBadge` | Purple pill showing count |
| `SectionLabel` | Tiny uppercase muted label |
| `PlusBtn` | Faded `+` icon button with hover color |
| `NavItem` | `NavLink` wrapper with active/hover/unread styles |
| `FooterBtn` | Hover-state footer action button |

## Constraints
- Never use `ringColor` in inline `style` — use Tailwind `ring-{color}/{opacity}` instead
- Hover states are inline `onMouseEnter`/`onMouseLeave` (not Tailwind pseudo-classes) for dark dynamic colors not available as static tokens
- `NavItem` uses `style={}` for active colors and `className` for structural layout — keep this pattern consistent
- Width is fixed at `w-60` — do not make it resizable without updating `AppLayout`
