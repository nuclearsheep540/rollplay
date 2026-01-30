# Plan: Campaign Derived State Refactor

## Problem Summary

The CampaignManager component has a fundamental state management issue: `selectedCampaign` is stored as a **separate copy** of campaign data rather than being **derived** from the `campaigns` array. This causes state drift whenever campaigns are updated externally (WebSocket events, fetches, optimistic updates).

### Symptoms Observed

1. After player accepts invite, host's modal shows "Invite pending" instead of "Already in campaign"
2. After removing a player, invite modal shows stale member list
3. After sending an invite, reopening modal loses pending invite status
4. Any WebSocket-triggered refresh updates `campaigns` but not `selectedCampaign`

### Root Cause

```javascript
// Current: Two separate pieces of state that can drift
const [campaigns, setCampaigns] = useState([])
const [selectedCampaign, setSelectedCampaign] = useState(null)  // COPY of data
```

When `campaigns` is updated, `selectedCampaign` remains stale because it's a snapshot, not a live reference.

---

## Solution: Derived State Pattern

Replace the copied state with derived state:

```javascript
// New: Single source of truth with derived value
const [campaigns, setCampaigns] = useState([])
const [selectedCampaignId, setSelectedCampaignId] = useState(null)  // Just the ID

// Derived - always fresh from campaigns array
const selectedCampaign = useMemo(
  () => campaigns.find(c => c.id === selectedCampaignId) || null,
  [campaigns, selectedCampaignId]
)
```

### Why This Works

1. **Single source of truth**: `campaigns` array is the only place campaign data lives
2. **Always fresh**: `selectedCampaign` is computed from current `campaigns` on every render
3. **No sync needed**: Can't get out of sync because it's derived, not stored
4. **Safe optimistic updates**: Update `campaigns` once, all derived values update automatically

---

## Implementation Plan

### Phase 1: Update State Declaration

**File:** `/rollplay/app/dashboard/components/CampaignManager.js`

```javascript
// Before (around line 42)
const [selectedCampaign, setSelectedCampaign] = useState(null)

// After
const [selectedCampaignId, setSelectedCampaignId] = useState(null)

// Add derived value (around line 50, after all useState calls)
const selectedCampaign = useMemo(
  () => campaigns.find(c => c.id === selectedCampaignId) || null,
  [campaigns, selectedCampaignId]
)
```

### Phase 2: Update All setSelectedCampaign Calls

Find all places where `setSelectedCampaign(campaign)` is called and change to `setSelectedCampaignId(campaign?.id || null)`.

**Key locations to update:**

1. **toggleCampaignDetails** (expand/collapse campaign)
   ```javascript
   // Before
   setSelectedCampaign(campaign)

   // After
   setSelectedCampaignId(campaign?.id || null)
   ```

2. **handleCampaignInviteSuccess** - Remove the `setSelectedCampaign` call entirely (no longer needed)

3. **removePlayerFromCampaign** - Remove the `setSelectedCampaign` call entirely

4. **Any useEffect that sets selectedCampaign** - Update to use ID

5. **expandCampaignId handling** - Update to set ID not object

### Phase 3: Update Modal Opening

Modals that receive `selectedCampaign` should continue to work because the derived value is always fresh:

```javascript
// This stays the same - selectedCampaign is now always current
onClick={() => openModal('campaignInvite', { campaign: selectedCampaign })}
```

### Phase 4: Remove Sync UseEffects

Delete any useEffects that were syncing `selectedCampaign` with `campaigns`:

- Remove the Phase 14 sync useEffect (if it was added)
- Remove any duplicate sync logic

### Phase 5: Enable Optimistic Updates (Optional)

With derived state working, we can safely re-enable optimistic updates:

```javascript
const handleCampaignInviteSuccess = async (updatedCampaign) => {
  // Just update campaigns - selectedCampaign derives automatically
  setCampaigns(prev => prev.map(c =>
    c.id === updatedCampaign.id ? { ...c, ...updatedCampaign } : c
  ))
  // No need to update selectedCampaign - it's derived!
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `/rollplay/app/dashboard/components/CampaignManager.js` | All changes below |

### Specific Changes

1. **Line ~42**: Change `useState(null)` to `useState(null)` for ID
2. **Line ~50**: Add `useMemo` for derived `selectedCampaign`
3. **All `setSelectedCampaign(x)` calls**: Change to `setSelectedCampaignId(x?.id || null)`
4. **Remove**: Any sync useEffects for selectedCampaign
5. **Update imports**: Add `useMemo` to React imports if not present

---

## Search Patterns for Finding All Usages

```bash
# Find all setSelectedCampaign calls
grep -n "setSelectedCampaign" rollplay/app/dashboard/components/CampaignManager.js

# Find all selectedCampaign references (to verify they still work)
grep -n "selectedCampaign" rollplay/app/dashboard/components/CampaignManager.js
```

---

## Verification Plan

### Test 1: Basic Expand/Collapse
1. Click on a campaign to expand it
2. Verify campaign details show correctly
3. Click again to collapse
4. Verify it collapses

### Test 2: Invite Flow (Host Side)
1. Expand a campaign
2. Open invite modal
3. Invite a friend
4. Close modal
5. Reopen modal
6. **Verify**: Friend shows "Invite pending"

### Test 3: Accept Flow (Host Side)
1. Host expands campaign and opens invite modal
2. Host invites a player
3. Host closes modal
4. Player accepts (in another session)
5. Host waits for WebSocket notification
6. Host reopens invite modal
7. **Verify**: Player shows "Already in campaign"

### Test 4: Remove Player Flow
1. Host expands campaign
2. Host removes a player from member list
3. Host opens invite modal
4. **Verify**: Removed player is available to invite again

### Test 5: Page Refresh Consistency
1. Expand a campaign
2. Refresh the page
3. Navigate back to campaigns tab
4. **Verify**: No campaign is expanded (correct behavior)

---

## Rollback Plan

If issues arise, revert to the previous approach:
1. Change `selectedCampaignId` back to `selectedCampaign`
2. Remove the `useMemo`
3. Change all `setSelectedCampaignId` back to `setSelectedCampaign`

The git diff will show exactly what was changed for easy reversal.

---

## Benefits After Refactor

1. **No more state drift**: `selectedCampaign` is always current
2. **Simpler mental model**: One source of truth for campaign data
3. **Safe optimistic updates**: Can update `campaigns` without worrying about sync
4. **Less code**: Remove all sync useEffects and duplicate state updates
5. **Better performance**: `useMemo` only recomputes when dependencies change
6. **Easier debugging**: State issues can only come from `campaigns` array

---

## Priority

**Medium** - Current `fetchCampaigns()` approach works but is suboptimal. This refactor should be done when there's time for proper testing, not as an urgent fix.
