---
# ─── Machine-readable design tokens ───────────────────────────────────────────
# Agents read these values directly. Never approximate — use exact hex/numbers.

meta:
  project: FlowWork
  version: "1.0"
  updated: "2026-05-26"

color:
  # Surface
  paper:    "#F8F7F3"   # warm off-white — primary background
  paper-2:  "#F2F1EC"   # slightly darker — hover states, code blocks, message highlights

  # Text hierarchy
  ink:      "#17171B"   # near-black — headings, labels, active nav
  ink-2:    "#2F2F33"   # dark grey — body text, inactive items with unread
  muted:    "#6E6E72"   # mid grey — secondary text, placeholder buttons
  faint:    "#A0A09C"   # light grey — timestamps, labels, placeholders, inactive icons

  # Borders / dividers
  rule:     "#E5E3DD"   # warm light grey — card borders, dividers, scrollbar
  rule-2:   "#EFEEE9"   # lighter rule — subtle row separators inside message groups

  # Semantic
  danger:   "#A8332A"   # muted red — destructive actions (muted at rest, revealed on hover)

  # Accent (sparingly — reserved for interactive state only)
  accent:   "#6366f1"   # indigo-500 — focus rings, links, active selection, mention chips
  violet:   "#7C3AED"   # violet-600 — product/workspace icon, opportunity badge
  amber:    "#D97706"   # amber-600 — smart suggestion / task badge accent

  # Utility
  online:   "#2D8A4F"   # green — presence dot (online indicator)
  alert-bg: "#2C3A4A"   # slate — priority alert banner background

typography:
  family:
    body: '"Inter", system-ui, sans-serif'
    mono: '"SF Mono", "Menlo", monospace'

  size:
    xs:        10   # labels, section headers, unread badges, timestamps alt
    sm:        11   # timestamps, reply tag, depth indicators, badge text
    base:      13   # buttons, sidebar nav, panel text, modal form labels
    md:        14   # body, DM/channel nav names, sidebar section items
    message:   15   # composer + message body
    heading-sm: 20  # panel headings (channel name in info panel)
    heading:   22   # page-level headers (channel name, DM title)

  weight:
    normal:  400
    medium:  500   # headings use 500 — intentionally not bold
    semi:    600   # sender name, unread items, active shortcuts

  tracking:
    tight:   "-0.015em"  # page headings
    message: "-0.01em"   # sender name in bubble
    base:    "-0.005em"  # body, inputs, composer
    wide:    "0.04em"    # timestamps
    upper:   "0.06em"    # uppercase action labels
    label:   "0.18em"    # .label, section headers

  line-height:
    body:    1.5
    message: 1.55

  rendering: |
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;

spacing:
  # All values in px
  gap-xs:  6    # icon-to-label gap inside buttons/badges
  gap-sm:  8    # tight component gaps
  gap-md:  12   # standard component gaps
  gap-lg:  16   # section gaps
  gap-xl:  24   # between major sections

  page-x:  40   # channel/DM view horizontal padding
  page-y-top: 22   # channel/DM header top padding
  page-y-btm: 18   # channel/DM header bottom padding

  sidebar-x: 20    # sidebar section horizontal padding
  sidebar-y: 16    # sidebar footer vertical padding

  bubble-pl: 21    # message bubble left padding (avatar col = 22px + gap-sm)
  bubble-pr: 24    # message bubble right padding
  bubble-py: 10    # message bubble vertical padding (normal group start)
  bubble-py-cont: 4  # continuation message vertical padding

  panel-width: 380  # right sidebar panel width (px)

radius:
  # Flat-first: border-radius 0 everywhere except avatars and chips
  none:   0      # cards, inputs, buttons, badges — no rounding
  chip:   4      # mention chips only
  avatar: 9999   # avatars are always circles
  badge:  9999   # status emoji badge is always a circle
  # Note: auth/join pages use Tailwind rounded-xl (12px) — legacy, not part of the app shell

border:
  default:  "1px solid var(--rule)"
  subtle:   "1px solid var(--rule-2)"
  input:    "1px solid var(--rule)"        # bottom border only
  input-focus: "1px solid var(--ink)"      # bottom border on focus
  importance: "3px solid {color}"          # left-border on urgent messages

shadow:
  card:     none    # cards are borderless-flat — no drop shadow
  panel:    none    # right-side panels — no drop shadow
  dropdown: "0 4px 16px rgba(0,0,0,0.10)"  # floating menus only

