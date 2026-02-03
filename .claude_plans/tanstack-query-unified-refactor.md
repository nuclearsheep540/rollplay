# Unified Frontend Refactor: TanStack Query Adoption

## Summary

Adopt TanStack Query as the data-fetching layer for both the **asset library** and **dashboard/campaign data**, unifying three existing plans:
- `campaign-derived-state-refactor.md` — selectedCampaign copy-drift fix
- `dashboard-rerendering-analysis.md` — refreshTrigger cascade + re-render fixes
- `frontend-stack-asset-library-v2.md` — TanStack Query + Headless UI for asset library

The plans are interconnected: the derived state fix (Plan 1) is a prerequisite for Plan 2's solutions, and TanStack Query (Plan 3) structurally solves the class of problems both plans address manually.

---

## Phase 1: Foundation + Asset Library (Branch: `library-stack-improvements`)

### 1.1 Install & Provider Setup

- `npm install @tanstack/react-query`
- Create `rollplay/app/shared/providers/QueryProvider.js` — `'use client'` component wrapping `QueryClientProvider`
  - `staleTime: 30s`, `refetchOnWindowFocus: false`, `retry: 1`
- Modify `rollplay/app/layout.js` — wrap `{children}` in `<QueryProvider>`

### 1.2 Asset Library TanStack Hooks

Replace `useAssetLibrary.js` (manual useState/useEffect) with individual hooks:

| New File | Replaces |
|----------|----------|
| `asset_library/hooks/useAssets.js` | `fetchAssets()` + `assets`/`loading`/`error` state |
| `asset_library/hooks/useUploadAsset.js` | `uploadAsset()` + `uploading`/`uploadProgress` state |
| `asset_library/hooks/useDeleteAsset.js` | `deleteAsset()` + manual state removal |
| `asset_library/hooks/useAssociateAsset.js` | `associateWithCampaign()` + manual state update |

Query keys: `['assets']`, `['assets', { type: 'map' }]`
Mutations invalidate `['assets']` on success — no manual refetch needed.

Upload progress: companion `useState` inside `useUploadAsset` updated at step boundaries (20%/70%/100%).

### 1.3 Migrate Consumers

- **`asset_library/components/AssetLibraryManager.js`** — replace `useAssetLibrary()` with new hooks. Remove the `useEffect` that calls `fetchAssets()` on filter change (TanStack handles this via query key changes).
- **`game/components/MapSelectionModal.js`** — replace duplicated fetch logic with shared `useAssets('map')` hook. Use `useUploadAsset` and `useAssociateAsset` mutations.
- **`asset_library/index.js`** — add new hook exports.
- **`asset_library/hooks/useAssetLibrary.js`** — deprecate (delete in Phase 3).

### 1.4 Headless UI for Asset Library (optional, if bandwidth)

Headless UI is already installed. Candidate components:
- Type filter tabs → `Tab.Group` (keyboard nav, ARIA)
- Upload modal → `Dialog` (focus trapping, escape-to-close)
- Asset type selector → `Listbox` (accessible dropdown)

---

## Phase 2: Campaign Data Layer (Separate PR)

### 2.1 Campaign Query Hooks

| New File | Replaces |
|----------|----------|
| `dashboard/hooks/useCampaigns.js` | `fetchCampaigns()` waterfall + `campaigns`/`invitedCampaigns`/`allSessions` state |
| `dashboard/hooks/useInvitedCampaignMembers.js` | useEffect that fetches members on invited campaign expand (lines 872-899) |
| `dashboard/hooks/useCharacters.js` | `fetchCharacters()` + characters state |

`useCampaigns` queryFn: same waterfall internally (fetch campaigns → members in parallel → sessions in parallel). Returns `{ campaigns, invitedCampaigns }`. Query key: `['campaigns']`.

`useInvitedCampaignMembers(campaignId)`: enabled only when `campaignId` is set. Query key: `['campaigns', campaignId, 'members']`.

### 2.2 Campaign Mutation Hooks

| New File | Contains |
|----------|----------|
| `dashboard/hooks/mutations/useCampaignMutations.js` | `useCreateCampaign`, `useUpdateCampaign`, `useDeleteCampaign`, `useAcceptInvite`, `useDeclineInvite`, `useLeaveCampaign`, `useRemovePlayer` |
| `dashboard/hooks/mutations/useSessionMutations.js` | `useCreateSession`, `useStartSession`, `usePauseSession`, `useFinishSession`, `useDeleteSession` |
| `dashboard/hooks/mutations/useCharacterMutations.js` | `useSelectCharacter`, `useReleaseCharacter` |

All mutations invalidate `['campaigns']` on success. Mutation `isPending` replaces manual `isDeleting`/`isCreating` flags.

### 2.3 WebSocket → TanStack Bridge

Create `dashboard/hooks/useEventQueryInvalidation.js`:
- Uses `useQueryClient()` internally
- Exposes `invalidateCampaigns()` and `invalidateSessions(campaignId)`
- Called in `page.js` — WebSocket event handlers call invalidation methods instead of `setRefreshTrigger(prev => prev + 1)`

Modify `dashboard/page.js`:
- Campaign-related event handlers use `invalidation.invalidateCampaigns()` instead of `setRefreshTrigger`
- Session events use `invalidation.invalidateSessions(campaignId)`
- `refreshTrigger` kept temporarily for non-campaign components (FriendsWidget, SocialManager, etc.)
- Remove `updateGameState`, `campaignUpdateHandlers`, `onCampaignUpdate` prop

