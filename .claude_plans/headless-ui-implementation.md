# Headless UI Migration + Frontend Consistency — Implementation Plan

Reference: `.claude_plans/headless-ui-migration.md`

## Implementation Order

Work phase-by-phase. Each phase is self-contained and testable before moving on.

---

### Phase 0: Design Token Foundation

**Problem**: `colorTheme.js` uses inline `style={}` for all colors. Headless UI's `data-[state]` selectors (e.g. `data-[selected]`, `data-[focus]`) work with CSS classes but not inline styles. The existing Combobox already hits this — it has a hardcoded `data-[focus]:bg-[#37322F]` escape hatch.

**Solution**: CSS Custom Properties → Tailwind theme extension. All color values defined in our own `:root` variables. Tailwind config registers them so its variant engine (`hover:`, `data-[]:`, etc.) can generate utility classes. No Tailwind built-in colors used.

**0.1 `rollplay/app/globals.css`** — add `:root` custom properties

```css
:root {
  /* Palette */
  --palette-carbon: #1F1F1F;
  --palette-smoke: #F7F4F3;
  --palette-onyx: #0B0A09;
  --palette-graphite: #37322F;
  --palette-silver: #B5ADA6;

  /* Surface — backgrounds */
  --surface-primary: #F7F4F3;
  --surface-secondary: #1F1F1F;
  --surface-panel: #1F1F1F;
  --surface-elevated: #0B0A09;

  /* Content — text */
  --content-primary: #1F1F1F;
  --content-secondary: #B5ADA6;
  --content-on-dark: #F7F4F3;
  --content-bold: #0B0A09;
  --content-accent: #B5ADA6;

  /* Border */
  --border-default: #37322F;
  --border-active: #F7F4F3;
  --border-subtle: #37322F40;

  /* Interactive */
  --interactive-hover: #B5ADA6;
  --interactive-focus: #0B0A09;

  /* Overlay */
  --overlay-dark: #1F1F1FE6;
  --overlay-light: #0B0A09CC;

  /* Feedback — status colors */
  --feedback-success: #16a34a;
  --feedback-error: #dc2626;
  --feedback-warning: #d97706;
  --feedback-info: #2563eb;
}
```

**0.2 `rollplay/tailwind.config.js`** — register our CSS variables with Tailwind's variant engine

This does NOT use Tailwind's built-in color palette. It maps our `:root` CSS variables to utility class names so that `hover:`, `focus:`, `data-[selected]:` etc. work with our custom colors.

```js
colors: {
  surface: {
    primary: 'var(--surface-primary)',
    secondary: 'var(--surface-secondary)',
    panel: 'var(--surface-panel)',
    elevated: 'var(--surface-elevated)',
  },
  content: {
    primary: 'var(--content-primary)',
    secondary: 'var(--content-secondary)',
    'on-dark': 'var(--content-on-dark)',
    bold: 'var(--content-bold)',
    accent: 'var(--content-accent)',
  },
  border: {
    DEFAULT: 'var(--border-default)',
    active: 'var(--border-active)',
    subtle: 'var(--border-subtle)',
  },
  interactive: {
    hover: 'var(--interactive-hover)',
    focus: 'var(--interactive-focus)',
  },
  overlay: {
    dark: 'var(--overlay-dark)',
    light: 'var(--overlay-light)',
  },
  feedback: {
    success: 'var(--feedback-success)',
    error: 'var(--feedback-error)',
    warning: 'var(--feedback-warning)',
    info: 'var(--feedback-info)',
  },
}
```

**0.3 `rollplay/app/styles/colorTheme.js`** — keep for backward compat

No changes in Phase 0. Existing components continue working. As components are touched in Phases 1–5, switch from `style={{ ...THEME }}` to semantic Tailwind classes. `colorTheme.js` removable once all consumers migrated.

**0.4 `rollplay/app/shared/components/Combobox.js`** — fix hardcoded color

Replace `data-[focus]:bg-[#37322F]` with `data-[focus]:bg-interactive-hover`.

**Migration cheatsheet** (used across all phases):
| Before (inline style) | After (Tailwind class) |
|---|---|
| `style={{ backgroundColor: THEME.bgSecondary }}` | `className="bg-surface-secondary"` |
| `style={{ color: THEME.textOnDark }}` | `className="text-content-on-dark"` |
| `style={{ borderColor: THEME.borderDefault }}` | `className="border-border"` |
| `style={{ backgroundColor: THEME.overlayDark }}` | `className="bg-overlay-dark"` |

---

### Phase 1: Shared Components (8 new files)

All new components use Phase 0 semantic tokens. No inline `style={}`, no Tailwind built-in colors.

#### Headless UI Primitives