animation:
  slide-in:
    class: "animate-slide-in"
    keyframe: "translateX(12px) → translateX(0), opacity 0→1"
    duration: "0.18s ease-out forwards"
    use: right sidebar panel entrance

  fade-in:
    class: "animate-fade-in"
    keyframe: "translateY(-3px) → translateY(0), opacity 0→1"
    duration: "0.12s ease-out forwards"
    use: inline confirmations, archive prompt

  msg-highlight:
    class: "msg-highlight"
    keyframe: "background paper-2 → transparent"
    duration: "2.5s ease-out forwards"
    use: jump-to-message highlight

scrollbar:
  width:  6px
  track:  transparent
  thumb:  "var(--rule)"
  thumb-hover: "var(--faint)"
  radius: 0   # square thumb, no rounding

selection:
  background: "var(--ink)"
  color:      "var(--paper)"   # inverted selection

avatar:
  status-badge:
    size-ratio:   0.42    # badge diameter = avatar * 0.42, min 10px
    offset-ratio: -0.28   # bottom/right offset = badgeSize * -0.28 (half in, half out)
    outline:      "0 0 0 1.5px var(--paper)"  # white ring separating badge from avatar
    threshold:    18      # minimum avatar size (px) to show badge
---

# FlowWork Design System

## Philosophy

FlowWork uses an **ink-on-paper minimal** design language. The goal is a workspace that disappears into the work — surfaces are warm off-white, type does the hierarchy work, and color is kept in reserve for moments that genuinely demand attention.

Three rules govern every decision:

1. **Quiet at rest, clear on intent.** Buttons have no fill or border at rest. Hover reveals the action through underline. This keeps the interface visually calm during reading but unambiguous when acting.
2. **Typography over decoration.** Weight, tracking, and size carry hierarchy. Color is not used to distinguish content levels within a single surface.
3. **Flat first.** No drop shadows on cards or panels. Borders use warm-grey rules instead. Elevation is expressed through `paper-2` fill, not shadows.

---

## Color

