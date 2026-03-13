# Bottom Mixer Drawer + Bus/Aux Send Architecture

## Context

The audio mixer currently renders 6 horizontal BGM channel strips inside the right-side audio drawer. With 6 channels, per-channel effects (HPF, LPF, Reverb), and upcoming effect parameter tuning (frequency knobs, reverb preset selection), the horizontal layout is hitting its limits. Additionally, effects are baked inline per-channel (each channel gets its own filter/convolver instances), which is both inefficient and limits mixing flexibility.

We're building:
1. A **bottom mixer drawer** with vertical channel strips — matching the universal mixer mental model
2. A **bus/aux send architecture** — replacing inline per-channel effects with shared effect buses that appear as their own mixer channels

The bottom drawer is DM-only, overlaps side drawers, and gives room to grow into more advanced mixing controls.

---

## Decisions

- **Post-fader sends** (default) — channel fader scales send proportionally. PFL per-send toggle deferred to future iteration.
- **Toggle + fixed level sends** initially — on/off per bus, not continuous knobs. Continuous send control added later.
- **DM-only** — players don't see the mixer drawer.
- **Full implementation** — drawer, vertical strips, and bus architecture as one body of work.

---

## Architecture

### Current Signal Chain (per channel)
```
Source → HPF stage → LPF stage → Reverb stage → gainNode → muteGainNode → upmixNode → splitter → [L,R analysers] → merger → masterGain
```

### New Signal Chain

**Per BGM channel:**
```
Source → channelGainNode → muteGainNode → upmixNode → splitter → [L,R analysers] → merger → masterGain  (DRY)
                        ↓ (post-fader tap)
                        ├→ hpfSendGain ──→ HPF Bus input
                        ├→ lpfSendGain ──→ LPF Bus input
                        └→ reverbSendGain → Reverb Bus input
```

**Per effect bus (3 total, shared):**
```
busInputMixer (summing junction) → effectNode → busReturnGain → busMuteGain → busUpmix → busSplitter → [L,R analysers] → busMerger → masterGain
```

Send gains tap from after `channelGainNode` (post-fader). Toggle on = send gain at fixed level (e.g., 0.7), toggle off = send gain at 0.0.

---

## Changes

### 1. Bottom Mixer Drawer — CSS + Component

**New CSS in `globals.css`** (after existing drawer styles ~line 705):

```css
.bottom-mixer-drawer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: max(40vh, 300px);
  z-index: 35;              /* above side drawers (30) and their tabs (31), below command bar (100) */
  transition: transform 300ms ease;
  background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(26,26,46,0.8) 100%);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.bottom-mixer-tab {
  position: absolute;
  top: -36px;
  z-index: 36;
  /* centered or right-aligned — TBD based on feel */
}
```

Hidden: `transform: translateY(100%)`. Open: `transform: translateY(0)`.

**New component: `BottomMixerDrawer.js`**

- Receives same audio props as AudioMixerPanel (track states, analysers, volume handlers, mute/solo, effects/sends)
- Renders a horizontal flex row of `VerticalChannelStrip` components
- Layout: `[Ch A] [Ch B] [Ch C] [Ch D] [Ch E] [Ch F] | [HPF Bus] [LPF Bus] [RVB Bus] | [Master]`
- Separator between channel strips and bus strips
- `overflow-x: auto` for smaller screens

**State in `page.js`:** `const [isMixerOpen, setIsMixerOpen] = useState(false)`

### 2. Vertical Channel Strip Component

**New component: `VerticalChannelStrip.js`**

Each strip is ~80-100px wide, full drawer height. Shared component for both BGM channels and bus returns, differentiated by `stripType` prop.

