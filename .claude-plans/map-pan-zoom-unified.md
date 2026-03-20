# Plan: MapDisplay — Unified Pan/Zoom (Mouse, Trackpad, Touch)

## Context

`MapDisplay.js` has three related bugs affecting touch devices and trackpads:
1. **No pinch-to-zoom** — two-finger touches both trigger independent drag handlers,
   causing erratic jumps
2. **Zoom has no focal point** — `transformOrigin: 'center'` means scale always pivots
   around the container centre, causing the map to drift off screen when panned
3. **Wheel sensitivity** — `deltaY > 0 ? -0.1 : 0.1` ignores magnitude, behaves
   unpredictably on trackpads and mice

**No user-agent detection needed.** The Pointer Events API is already device-agnostic:
- 1 active pointer → drag (mouse or single finger)
- 2 active pointers → pinch (only physically possible on touch — no guard needed)
- `wheel` event → mouse scroll or trackpad scroll
- `wheel` + `e.ctrlKey` → trackpad pinch (browsers synthesise this automatically)

All behaviours are baked in simultaneously and self-select based on what the browser
sends. Desktop users never generate two simultaneous pointers; touch users never
generate wheel events.

---

## Zoom-to-Point Maths

The core formula used for both wheel zoom and pinch zoom — keeps the focal point
`(fx, fy)` visually fixed while scale changes:

```javascript
const newScale  = clamp(prev.scale * factor, 0.25, 5.0);
const ratio     = newScale / prev.scale;
return {
  scale: newScale,
  x: fx - ratio * (fx - prev.x),
  y: fy - ratio * (fy - prev.y),
};
```

`transformOrigin` must be `'0px 0px'` (not `'center'`) for this maths to work —
`'center'` adds an implicit offset that would double-apply the translation.

---

## Implementation

### Single file: `rollplay/app/map_management/components/MapDisplay.js`

**Replace** `isDragging`/`dragStart` useState with refs (no re-render needed for
tracking pointer positions):

```javascript
const activePointers = useRef(new Map()); // pointerId → { x, y }
const lastPinch      = useRef(null);      // { dist, midX, midY }
const [isDragging, setIsDragging] = useState(false); // still needed for cursor style
```

**`handlePointerDown`**:
```javascript
activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
e.currentTarget.setPointerCapture(e.pointerId);
setIsDragging(true);
```

**`handlePointerMove`** — branches on active pointer count:
```javascript
activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
const pointers = [...activePointers.current.values()];

if (pointers.length === 1) {
  // Single pointer — translate
  const prev = activePointers.current.get(e.pointerId); // previous position
  setViewTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));

} else if (pointers.length === 2) {
  const [p1, p2] = pointers;
  const dist  = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const midX  = (p1.x + p2.x) / 2;
  const midY  = (p1.y + p2.y) / 2;

  if (lastPinch.current) {
    const factor = dist / lastPinch.current.dist;
    const panDX  = midX - lastPinch.current.midX;
    const panDY  = midY - lastPinch.current.midY;
    const rect   = containerRef.current.getBoundingClientRect();
    const fx     = midX - rect.left;
    const fy     = midY - rect.top;
    setViewTransform(prev => {
      const newScale = clamp(prev.scale * factor, 0.25, 5.0);
      const ratio    = newScale / prev.scale;
      return {
        scale: newScale,
        x: fx - ratio * (fx - prev.x) + panDX,
        y: fy - ratio * (fy - prev.y) + panDY,
      };
    });
  }
  lastPinch.current = { dist, midX, midY };
}
```

**`handlePointerUp/Cancel`**:
```javascript
activePointers.current.delete(e.pointerId);
if (activePointers.current.size < 2) lastPinch.current = null;
if (activePointers.current.size === 0) setIsDragging(false);
```

**`handleWheel`**:
```javascript
e.preventDefault();
const raw    = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY; // line mode → px
const delta  = clamp(raw, -200, 200);
const factor = 1 - delta / 1000; // ≈ 0.8–1.2 per event, smooth
const rect   = e.currentTarget.getBoundingClientRect();
const fx     = e.clientX - rect.left;
const fy     = e.clientY - rect.top;
setViewTransform(prev => {
  const newScale = clamp(prev.scale * factor, 0.25, 5.0);
  const ratio    = newScale / prev.scale;
  return {
    scale: newScale,
    x: fx - ratio * (fx - prev.x),
    y: fy - ratio * (fy - prev.y),
  };
});
```

**`contentTransform` style** — change `transformOrigin`:
```javascript
transformOrigin: '0px 0px',   // was 'center' — required for zoom-to-point maths
```

---

## What Does NOT Change

- `touchAction: 'none'` — already correct
- `setPointerCapture` — already correct, keep as-is
- `viewTransform` state shape `{ x, y, scale }` — unchanged
- `transform: translate3d(${x}px, ${y}px, 0) scale(${scale})` — unchanged
- All props, GridOverlay, image rendering — unchanged

---

## File

`rollplay/app/map_management/components/MapDisplay.js` — handler logic only

---

## Verification

1. **Mouse drag** — single pointer, map follows cursor
2. **Mouse wheel** — zooms toward cursor, no drift
3. **Trackpad scroll** — smooth pan (no ctrlKey)
4. **Trackpad pinch** — `ctrlKey` wheel events, zooms toward cursor
5. **Touch single finger** — pans map
6. **Touch two fingers** — zooms toward pinch midpoint, map stays under fingers
7. **Touch pinch + pan simultaneously** — both gestures apply together
8. **Zoom in → pan → zoom out** — no drift accumulation
9. **Lock map** — all gestures blocked when `isMapLocked = true`