**1.1 `rollplay/app/shared/components/Modal.js`** — wraps `Dialog` + `Transition`
- Props: `open`, `onClose`, `size` (sm/md/lg/xl), `children`, `initialFocus`
- Headless UI: focus trap, escape-to-close, `role="dialog"`, `aria-modal`
- Overlay: `bg-overlay-dark backdrop-blur`
- Transition: fade in/out via Headless UI `Transition`
- Size presets: `max-w-sm`, `max-w-md`, `max-w-lg`, `max-w-xl`
- Panel: `bg-surface-secondary border border-border text-content-on-dark rounded-sm`

**1.2 `rollplay/app/shared/components/ConfirmDialog.js`** — wraps `Modal`
- Same props interface as current `ConfirmModal.js`: `show`, `title`, `message`, `description`, `confirmText`, `cancelText`, `onConfirm`, `onCancel`, `isLoading`, `loadingText`, `icon`, `variant`
- Structured layout: icon + title + message + description + button row
- Uses `<Spinner>` for loading state instead of inline `animate-spin` div
- Variant styling: `feedback-error` for danger, `feedback-warning` for warning, `feedback-info` for info

**1.3 `rollplay/app/shared/components/TabNav.js`** — wraps `TabGroup`
- Props: `tabs` (array of `{id, label}`), `activeTab`, `onTabChange`
- Uses `selectedIndex` derived from `activeTab` matching `tabs[i].id`
- Tab styling: `text-content-secondary data-[selected]:text-content-on-dark data-[selected]:border-b-2 data-[selected]:border-border-active`
- Headless UI: `role="tablist"`/`role="tab"`, arrow key nav, `aria-selected`

**1.4 `rollplay/app/shared/components/Dropdown.js`** — wraps `Menu`
- Props: `trigger` (ReactNode), `items` (array of `{label, onClick, icon?, variant?, disabled?}`), `align` ('left'|'right')
- Item styling: `text-content-on-dark data-[focus]:bg-interactive-hover`
- Headless UI: `role="menu"`/`role="menuitem"`, keyboard nav, click-outside, escape

#### Utility Components (DRY)

**1.5 `rollplay/app/shared/components/Spinner.js`** — replaces 14 inline spinner implementations
- Props: `size` ('sm'|'md'|'lg'), `className` (optional override)
- Size presets: sm=`h-4 w-4`, md=`h-5 w-5`, lg=`h-8 w-8`
- Uses `border-content-accent` (semantic token) instead of hardcoded colors
- Single `animate-spin rounded-full border-b-2` pattern, one place to maintain
- Replaces divergent spinners in ConfirmModal, CampaignInviteModal, SessionsManager, CharacterEditPanel, etc.

**1.6 `rollplay/app/shared/components/FormField.js`** — replaces 10 repeated label+input+error patterns
- Props: `label`, `id`, `error`, `helperText`, `children` (input element passed as child)
- Structured layout: label → input slot → helper text → error message
- Error styling: `text-feedback-error` + `border-feedback-error`
- Composable: wraps any input type (`<input>`, `<textarea>`, `<Combobox>`, etc.)
- Replaces duplicated form field markup in AccountNameModal, ScreenNameModal, CampaignInviteModal, CharacterEditPanel, CharacterForm, AssetUploadModal

**1.7 `rollplay/app/shared/components/EmptyState.js`** — standardizes empty collection UI
- Props: `icon` (emoji or FontAwesome icon), `title`, `description`, `action` (optional ReactNode for CTA button)
- Centered layout: `flex flex-col items-center justify-center py-16 text-center`
- Uses semantic tokens: `text-content-on-dark` for title, `text-content-secondary` for description
- Replaces inline empty state in AssetGrid. Available for campaigns, sessions, characters, etc.

**1.8 `rollplay/app/shared/components/Badge.js`** — move from Button.js, standardize
- Move existing Badge from `dashboard/components/shared/Button.js` to its own file
- Props: `children`, `variant` ('default'|'success'|'error'|'warning'|'info'), `size` ('xs'|'sm'|'md')
- Variant colors use feedback tokens: `bg-feedback-success`, `text-feedback-error`, etc.
- Replaces divergent badge implementations in AssetCard (type badges) and SessionsManager (role badges)

---

### Phase 2: Modal Migrations (8 files modified)

Each migration: remove `createPortal`/`fixed inset-0`/manual overlay → wrap in `<Modal>`. Switch inline `style={{ ...THEME }}` → semantic classes. Use `<Spinner>` and `<FormField>` where applicable.

