# Plan: Migrate All Authenticated API Calls to `authFetch`

## Problem

All TanStack Query hooks (queries and mutations) and many standalone components use plain `fetch` for authenticated API calls. Plain `fetch` has no 401 retry logic — when the access token expires (15-minute lifetime), calls silently fail with auth errors. The user must reload the page (triggering Next.js middleware server-side refresh) to recover.

Only the asset library hooks correctly use `authFetch`. Everything else is unprotected.

## Solution

Replace plain `fetch` with `authFetch` in every authenticated API call. `authFetch` automatically handles 401 → token refresh → retry, providing seamless token renewal without page reloads.

---

## Files to Modify

### Dashboard TanStack Query Hooks (7 files, 30 calls)

| File | `fetch` calls | Notes |
|------|--------------|-------|
| `dashboard/hooks/mutations/useSessionMutations.js` | 5 | start, pause, finish, create, delete |
| `dashboard/hooks/mutations/useCampaignMutations.js` | 7 | create, update, delete, accept/decline invite, leave, remove player |
| `dashboard/hooks/mutations/useFriendshipMutations.js` | 6 | buzz, invite to campaign, accept/decline request, send request, remove |
| `dashboard/hooks/mutations/useCharacterMutations.js` | 5 | select, release, create, update, delete |
| `dashboard/hooks/mutations/useNotificationMutations.js` | 2 | mark read, mark all read |
| `dashboard/hooks/useCampaigns.js` | 3 | campaigns list, members, sessions |
| `dashboard/hooks/useCharacters.js` | 1 | characters list |

### Dashboard TanStack Query Hooks (3 files, 3 calls)

| File | `fetch` calls | Notes |
|------|--------------|-------|
| `dashboard/hooks/useFriendships.js` | 1 | friendships list |
| `dashboard/hooks/useNotifications.js` | 1 | unread notifications |
| `dashboard/hooks/useInvitedCampaignMembers.js` | 1 | invited campaign members |

### Dashboard Components (5 files, 12 calls)

| File | `fetch` calls | Notes |
|------|--------------|-------|
| `dashboard/components/CampaignInviteModal.js` | 6 | fetch friends, lookup user, check invites, send invite, lookup user, remove player |
| `dashboard/components/ProfileManager.js` | 2 | update screen name, delete account |
| `dashboard/components/AccountNameModal.js` | 1 | set account name |
| `dashboard/components/CharacterManager.js` | 1 | fetch characters (likely dead code — TanStack hook exists) |
| `dashboard/components/SocialManager.js` | 2 | test notification, hard delete |

### Game Page & Components (4 files, 15 calls)

| File | `fetch` calls | Notes |
|------|--------------|-------|
| `game/page.js` | 8 | get session, get roles (x2), get current user, get characters, update seats, get logs, get active map |
| `game/hooks/webSocketEvent.js` | 3 | post system log, post adventure log, update seat layout |
| `game/components/ModeratorControls.js` | 2 | fetch session, role change |
| `game/components/MapControlsPanel.js` | 2 | update map, update grid config |

### Audio (1 file, 1 call)

| File | `fetch` calls | Notes |
|------|--------------|-------|
| `audio_management/hooks/useUnifiedAudio.js` | 1 | load audio buffer — **Exception**: this fetches audio binary data from S3 presigned URLs, not our API. Leave as plain `fetch`. |

---

## Approach

Each file change is mechanical:

1. Add `import { authFetch } from '@/app/shared/utils/authFetch'` at the top
2. Replace `await fetch(` with `await authFetch(` for each authenticated call
3. Ensure `credentials: 'include'` is present (authFetch adds this automatically, but keeping it explicit is harmless)

No logic changes, no refactoring — just swap the fetch function.

---

## Exceptions (Leave as plain `fetch`)

| File | Call | Reason |
|------|------|--------|
| `shared/hooks/useTokenRefresh.js` | `POST /api/users/auth/refresh` | IS the refresh call — authFetch would infinitely recurse |
| `shared/utils/authFetch.js` | `POST /api/users/auth/refresh` | Internal refresh mechanism |
| `auth/magic/page.js` | All calls | User isn't authenticated yet |
| `auth/verify/page.js` | `POST /api/auth/verify-otp` | User isn't authenticated yet |
| `patch_notes/page.js` | `GET /api/patch-notes-versions` | Public endpoint |
| `asset_library/hooks/useUploadAsset.js` | `PUT` to S3 presigned URL | Direct S3 upload, not our backend |
| `audio_management/hooks/useUnifiedAudio.js` | Audio buffer fetch | Fetches binary from S3, not our API |
| `audio_management/hooks/useWebAudio.js` | Audio buffer fetch | Fetches binary from S3, not our API |
| `dashboard/hooks/useAuth.js:58` | `POST /auth/logout` | Goes to api-auth, not api-site; user is logging out |
| `shared/hooks/useEvents.js` | `POST /api/users/ws-token` | **Resolved**: Needs authFetch — authenticated call for WebSocket token; fails silently on token expiry during reconnect |
| `dashboard/components/FriendsManager.js` | user lookup by account tag | **Resolved**: Needs authFetch — not dead code, active component with one plain fetch for `/api/users/by-account-tag/` lookup |

---

## Verification

1. Search codebase: `grep -r "await fetch(" rollplay/app/ --include="*.js"` — every remaining hit should be in the exceptions list above
2. Test token expiry: sit on dashboard for 16+ minutes without reloading, then perform actions (start session, invite player, create campaign) — should work without page reload
3. Test game page: sit in a game session for 16+ minutes, verify all interactions still work
4. Build check: `npm run build` passes with no import errors
