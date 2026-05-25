# Fog rendering performance — SMIL kill, cursor lift, shared texture

## Context

Cursor lag and paint sluggishness once the map is zoomed in. The cost grows further with each fog region because today every `FogCanvasLayer` instance owns its own SVG filter pipeline, its own ~88-tile GIF grid, and its own CSS mask updates. Two unrelated drivers compound the problem:

1. The SMIL `<animate>` on `feTurbulence baseFrequency` forces the whole filter chain (`feTurbulence → feDisplacementMap → feGaussianBlur`) to recompute **every frame**, idle or not.
2. The brush cursor sits *inside* the fog wrapper, which is itself inside `contentRef`'s pan/zoom transform — its compositing layer invalidates whenever the fog repaints, so cursor pointer-tracking blocks behind the heavy fog rendering on each frame.

The fundamental architectural issue is that the texture layer (the 88 tiles + filter + screen blend) has *no per-region semantics* — it's a shared "fog texture base." Replicating it per region wastes work that scales linearly with N. By construction, all regions' tile grids are at identical coordinates today, so user-visible behaviour is unchanged when the texture becomes a single shared element.

Per-region settings (`opacity`, `hide_feather_px`, `texture_dilate_px`) are preserved through a **union mask** that pre-blurs each region's alpha by its own dilate/feather and weights it by its own opacity before compositing into one shared mask source.

## Critical files

- [rollplay/app/fog_management/components/FogCanvasLayer.js](rollplay/app/fog_management/components/FogCanvasLayer.js) — current per-region renderer. Step 1 edits in place; step 3 splits into two new components.
- [rollplay/app/fog_management/components/FogRegionStack.js](rollplay/app/fog_management/components/FogRegionStack.js) — currently mounts N `FogCanvasLayer`s; step 3 rewrites to host N hide layers + 1 shared texture layer.
- [rollplay/app/fog_management/hooks/useFogRegions.js](rollplay/app/fog_management/hooks/useFogRegions.js) — already exposes `regions`, `getEngine(id)`, `activeId`, etc. **No structural change needed**, just consumed by the new layout.
- [rollplay/app/map_management/components/MapDisplay.js](rollplay/app/map_management/components/MapDisplay.js) — wraps `contentRef` (pan/zoom transform). Step 2 adds a sibling div for the lifted cursor.
- [rollplay/app/workshop/components/MapConfigTool.js](rollplay/app/workshop/components/MapConfigTool.js) and [rollplay/app/game/GameContent.js](rollplay/app/game/GameContent.js) — pass-through call sites; should require minimal updates.

## Plan

### Step 1 — Kill the SMIL animation (permanent delete, not a toggle)

**The change is unconditional**: delete the `<animate>` element inside `<feTurbulence>` in [FogCanvasLayer.js](rollplay/app/fog_management/components/FogCanvasLayer.js) (and later in `FogSharedTextureLayer` once step 3 lands). The element looks like:

```jsx
<animate
  attributeName="baseFrequency"
  values={`${FOG_DISPLACE_FREQUENCY};${FOG_DISPLACE_FREQUENCY * 1.15};${FOG_DISPLACE_FREQUENCY}`}
  dur="14s"
  repeatCount="indefinite"
/>
```

That `<animate>` is what was driving the entire filter chain to recompute on **every frame**, idle or not — it was the source of the "fog drifting" motion. With it removed, the filter (`feTurbulence → feDisplacementMap → feGaussianBlur`) still runs and still produces the wispy displaced boundary, but only when its **inputs change** — i.e. when the mask is repainted via a stroke, or on initial mount. Static state = zero filter cost.

**Visual change**: wisps stop drifting over time. They become a static organic boundary rather than a slowly-morphing one. Acceptable trade per discussion (drift was a "nice-to-have", not the main goal).

**Why this isn't a "disable filter while painting" toggle**: an earlier discussion considered conditionally turning the *whole* filter off during paint mode for max paint-time performance. That lever was dropped from the plan because step 3 (shared texture) already collapses N filter pipelines into one — making per-paint filter cost flat regardless of region count. With shared texture in place, conditional disabling is redundant aggression and not worth the visual flicker on tool toggle.

### Step 2 — Lift the cursor out of the fog wrapper

Move the cursor `<div>` from inside the fog wrapper (currently rendered inside `FogCanvasLayer`) to a **sibling of `contentRef`** in [MapDisplay.js](rollplay/app/map_management/components/MapDisplay.js). The cursor lives in the same stacking context as the map (so `mix-blend-mode: difference` still inverts against map content) but is **outside the pan/zoom transform**.

Coordinate math:
- Position via `clientX / clientY` directly (no transform inheritance).
- Size scales with zoom via the fog wrapper's `getBoundingClientRect().width / engine.width × brush_size` — i.e. revert to bounding-rect scaling because the lifted cursor is in screen pixels.
- Visibility wired from pointer-enter / pointer-leave events on the fog wrapper (the wrapper still owns pointer capture for paint).

Net: cursor compositing is no longer tied to fog-layer invalidations.

### Step 3 — Shared-texture refactor

**New layer composition** (rendered by a rewritten `FogRegionStack`):

