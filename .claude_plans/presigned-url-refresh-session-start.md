# Implementation Plan: Presigned S3 URL Refresh at Session Start

## Overview

Refresh presigned S3 URLs for ALL campaign assets during SESSION_STARTING phase. This guarantees assets are available for 24 hours once a session becomes ACTIVE.

**Problem**: Presigned URLs expire, causing silent image load failures. Currently URLs are generated once at asset selection and stored in MongoDB indefinitely.

**Solution**: Bulk refresh all campaign asset URLs at session start using parallel generation.

---

## Architecture

```
DM clicks "Start Session"
    ↓
SESSION_STARTING phase (~200-500ms for URL generation)
    ↓
api-site: Fetch campaign assets from PostgreSQL
    ↓
api-site: Parallel presigned URL generation (ThreadPoolExecutor)
    ↓
api-site → api-game: ETL with fresh URLs for ALL assets
    ↓
api-game: Store in MongoDB, broadcast to clients
    ↓
SESSION_ACTIVE - Assets guaranteed fresh for 24 hours
```

---

## Critical Files

| File | Action | Purpose |
|------|--------|---------|
| `api-site/modules/session/application/commands.py` | Modify | Add parallel URL generation in StartSession |
| `api-site/modules/session/api/endpoints.py` | Modify | Inject S3Service dependency |
| `api-site/shared/services/s3_service.py` | Reference | Existing S3Service.generate_download_url() |
| `api-game/schemas/session_schemas.py` | Reference | AssetRef already has `s3_url: Optional[str]` |
| `rollplay/app/dashboard/components/CampaignManager.js` | Modify | Add UI for SESSION_STARTING state |

---

## Implementation Tasks

### Task 1: Add Parallel URL Generation Method

**File**: `api-site/modules/session/application/commands.py`

Add imports and helper method to StartSession class:

```python
import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

class StartSession:
    def __init__(
        self,
        session_repository,
        user_repository,
        campaign_repository,
        event_manager,
        asset_repository=None,
        s3_service=None  # NEW
    ):
        ...
        self.s3_service = s3_service

    async def _generate_presigned_urls_parallel(self, assets, expiry=86400):
        """Generate presigned URLs for all assets in parallel."""
        if not self.s3_service or not assets:
            return {}

        def generate_url(s3_key):
            try:
                url = self.s3_service.generate_download_url(s3_key, expiry)
                return (s3_key, url)
            except Exception as e:
                logger.warning(f"Failed to generate URL for {s3_key}: {e}")
                return (s3_key, None)

        # Scale workers to CPU count (CPU-bound crypto work)
        # Minimum 2, maximum capped at asset count to avoid idle threads
        cpu_count = os.cpu_count() or 2
        max_workers = min(len(assets), cpu_count * 2)  # 2x cores for slight I/O slack

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            s3_keys = [asset.s3_key for asset in assets]
            futures = [loop.run_in_executor(executor, generate_url, key) for key in s3_keys]
            results = await asyncio.gather(*futures)

        logger.info(f"Generated URLs with {max_workers} workers on {cpu_count} CPUs")
        return {key: url for key, url in results if url is not None}
```

### Task 2: Modify Asset Payload Building

**File**: `api-site/modules/session/application/commands.py`

Update the section that builds the asset list (around lines 330-344):

```python
# Fetch campaign assets and generate fresh presigned URLs
assets = []
if self.asset_repo:
    campaign_assets = self.asset_repo.get_by_campaign_id(session.campaign_id)

    # Generate presigned URLs in parallel
    url_map = await self._generate_presigned_urls_parallel(campaign_assets)

    assets = [
        {
            "id": str(asset.id),
            "filename": asset.filename,
            "s3_key": asset.s3_key,
            "asset_type": asset.asset_type.value if hasattr(asset.asset_type, 'value') else str(asset.asset_type),
            "s3_url": url_map.get(asset.s3_key)  # Fresh presigned URL
        }
        for asset in campaign_assets
    ]

    logger.info(f"Generated {len(url_map)} presigned URLs for {len(assets)} assets")
```

### Task 3: Update Dependency Injection

**File**: `api-site/modules/session/api/endpoints.py`

Inject S3Service into the session start endpoint:

