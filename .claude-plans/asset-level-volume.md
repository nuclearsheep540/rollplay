# Asset-Level Volume: Move Volume from Channel to Audio File

## Context

Volume is currently a channel-level property — when you swap audio files in a channel, the volume stays the same. Volume should live on the audio file (asset) itself, so swapping files updates the fader to that file's stored level. This applies to both BGM channels and SFX soundboard slots.

The backend infrastructure already exists: `MusicAssetModel`/`SfxAssetModel` have `default_volume` fields, `MusicAsset`/`SfxAsset` aggregates have `update_audio_config()` with validation, `PATCH /api/assets/{id}/audio-config` endpoint and `UpdateAudioConfig` command are ready. The frontend just never uses any of it.

---

## Changes

### 1. loadAssetIntoChannel applies asset's default_volume

**File:** `rollplay/app/audio_management/hooks/useUnifiedAudio.js` (~line 1110)

When loading an asset into a BGM channel:
- Read `asset.default_volume` (fallback to 0.8 if null/undefined)
- Set the channel's `volume` in state to the asset's value
- Update the Web Audio `gainNode.gain.value` to match

```javascript
const loadAssetIntoChannel = (channelId, asset) => {
  const volume = asset.default_volume ?? 0.8;
  if (remoteTrackGainsRef.current[channelId]) {
    remoteTrackGainsRef.current[channelId].gain.value = volume;
  }
  setRemoteTrackStates(prev => ({
    ...prev,
    [channelId]: {
      ...prev[channelId],
      filename: asset.filename,
      asset_id: asset.id,
      s3_url: asset.s3_url,
      volume,
    }
  }));
};
```

### 2. loadSfxSlot applies asset's default_volume

**File:** `rollplay/app/audio_management/hooks/useUnifiedAudio.js` (~line 1128)

When loading an asset into an SFX slot:
- Read `asset.default_volume` (fallback to 0.8)
- Set the slot's `volume` in state
- Update the SFX `slotGain.gain.value` to match

```javascript
const loadSfxSlot = async (slotIndex, asset) => {
  const volume = asset.default_volume ?? 0.8;
  const trackId = `sfx_slot_${slotIndex}`;
  if (sfxSlotGainsRef.current[trackId]) {
    sfxSlotGainsRef.current[trackId].gain.value = volume;
  }
  setSfxSlots(prev => prev.map((s, i) =>
    i === slotIndex ? { ...s, asset_id: asset.id, filename: asset.filename, s3_url: asset.s3_url, volume } : s
  ));
  // ... existing buffer pre-fetch logic unchanged
};
```

### 3. AudioMixerPanel passes default_volume in load batch operations

**File:** `rollplay/app/audio_management/components/AudioMixerPanel.js`

**BGM** (~line 93, `handleAssetSelected`):
- Include `volume: asset.default_volume` in the WebSocket `load` operation so remote clients also get the asset's volume

```javascript
sendRemoteAudioBatch([{
  trackId: channelId,
  operation: 'load',
  filename: asset.filename,
  asset_id: asset.id,
  s3_url: asset.s3_url,
  volume: asset.default_volume,
}]);
```

**SFX** (~line 455, `handleSfxAssetSelected`):
- Same: include `volume: asset.default_volume` in the SFX load operation

### 4. webSocketAudioEvents passes volume through on load operations

**File:** `rollplay/app/audio_management/hooks/webSocketAudioEvents.js`

**BGM load handler** (~line 266):
- Pass `default_volume` from the operation into `loadAssetIntoChannel`

```javascript
case 'load':
  if (loadAssetIntoChannel) {
    const { filename, asset_id, s3_url, volume } = op;
    loadAssetIntoChannel(trackId, { filename, id: asset_id, s3_url, default_volume: volume });
  }
  break;
```

**SFX load handler** (~line 168):
- Same: pass `volume` through as `default_volume` in the asset object to `loadSfxSlot`

### 5. Persist volume to asset on fader release

**File:** `rollplay/app/audio_management/components/AudioMixerPanel.js`