```
<wrapper>                         ← owns pointer events, routes to active engine
  ├ <FogHideLayer region 1>       ← solid-colour div, mask = blurred engine canvas, opacity = region.opacity
  ├ <FogHideLayer region 2>
  ├ ...
  └ <FogSharedTextureLayer>       ← 88 tiles + SVG filter + screen blend + mask = union of (per-region dilated × opacity) masks
```

**Two new components** (replacing `FogCanvasLayer`):

1. **`FogHideLayer`** — per-region. Lightweight: single coloured div with a CSS mask. Mask source = the region's engine canvas, blurred by `region.hide_feather_px` (extracted `renderMaskCanvas` helper from current `FogCanvasLayer`). Opacity = `region.opacity × fogOpacity × paintModeKnockback`.

2. **`FogSharedTextureLayer`** — singleton. Owns the 88-tile GIF grid, the SVG filter (`<feTurbulence>` static after step 1, `feDisplacementMap`, `feGaussianBlur`), and the screen blend. Mask source = a **union mask** rebuilt from all enabled regions whenever any engine emits `change` or `load`.

**Two distinct blend concepts in this design — important not to conflate them**:

1. The **visible blend** — `mix-blend-mode: screen` between the texture layer and the map underneath it. **Stays as `screen`. Unchanged.** This is what makes the fog texture look like wispy fog over the map.
2. The **mask compositor's blend** — `globalCompositeOperation: 'lighten'` on an *offscreen* canvas, used purely to merge per-region alpha into one combined alpha channel. **Internal to mask building, never visible directly.**

**Union mask compositor** (lives inside `FogSharedTextureLayer` or as a hook):

```
On any region's engine 'change' / 'load':
  1. For each enabled region in iteration order:
       individual = blur(engine.canvas, region.texture_dilate_px) + contrast(2)
       weighted   = individual × region.opacity   (via globalAlpha during drawImage)
  2. Composite weighted onto a shared OFFSCREEN union canvas using
     globalCompositeOperation: 'lighten'
  3. Convert union canvas → data URL → assign as the CSS mask source of
     FogSharedTextureLayer (the texture layer still uses mix-blend-mode: 'screen'
     to composite against the map; only its mask source changed).
```

**Why `lighten` for the mask compositor**: takes the max alpha per pixel across regions. Where regions don't overlap, each contributes its own dilated/feathered/opacity-weighted edge. Where regions overlap, the brighter (higher-alpha after opacity weighting) one wins — matches today's hide-stacking behaviour where overlapping fog "densifies" via the brighter contributor. This is *only* the offscreen alpha-merge step; nothing about the user-visible compositing pipeline changes.

**Reused utilities**:
- `useFogRegions.getEngine(regionId)` — already exposed; resolves a region id to its `FogEngine`.
- `renderMaskCanvas(srcCanvas, blurPx, contrast)` — extract from `FogCanvasLayer.js:244-260` into a shared `app/fog_management/utils/renderMaskCanvas.js` so both `FogHideLayer` and the union compositor reuse it.
- Tile-grid math + grid `useMemo` — extract from `FogCanvasLayer.js:440-450` into `FogSharedTextureLayer`.
- The SVG filter `<defs>` — moves into `FogSharedTextureLayer`. There's only one instance, so the `<filter id>` collision concern goes away.

**Decommission**: delete `FogCanvasLayer.js` once `FogHideLayer` + `FogSharedTextureLayer` are verified. The legacy single-engine `fogEngine` prop on [MapDisplay.js](rollplay/app/map_management/components/MapDisplay.js) can be removed at the same time — all callers (`MapConfigTool`, `GameContent`) already pass the multi-region triplet (`fogRegions`, `fogGetEngine`, `fogActiveRegionId`).

**Painter knock-back**: stays on the wrapper's opacity (`paintMode ? FOG_PAINTER_KNOCKBACK : 1`), dimming hide + texture together.

## Verification

**After step 1** — workshop, paint tool active:
- Wisps still visible at boundaries; filter ran once.
- Wisps no longer drift over time.
- Cursor + paint feel unchanged when not zoomed.

**After step 2**:
- Cursor tracks pointer at any zoom level with no lag.
- `mix-blend-mode: difference` still inverts against the map.
- Cursor hides when leaving the fog wrapper bounds.
- Pinch/zoom still smooth; cursor doesn't drift relative to mouse.

**After step 3** — multi-region scenario, ≥3 regions painted in different map areas:
- All wisps appear continuous across regions (no tile-grid mismatch where two regions abut).
- Per-region feather slider still only changes that region's edge.
- Per-region opacity slider still dims that region's hide AND wisps; other regions unaffected.
- Overlap of region A (opacity 0.5) and region B (opacity 1.0): overlap renders at 1.0 (B dominates) — same as today.
- Active region toggle: strokes route into the right engine.
- Auto-save round-trip preserves all per-region params.
- DM runtime: region labels still anchor to per-region centroids.
- Player runtime: composited fog visible, no labels.

**Performance check** (Chrome DevTools Performance tab, 12 regions, 2× zoom):
- Idle (tool open, not painting): expect frame cost to drop substantially after step 1.
- Painting: expect frame cost to drop further after step 3 (one filter pass, not 12).

**Edge cases**:
- Region with empty mask (just metadata): contributes alpha 0, invisible in union — no artifacts.
- All regions disabled: union mask empty → texture invisible, hide layers all hidden — map fully visible.
- Live region: paints into the union same as prepped regions (no special case).
