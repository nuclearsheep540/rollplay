# Dashboard Re-Rendering Analysis

## Concern

The dashboard exhibits visible full re-renders (or mount/unmount cycles) when certain states change. Components appear to "flash" or reset rather than updating smoothly in place.

---

## Root Causes Identified

### 1. Cascading `refreshTrigger` Pattern (CRITICAL)

**Location**: `rollplay/app/dashboard/page.js` → `CampaignManager.js`

The parent `page.js` increments `refreshTrigger` for many WebSocket events:
- Friend requests (received/accepted/declined)
- Campaign invites
- Session updates
- Player removals

Each increment triggers a **full `fetchCampaigns()`** call that:
1. Fetches all campaigns from API
2. Fetches members for each campaign
3. Fetches sessions for each campaign
4. Creates **new array references**, triggering all dependent effects

**Impact**: Heavy API calls + cascading re-renders throughout the component tree.

---

### 2. Multiple useEffects Depending on `campaigns` Array

**Location**: `CampaignManager.js` lines 770-787, 820-832, 862-871

```javascript
// Lines 770-787
useEffect(() => { ... }, [expandCampaignId, campaigns, loading])

// Lines 820-832 - Effect 1
useEffect(() => { ... }, [campaigns])

// Lines 862-871 - Effect 2 (DUPLICATE of above)
useEffect(() => { ... }, [campaigns])
```

Since `campaigns` is a **new array reference** after every fetch, all these effects fire even when the actual data hasn't meaningfully changed.

**Impact**: 3+ effect executions per refresh, each potentially updating state.

---

### 3. Modal State Object Spread Pattern

**Location**: `CampaignManager.js` lines 74-93

```javascript
const openModal = (modalName, data = {}) => {
  setModals(prev => ({
    ...prev,
    [modalName]: { ...prev[modalName], open: true, ...data }
  }))
}
```

Every modal update creates **new object references** for all modal states, not just the one being modified. Child components receiving modal props see "new" objects even if their specific modal didn't change.

**Impact**: Sibling modal components re-render unnecessarily.

---

### 4. Conditional Ref Assignment

**Location**: `CampaignManager.js` lines 1050, 1347

```javascript
ref={isSelected ? campaignCardRef : null}
```

When `isSelected` changes, the ref unmounts from one element and mounts to another. This can cause:
- DOM node detachment/reattachment
- Loss of focus states
- Event listener cleanup/recreation

**Impact**: Cards appear to visually "reset" when expanded/collapsed.

---

### 5. Expensive Drawer Position Calculations

**Location**: `CampaignManager.js` lines 887-919

The drawer position effect schedules **4 timeout-based DOM measurements** (at 50ms, 150ms, 300ms, 500ms) every time `selectedCampaign` changes. Combined with re-renders from other sources, this can cause layout thrashing.

---

## Summary Table

| Issue | Location | Frequency | Severity |
|-------|----------|-----------|----------|
| refreshTrigger full refetches | page.js | Per WebSocket event | CRITICAL |
| campaigns array dependency | CampaignManager.js:770-871 | Every refresh | HIGH |
| Duplicate useEffects | CampaignManager.js:820,862 | Every refresh | MEDIUM |
| Modal state spreads | CampaignManager.js:74-93 | Per modal action | MEDIUM |
| Conditional ref assignment | CampaignManager.js:1050,1347 | On expand/collapse | LOW |

---

## Potential Solutions (For Future Reference)

### High Impact
1. **Targeted state updates** - Update specific campaign in array instead of full refetch
2. **Effect consolidation** - Merge duplicate `[campaigns]` effects into one
3. **Optimistic UI** - Update state locally first, sync with server async

### Medium Impact
4. **Stable modal state** - Use individual `useState` per modal or memoize
5. **Memoization** - `useMemo` for derived data, `useCallback` for handlers

### Lower Impact
6. **Stable refs** - Always assign ref, use CSS/state for visibility
7. **Debounce drawer calculations** - Single delayed measurement instead of 4

---

## Files Involved

- **Primary**: `rollplay/app/dashboard/components/CampaignManager.js`
- **Parent**: `rollplay/app/dashboard/page.js` (refreshTrigger pattern)
- **Related**: `rollplay/app/dashboard/components/DashboardLayout.js`