**BGM channel strip layout (top to bottom):**
```
┌──────────┐
│    A     │  ← Channel label (colored badge)
├──────────┤
│  ▶  ⏹   │  ← Transport (play/pause, stop) — FontAwesome icons
├──────────┤
│ HPF [·]  │  ← Send toggles (on/off per bus)
│ LPF [·]  │
│ RVB [·]  │
├──────────┤
│  [S] [M] │  ← Solo / Mute
├──────────┤
│ L ▌▌ R   │  ← Vertical L/R meters + vertical fader between
│ ▌ ── ▌   │     (meters flanking the fader)
│ ▌ ── ▌   │
│ ▌ ── ▌   │
│ ▌ ●  ▌   │
│ ▌ ── ▌   │
│ ▌ ── ▌   │
├──────────┤
│ song.mp3 │  ← Filename (truncated) + MM:SS
│ 1:23     │
└──────────┘
```

**Bus return strip layout (top to bottom):**
```
┌──────────┐
│ HPF Bus  │  ← Bus label (distinct color: orange/cyan/purple)
├──────────┤
│  [S] [M] │  ← Solo bus (hear only wet) / Mute bus
├──────────┤
│ L ▌▌ R   │  ← Vertical L/R meters + return fader
│ ▌ ── ▌   │
│ ▌ ●  ▌   │
│ ▌ ── ▌   │
└──────────┘
```

No transport or send toggles on bus strips. Future: add effect parameter controls (frequency, preset) to bus strips.

**Vertical fader:** Use CSS `writing-mode: vertical-lr; direction: rtl` on range input, or a custom vertical slider. Same range 0.0–1.3, same dB pips rendered vertically.

**Vertical meters:** Same RAF loop + `rmsToPct()` as current horizontal meters, but `linear-gradient(to top, ...)` instead of `to right`. Height fills available space.

### 3. Bus/Aux Send — Web Audio Refactor

**File:** `useUnifiedAudio.js`

**a) New refs:**
```javascript
const effectBusesRef = useRef({});        // { hpf: { inputMixer, effectNode, returnGain, muteGain, ... }, lpf: {...}, reverb: {...} }
const channelSendGainsRef = useRef({});   // { audio_channel_A: { hpf: GainNode, lpf: GainNode, reverb: GainNode }, ... }
```

**b) In `initializeWebAudio()` — create 3 shared buses:**

For each bus (hpf, lpf, reverb):
1. `busInputMixer` — GainNode (summing junction, all channel sends connect here)
2. `effectNode` — BiquadFilter (hpf/lpf) or ConvolverNode (reverb) with default params from `DEFAULT_BUS_CONFIG`
3. `busReturnGain` — GainNode (bus fader, default 0.8)
4. `busMuteGain` — GainNode (bus solo/mute gate)
5. `busUpmix → busSplitter → busAnalyserL/R → busMerger` — same metering pattern as channels
6. `busMerger → masterGain`

Store in `effectBusesRef.current`.

**c) In `initializeWebAudio()` — per BGM channel:**

Remove `createEffectStage()` calls. Instead:
1. Create 3 send gain nodes per channel (hpfSend, lpfSend, reverbSend), all initialized to gain 0.0
2. Connect: `channelGainNode → hpfSendGain → effectBusesRef.current.hpf.inputMixer` (and same for lpf, reverb)
3. Direct path: `channelGainNode → muteGainNode → upmixNode → splitter → ...` (unchanged)
4. Store sends in `channelSendGainsRef.current[trackId]`

**d) Replace `applyChannelEffects` with `applyChannelSends`:**
```javascript
const applyChannelSends = useCallback((trackId, sends) => {
  // sends = { hpf: true/false, lpf: true/false, reverb: true/false }
  const channelSends = channelSendGainsRef.current[trackId];
  if (!channelSends) return;
  const now = audioContextRef.current.currentTime;
  const RAMP = 0.02;
  const SEND_LEVEL = 0.7; // fixed send level when enabled

  Object.entries(sends).forEach(([bus, enabled]) => {
    if (channelSends[bus]) {
      channelSends[bus].gain.linearRampToValueAtTime(enabled ? SEND_LEVEL : 0.0, now + RAMP);
    }
  });

  setChannelEffects(prev => ({ ...prev, [trackId]: { ...prev[trackId], ...sends } }));
}, []);
```

**e) New bus control functions:**
- `setBusReturnLevel(busName, level)` — sets `effectBusesRef.current[busName].returnGain.gain`
- Bus mute/solo — reuse same pattern as channel mute/solo but on `busMuteGain` nodes