| File | Key details |
|------|-------------|
| `shared/components/ConfirmModal.js` | Rewrite internals to delegate to `ConfirmDialog`. Same external props. |
| `dashboard/components/CharacterSelectionModal.js` | `<Modal size="lg">`. Remove fixed overlay div. |
| `dashboard/components/CampaignInviteModal.js` | `<Modal size="lg">`. Remove `createPortal` + stopPropagation. Use `<FormField>` for invite input. |
| `asset_library/components/AssetUploadModal.js` | `<Modal>`. Guard `onClose` when `uploading` is true. Use `<Spinner>` for upload state. |
| `dashboard/components/AccountNameModal.js` | `<Modal onClose={() => {}}>` (blocking). Use `<FormField>`. Migrate hardcoded white/slate → semantic tokens. |
| `dashboard/components/ScreenNameModal.js` | `<Modal onClose={() => {}}>` (blocking). Use `<FormField>`. Migrate hardcoded white/slate → semantic tokens. |
| `dashboard/components/PauseSessionModal.js` | `<Modal>`. Remove `createPortal`. Use `<Spinner>` for loading. |
| `dashboard/components/FinishSessionModal.js` | `<Modal>`. Remove `createPortal`. Preserve 3-second countdown timer. |

---

### Phase 3: Tab Migration (1 file)

`shared/components/SubNav.js` — tabs mode only
- Replace button group with `TabGroup` / `TabList` / `Tab`
- Breadcrumb mode unchanged
- Same props interface, zero consumer impact

---

### Phase 4: Dropdown Migrations (3 files)

| File | Change |
|------|--------|
| `shared/components/NotificationBell.js` | Replace `showPanel` state toggle with `Popover` / `PopoverButton` / `PopoverPanel` |
| `shared/components/NotificationPanel.js` | Becomes content inside `PopoverPanel`. Migrate hardcoded Tailwind colors (bg-white, text-slate-*) → semantic tokens. Use `<Badge>` for notification count. |
| `dashboard/components/FriendsWidget.js` | Replace `inviteDropdown` state + click-outside ref with `Menu` / `MenuButton` / `MenuItems` / `MenuItem`. Use `<Badge>` for status indicators. |

---

### Phase 5: Asset Library Context Menus (Radix)

**Why Radix**: Headless UI has no context menu primitive. `@radix-ui/react-context-menu` is unstyled and accessible — same philosophy, fills the gap.

**Library responsibilities**:
- **Headless UI** → modals (focus trap, Esc), tabs (arrow keys, ARIA), dropdowns (Menu/Popover)
- **Radix Context Menu** → right-click menus on asset cards

**5.1 Install `@radix-ui/react-context-menu`**

**5.2 `rollplay/app/shared/components/ContextMenu.js`** — wraps Radix `ContextMenu`
- Reusable wrapper using semantic token classes
- Props: `trigger` (children to right-click on), `items` (array of `{label, onClick, icon?, variant?, disabled?}`)
- Supports sub-menus (needed for "Add to Campaign" with campaign list)
- Radix provides: right-click trigger, positioning, keyboard nav, focus management, Esc to close

**5.3 `rollplay/app/asset_library/components/AssetCard.js`** — add context menu
- Wrap card in `<ContextMenu>` trigger
- Remove hover delete button (context menu replaces it — cleaner card UI)
- Use `<Badge>` for type badges (map/audio/image)
- Context menu items:
  1. **Quick Look** — opens preview modal
  2. **Rename** — opens rename modal with text input + `<FormField>`
  3. **Add to Campaign** → sub-menu listing user's campaigns (uses existing `useAssociateAsset` hook)
  4. **Delete** — triggers existing delete confirmation flow via `ConfirmDialog`

**5.4 `rollplay/app/asset_library/components/AssetQuickLook.js`** — new preview component
- Uses `<Modal>` from Phase 1
- Image/map assets: full-resolution image view
- Audio assets: audio player with playback controls

**5.5 Backend: Rename endpoint**
- New `PATCH /api/library/{asset_id}` endpoint in `api-site/modules/library/api/endpoints.py`
- Updates `filename` field on the asset aggregate
- Add `RenameMediaAsset` command in `api-site/modules/library/application/commands.py`
- Frontend hook: `rollplay/app/asset_library/hooks/useRenameAsset.js`

---

## Estimated DRY Reduction

Duplicate/boilerplate code removed (excluding new functionality like context menus, QuickLook):

| Pattern | Instances | Lines removed per instance | Total |
|---|---|---|---|
| Modal overlay boilerplate (`createPortal`, `fixed inset-0`, backdrop div, click handlers) | 8 modals | ~10 lines each | ~80 lines |
| FormField duplication (label + input wrapper + error + helper) | 10 files | ~8 lines each | ~80 lines |
| Spinner duplication (inline `animate-spin` divs with varying sizes/colors) | 14 files | ~2 lines each | ~28 lines |
| Click-outside handlers (`useRef` + `useEffect` + mousedown listener) | 2 files | ~12 lines each | ~24 lines |
| Inline style objects → single className | ~19 files | ~3 lines each | ~57 lines |
| Badge duplication (inline badge markup) | 3 files | ~5 lines each | ~15 lines |
| ConfirmModal → ConfirmDialog delegation | 1 file | ~20 lines | ~20 lines |
| **Total** | | | **~300 lines** |

