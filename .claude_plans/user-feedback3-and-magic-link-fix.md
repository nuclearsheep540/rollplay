# Plan: v0.19.0 Nitpicks and Magic Link Production Fix

## Status: ✅ ALL COMPLETE

## Issues Summary

| # | Issue | Status | Files Changed |
|---|-------|--------|---------------|
| 1 | Session start notification wording + redirect | ✅ Complete | eventConfig.js, session_events.py, commands.py |
| 2 | Campaign delete with non-finished sessions | ✅ Complete | commands.py (campaign), CampaignManager.js |
| 3 | ~~Friend requests section~~ | N/A | Resolved - already working |
| 4 | "Username" → "Account Name" label | ✅ Complete | AccountNameModal.js |
| 5 | Self-triggered notifications show "You" | ✅ Complete | eventConfig.js, AccountNotificationFeed.js |
| 6 | ~~Stale screen names in notifications~~ | N/A | Resolved - acceptable as historical record |
| 7 | Magic link broken in production | ✅ Complete | docker/prod/nginx/nginx.conf |

---

## Completed Changes

### Issue #7: Magic Link Production Fix (HIGH PRIORITY)
**Root Cause:** NGINX route mismatch - frontend calls `/api/auth/verify-otp` but prod NGINX only had `/auth/verify-otp`

**File:** `docker/prod/nginx/nginx.conf`
- Added `/api/auth/` catch-all route to match dev configuration

### Issue #4: "Username" → "Account Name"
**File:** `rollplay/app/dashboard/components/AccountNameModal.js`
- Changed title: "Create Username" → "Create Account Name"
- Changed label: "Username" → "Account Name"

### Issue #5: Self-Triggered Notifications Show "You"
**Files:**
- `rollplay/app/shared/config/eventConfig.js` - Updated `session_started` template with `currentUserId` parameter
- `rollplay/app/dashboard/components/AccountNotificationFeed.js` - Pass `userId` to `formatPanelMessage`

### Issue #1: Session Start Notification
**Files:**
- `rollplay/app/shared/config/eventConfig.js` - Changed message wording and `navigationTab` from 'sessions' to 'campaigns'
- `api-site/modules/session/domain/session_events.py` - Added `campaign_name` parameter
- `api-site/modules/session/application/commands.py` - Pass `campaign_name` to event

### Issue #2: Campaign Delete Validation
**Files:**
- `api-site/modules/campaign/application/commands.py` - Check all non-FINISHED sessions (not just ACTIVE)
- `rollplay/app/dashboard/components/CampaignManager.js` - Close modal on error, show backend message

---

## Verification Checklist

- [ ] **Issue #7:** Deploy NGINX config, test magic link in production
- [ ] **Issue #4:** Test new user account creation flow
- [ ] **Issue #5:** Start session as DM, verify "You started..." notification
- [ ] **Issue #1:** Start session, verify notification wording and click behavior
- [ ] **Issue #2:** Try to delete campaign with INACTIVE session, verify error message
