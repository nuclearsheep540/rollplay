# Audio Asset Library Migration Plan

## Summary
Replace hardcoded audio files in `public/audio/` with asset library integration, following the existing `MapSelectionSection` pattern. Add MUSIC and SFX as first-class asset types. Add an inline track selector UI alongside the existing mixer.

---

## Phase 1: Backend — Replace AUDIO with MUSIC and SFX Enum Values

### 1.1 Update MediaAssetType enum
**File**: `api-site/modules/library/domain/media_asset_type.py`
- Remove `AUDIO = "audio"`, add `MUSIC = "music"` and `SFX = "sfx"`
- Final Python enum: `MAP`, `IMAGE`, `MUSIC`, `SFX`
- Note: `'audio'` remains in the PostgreSQL enum type (PG can't remove enum values) but is unused — no code path can produce it

### 1.2 Create Alembic migration
- Manual migration (not autogenerate — enum changes need explicit SQL):
  ```sql
  ALTER TYPE media_asset_type ADD VALUE IF NOT EXISTS 'music';
  ALTER TYPE media_asset_type ADD VALUE IF NOT EXISTS 'sfx';
  ```
- Then data migration: `UPDATE media_assets SET asset_type = 'music' WHERE asset_type = 'audio'`

### 1.3 Update domain aggregate
**File**: `api-site/modules/library/domain/asset_aggregate.py`
- Update `change_type()`: audio content types (mp3/wav/ogg) can be changed between `MUSIC` and `SFX`
- No explicit rejection logic needed — removing AUDIO from the Python enum means Pydantic/SQLAlchemy naturally prevent it

### 1.4 Update schemas
**File**: `api-site/modules/library/schemas/asset_schemas.py`
- No new fields needed — `asset_type` field already handles this
- Ensure response serialization handles new enum values

### 1.5 Update API endpoints
**File**: `api-site/modules/library/api/endpoints.py`
- `GET /api/library/`: existing `asset_type` filter naturally works with `music`/`sfx` values
- **New endpoint**: `GET /api/library/{asset_id}/download-url` — returns fresh presigned download URL (for URL expiry during long sessions)

### 1.6 Update repository
**File**: `api-site/modules/library/repositories/asset_repository.py`
- No changes needed — existing `asset_type` filtering works with new enum values

---

## Phase 2: Frontend Hooks — Minor Updates

### 2.1 No changes to `useAssets` hook
- Already supports `assetType` filtering — just pass `'music'` or `'sfx'` instead of `'audio'`

### 2.2 No changes to `useUploadAsset` hook
- Already passes `asset_type` through — just pass `'music'` or `'sfx'` from callers

### 2.3 Create `fetchAudioDownloadUrl` utility
**New file**: `rollplay/app/asset_library/hooks/useAudioDownloadUrl.js`
- Simple async function: `fetchDownloadUrl(assetId)` → calls `GET /api/library/{assetId}/download-url`
- Used for URL refresh when presigned URLs expire during long game sessions

---

## Phase 3: Frontend — Track Selection UI

### 3.1 Create `AudioTrackSelector` component
**New file**: `rollplay/app/audio_management/components/AudioTrackSelector.js`

Inline collapsible section (same pattern as `MapSelectionSection` in `rollplay/app/game/components/MapSelectionModal.js`):
- 8 rows: Track A, B, C, D (BGM) + SFX 1, 2, 3, 4
- Each row: channel label | loaded filename (or "Empty") | "Select Audio" button
- Clicking "Select Audio" opens an inline `AudioSelectionModal` for that channel
- Props: `remoteTrackStates`, `onAssetSelected(channelId, asset)`, `campaignId`, `isExpanded`

### 3.2 Create `AudioSelectionModal` component
**New file**: `rollplay/app/audio_management/components/AudioSelectionModal.js`

Inline collapsible with two sub-sections (following `MapSelectionSection` pattern):

**Upload section**:
- Drag-and-drop / file picker for audio (mp3, wav, ogg)
- Auto-sets `assetType` based on channel: BGM channels → `'music'`, SFX channels → `'sfx'`
- Uses existing `useUploadAsset` hook with `assetType: 'music'|'sfx'`, `campaignId`
- On success: auto-associates with campaign, auto-selects for channel

**Library section**:
- Campaign-scoped query: `useAssets({ assetType: 'music'|'sfx', campaignId, enabled })`
- Full library query: `useAssets({ assetType: 'music'|'sfx', enabled })` filtered to exclude campaign assets
- "Add to Campaign" button uses existing `useAssociateAsset` hook
- Clicking a campaign asset selects it for the channel

### 3.3 Update component exports
**File**: `rollplay/app/audio_management/components/index.js`
- Export `AudioTrackSelector`

---

## Phase 4: Frontend — Audio Engine Changes

### 4.1 Update initial track state to empty
**File**: `rollplay/app/audio_management/hooks/useUnifiedAudio.js` (lines 112-124)
- Change all channels to `filename: null, asset_id: null, s3_url: null`
- Channels start empty, no hardcoded defaults

### 4.2 Add `loadAssetIntoChannel` function
**File**: `rollplay/app/audio_management/hooks/useUnifiedAudio.js`
- New function exposed from hook: `loadAssetIntoChannel(channelId, asset)`
- Updates track state with `{ filename: asset.filename, asset_id: asset.id, s3_url: asset.s3_url }`
- Does NOT start playback — DM uses existing play button

### 4.3 Update buffer loading to use S3 URLs
**File**: `rollplay/app/audio_management/hooks/useUnifiedAudio.js`

Key changes in `playRemoteTrack` (line 273):
- **Line 341**: Change buffer cache key from `${trackId}_${audioFile}` to `${trackId}_${assetId || audioFile}` (stable across URL refreshes)
- **Line 354**: Change `loadRemoteAudioBuffer(`/audio/${audioFile}`, trackId)` to use `s3_url` from track state, falling back to `/audio/${audioFile}` for backward compat

### 4.4 Update `loadRemoteAudioBuffer` with retry on 403
**File**: `rollplay/app/audio_management/hooks/useUnifiedAudio.js` (line 169)
- If fetch returns 403 (expired presigned URL), call `fetchDownloadUrl(assetId)` for a fresh URL and retry
- Low priority — acceptable to skip for MVP since buffers are cached after first load

### 4.5 Expose new function from hook return
**File**: `rollplay/app/audio_management/hooks/useUnifiedAudio.js` (line 863)
- Add `loadAssetIntoChannel` to the return object

---

## Phase 5: Frontend — WebSocket Integration

### 5.1 Update send-side: include `asset_id` and `s3_url` in play operations
**File**: `rollplay/app/audio_management/components/AudioMixerPanel.js`
- In `handlePlay` (around line 371): add `asset_id` and `s3_url` from track state to play operation payload

### 5.2 Update receive-side: use `s3_url` for loading
**File**: `rollplay/app/audio_management/hooks/webSocketAudioEvents.js`
- **Line 29** (`handleRemoteAudioPlay`): Change `loadRemoteAudioBuffer(`/audio/${filename}`, channelId)` → use `track.s3_url || `/audio/${filename}``
- **Line 33**: Update buffer cache key to use `asset_id` when available
- **Line 163** (`handleRemoteAudioBatch` single): Same URL change
- **Line 257** (`handleRemoteAudioBatch` synchronized): Same URL change
- On receive, update local track state with `asset_id` and `s3_url` from the incoming event

### 5.3 Backend WebSocket — No changes needed
The `api-game/websocket_handlers/websocket_events.py` passes through operation objects unchanged. `asset_id` and `s3_url` are just additional fields that get broadcast automatically.

---

## Phase 6: Wire Into DMControlCenter

### 6.1 Add `AudioTrackSelector` to DMControlCenter
**File**: `rollplay/app/game/components/DMControlCenter.js`
- Add new collapsible section above `AudioMixerPanel` (line 684)
- Use existing `expandedSections` pattern (add `trackSelect` key)
- Pass: `campaignId`, `remoteTrackStates`, `loadAssetIntoChannel`

### 6.2 Thread `loadAssetIntoChannel` through game page
**File**: `rollplay/app/game/page.js`
- Destructure `loadAssetIntoChannel` from `useUnifiedAudio()` return
- Pass it through to `DMControlCenter` props

### 6.3 Disable play button for empty channels
**File**: `rollplay/app/audio_management/components/AudioMixerPanel.js`
- In play button rendering, disable when `trackState.filename === null`

---

## Phase 7: Cleanup & Asset Library UI Updates

### 7.1 Remove hardcoded audio files
- Delete files from `rollplay/public/audio/` EXCEPT `sword.mp3` (still used for local combat start sound at `useUnifiedAudio.js:50`)

### 7.2 Update AssetLibraryManager filters
**File**: `rollplay/app/asset_library/components/AssetLibraryManager.js`
- Replace "Audio" sub-filter tab with "Music" and "SFX" tabs (required since `audio` is no longer a valid asset_type)

### 7.3 Update AssetUploadModal
**File**: `rollplay/app/asset_library/components/AssetUploadModal.js`
- Replace the "Audio" upload type button with "Music" and "SFX" buttons
- Same accepted file types (mp3, wav, ogg) for both

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Audio typing | MUSIC and SFX as first-class `MediaAssetType` enum values | Simpler — no new columns, uses existing `asset_type` filtering throughout |
| WebSocket payload | Broadcast `asset_id` + `s3_url` + `filename` | All clients can fetch audio directly; backward compatible with `/audio/` paths |
| Buffer cache key | `${trackId}_${assetId}` instead of URL | Stable across presigned URL refreshes |
| Campaign association | Auto-associate on upload/select (MapSelectionSection pattern) | Consistent UX with map controls |
| Empty channels | Channels start empty, no defaults | Clean slate; DM loads what they need |
| URL expiry | Accept 1hr presigned URLs, add refresh endpoint | Buffers are cached after first load; refresh is edge case for late-joining players |

---

## Files Modified (Summary)

**Backend (api-site)**:
- `modules/library/domain/media_asset_type.py` — add MUSIC and SFX enum values, remove AUDIO
- `modules/library/domain/asset_aggregate.py` — update `change_type()` for MUSIC/SFX
- `modules/library/api/endpoints.py` — add download-url endpoint
- `alembic/versions/` — new migration (add enum values + migrate existing data)

**Frontend (rollplay — asset library updates)**:
- `app/asset_library/components/AssetLibraryManager.js` — replace "Audio" filter with "Music"/"SFX"
- `app/asset_library/components/AssetUploadModal.js` — replace "Audio" button with "Music"/"SFX"

**Frontend (rollplay — audio management)**:
- `app/asset_library/hooks/useAudioDownloadUrl.js` — **NEW** (URL refresh utility)
- `app/audio_management/components/AudioTrackSelector.js` — **NEW** (track selector UI)
- `app/audio_management/components/AudioSelectionModal.js` — **NEW** (upload/library picker)
- `app/audio_management/components/index.js` — updated exports
- `app/audio_management/hooks/useUnifiedAudio.js` — empty defaults, S3 URL loading, new function
- `app/audio_management/hooks/webSocketAudioEvents.js` — use S3 URLs in handlers
- `app/audio_management/components/AudioMixerPanel.js` — send asset_id/s3_url, disable empty channels
- `app/game/components/DMControlCenter.js` — add track selector section
- `app/game/page.js` — thread new prop

---

## Verification

1. **Backend**: Start dev environment, run `alembic upgrade head`, verify enum migration applied and existing audio assets migrated to `music`
2. **Upload flow**: Upload an audio file via asset library with new "Music" or "SFX" type button, verify correct `asset_type` persisted
3. **Track selector UI**: Open DM Control Center in game, verify 8 channel rows appear (Track A-D + SFX 1-4)
4. **Select from library**: Click "Select Audio" on a BGM channel, verify only music assets show; on SFX channel, verify only sfx assets show
5. **Playback**: Hit play on a channel with a loaded asset, verify audio plays from S3 URL
6. **WebSocket sync**: Verify other clients receive the play event and load audio from S3
7. **Empty channel guard**: Verify play button is disabled when no asset is loaded