### 2.4 Fix selectedCampaign Copy-Drift (Plan 1)

In `CampaignManager.js`:
```javascript
// BEFORE: copy that drifts
const [selectedCampaign, setSelectedCampaign] = useState(null)

// AFTER: ID + derivation from query cache
const [selectedCampaignId, setSelectedCampaignId] = useState(null)
const selectedCampaign = useMemo(
  () => campaigns.find(c => c.id === selectedCampaignId) ?? null,
  [campaigns, selectedCampaignId]
)
```

Same pattern for `selectedInvitedCampaign` → `selectedInvitedCampaignId`.

### 2.5 Remove Dead useEffects (Plan 2)

| Effect (CampaignManager.js) | Action |
|------------------------------|--------|
| Lines 801-805 (`[refreshTrigger]` → fetchCampaigns) | REMOVE — replaced by `useCampaigns()` |
| Lines 902-914 (sync invite modal campaign data) | REMOVE — modal reads from derived `selectedCampaign` |
| Lines 943-953 (duplicate of above) | REMOVE |
| Lines 955-967 (sync selectedCampaign via JSON.stringify) | REMOVE — fixed by derived state |
| Lines 969-974 (expose handleSessionUpdate to parent) | REMOVE — WebSocket bridge handles this |
| Lines 872-899 (fetch invited campaign members) | REPLACE with `useInvitedCampaignMembers` hook |

### 2.6 Replace Consolidated Modal State (Plan 2)

Replace the single `modals` object (9 sub-objects, lines 66-76) with individual target states:
```javascript
const [deleteCampaignTarget, setDeleteCampaignTarget] = useState(null)
const [inviteModalCampaign, setInviteModalCampaign] = useState(null)
// ... etc — modal is "open" when target is non-null
```

Eliminates `openModal`/`closeModal`/`updateModalData` helpers and the cascading re-render from object spread.

### 2.7 Fix Conditional Ref Assignment (Plan 2)

Replace `ref={isSelected ? campaignCardRef : null}` with stable ref — always assigned, drawer calculation effects already handle the null case internally.

---

## Phase 3: Cleanup (Deferred, Separate PRs)

- Migrate FriendsWidget, SessionsManager, SocialManager off `refreshTrigger`
- Remove `refreshTrigger` state from `page.js` entirely once all consumers migrated
- Delete `useAssetLibrary.js`
- Consolidate drawer position calculations (single ResizeObserver instead of 4 timeouts)

---

## Files Summary

### New Files
| File | Phase |
|------|-------|
| `shared/providers/QueryProvider.js` | 1 |
| `asset_library/hooks/useAssets.js` | 1 |
| `asset_library/hooks/useUploadAsset.js` | 1 |
| `asset_library/hooks/useDeleteAsset.js` | 1 |
| `asset_library/hooks/useAssociateAsset.js` | 1 |
| `dashboard/hooks/useCampaigns.js` | 2 |
| `dashboard/hooks/useInvitedCampaignMembers.js` | 2 |
| `dashboard/hooks/useCharacters.js` | 2 |
| `dashboard/hooks/mutations/useCampaignMutations.js` | 2 |
| `dashboard/hooks/mutations/useSessionMutations.js` | 2 |
| `dashboard/hooks/mutations/useCharacterMutations.js` | 2 |
| `dashboard/hooks/useEventQueryInvalidation.js` | 2 |

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `package.json` | 1 | Add `@tanstack/react-query` |
| `app/layout.js` | 1 | Wrap in QueryProvider |
| `asset_library/components/AssetLibraryManager.js` | 1 | Use TanStack hooks |
| `game/components/MapSelectionModal.js` | 1 | Use shared asset hooks |
| `asset_library/index.js` | 1 | Export new hooks |
| `dashboard/page.js` | 2 | WebSocket invalidation bridge |
| `dashboard/components/CampaignManager.js` | 2 | Major refactor: TanStack hooks, derived state, modal cleanup, ref fix |

---

## Verification

### Phase 1
1. Asset library loads and displays assets (filter by type works)
2. Upload asset → appears in grid without manual refresh
3. Delete asset → disappears from grid without manual refresh
4. MapSelectionModal shows campaign maps correctly
5. Upload from within MapSelectionModal works
6. Tab switching between asset types fetches correctly (check Network tab — no duplicate requests)

### Phase 2
1. Dashboard loads campaigns with members and sessions
2. Expand campaign → shows current data (not stale)
3. Send invite → reopen modal → shows "Invite pending" (not stale)
4. Player accepts invite (other session) → host reopens modal → shows "Already in campaign" (WebSocket → invalidation → fresh data)
5. Remove player → invite modal shows player available again
6. Start/pause/finish session → UI updates without full page flash
7. Open/close modals → no visible re-render of unrelated components
8. Campaign cards expand/collapse without visual "reset"

---

## Design Decisions

- **Asset library first**: Lower risk, proves TanStack pattern before tackling the complex CampaignManager
- **WebSocket bridge as hook** (not provider): Avoids over-engineering, `useEvents` hook is already well-structured
- **Single `useCampaigns` query** (not separate queries per campaign): Campaigns, members, and sessions always needed together in CampaignManager
- **Individual modal states** (not consolidated object): Prevents cascading re-renders from object spread
- **`refreshTrigger` kept temporarily**: Non-campaign components (friends, social) stay as-is until Phase 3
