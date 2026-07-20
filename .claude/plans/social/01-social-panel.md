# Social Panel v1 — friends + notifications, one surface

> **Status:** built 2026-07-19. Interactive mock (approved, "float-unfold" version): claude.ai/code/artifact/1883353d-1078-4604-9eb1-e7b737b1593b
> **Origin:** Matt's Gemini/Stitch wireframe accidentally aggregated friends + notifications into one component — kept deliberately. Replaces the NotificationBell popover and the bottom-right friends collapsible ("very 2010, killing the dashboard vibe").
> **v2 parked:** the "Live Pulse" friend-activity feed → [TODO-social-live-pulse.md](../TODO-social-live-pulse.md).

## Settled design decisions (from the 2026-07-19 conversation)

1. **One surface, three sections, top-to-bottom:** Friends (present tense — who's around now), Requests (pending, accept/decline inline), Notifications (past tense — what happened). All under **one CTA**; the bell and the corner widget both retire.
2. **Naming:** "Social" (Matt, post-build: "Fellowship" was a Gemini placeholder, not a name). Component is `SocialPanel` — which also dissolves the grep collision with the in-game "fellowship panel" (seated-player list comments in `GameContent.js`).
3. **Pairing B — page-native geometry:** the SiteHeader's *contents* align to the same max-width column as the page content, and the panel is a **floating card that unfolds from the CTA** (fade + slight scale, `transform-origin: top right`, ~200ms, reduced-motion → instant). NOT an edge-slide drawer: a full-height sheet claims edge attachment, which breaks on ultrawide; a rounded floating card owns its own boundaries, so open space beside it reads intentional at any width. Max-height ≈ nav→viewport gap, internal scroll. Non-modal, no backdrop; Esc / ✕ / CTA re-click closes.
4. **Mount point:** the persistent `(authenticated)` layout — panel state survives navigation between dashboard tabs.
5. **CTA badge** = unread notifications + pending friend requests.
6. **Presence, honestly scoped:**
   - **v1 — online/offline only.** Truth source: the events WebSocket connection registry api-site already maintains. Friends response enriched with `is_online`; TanStack's ~30s refetch keeps dots fresh. Zero client-side detection code.
   - **v1.1 (small follow-up PR) — real "away".** Client-side idle detection in the events WS hook (Page Visibility API + debounced input listeners — DOM-level, works on every OS/browser; no OS idle APIs). After **5 min** idle/hidden → send `presence: away` over the existing socket; any input flips back. Server keeps per-connection state in memory (presence is ephemeral, never persisted), resolves multi-tab as any-active-wins, fans `presence_change` to connected friends.
   - **Never:** page-level activity ("Browsing Market") — surveillance granularity, cut.
   - Rejected: "WS closed <5min = away" — conflates away with recently-offline and lies in both directions (closed laptop = away; AFK with tab open = confident green dot).
7. **"In session · {campaign}" + Enter button:** derived client-side from data the dashboard already loads — a friend who is a member of one of *my* campaigns that has a live session. Mutual campaigns only (non-shared sessions aren't joinable anyway, and it avoids leaking activity outside shared context). Enter = the same enter-session flow the dashboard already has.
8. **Visual language:** carbon/onyx surfaces, smoke/silver text, Tier-2 uppercase section labels, standard smoke-primary/ghost buttons. Friend avatars = the **initial-disc pattern** from the nav account CTA, tinted with **character colors** (2026-07-19 character-color work) where the friend has one; palette fallback otherwise. Presence dots: green online, amber away (v1.1), dimmed row when away/offline.

## v1 scope

**Build:**
- Column-align SiteHeader contents (small wrapper; improves ultrawide independently)
- `SocialPanel` (+ small section components) mounted in the authenticated layout; composition over the **existing** friends/requests/notifications TanStack hooks and mutations — feature parity with the bell popover (unread badge, mark read, notification actions) and the corner widget (friend list, requests, add/remove) before both are deleted
- CTA swap in the nav (people icon + combined badge, replacing the bell)
- Retire the bottom-right friends collapsible
- **Inline add-friend** (added during build, Matt's call): the footer's Add Friend expands an in-panel flow — type-ahead tag lookup + send — instead of routing to `/account`. Lookup/validation extracted to `useAccountLookup` (shared with FriendsManager: the twice-used threshold met, so the debounced lookup + identifier regexes now have one home). Footer also shows **your own tag with copy** — the reciprocal half of trading tags.
- Backend: **none** — `is_online` already ships in the friends response (see current-state facts)

**Explicitly not in v1:** Live Pulse (v2, TODO filed) · away state (v1.1) · chat/DMs (don't exist) · achievements (don't exist) · page-level presence context (never) · any new NGINX routes (none needed).

## Verification (desktop, two browsers)

1. CTA badge counts unread + pending; opens/closes via CTA, ✕, Esc; panel survives dashboard tab navigation.
2. Friend requests: accept in panel → both browsers' lists update (query invalidation + WS event).
3. Notifications: campaign invite accept/decline from the panel; mark-all-read clears badge.
4. Presence: friend logs in/out → dot flips within the refetch window (~30s).
5. In-session: start a shared campaign's session in browser A → browser B's panel shows "In session" + Enter within the refetch window; Enter lands in the session.
6. Ultrawide: responsive-mode wide viewport → nav cluster, panel, and content stay glued to the column; no stranded UI. Old widget and bell fully gone (grep + visual).
7. `/code-review` before the commit proposal; all new frontend API calls use `authFetch` (site endpoints — unlike the game runtime's plain-fetch convention).

## Current-state facts (researched 2026-07-19)

- **`is_online` already exists** in the friends response (`friendship/api/schemas.py:35-49`), computed per-friend via `event_connection_manager.is_user_connected` (`endpoints.py:61`). **v1 presence therefore needs no backend work at all.** A batch `filter_connected` helper was considered and **rejected as ceremony**: `is_user_connected` is an O(1) in-memory dict check, so the loop costs nothing. (The *real* per-friend cost in `_to_friendship_response` is the `user_repo.get_by_id` DB lookup — pre-existing, small lists, out of scope; noted for whenever friend lists grow.)
- **Bell** (`shared/components/NotificationBell.js` + `NotificationPanel.js`): Headless Popover; badge = unread within the 7-most-recent window (`GET /api/notifications/unread` returns read+unread despite the name); rows navigate + mark-read (NO inline actions today); **the toast stack anchors to the bell** and must move to the new CTA (`toasts`/`onDismissToast` props from the layout's `useToast`).
- **FriendsWidget** (`dashboard/components/FriendsWidget.js`, mounted only in `dashboard/page.js:171-173`): friend list with `is_online` dots, **Buzz** (20s cooldown, `useBuzzFriend`), **invite-to-campaign** dropdown (hosted campaigns, disabled when already invited/member), request accept/decline, add-friend → `/account`. All logic lives in shared hooks — deleting the widget orphans nothing, but Buzz + invite must be re-homed in the panel (feature parity).
- **Hooks/endpoints:** `useFriendships` → `['friendships']`, `GET /api/friendships/` → `{accepted[], incoming_requests[], outgoing_requests[]}` (friend rows: `friend_id`, `friend_screen_name`, `friend_account_tag`, `is_online`). Mutations exist for accept/decline/remove/buzz/invite/send. `useNotifications` → `['notifications','unread']`; mark-read single/all. Campaign invite accept/decline: `useAcceptInvite`/`useDeclineInvite` (`useCampaignMutations.js:113-161`).
- **In-session derivation confirmed client-side:** `useCampaigns` merges members[] + sessions[] per campaign; live = any `sessions[].status === 'active'`. Friend ∈ `member_ids` of my campaign with a live session ⇒ "In session · {title}" + Enter.
- **Column value:** the dashboard's only real content frame is the tab strip's `max-w-[1410px]` (`TabNav.js:94`) — header contents and the panel align to that. SiteHeader's sole consumer is the authenticated layout (auth/game pages unaffected).
- **Known gaps NOT addressed here:** backend produces no `friend_request_declined`/`friend_removed` events (frontend config references them; peers see changes on refetch only). Notification actions today are navigate-only — the panel upgrades campaign-invite and friend-request notifications to inline accept/decline using the existing mutations.
- **Naming collision resolved:** the in-game seated-player list is called "fellowship panel" in `GameContent.js` comments — the dashboard component is `SocialPanel` in `shared/components/` (precedent: NotificationBell lived in shared, consumed dashboard hooks), so the terms no longer collide.
- **Friend disc tint:** friends' character colors aren't in the friendships response; v1 tints discs deterministically from the seat palette by hashing `friend_id` (stable, varied, zero backend). Enriching with real character colors is a future nicety.