**BGM volume handler:**
- On volume change (which fires on debounce/release), also call `PATCH /api/assets/{asset_id}/audio-config` with `{ default_volume: volume }`
- Need the `asset_id` from `remoteTrackStates[channelId].asset_id`
- Use `authFetch` — fire-and-forget (no need to await or invalidate cache)
- Only persist if `asset_id` exists (skip if channel is empty)

```javascript
const handleVolumeChange = (channelId, volume) => {
  // Existing: broadcast via WebSocket
  sendRemoteAudioBatch?.([{ trackId: channelId, operation: 'volume', volume }]);
  // New: persist to asset
  const assetId = remoteTrackStates[channelId]?.asset_id;
  if (assetId) {
    authFetch(`/api/assets/${assetId}/audio-config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ default_volume: volume }),
    });
  }
};
```

**SFX volume handler** (~line 447, `handleSfxVolumeChange`):
- Same pattern: persist volume to asset on change
- Get `asset_id` from `sfxSlots[slotIndex].asset_id`

### 6. ETL StartSession: resolve volume from asset, not JSONB

**File:** `api-site/modules/session/application/commands.py` (~line 398)

In `StartSession.execute()`, when building `audio_config_with_urls` from the paused session's JSONB:
- The command already fetches all campaign assets (line 370-394) into an `assets` list
- Build a lookup: `asset_volume_lookup = {str(a.id): a.default_volume for a in assets if hasattr(a, 'default_volume')}`
- When constructing each channel's config, use the asset's current `default_volume` instead of the JSONB snapshot:

```python
audio_config_with_urls[channel_id] = {
    **ch,
    "s3_url": asset_url_lookup.get(ch.get("asset_id")),
    "volume": asset_volume_lookup.get(ch.get("asset_id"), ch.get("volume", 0.8)),
    "playback_state": "stopped",
    "started_at": None,
    "paused_elapsed": None
}
```

This means the asset's current `default_volume` wins, with the JSONB snapshot as fallback (e.g., if asset was deleted).

### 7. Backend websocket_events: pass volume in load persistence

**File:** `api-game/websocket_handlers/websocket_events.py`

In the `remote_audio_batch` handler's `load` operation (~line 942), ensure the `volume` field from the operation payload is stored in MongoDB's `audio_state` for the channel. This is likely already happening since the handler stores the full channel state, but verify the `load` case includes `volume` from the operation.

---

## Key files

| File | Change |
|------|--------|
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | `loadAssetIntoChannel` + `loadSfxSlot` apply `default_volume` + gain node |
| `rollplay/app/audio_management/components/AudioMixerPanel.js` | Pass `default_volume` in load ops, persist volume to asset on fader change |
| `rollplay/app/audio_management/hooks/webSocketAudioEvents.js` | Pass volume through on load operations (BGM + SFX) |
| `api-site/modules/session/application/commands.py` | StartSession resolves volume from asset, not JSONB snapshot |
| `api-game/websocket_handlers/websocket_events.py` | Verify load operation stores volume in MongoDB |

## Existing backend (no changes needed)

| File | Already has |
|------|------------|
| `api-site/modules/library/api/endpoints.py` | `PATCH /{asset_id}/audio-config` endpoint (line 423) |
| `api-site/modules/library/application/commands.py` | `UpdateAudioConfig` command (line 392) |
| `api-site/modules/library/domain/music_asset_aggregate.py` | `update_audio_config()` with 0.0-1.3 validation |
| `api-site/modules/library/domain/sfx_asset_aggregate.py` | Same as music |
| `api-site/modules/library/api/schemas.py` | `UpdateAudioConfigRequest`, `MusicAssetResponse`, `SfxAssetResponse` |

## Verification

1. Load a music asset into BGM channel A — fader jumps to that file's stored volume
2. Adjust the fader — volume persists to asset via API
3. Load the same asset into channel B — fader shows the updated volume
4. Load a different asset into channel A — fader changes to new file's volume
5. Same behavior for SFX soundboard slots
6. Pause session, resume — channels restore with asset's current volume (not stale snapshot)
7. Remote clients see correct volume when DM loads an asset
