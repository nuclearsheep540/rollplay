# Plan: Mobile Optimisations

## Context

This plan consolidates three related efforts that emerged from improving the mobile and cross-browser experience: unified pan/zoom for maps, iOS audio unlock fixes, and general performance/UX optimisations across the game UI.

---

## Feature 1: MapDisplay — Unified Pan/Zoom (Mouse, Trackpad, Touch)

### Problem

`MapDisplay.js` had three related bugs affecting touch devices and trackpads:
1. **No pinch-to-zoom** — two-finger touches both trigger independent drag handlers, causing erratic jumps
2. **Zoom has no focal point** — `transformOrigin: 'center'` means scale always pivots around the container centre, causing the map to drift off screen when panned
3. **Wheel sensitivity** — `deltaY > 0 ? -0.1 : 0.1` ignores magnitude, behaves unpredictably on trackpads and mice

### Approach

**No user-agent detection needed.** The Pointer Events API is device-agnostic:
- 1 active pointer → drag (mouse or single finger)
- 2 active pointers → pinch (only physically possible on touch)
- `wheel` event → mouse scroll or trackpad scroll
- `wheel` + `e.ctrlKey` → trackpad pinch (browsers synthesise this automatically)

### Zoom-to-Point Maths

The core formula used for both wheel zoom and pinch zoom — keeps the focal point `(fx, fy)` visually fixed while scale changes:

```javascript
const newScale  = clamp(prev.scale * factor, 0.25, 5.0);
const ratio     = newScale / prev.scale;
return {
  scale: newScale,
  x: fx - ratio * (fx - prev.x),
  y: fy - ratio * (fy - prev.y),
};
```

`transformOrigin` must be `'0px 0px'` (not `'center'`) for this maths to work.

### Implementation

**Single file: `rollplay/app/map_management/components/MapDisplay.js`**

- Replaced `isDragging`/`dragStart` useState with refs (no re-render for pointer tracking)
- `activePointers` ref (Map of pointerId → {x, y}) for multi-touch
- `lastPinch` ref for pinch distance/midpoint tracking
- Pointer count branches: 1 = drag, 2 = pinch-zoom
- Wheel handler with clamped delta and zoom-to-cursor-point maths

### Performance Enhancement — Direct DOM Manipulation

Added `viewRef` + `contentRef` to bypass React render cycle during drag/pinch:
- `viewRef.current` is source of truth during gestures
- `applyTransform()` writes directly to `contentRef.current.style.transform`
- React state `viewTransform` syncs only on pointer-up (drag end)
- CSS transition (`0.1s ease-out`) applies only when not dragging, giving smooth settle

### Verification

1. Mouse drag — single pointer, map follows cursor
2. Mouse wheel — zooms toward cursor, no drift
3. Trackpad scroll — smooth pan
4. Trackpad pinch — zooms toward cursor
5. Touch single finger — pans map
6. Touch two fingers — zooms toward pinch midpoint
7. Touch pinch + pan simultaneously — both gestures apply together
8. Zoom in → pan → zoom out — no drift accumulation
9. Lock map — all gestures blocked when `isMapLocked = true`

---

## Feature 2: iOS Audio Unlock — Safari + Chrome

> *Consolidated from `.claude-plans/ios-audio-fix.md` and `.claude-plans/ios-audio-unlock-fix.md` — these were iterative refinements of the same fix.*

### Problem

On iOS, Web Audio tracks don't produce audible output until the page is refreshed. The UI shows tracks as "playing" but no sound comes out. Additionally, entering a session played an audible "beep" (sword.mp3).

### Root Cause

The AudioContext is eagerly created on component mount (outside a user gesture). On iOS, a context created before the hardware audio session is activated cannot produce output — even after `resume()` succeeds. On refresh, the audio session persists from the previous play, so the eager context works.

### Iteration History

1. **sword.mp3** → worked but beeped audibly
2. **silence.mp3 file** → no beep, worked on Safari, failed on Chrome (network fetch consumed gesture window)
3. **Base64 WAV data URI** → worked on Chrome, failed on Safari (WAV format issue)
4. **Programmatic silent buffer** → rejected — too short, doesn't activate iOS audio session
5. **Base64 MP3 data URI** → works on both (no network fetch + Safari-compatible format)

### Final Fix

**File: `rollplay/app/audio_management/hooks/useUnifiedAudio.js` — `unlockAudio()`**

Two changes:

#### 2a. Inline base64 MP3 data URI (line ~1066)
```javascript
// Before: const silentAudio = new Audio('/audio/silence.mp3');
const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAA...');
```

| Factor | silence.mp3 file | **Base64 MP3** |
|--------|-----------------|----------------|
| Network request | Yes (fetch) | **None (inline)** |
| Format | MP3 | **MP3** |
| Chrome gesture timing | Consumed by fetch | **Preserved** |
| Safari compatibility | Works | **Works** |

