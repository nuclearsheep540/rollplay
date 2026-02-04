# Headless UI Migration Plan

## Goal

Migrate hand-rolled interactive components to Headless UI, completing the third layer of the frontend stack convention:

| Layer | Tool | Status |
|-------|------|--------|
| Layout & spacing | Tailwind CSS | Done |
| Colours & theme | `colorTheme.js` | Done |
| Interactive behaviour | Headless UI | **This plan** |
| Server state | TanStack Query | Done |

## Current State

- `@headlessui/react` v2.2.9 already installed
- 1 component migrated: `Combobox.js` (shared)
- 16 hand-rolled interactive components with zero focus trapping, zero escape handling, zero ARIA

## Styling Convention (Enforced)

All Headless UI components follow the Combobox pattern:
- **Tailwind** → layout, spacing, sizing, responsiveness (`flex`, `p-6`, `rounded-sm`, `max-w-md`)
- **`colorTheme.js`** via `style={}` → all colours (`THEME.bgSecondary`, `THEME.borderDefault`, `THEME.textOnDark`)
- **Never** use Tailwind colour classes (`bg-blue-500`, `text-red-600`) — colours come from `colorTheme.js` only
- **Headless UI** → accessibility behaviour (focus trap, escape, ARIA, keyboard nav)

---

## Phase 1: Shared Primitives

Create reusable Headless UI wrappers in `shared/components/` that enforce styling conventions.

### 1.1 `Modal.js` — wraps `Dialog`

**File**: `rollplay/app/shared/components/Modal.js`

Provides:
- Focus trap (automatic via `Dialog`)
- Escape-to-close (automatic via `Dialog`)
- Backdrop click-to-close (via `DialogBackdrop`)
- `role="dialog"` + `aria-modal="true"` (automatic)
- Overlay with `THEME.overlayDark` + `backdropFilter: blur(4px)`
- Transition animations via `Transition` (fade in/out)

Props:
- `open` (boolean) — controls visibility
- `onClose` (function) — called on escape/backdrop click
- `size` ('sm' | 'md' | 'lg' | 'xl') — max-width preset
- `children` — modal content
- `initialFocus` (ref, optional) — element to focus on open

Replaces: `createPortal` + `fixed inset-0` + manual backdrop in every modal.

### 1.2 `ConfirmDialog.js` — wraps `Modal`

**File**: `rollplay/app/shared/components/ConfirmDialog.js`

Drop-in replacement for current `ConfirmModal.js`. Same props interface, backed by `Modal`.

Provides: Everything `Modal` does, plus structured title/message/buttons layout.

### 1.3 `TabNav.js` — wraps `TabGroup`

**File**: `rollplay/app/shared/components/TabNav.js`

Provides:
- `role="tablist"` / `role="tab"` / `role="tabpanel"` (automatic)
- Arrow key navigation between tabs (automatic)
- `aria-selected` on active tab (automatic)
- Styled with existing `STYLES.tabActive` / `STYLES.tabInactive` from `colorTheme.js`

Props:
- `tabs` (array of `{ id, label }`)
- `activeTab` (string)
- `onTabChange` (function)

Replaces: SubNav tabs mode button group.

### 1.4 `Dropdown.js` — wraps `Menu`

**File**: `rollplay/app/shared/components/Dropdown.js`

Provides:
- `role="menu"` / `role="menuitem"` (automatic)
- Keyboard navigation (automatic)
- Click-outside-to-close (automatic)
- Escape-to-close (automatic)

Props:
- `trigger` (ReactNode) — the button that opens the menu
- `items` (array of `{ label, onClick, icon?, variant? }`)
- `align` ('left' | 'right')

Replaces: Manual `useState` + `useRef` + click-outside handlers in FriendsWidget and NotificationBell.

---

## Phase 2: Modal Migrations

Swap each hand-rolled modal to use the `Modal` or `ConfirmDialog` primitive.

### 2.1 `ConfirmModal.js` → `ConfirmDialog.js`

- Replace `createPortal` + `fixed inset-0` with `Modal` wrapper
- Keep exact same props interface for backward compatibility
- All consumers (DeleteCampaignModal, DeleteSessionModal, PauseSessionModal, FinishSessionModal) get focus trap + escape + ARIA for free

**Files modified**: `shared/components/ConfirmModal.js`
**Consumer impact**: Zero — same props, better behaviour

### 2.2 `CharacterSelectionModal.js`

- Wrap content in `<Modal open={true} onClose={onClose}>`
- Remove `fixed inset-0 z-50` overlay div
- `selectCharacterMutation.isPending` disables close via `onClose` guard

**File**: `dashboard/components/CharacterSelectionModal.js`