**f) Modify `playRemoteTrack()`:**
Source connects directly to `channelGainNode` (no more routing through effect chain input). Send gains are already connected from init — they tap from the gain node continuously.

**g) Export** bus state, analysers, and control functions from hook return.

### 4. Data Model Changes

**Frontend (`types.js`):**
```javascript
// Existing DEFAULT_EFFECTS stays compatible — booleans map to send on/off
// Add bus config defaults for future parameter tuning
export const DEFAULT_BUS_CONFIG = {
  hpf: { returnLevel: 0.8, frequency: 1000 },
  lpf: { returnLevel: 0.8, frequency: 500 },
  reverb: { returnLevel: 0.8, preset: 'room' },
};
```

**Backend (`shared_contracts/audio.py`):**

No schema change needed for toggle-based sends — existing `AudioEffects(hpf: bool, lpf: bool, reverb: bool)` works as-is. The boolean `True`/`False` maps to send on/off. Bus config (return levels, parameters) starts as client-side defaults only, with MongoDB persistence added later.

**WebSocket:** Existing `effects` operation in `websocket_events.py` continues to work unchanged — it sends `{hpf: true/false, ...}` and the frontend interprets as send on/off.

### 5. AudioMixerPanel Simplification

**Remove from AudioMixerPanel:**
- BGM channel strip rendering (the `AudioTrack` components + effects)
- Solo/mute button handling for channels (moves to mixer drawer)

**Keep in AudioMixerPanel (right drawer):**
- AudioTrackSelector (load files into channels)
- DJ Cue System (PFL, Transition, PGM, Preview grid)
- Fade controls + CUT / STOP ALL
- SFX Soundboard

### 6. page.js Threading

- Add `isMixerOpen` / `setIsMixerOpen` state
- Render `<BottomMixerDrawer>` as sibling to existing drawers, DM-only
- Pass audio props: track states, analysers, send handlers, bus state, mute/solo, volume handlers
- Pass bus analysers for bus strip metering

---

## Key Files

| File | Change |
|------|--------|
| `rollplay/app/globals.css` | Add `.bottom-mixer-drawer` and `.bottom-mixer-tab` CSS |
| `rollplay/app/game/page.js` | Add mixer drawer state, render `BottomMixerDrawer`, pass props |
| `rollplay/app/audio_management/components/BottomMixerDrawer.js` | **NEW** — drawer container, horizontal layout of vertical strips |
| `rollplay/app/audio_management/components/VerticalChannelStrip.js` | **NEW** — vertical strip (BGM channels + bus returns) |
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | Replace inline effects with bus architecture, add bus refs/state/controls, modify source connection |
| `rollplay/app/audio_management/components/AudioMixerPanel.js` | Remove BGM channel strips, keep track selector + cue + SFX |
| `rollplay/app/audio_management/types.js` | Add `DEFAULT_BUS_CONFIG` |
| `rollplay/app/audio_management/components/index.js` | Export new components |

---

## Verification

1. Bottom mixer drawer opens/closes with smooth animation, overlaps side drawers
2. 6 vertical BGM channel strips render with labels A–F
3. 3 bus return strips render (HPF, LPF, Reverb) with distinct colors
4. Vertical faders control volume, same 0.0–1.3 range with dB pips
5. Vertical L/R meters animate with RMS data, same color thresholds
6. Transport buttons (play/pause/stop) work from vertical strips
7. Solo/Mute works on both channel strips and bus strips
8. Toggling a send (e.g., HPF on Channel A) routes that channel's audio through the HPF bus
9. Soloing a bus strip lets you hear only the wet signal for tuning
10. Multiple channels sending to the same bus sum correctly
11. Bus return fader controls overall effect level
12. Cue system in right drawer still works (PFL/PGM/Preview/CUT)
13. Track selection in right drawer still loads files into channels
14. SFX soundboard unaffected
15. WebSocket broadcast of send toggles syncs to all clients
16. Late-joiner sees correct send state from MongoDB
17. No audio glitches during send toggling (20ms gain ramp)