#### 2b. Close/recreate AudioContext within user gesture (lines ~1060-1085)
```javascript
// Close stale context (created on mount, before iOS audio session was active)
if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
  await audioContextRef.current.close();
}
audioContextRef.current = null;

// Create fresh context + full graph within user gesture
const webAudioSuccess = await initializeWebAudio();
```

**Why safe:** AudioBuffers are context-independent (raw PCM), `initializeWebAudio()` rebuilds all nodes, no active sources on the old context, pending ops drain uses fresh refs.

#### 2c. Re-apply channel effects after context recreation (after line ~1103)
```javascript
for (const [trackId, effects] of Object.entries(channelEffects)) {
  if (channelInsertEffectsRef.current[trackId]) {
    applyChannelEffects(trackId, effects);
  }
}
```

This fixed a regression where reverb buses didn't activate until manual fader interaction — `syncAudioState` had applied effects to old context nodes before `unlockAudio` recreated them.

### Cleanup
- `/public/audio/silence.mp3` can be deleted (only used by the now-replaced line)

---

## Feature 3: Animation Performance at High Resolutions

### Problem

All animations (drawer open/close, button hover, meter visualisations) looked choppy at 4K / large window sizes despite modern hardware.

### Root Causes

1. **`transition-all`** — triggers transitions on ALL CSS properties including layout-triggering ones
2. **Per-frame gradient repaints** — VU meter bars rebuilt gradient fills every animation frame
3. **`backdrop-filter: blur()`** — cost scales with pixel count (O(n²) at 4K)
4. **Opacity on large drawers** — semi-transparent backgrounds force compositor blending

### Fixes Applied

#### 3a. Replace `transition-all` with specific properties
Files: `PlayerCard.js`, `HorizontalInitiativeTracker.js`, `DiceActionPanel.js`, `DMChair.js`, `ColorPicker.js`, `CombatControlsPanel.js`, `ModeratorControls.js`

Changed `transition-all` to targeted properties: `transition-colors`, `transition-transform`, `transition-[transform,opacity]`, `transition-[left]`.

#### 3b. GPU-composited VU meters
File: `VerticalChannelStrip.js`

Replaced per-frame gradient repaint with `scaleY()` transform on a filled div:
```javascript
ref.current.style.transform = `scaleY(${pct / 100})`;
// Only update backgroundColor when color threshold changes
if (color !== colorRef.current) {
  ref.current.style.backgroundColor = color;
  colorRef.current = color;
}
```

#### 3c. Mixer drawer — opaque background
File: `globals.css`

Removed `backdrop-filter: blur(8px)` from mixer drawer, changed `rgba` to `rgb` background — no transparency needed since mixer slides over content.

#### 3d. Drawer settled-state pattern
Files: `globals.css`, `page.js`

Drawers use opaque backgrounds during animation, switch to translucent + blur only after `onTransitionEnd` fires:
```css
.party-drawer.drawer-settled {
  background: rgba(...);
  backdrop-filter: blur(8px);
}
```

---

## Feature 4: Grid Cell Inspection

### Problem

Grid cell hover highlight (showing cell coordinate like "B3") was always active, adding visual noise. Needed to be opt-in.

### Implementation

#### 4a. Shift key modifier (`page.js`)
```javascript
const [gridInspect, setGridInspect] = useState(false);
const [gridInspectMode, setGridInspectMode] = useState('hold'); // 'hold' | 'toggle'

useEffect(() => {
  const onKeyDown = (e) => {
    if (e.key !== 'Shift' || e.repeat) return;
    setGridInspect(prev => gridInspectMode === 'toggle' ? !prev : true);
  };
  const onKeyUp = (e) => {
    if (e.key !== 'Shift' || gridInspectMode === 'toggle') return;
    setGridInspect(false);
  };
  // ...
}, [gridInspectMode]);
```

#### 4b. GridOverlay uses prop instead of `e.shiftKey`
```javascript
// Before: if (!e.shiftKey) { ... }
// After:  if (!gridInspect) { ... }
```

#### 4c. MapOverlayPanel — inspect button + key hint
Desktop-only crosshair button showing HOLD/TOGGLE mode, with keyboard icon + "shift" label below. Click switches between modes.

---

## Feature 5: General Mobile/UX Fixes

- **Default UI scale to small for mobile** (`page.js`)
- **iOS Safari full-screen immersive view** (`layout.js`, `next.config.js`)
- **Drawer tabs scrollable** for narrow screens (`globals.css`)
- **Map safe area padding** — lock button doesn't fall behind drawer tabs on mobile
- **Top nav adjusted for mobile** (`globals.css`)
- **Grid controls D-pad adjusted for mobile** (`GridTuningOverlay.js`)
- **Lock map button scaling** — `isMobile ? 1 : 1.5` (rejected 2x as too large, rejected clamp as removing mobile styles)
- **Mixer content centred** (`globals.css`)
- **Drawer scroll space** — invisible spacer div (40vh) at end of drawer content for overscroll
- **Panel width addition** — large UI scale changed from 120px to 180px
- **Button focus outlines removed** on map overlay buttons (`MapOverlayPanel.js`)
