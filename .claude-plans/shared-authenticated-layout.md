# Shared Authenticated Layout — Persistent SiteHeader

## Context

Navigating between `/dashboard` and `/workshop/map-config` causes the entire page to re-mount — including the SiteHeader, NotificationBell, and logout button — because each page independently renders its own header and auth check. There is no shared Next.js layout wrapping authenticated routes, so nothing persists across navigation.

## Goal

Create a Next.js route group layout for authenticated pages so the SiteHeader persists across navigations. Each child route only renders its own content area.

## Current State

- **Root layout** (`app/layout.js`): fonts, metadata, `QueryProvider` — no auth, no header
- **Dashboard** (`app/dashboard/page.js`): calls `useAuth()`, renders `DashboardLayout` which renders SiteHeader + SubNav
- **Map Config** (`app/workshop/map-config/page.js`): calls `useAuth()`, renders SiteHeader directly
- **Game** (`app/game/page.js`): server component, no SiteHeader (full-screen game UI)
- **No layout.js files** exist under `dashboard/`, `workshop/`, or `game/`

Both dashboard and map-config duplicate: auth check → loading state → SiteHeader + NotificationBell + logout.

## Approach

Use a Next.js **route group** `(authenticated)` to share a layout across dashboard and workshop routes. Game is excluded (full-screen, no header).

### Target Structure
```
app/
├── layout.js                              (root — fonts, providers, unchanged)
├── (authenticated)/
│   ├── layout.js                          (NEW — useAuth, SiteHeader, NotificationBell, logout)
│   ├── dashboard/
│   │   └── page.js                        (strip auth/header, keep DashboardLayout for SubNav + content)
│   └── workshop/
│       └── map-config/
│           └── page.js                    (strip auth/header, keep tool content only)
├── game/
│   └── page.js                            (unchanged — full-screen, no shared header)
├── auth/
│   └── ...                                (unchanged — public routes)
└── character/
    └── ...                                (move into (authenticated) if it uses SiteHeader)
```

Route groups `(authenticated)` don't affect URLs — `/dashboard` and `/workshop/map-config` stay the same.

### Phase 1 — Create `(authenticated)/layout.js`

**New file: `app/(authenticated)/layout.js`**

Consolidates the duplicated pattern from dashboard and map-config:
- Calls `useAuth()` (from `app/dashboard/hooks/useAuth.js`)
- Renders loading fallback while auth resolves
- Renders `SiteHeader` with `NotificationBell` + logout button
- Passes `user` down via context or props (children can't receive props from layouts directly — use React context)
- Renders `{children}` below the header

Will need a small `AuthContext` provider so child pages can access `user`, `handleLogout`, etc. without calling `useAuth()` again. Could be a new file `app/shared/providers/AuthProvider.js` or could be added to the layout itself.

### Phase 2 — Move routes into route group

Move existing directories:
- `app/dashboard/` → `app/(authenticated)/dashboard/`
- `app/workshop/` → `app/(authenticated)/workshop/`
- `app/character/` → `app/(authenticated)/character/` (if it uses SiteHeader — verify)

### Phase 3 — Strip duplicated auth/header from pages

**`(authenticated)/dashboard/page.js`:**
- Remove `useAuth()` call — get user from context
- Remove SiteHeader rendering from `DashboardLayout` — layout handles it
- Keep SubNav and content rendering (SubNav is dashboard-specific)

**`(authenticated)/workshop/map-config/page.js`:**
- Remove `useAuth()`, SiteHeader, NotificationBell, logout button, loading state
- Keep tool header ("Map Config"), back button, and `<MapGridTool>`

### Phase 4 — Verify game page unaffected

Game stays at `app/game/` outside the route group. No changes needed.

## Key Files

| File | Action |
|------|--------|
| `app/(authenticated)/layout.js` | **Create** — shared auth + header layout |
| `app/shared/providers/AuthProvider.js` | **Create** — context for user/auth state |
| `app/dashboard/page.js` | **Move + modify** — strip auth/header |
| `app/dashboard/components/DashboardLayout.js` | **Modify** — strip SiteHeader (keep SubNav) |
| `app/workshop/map-config/page.js` | **Move + modify** — strip auth/header |
| `app/dashboard/hooks/useAuth.js` | **Reuse** — called once in shared layout |
| `app/shared/components/SiteHeader.js` | **Reuse** — rendered once in shared layout |

## Open Questions

- Does `character/create` and `character/edit` render SiteHeader? If so, move into route group too.
- `useAuth` currently lives in `dashboard/hooks/` — should it move to `shared/hooks/` as part of this since it's no longer dashboard-specific?
- Does `DashboardLayout` do anything beyond SiteHeader + SubNav that would complicate extracting the header?

## Verification

1. Navigate `/dashboard` → header renders, tabs work
2. Navigate `/dashboard` → `/workshop/map-config` — header does NOT re-mount (check via React DevTools or visual flash)
3. Browser back from map-config → dashboard — header persists
4. Deep-link `/workshop/map-config?asset_id=xxx` — auth check works, header renders, asset loads
5. Library "Configure Grid" context menu → navigates to map-config with header persisting
6. Game page (`/game`) — unchanged, no header, full-screen
7. Unauthenticated access to any `(authenticated)` route → redirect to `/auth/magic`
8. `npm run build` — clean, no errors