```python
from shared.services.s3_service import S3Service, get_s3_service

@router.post("/{session_id}/start")
async def start_session(
    session_id: UUID,
    current_user = Depends(get_current_user_from_token),
    session_repo = Depends(get_session_repository),
    user_repo = Depends(get_user_repository),
    campaign_repo = Depends(get_campaign_repository),
    asset_repo = Depends(get_media_asset_repository),
    event_manager = Depends(get_event_manager),
    s3_service: S3Service = Depends(get_s3_service)  # NEW
):
    command = StartSession(
        session_repo, user_repo, campaign_repo,
        event_manager, asset_repo, s3_service  # NEW
    )
    ...
```

### Task 4: Verify Environment Configuration

**File**: `.env`

Ensure 24-hour expiry is set:
```env
PRESIGNED_URL_EXPIRY=86400
```

---

## api-game Changes (None Required)

The existing schema already supports `s3_url`:

```python
# api-game/schemas/session_schemas.py
class AssetRef(BaseModel):
    id: str
    filename: str
    s3_key: str
    asset_type: str
    s3_url: Optional[str] = None  # Already present!
```

MongoDB will automatically store `s3_url` when included in the ETL payload.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Single URL fails | Log warning, continue with others |
| S3 service unavailable | Log error, return empty URL map, session still starts |
| All URLs fail | Session starts, assets won't load (existing behavior) |

**Principle**: URL generation failure should NOT block session start.

---

## Performance

Workers scale to CPU count: `min(asset_count, cpu_count * 2)`

| Assets | 2 vCPU (4 workers) | 8 vCPU (16 workers) |
|--------|-------------------|---------------------|
| 10 | ~100-200ms | ~50-100ms |
| 50 | ~500-1000ms | ~200-400ms |
| 100 | ~1-2 seconds | ~400-800ms |

Each URL generation is ~20-40ms (CPU-bound HMAC-SHA256 signing). Performance scales linearly with available cores.

---

## Verification Plan

1. **Start session with campaign assets** → Check api-site logs for "Generated X presigned URLs"
2. **Query MongoDB** → Verify `active_sessions.available_assets[].s3_url` is populated
3. **Frontend shows "Starting Session..."** → During startup, see spinner instead of Enter button
4. **Enter button appears** → Once status is `active`, Enter button becomes available
5. **Join as player** → Map images load without errors
6. **Wait 1+ hours** → Assets still load (24hr expiry vs old 1hr)
7. **Test S3 failure** → Mock S3 error, verify session still starts (graceful degradation)

---

## Frontend: Handle SESSION_STARTING State

### Task 5: Add STARTING State UI

**File**: `rollplay/app/dashboard/components/CampaignManager.js`

**Problem**: The `starting` status isn't handled in the session card UI. Users see nothing during the ~1-2s startup.

**Solution**: Add explicit handling for `game.status === 'starting'` in the button logic (around line 1584):

```javascript
{game.status === 'active' ? (
  // Existing Enter/Pause/Finish buttons
  <>
    <Button variant="primary" size="md" onClick={() => enterGame(game)}>
      <FontAwesomeIcon icon={faRightToBracket} className="mr-2" />
      Enter
    </Button>
    {/* ... host controls ... */}
  </>
) : game.status === 'starting' ? (
  // NEW: Show starting indicator - prevents entry until ACTIVE
  <div className="flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium"
       style={{backgroundColor: '#1e40af', color: '#fff'}}>
    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
    <span>Starting Session...</span>
  </div>
) : game.status === 'inactive' && campaign.host_id === user.id ? (
  // Existing Start button
  ...
```

**Result**:
- Users see "Starting Session..." spinner during URL generation
- Enter button only appears when status transitions to `active`
- Clear visual feedback during the startup phase

---

## Summary

- **Scope**: api-site backend + dashboard frontend
- **Backend**: Parallel URL generation during SESSION_STARTING
- **Frontend**: Show "Starting Session..." indicator before Enter is available
- **Performance**: ~500ms-2s for typical campaign on 2 vCPU
- **Expiry**: 24 hours (configurable via PRESIGNED_URL_EXPIRY)
- **Failure mode**: Graceful degradation, session always starts