### 2.3 `CampaignInviteModal.js`

- Replace `createPortal` + overlay with `<Modal>`
- Remove manual `onClick={onClose}` backdrop + `stopPropagation`
- Keep all internal state (friendUuid, lookupUser, etc.) unchanged

**File**: `dashboard/components/CampaignInviteModal.js`

### 2.4 `AssetUploadModal.js`

- Replace `fixed inset-0 backdrop-blur-sm` with `<Modal>`
- Keep drag-drop + file state unchanged

**File**: `asset_library/components/AssetUploadModal.js`

### 2.5 `AccountNameModal.js` + `ScreenNameModal.js`

- These are blocking modals (no dismiss). Wrap in `<Modal onClose={() => {}}>` to get focus trap + ARIA without allowing escape-to-close.

**Files**: `dashboard/components/AccountNameModal.js`, `dashboard/components/ScreenNameModal.js`

### 2.6 `PauseSessionModal.js` + `FinishSessionModal.js`

- These use custom countdown UI but are structurally confirmation dialogs
- Wrap in `<Modal>` to get focus trap + escape + ARIA
- Keep countdown timer logic unchanged

**Files**: `dashboard/components/PauseSessionModal.js`, `dashboard/components/FinishSessionModal.js`

---

## Phase 3: Tab Migration

### 3.1 `SubNav.js` — tabs mode

- Replace button group in tabs mode with `TabNav` component (or inline `TabGroup` / `TabList` / `Tab`)
- Breadcrumb mode stays as-is (not a tab pattern)
- `DashboardLayout.js` passes same `tabs`/`activeTab`/`onTabChange` props — no changes needed

**Files modified**: `shared/components/SubNav.js`
**Consumer impact**: Zero — same props interface

---

## Phase 4: Dropdown Migrations

### 4.1 `NotificationBell.js` + `NotificationPanel.js`

- Replace manual `showPanel` toggle + click-outside with Headless UI `Popover`
- `Popover.Button` wraps the bell icon
- `Popover.Panel` wraps the notification list
- Click-outside, escape, focus management all automatic

**Files**: `shared/components/NotificationBell.js`, `shared/components/NotificationPanel.js`

### 4.2 `FriendsWidget.js` — invite dropdown

- Replace `inviteDropdown` state + manual click-outside ref with `Dropdown` component (or inline `Menu`)
- Campaign list items rendered as `Menu.Item` with keyboard nav

**File**: `dashboard/components/FriendsWidget.js`

---

## Files Summary

### New Files (4)
| File | Phase |
|------|-------|
| `shared/components/Modal.js` | 1 |
| `shared/components/ConfirmDialog.js` | 1 |
| `shared/components/TabNav.js` | 1 |
| `shared/components/Dropdown.js` | 1 |

### Modified Files (12)
| File | Phase | Change |
|------|-------|--------|
| `shared/components/ConfirmModal.js` | 2 | Rewrite internals to use `Modal` |
| `dashboard/components/CharacterSelectionModal.js` | 2 | Wrap in `Modal` |
| `dashboard/components/CampaignInviteModal.js` | 2 | Replace `createPortal` with `Modal` |
| `asset_library/components/AssetUploadModal.js` | 2 | Replace overlay with `Modal` |
| `dashboard/components/AccountNameModal.js` | 2 | Wrap in `Modal` |
| `dashboard/components/ScreenNameModal.js` | 2 | Wrap in `Modal` |
| `dashboard/components/PauseSessionModal.js` | 2 | Wrap in `Modal` |
| `dashboard/components/FinishSessionModal.js` | 2 | Wrap in `Modal` |
| `shared/components/SubNav.js` | 3 | Tabs mode uses `TabGroup` |
| `shared/components/NotificationBell.js` | 4 | Uses `Popover` |
| `shared/components/NotificationPanel.js` | 4 | Becomes `Popover.Panel` content |
| `dashboard/components/FriendsWidget.js` | 4 | Uses `Menu` for invite dropdown |

---

## Verification

### Per-component checks
- Tab into and out of every modal — focus should stay trapped inside
- Press Escape on every modal — should close (except blocking modals)
- Click backdrop on every modal — should close (except blocking modals)
- Tab through dashboard nav — arrow keys should move between tabs
- Open notification panel — escape and click-outside should close it
- Open friends invite dropdown — keyboard navigation through campaign list

### Cross-browser
- Test focus trap in Chrome, Firefox
- Test escape handling across browsers

### Regression
- `docker compose -f docker-compose.dev.yml build app` passes
- All existing modal flows work identically (character selection, campaign invite, asset upload, session pause/finish, delete confirmation)
