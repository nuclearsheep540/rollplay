# BGM Channel Mute/Solo

## Context

Add per-channel Mute and Solo controls to the BGM mixer. The DM should be able to mute individual channels or solo one/more channels, with the state broadcast to all players via WebSocket and persisted in MongoDB for late-joiner sync. Mute/Solo is **session-level** state (not asset-level) — it automatically survives pause/resume via the existing audio_config ETL round-trip but is not saved to PostgreSQL assets.

The effects chain (HPF → LPF → Reverb) was added in the previous feature. The muteGainNode inserts after the volume fader and before the analyser, so muted channels show silent meters.

---

## Updated Audio Chain

```
Current:
  Source → [HPF] → [LPF] → [Reverb] → GainNode → AnalyserNode → MasterGain → Destination
                                        (volume)

After:
  Source → [HPF] → [LPF] → [Reverb] → GainNode → MuteGainNode → AnalyserNode → MasterGain → Destination
                                        (volume)   (solo/mute)
```

MuteGainNode is a simple GainNode with value 0 or 1. It gates audio for both mute and solo. Meters reflect what the audience hears (silent when muted/not-soloed).

---

## Changes

### 1. Add muteGainNode to audio chain

**File:** `rollplay/app/audio_management/hooks/useUnifiedAudio.js` (~line 215-229)

**a)** Add ref: `const remoteTrackMuteGainsRef = useRef({});`

**b)** In `initializeWebAudio()`, for each BGM track, insert muteGainNode between gainNode and analyserNode. Currently (lines 223-225):
```javascript
// Current:
gainNode.connect(analyserNode);
analyserNode.connect(masterGainRef.current);
```
Change to:
```javascript
// New:
const muteGainNode = ctx.createGain();
muteGainNode.gain.value = 1.0;  // default: unmuted
gainNode.connect(muteGainNode);
muteGainNode.connect(analyserNode);
analyserNode.connect(masterGainRef.current);
remoteTrackMuteGainsRef.current[trackId] = muteGainNode;
```

No change needed for the effects chain connection — effects still feed into gainNode, muteGainNode sits after gainNode.

### 2. Mute/Solo state + recomputation logic

**File:** `rollplay/app/audio_management/hooks/useUnifiedAudio.js`

**a)** Add state:
```javascript
const [mutedChannels, setMutedChannels] = useState({});   // { audio_channel_A: true, ... }
const [soloedChannels, setSoloedChannels] = useState({});  // { audio_channel_B: true, ... }
```

**b)** Add toggle functions:
```javascript
const setChannelMuted = useCallback((channelId, muted) => {
  setMutedChannels(prev => ({ ...prev, [channelId]: muted }));
}, []);

const setChannelSoloed = useCallback((channelId, soloed) => {
  setSoloedChannels(prev => ({ ...prev, [channelId]: soloed }));
}, []);
```

**c)** Add `useEffect` that recomputes all muteGainNode values whenever mutedChannels or soloedChannels changes:
```javascript
useEffect(() => {
  const anySoloed = Object.values(soloedChannels).some(Boolean);
  for (const [trackId, muteGain] of Object.entries(remoteTrackMuteGainsRef.current)) {
    const isMuted = mutedChannels[trackId] || false;
    const isSoloed = soloedChannels[trackId] || false;
    let gain;
    if (anySoloed) {
      gain = isSoloed ? 1.0 : 0.0;   // Solo overrides mute
    } else {
      gain = isMuted ? 0.0 : 1.0;
    }
    muteGain.gain.setValueAtTime(gain, muteGain.context.currentTime);
  }
}, [mutedChannels, soloedChannels]);
```

**d)** Export from hook return: `mutedChannels`, `soloedChannels`, `setChannelMuted`, `setChannelSoloed`

### 3. Mute/Solo UI buttons in AudioTrack

**File:** `rollplay/app/audio_management/components/AudioTrack.js`

**a)** Add new props: `isMuted`, `isSoloed`, `onMuteToggle`, `onSoloToggle`

**b)** Add Solo (S) and Mute (M) toggle buttons on the transport row (line 190, the `flex gap-2` div with play/pause/stop/loop buttons), after the loop button. Only show when a file is loaded:

```jsx
{/* Solo/Mute — right of loop button */}
<button
  className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
    isSoloed ? 'bg-yellow-500 text-black' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
  }`}
  onClick={onSoloToggle}
  title={isSoloed ? 'Unsolo' : 'Solo'}
>S</button>
<button
  className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
    isMuted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
  }`}
  onClick={onMuteToggle}
  title={isMuted ? 'Unmute' : 'Mute'}
>M</button>
```

### 4. Thread mute/solo through AudioMixerPanel

**File:** `rollplay/app/audio_management/components/AudioMixerPanel.js`

**a)** Add props: `mutedChannels`, `soloedChannels`, `setChannelMuted`, `setChannelSoloed`

**b)** Add handlers that toggle state locally AND broadcast via WebSocket:
```javascript
const handleMuteToggle = useCallback((channelId) => {
  const newMuted = !mutedChannels[channelId];
  setChannelMuted(channelId, newMuted);
  sendRemoteAudioBatch([{
    trackId: channelId,
    operation: 'mute',
    muted: newMuted,
  }]);
}, [mutedChannels, sendRemoteAudioBatch, setChannelMuted]);

const handleSoloToggle = useCallback((channelId) => {
  const newSoloed = !soloedChannels[channelId];
  setChannelSoloed(channelId, newSoloed);
  sendRemoteAudioBatch([{
    trackId: channelId,
    operation: 'solo',
    soloed: newSoloed,
  }]);
}, [soloedChannels, sendRemoteAudioBatch, setChannelSoloed]);
```

