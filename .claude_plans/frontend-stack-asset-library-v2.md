# Frontend Stack & Asset Library V2

## Summary

Technical decisions and implementation plan for adopting TanStack Query + Headless UI into the asset library, based on PR feedback discussion on the `assets-poc` branch. This replaces hand-rolled fetch/state management and interactive component boilerplate with maintained libraries.

---

## Technical Decisions

### Frontend Stack Convention (New Code)

| Layer | Tool | Responsibility |
|-------|------|----------------|
| **Layout & spacing** | Tailwind CSS | `flex`, `grid`, `gap`, `p-4`, `rounded`, etc. |
| **Colours & theme** | `colorTheme.js` | All colour values via `style={}` — single source of truth |
| **Interactive behaviour** | Headless UI | Dropdowns, modals, tabs, menus — no styling opinions |
| **Server state** | TanStack Query | Fetching, caching, mutations, cache invalidation |

**Rule**: Each layer owns a distinct concern with no overlap. Existing components stay as-is; new components follow this convention. No rewrite of existing code.

### Asset Type Assignment (Upload UX)

**Decision**: Smart defaults + batch-level selector

- Upload dialog shows a visible type selector pre-populated based on context
- Audio files (`audio/*` MIME) auto-assign to `audio`
- Image files default to current view filter tab, or `map` if on "all" (most common image upload for D&D)
- User can override the batch type in one click before confirming upload
- No per-file type selection (bad multi-file UX)
- No unassigned/deferred classification (adds workflow friction)

---

## Implementation Plan

### Phase 1: Install Dependencies

**Files**:
- `rollplay/package.json`

**Steps**:
1. Install TanStack Query: `@tanstack/react-query`
2. Install Headless UI: `@headlessui/react`
3. Optional: `react-dropzone` for drag-and-drop (~2KB)

**Setup**:
- Add `QueryClientProvider` wrapper in `app/layout.js`
- Configure default query options (staleTime, refetch behaviour)

---

### Phase 2: TanStack Query — Asset Library Data Layer

Replace hand-rolled `useState`/`useEffect` fetch patterns in the asset library with TanStack Query hooks.

**New file**: `rollplay/app/asset_library/hooks/useAssets.js`

Shared hooks for asset data:
```
useAssets(campaignId?, assetType?)  — fetches asset list
useUploadAsset()                   — mutation: upload flow (get URL → PUT S3 → confirm)
useDeleteAsset()                   — mutation: delete + cache invalidation
useAssociateAsset()                — mutation: associate with campaign
```

**Modified files**:
- `rollplay/app/asset_library/components/AssetLibraryManager.js` — replace fetch logic with `useAssets()` hook
- `rollplay/app/asset_library/components/AssetUploadModal.js` — replace upload logic with `useUploadAsset()` mutation
- `rollplay/app/asset_library/components/AssetGrid.js` — receives data from parent, no fetch logic changes
- `rollplay/app/asset_library/components/AssetCard.js` — delete uses `useDeleteAsset()` mutation

**What this eliminates**:
- Manual `useState` for assets, loading, error
- Manual `useEffect` for fetching on mount / filter change
- Manual refetch after upload/delete/associate
- Manual cache management

---

### Phase 3: Headless UI — Interactive Components

Replace hand-rolled interactive behaviour with Headless UI components.

**Asset library components to refactor**:

1. **Type filter tabs** (All / Maps / Audio / Images)
   - Current: manual button group with `useState` for active tab
   - Replace with: `Tab.Group` / `Tab.List` / `Tab` — keyboard nav, ARIA roles handled automatically

2. **Upload modal**
   - Current: manual modal with open/close state
   - Replace with: `Dialog` — focus trapping, escape-to-close, click-outside, ARIA handled

3. **Asset type selector** (batch-level on upload)
   - New component using `Listbox` — dropdown with keyboard nav, accessibility
   - Pre-populated via MIME detection + current tab context

4. **Delete confirmation**
   - Current: manual confirm modal
   - Replace with: `Dialog` — same benefits as upload modal

5. **Asset card actions menu** (if added later)
   - Use `Menu` — accessible dropdown menu for per-card actions

**Styling approach**: All Headless UI components styled with Tailwind layout classes + `colorTheme.js` colour values. Zero styling from Headless UI itself.

---

### Phase 4: Multi-File Upload with Type Assignment

Build on Phase 2 (TanStack) + Phase 3 (Headless UI) to implement multi-file upload with smart type defaults.

**Upload flow**:
1. User drags/drops or selects multiple files
2. File queue renders with:
   - Audio files: auto-assigned, shown with "Audio" badge (locked)
   - Image files: shown with `Listbox` dropdown defaulting to current tab / "Map"
3. User can change the batch type selector (one click, applies to all images)
4. User clicks "Upload All"
5. `useUploadAsset()` mutation fires for each file (parallel)
6. On all complete: `queryClient.invalidateQueries(['assets'])` — grid auto-updates

**New/modified files**:
- `rollplay/app/asset_library/components/AssetUploadModal.js` — multi-file queue UI, batch type selector
- `rollplay/app/asset_library/hooks/useAssets.js` — `useUploadAsset` handles sequential: getUrl → PUT → confirm per file

---

### Phase 5: Game Map Selector (TanStack Migration)

Migrate the in-game map selector (`MapSelectionModal.js`) to use TanStack Query for consistency.

**Modified files**:
- `rollplay/app/game/components/MapSelectionModal.js` — replace fetch logic with `useAssets(campaignId, 'map')` hook
- Upload-within-game uses same `useUploadAsset()` mutation

---

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `@tanstack/react-query` | Server state management | ~13KB gzipped |
| `@headlessui/react` | Accessible interactive components | ~12KB gzipped |
| `react-dropzone` (optional) | Drag-and-drop file zone | ~2KB gzipped |

---

## What This Does NOT Change

- **Backend**: No API changes needed. TanStack Query calls the same endpoints.
- **Existing components outside asset library**: Stay as-is. No rewrite.
- **Tailwind CSS**: Stays. Used for layout/spacing in all components.
- **colorTheme.js**: Stays. Single source of truth for colours.
- **S3 upload pattern**: Same presigned URL flow (frontend → api-site → S3).

---

## Migration Strategy

- **No big bang rewrite.** Phases can be implemented incrementally.
- **Asset library is the pilot.** If the stack works well here, apply the same pattern to other domains (audio management, dashboard) as they're touched.
- **Existing fetch patterns coexist.** TanStack Query and manual `useEffect` fetching can live side by side — no need to migrate everything at once.
