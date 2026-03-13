# Bottom Mixer Drawer + Per-Channel Insert Effects

## Phase 1: Bottom Mixer Drawer + Shared Bus Architecture — COMPLETE

The bottom mixer drawer with vertical channel strips, shared effect buses, master strip, and AudioMixerPanel simplification has been implemented. The drawer is DM-only, overlaps side drawers (z-index 35), and renders vertical channel strips with transport, send toggles, solo/mute, L/R metering, and vertical faders.

### Completed Items
- Bottom mixer drawer CSS + component (`BottomMixerDrawer.js`)
- Vertical channel strip component (`VerticalChannelStrip.js`)
- Shared bus architecture in `useUnifiedAudio.js` (3 shared buses: HPF, LPF, Reverb)
- Master channel strip with stereo metering
- AudioMixerPanel simplified (BGM strips removed, kept track selector + cue + SFX)
- Wired up in `page.js` with all props threaded
- Tab styling matched to side drawer tabs

---

## Phase 2: Per-Channel Insert Effects with Wet/Dry Faders

### Context

Phase 1 implemented shared effect buses where all channels sending to the same effect are summed into one shared processor. This means you can't have different settings per channel, and there's no per-channel wet/dry control.

**Change**: Replace shared buses with per-channel insert effects. Each BGM channel gets its own HPF, LPF, and Reverb instances with individual wet/dry mix faders. When an effect is enabled on a channel, its effect strip appears to the right of the channel strip in the mixer drawer.

### Decisions

- **Per-channel inserts** — each channel owns its own HPF, LPF, Reverb instances
- **Wet/dry faders** — 0.0–1.0 range, controls wet gain (dry stays at 1.0, additive blend)
- **Effect strips inline** — appear to the right of their parent channel when enabled
- **Channel groups** — exaggerated spacing between each channel + its effect strips
- **All nodes created at init** — "disabled" = wetGain at 0.0 (avoids dynamic graph rewiring)

---

### Signal Chain

**Per BGM channel (parallel wet/dry):**
```
Source → channelGainNode → dryGain (1.0) ─────────────→ sumNode → muteGainNode → metering → master
                         → hpfNode → hpfWetGain (0-1) → sumNode
                         → lpfNode → lpfWetGain (0-1) → sumNode
                         → convolver → reverbWetGain (0-1) → sumNode
```

- All effect nodes created at init (not dynamically). "Disabled" = wetGain at 0.0.
- Wet/dry fader controls the wetGain value (0.0–1.0). Dry stays at 1.0 (additive blend).
- Per-channel ConvolverNodes share the same AudioBuffer (immutable, safe to share).

---

### Mixer Layout

Channel groups with exaggerated spacing. Effect strips appear inline when enabled:

```
[Ch A] [HPF] [RVB]  |||  [Ch B]  |||  [Ch C] [LPF]  |||  ...  |  [MST]
```

- Effect strips are narrower (60px vs 80px channel strips)
- Effect strips show: color label + vertical wet/dry fader + "Mix" footer
- Effect strips do NOT show: transport, send toggles, solo/mute, L/R meters
- `mixer-group-separator` between channel groups (wider than existing `mixer-separator`)

---

### Changes

#### 1. types.js

- Remove: `SEND_LEVEL`, `DEFAULT_BUS_CONFIG`, `EFFECT_BUSES`
- Update `DEFAULT_EFFECTS` to include mix levels:
  ```js
  export const DEFAULT_EFFECTS = {
    hpf:    { enabled: false, frequency: 1000, mix: 0.5 },
    lpf:    { enabled: false, frequency: 500,  mix: 0.5 },
    reverb: { enabled: false, preset: 'room',  mix: 0.5 },
  };
  ```
- Add strip rendering config:
  ```js
  export const EFFECT_STRIP_DEFS = [
    { key: 'hpf',    label: 'HPF', color: 'orange' },
    { key: 'lpf',    label: 'LPF', color: 'cyan' },
    { key: 'reverb', label: 'RVB', color: 'purple' },
  ];
  ```