### Surface scale
`paper` (#F8F7F3) is the primary background — slightly warm, never pure white. `paper-2` (#F2F1EC) signals a secondary surface: code inline blocks, hovered rows, highlighted messages, the message composer area.

### Text hierarchy
Four steps: `ink` → `ink-2` → `muted` → `faint`. Use `ink` for anything the user needs to read first. `muted` for secondary controls at rest. `faint` for timestamps, labels, and placeholder text that should not compete.

### Accent (`#6366f1`)
Reserved for **interactive state only** — focus rings, hyperlinks, selected-channel name, mention chips. It never appears as a decorative color on static UI. It is not registered as a CSS variable by design; its appearance should be rare enough that grepping for the hex is useful.

### Danger (`#A8332A`)
The `.btn-danger` class is `muted` at rest. `danger` color appears only on hover. This prevents the UI from looking alarmed at idle; destructive affordances are revealed on approach, not broadcast.

### Alert banner (`#2C3A4A`)
Priority alert banners intentionally break the warm paper palette with a dark slate background. This creates an unmistakable "system-level interrupt" context — distinct from any in-app surface.

---

## Typography

**Body** is Inter at 14px / 1.5. Smooth rendering is always on (`antialiased`, `optimizeLegibility`).

**Message text** is 15px / 1.55 with -0.005em tracking — slightly larger and looser than body to ease reading long threads.

**Headings** (channel name, DM title) are weight 500, not 700. The app is information-dense; heavy headings would create visual noise.

**Labels** are always 10px uppercase with 0.18em letter-spacing. This pattern is used consistently for section headers in the sidebar, panel section dividers, and form field labels (`.label` class).

**Timestamps** use tabular-nums and 0.04em tracking so columns align without width jumping.

---

## Shape Language

**Zero border-radius everywhere in the app shell.** Cards, inputs, buttons, dropdowns, modals — all sharp corners. This is deliberate: it creates a structured, editorial feel and avoids the rounded-corners monoculture.

The two exceptions:
- **Avatars** are always circles (`border-radius: 9999px`).
- **Mention chips** use 4px radius — enough to distinguish them inline from body text without looking like a pill button.

Auth/join pages (LoginPage, RegisterPage, JoinWorkspace) use Tailwind `rounded-xl` — they predate the sharp-edge decision and are outside the app shell. Do not introduce new rounded elements inside the main app layout.

---

## Component Patterns

### Buttons
Three variants, all text-only at rest:

| Variant | Rest color | Hover |
|---|---|---|
| `.btn-primary` | `ink` | underline (1px, 3px offset) |
| `.btn-ghost` | `muted` | `ink-2` + underline |
| `.btn-danger` | `muted` | `danger` + underline |

No fill, no border, no radius. Keyboard focus shows a 1px `ink` outline with 3px offset.

### Inputs (`.input`)
Bottom border only (`1px solid var(--rule)`). No side or top borders, no radius, transparent background. Focus changes the bottom border to `ink`. This makes form fields feel like editable document lines rather than UI widgets.

### Labels (`.label`)
10px · uppercase · 0.18em tracking · `faint` · 8px bottom margin. Used above every form field and above sidebar section groups.

### Cards (`.card`)
`1px solid var(--rule)` border, `paper` background, `border-radius: 0`. No shadow. Cards are used for Kanban task cards and inline task references in messages.

### Badges (priority)
Text-only: `.badge-priority-low` (faint) → `.badge-priority-medium` (ink-2) → `.badge-priority-high` (ink, semi-bold) → `.badge-priority-critical` (danger, semi-bold). No background fill, no border.

### Unread badges
18×18px (min-width), `ink` background, `paper` text, 10px tabular-nums, no radius. Square — consistent with the sharp shape language.

### Nav active indicator
A 6×1px `ink` dash (`::before` / inline span) to the left of the active item — not a highlight, not a dot, not bold alone. The dash is the only positional signal; weight 600 reinforces it.

---

## Message Bubbles

Each message group starts with a 22px avatar column. Continuation messages replace the avatar with a 22px spacer — keeping all message text left-aligned regardless of group position.

**Group boundary** is marked with a `1px solid var(--rule-2)` bottom border. Top padding 10px for group starts, 4px for continuations.

**Urgency** is expressed through a left border accent:
- Normal: `3px solid transparent` (invisible, but reserves layout space)
- Urgent: `3px solid #D97706` (amber)
- Left border width is always 3px so message text never shifts between states.

**Importance badge** inline next to the sender name: 10px uppercase, ink-on-accent background (`var(--danger)` for urgent), 2px 7px padding.

---

## Right Sidebar Panel

380px wide, fixed to the right edge, `var(--paper)` background, `1px solid var(--rule)` left border. No shadow. Enters with `animate-slide-in` (12px X, 0.18s).

A transparent full-screen backdrop sits behind it (`z-index: 199`) so clicking outside closes the panel. The panel itself is `z-index: 200`.

Panels that share this slot: notifications, thread replies, board updates, task tray, task updates, channel info. Only one is visible at a time; task detail opens only when no explicit panel is active.

---

## Sidebar (Navigation)

Dark shell that contrasts with the paper app body. Background `#111118` with `rgba(255,255,255,0.08)` rule borders. All text uses the same ink/muted/faint scale but against the dark background — do not introduce new sidebar-specific colors.

Section labels follow the same `.label` pattern but rendered at the smaller faint level. Nav items are 14px, weight 400 at rest, weight 600 when active or unread.

---

## Status Badges on Avatars

A status emoji badge overlays the bottom-right corner of any `UserAvatar`. Placement: badge center sits on the avatar circle's arc at 45° (bottom-right), so the badge is half inside the avatar and half outside. A `0 0 0 1.5px var(--paper)` box-shadow ring creates visual separation. Badge size is `avatar × 0.42` (minimum 10px). Badges do not render on avatars smaller than 18px.

---

## Dos and Don'ts

**Do**
- Use `ink`/`muted`/`faint` for text hierarchy — never create new greys
- Reserve `#6366f1` for interactive state only (focus, links, active)
- Keep `border-radius: 0` on all new app-shell surfaces
- Let underline + color-reveal be the hover pattern for all text buttons
- Use the `animate-slide-in` keyframe for any new panel that enters from the right

**Don't**
- Add drop shadows to cards or panels — the design is intentionally flat
- Use `danger` color at rest (only on hover/focus to avoid alarming idle UI)
- Introduce a new accent color — if something feels like it needs one, reconsider the layout
- Use weight 700 anywhere in the app shell
- Invent new border-radius values — stay at 0, 4 (chips), or 9999 (circles)
