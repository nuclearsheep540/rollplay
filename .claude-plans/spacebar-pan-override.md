# Spacebar pan override

## Context

Photoshop convention: while spacebar is held, the active tool is temporarily replaced with the grab/pan tool — click-and-drag pans the canvas regardless of which tool was selected. On release, the previous tool returns. We want this on [MapDisplay](rollplay/app/map_management/components/MapDisplay.js) for both workshop ([MapConfigTool](rollplay/app/workshop/components/MapConfigTool.js)) and game runtime ([GameContent](rollplay/app/game/GameContent.js)).

Today, [MapDisplay.js](rollplay/app/map_management/components/MapDisplay.js)'s `containerRef` already has the pan/pinch/zoom handlers — they're just shadowed by overlays that capture pointer events (currently the fog wrapper inside [FogRegionStack.js](rollplay/app/fog_management/components/FogRegionStack.js)). The override mechanism is therefore: while space is held, overlays release their `pointerEvents: 'auto'` so the existing pan handlers receive events.

## Behavioural rules

- Both workshop and game runtime — `MapDisplay` is rendered in both.
- Spacebar is **ignored entirely while a fog stroke is in progress** (mouse held down on the fog wrapper). No state is updated. If the user wants the override after their stroke ends, they release space and press it again.
- Spacebar is **ignored while an `<input>` / `<textarea>` / `[contenteditable]` is focused** (lets the user type a space normally).
- Window blur clears the override (no stuck pan-mode after alt-tab).
- Cursor swaps to grab/grabbing while override is on, regardless of the underlying tool.

## Critical files

- [MapDisplay.js](rollplay/app/map_management/components/MapDisplay.js) — owns `containerRef` pan handlers + the `cursor` style. Hosts the keyboard listener and the `panOverride` state. Mid-stroke flag tracked via a ref the fog stack writes into.
- [FogRegionStack.js](rollplay/app/fog_management/components/FogRegionStack.js) — captures pointer events when `paintMode` is true. Already gated on `paintMode`, so passing `paintMode={fogPaintMode && !panOverride}` from `MapDisplay` makes it release events automatically.

## Plan

### Step 1 — Surface mid-stroke state to MapDisplay

`FogRegionStack` already has internal `isPaintingRef` (set on `handlePointerDown`, cleared on `handlePointerUp`/`Cancel`). Surface it to `MapDisplay`:
- `MapDisplay` creates `const fogPaintingRef = useRef(false)`.
- Passes `paintingRef={fogPaintingRef}` to `FogRegionStack`.
- Inside `FogRegionStack`, on stroke begin/end mirror `paintingRef.current = true/false` alongside the existing internal `isPaintingRef`.

### Step 2 — Keyboard listener + panOverride state in MapDisplay

```js
const [panOverride, setPanOverride] = useState(false);

useEffect(() => {
  const isInputFocused = () => {
    const el = document.activeElement;
    if (!el) return false;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
    return false;
  };
  const onKeyDown = (e) => {
    if (e.code !== 'Space') return;
    if (e.repeat) return;
    if (isInputFocused()) return;
    if (fogPaintingRef.current) return;     // mid-stroke — completely skip
    e.preventDefault();                     // stop page scroll
    setPanOverride(true);
  };
  const onKeyUp = (e) => {
    if (e.code !== 'Space') return;
    setPanOverride(false);
  };
  const onBlur = () => setPanOverride(false);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}, []);
```

`fogPaintingRef` is a ref so the listener never needs to re-attach when painting state changes — no flicker, no dropped keystrokes.

`onKeyUp` always runs (no painting check) — keeps the state machine simple. If override was never set (because keydown was ignored), keyup setting `false` is a no-op.

### Step 3 — Wire the override into rendering

Two changes in `MapDisplay`:

1. **Container cursor** — when `panOverride && !isMapLocked`, force `grab` / `grabbing` so the user sees the mode switch even before they move the mouse off the fog wrapper:
   ```js
   cursor: isMapLocked
     ? 'default'
     : (panOverride || /* existing */ true)
       ? (isDragging ? 'grabbing' : 'grab')
       : 'default',
   ```
   (Container's current cursor is already `grab`/`grabbing` when not locked, so the override branch is functionally identical for now — but it's the place future tool-specific cursors would diverge from, and the override needs to win over them.)

2. **FogRegionStack** — pass `paintMode={fogPaintMode && !panOverride}` instead of `fogPaintMode`. While override is on, the fog wrapper goes `pointerEvents: 'none'` + `cursor: 'default'` via its existing logic, and pan handlers on `containerRef` receive events.

The brush-ring cursor (rendered in `MapDisplay` as a sibling of the fog wrapper) stays hidden under override because the fog wrapper's `pointerEnter` no longer fires (`pointerEvents: 'none'`). Acceptable — Photoshop also hides its tool cursor while space-grab is active.

### Step 4 — Edge cases

- **Space pressed before mousedown**: override on, fog wrapper releases events, mousedown lands on container, pan starts. ✓
- **Space released mid-pan**: override flips off, but the pan stroke continues on `containerRef` via pointer capture until mouseup. ✓
- **Stroke starts, space pressed during stroke**: keydown ignored (no override). Stroke continues. Releasing space later is a no-op.
- **Repeating keydown events from holding space**: guarded by `e.repeat`.
- **Window blur with space held**: `blur` listener clears override; on return, user re-presses space to re-engage.

## Verification

- Workshop, fog paint tool active, hover map → cursor is brush ring. Press + hold space → cursor becomes `grab`. Drag → map pans. Release space → cursor is brush ring again, paint mode resumed.
- Same in game runtime DM session.
- Region rename input focused, type space → space character inserts into input, no pan override.
- Begin a paint stroke (mouse down). While live, press and release space → no pan, stroke completes normally.
- Hold space, alt-tab away, return → cursor back to normal (override cleared by blur).
- Pinch-zoom unaffected — overlays still release events under override, pan/zoom math unchanged.