**c)** Pass to AudioTrack:
```jsx
<AudioTrack
  // ... existing props ...
  isMuted={mutedChannels[channel.channelId] || false}
  isSoloed={soloedChannels[channel.channelId] || false}
  onMuteToggle={() => handleMuteToggle(channel.channelId)}
  onSoloToggle={() => handleSoloToggle(channel.channelId)}
/>
```

### 5. Thread through page.js

**File:** `rollplay/app/game/page.js`

**a)** Destructure from useUnifiedAudio: `mutedChannels`, `soloedChannels`, `setChannelMuted`, `setChannelSoloed`

**b)** Add to `gameContext` memo: `setChannelMuted`, `setChannelSoloed` (for WebSocket handler access)

**c)** Pass to AudioMixerPanel: `mutedChannels`, `soloedChannels`, `setChannelMuted`, `setChannelSoloed`

### 6. WebSocket handlers for mute/solo

**File:** `rollplay/app/audio_management/hooks/webSocketAudioEvents.js`

**a)** Add `setChannelMuted` and `setChannelSoloed` to the destructured params from gameContext (~line 113)

**b)** Add `mute` and `solo` cases to the `processOperation` switch (after the `effects` case):
```javascript
case 'mute':
  setChannelMuted(trackId, op.muted);
  break;
case 'solo':
  setChannelSoloed(trackId, op.soloed);
  break;
```

### 7. Backend: accept mute/solo operations

**File:** `api-game/websocket_handlers/websocket_events.py`

**a)** Add `"mute"` and `"solo"` to `valid_operations` list (line 817)

**b)** Add operation summaries for logging (after line 882):
```python
elif operation == "mute":
    muted = op.get("muted", False)
    operation_summaries.append(f"{'mute' if muted else 'unmute'} {track_id}")
elif operation == "solo":
    soloed = op.get("soloed", False)
    operation_summaries.append(f"{'solo' if soloed else 'unsolo'} {track_id}")
```

**c)** Add MongoDB persistence (after line 989, the effects case):
```python
elif operation == "mute":
    ch = current_audio_state.get(track_id, {})
    channel_state = {**ch, "muted": op.get("muted", False)}
    GameService.update_audio_state(client_id, track_id, channel_state)

elif operation == "solo":
    ch = current_audio_state.get(track_id, {})
    channel_state = {**ch, "soloed": op.get("soloed", False)}
    GameService.update_audio_state(client_id, track_id, channel_state)
```

### 8. Late-joiner sync

**File:** `rollplay/app/audio_management/hooks/useUnifiedAudio.js`

In `syncAudioState()` (~line 1192, after the existing effects restore), add mute/solo restore:
```javascript
// Restore mute/solo state if present
if (channelState.muted) {
  setMutedChannels(prev => ({ ...prev, [channelId]: true }));
}
if (channelState.soloed) {
  setSoloedChannels(prev => ({ ...prev, [channelId]: true }));
}
```

The useEffect from step 2c will automatically recompute the muteGainNode values when these state updates land.

---

## Solo/Mute Behavior

- **Mute (M):** Toggle per channel. Muted channel's `muteGainNode.gain = 0`. Channel keeps playing (stays in sync). Meter goes silent.
- **Solo (S):** Toggle per channel. When ANY channel is soloed, all non-soloed channels get `muteGainNode.gain = 0`.
- **Solo overrides Mute:** If a channel is both Soloed and Muted, it plays (Solo wins).
- **Broadcast:** All mute/solo changes go via WebSocket → api-game → MongoDB → broadcast to all clients.
- **Late-join:** MongoDB stores `muted`/`soloed` flags per channel. `syncAudioState` restores them.
- **Pause/Resume:** Mute/solo flags survive pause/resume automatically — they're part of the MongoDB audio state that gets saved to `session.audio_config` JSONB during pause and restored during resume.

---

## Key Files

| File | Change |
|------|--------|
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | MuteGainNode in chain, mute/solo state + recomputation, sync restore |
| `rollplay/app/audio_management/components/AudioTrack.js` | Solo (S) and Mute (M) toggle buttons |
| `rollplay/app/audio_management/components/AudioMixerPanel.js` | Handle mute/solo toggles, broadcast via WebSocket, thread props |
| `rollplay/app/audio_management/hooks/webSocketAudioEvents.js` | Handle `mute`/`solo` batch operations |
| `rollplay/app/game/page.js` | Thread mute/solo state + functions to panel and gameContext |
| `api-game/websocket_handlers/websocket_events.py` | Accept mute/solo operations, MongoDB persistence |

---

## Verification

1. Load a BGM track → click M → track silenced for all players, meter goes flat, track stays in sync
2. Unmute → audio resumes from correct position (never stopped playing)
3. Solo channel A → all other channels silenced, only A audible
4. Solo A + Solo B → only A and B audible
5. Mute A + Solo A → A is audible (Solo overrides Mute)
6. Un-solo all → all unmuted channels resume
7. Late-joiner sees correct mute/solo state from MongoDB
8. Pause session → resume → mute/solo state preserved
9. `npm run build` passes