#### 2. useUnifiedAudio.js — Core audio graph refactor

**Remove:**
- `effectBusesRef`, `channelSendGainsRef` refs
- `createEffectBus()` function
- 3 shared bus creation blocks in `initializeWebAudio()`
- Per-channel send gain creation/connection
- `setBusReturnLevel()` function

**Add:**
- `channelInsertEffectsRef` — per-channel effect graphs:
  ```js
  // { audio_channel_A: { dryGain, sumNode, hpf: { effectNode, wetGain }, lpf: {...}, reverb: {...} } }
  ```
- In `initializeWebAudio()`, for each BGM channel: create dryGain + sumNode, create 3 effect instances (BiquadFilter HPF, BiquadFilter LPF, ConvolverNode), each with its own wetGain node. Wire: `channelGainNode → dryGain → sumNode` and `channelGainNode → effect → wetGain → sumNode`. Then `sumNode → muteGainNode`.
- `setEffectMixLevel(trackId, effectName, mixLevel)` — new exported function for effect strip faders

**Modify:**
- `applyChannelEffects()` — toggle wetGain between 0.0 and the channel's mix level (instead of toggling send gains to shared buses)
- `channelEffects` state shape gains `hpf_mix`, `lpf_mix`, `reverb_mix` floats
- Cleanup: clear `channelInsertEffectsRef` instead of `effectBusesRef`/`channelSendGainsRef`
- Hook return: remove `effectBuses`, `setBusReturnLevel`; add `setEffectMixLevel`

#### 3. VerticalChannelStrip.js — Add `stripType="effect"`

- Effect strips: `w-[60px]` width, fader range 0.0–1.0
- Render only: color label header + vertical fader + "Mix" footer
- No transport, sends, solo/mute, meters, filename

#### 4. BottomMixerDrawer.js — Channel group layout

- Remove: `effectBuses`, `setBusReturnLevel` props, bus strip rendering, `handleBusVolumeChange`
- Add: `setEffectMixLevel` prop
- Render channel groups: for each channel, render channel strip + enabled effect strips, with `mixer-group-separator` between groups

#### 5. page.js — Prop threading

- Remove from BottomMixerDrawer props: `effectBuses`, `setBusReturnLevel`
- Add: `setEffectMixLevel`
- Update useUnifiedAudio destructuring accordingly

#### 6. globals.css — Group separator

```css
.mixer-group-separator {
  width: 3px;
  align-self: stretch;
  background: rgba(255, 255, 255, 0.08);
  margin: 0 calc(6px * var(--ui-scale));
  flex-shrink: 0;
}
```

#### 7. shared-contracts/audio.py — Extend AudioEffects model

Add `hpf_mix`, `lpf_mix`, `reverb_mix` float fields with default 0.5. Backward-compatible — existing MongoDB docs get defaults.

---

### Key Files

| File | Change |
|------|--------|
| `rollplay/app/audio_management/types.js` | Remove bus constants, add EFFECT_STRIP_DEFS, update DEFAULT_EFFECTS |
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | Replace shared buses with per-channel inserts |
| `rollplay/app/audio_management/components/VerticalChannelStrip.js` | Add effect strip type |
| `rollplay/app/audio_management/components/BottomMixerDrawer.js` | Channel group layout with inline effect strips |
| `rollplay/app/game/page.js` | Update prop threading |
| `rollplay/app/globals.css` | Add group separator |
| `rollplay-shared-contracts/shared_contracts/audio.py` | Extend AudioEffects with mix fields |

---

### Verification

1. Each channel gets independent HPF/LPF/Reverb effect instances
2. Toggling an effect on a channel strip shows the effect strip to its right
3. Effect strip wet/dry fader controls the wet blend level
4. Toggling effect off hides the strip and ramps wet gain to 0
5. Multiple channels can have different effect settings independently
6. WebSocket broadcast of effect toggles + mix levels syncs to all clients
7. Late-joiner sees correct effect state and mix levels from MongoDB
8. No audio glitches during effect toggling (20ms gain ramp)
9. Master strip and channel strips still function as before
10. Build passes