`colorTheme.js` (~80 lines) becomes deletable once all consumers migrate, but that's a follow-up.

---

## Files Summary

### New Files (11)
| File | Phase |
|------|-------|
| `shared/components/Modal.js` | 1 |
| `shared/components/ConfirmDialog.js` | 1 |
| `shared/components/TabNav.js` | 1 |
| `shared/components/Dropdown.js` | 1 |
| `shared/components/Spinner.js` | 1 |
| `shared/components/FormField.js` | 1 |
| `shared/components/EmptyState.js` | 1 |
| `shared/components/Badge.js` | 1 (moved from Button.js) |
| `shared/components/ContextMenu.js` | 5 |
| `asset_library/components/AssetQuickLook.js` | 5 |
| `asset_library/hooks/useRenameAsset.js` | 5 |

### Modified Files (19)
| File | Phase | Change |
|------|-------|--------|
| `app/globals.css` | 0 | Add `:root` CSS custom properties |
| `tailwind.config.js` | 0 | Register our CSS variables with Tailwind variant engine |
| `shared/components/Combobox.js` | 0 | Fix hardcoded `data-[focus]` color |
| `dashboard/components/shared/Button.js` | 1 | Remove Badge export (moved to own file) |
| `shared/components/ConfirmModal.js` | 2 | Rewrite internals to delegate to `ConfirmDialog` |
| `dashboard/components/CharacterSelectionModal.js` | 2 | Wrap in `Modal` |
| `dashboard/components/CampaignInviteModal.js` | 2 | Replace `createPortal` with `Modal`, use `FormField` |
| `asset_library/components/AssetUploadModal.js` | 2 | Replace overlay with `Modal`, use `Spinner` |
| `dashboard/components/AccountNameModal.js` | 2 | Wrap in `Modal`, use `FormField`, migrate colors |
| `dashboard/components/ScreenNameModal.js` | 2 | Wrap in `Modal`, use `FormField`, migrate colors |
| `dashboard/components/PauseSessionModal.js` | 2 | Wrap in `Modal`, use `Spinner` |
| `dashboard/components/FinishSessionModal.js` | 2 | Wrap in `Modal` |
| `shared/components/SubNav.js` | 3 | Tabs mode uses `TabGroup` |
| `shared/components/NotificationBell.js` | 4 | Uses `Popover` |
| `shared/components/NotificationPanel.js` | 4 | Inside `PopoverPanel`, migrate colors, use `Badge` |
| `dashboard/components/FriendsWidget.js` | 4 | Uses `Menu`, use `Badge` |
| `asset_library/components/AssetCard.js` | 5 | Context menu, remove hover delete, use `Badge` |
| `api-site/modules/library/api/endpoints.py` | 5 | Add PATCH rename endpoint |
| `api-site/modules/library/application/commands.py` | 5 | Add `RenameMediaAsset` command |

---

## Verification

### Per-phase build check
- `docker compose -f docker-compose.dev.yml build app` passes after each phase

### Phase 0 check
- Tailwind classes like `bg-surface-secondary`, `text-content-on-dark` render correctly in browser
- Combobox `data-[focus]` uses semantic token instead of hardcoded hex

### Phase 1 check
- `<Modal>` renders with focus trap, escape-to-close, backdrop click
- `<Spinner>` renders at all 3 sizes
- `<FormField>` renders label, input slot, error state
- `<EmptyState>` renders centered icon + text
- `<Badge>` renders all variant colors

### Phase 2 modal checks
- Tab into and out of every modal — focus stays trapped
- Press Escape — modal closes (except blocking: AccountName, ScreenName)
- Click backdrop — modal closes (except blocking)
- FinishSessionModal countdown timer still works
- All form fields use `<FormField>` wrapper

### Phase 3 tab check
- Arrow keys navigate between dashboard tabs
- `aria-selected` present on active tab

### Phase 4 dropdown checks
- Escape and click-outside close notification panel
- Keyboard navigation through friend invite campaign list
- Notification count uses `<Badge>`

### Phase 5 context menu checks
- Right-click asset card → context menu appears
- Quick Look opens preview modal
- Rename updates asset name (test backend PATCH endpoint)
- Add to Campaign sub-menu shows user's campaigns
- Delete triggers confirmation dialog
