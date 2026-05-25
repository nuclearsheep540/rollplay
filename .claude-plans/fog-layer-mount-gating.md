# Fog layer mount gating — parent decides readiness

## Context

`FogSharedTextureLayer` and `FogHideLayer` currently mount as soon as their parent `FogRegionStack` decides to render them, then internally short-circuit with `return null` based on conditions like `imgDims === {0,0}` or `!hasReadyEngine`. This produces a mounted-but-not-really-ready transitional state where:

- React calls hooks (so a `useLayoutEffect` is registered).
- The component returns `null`, so the masked `<div ref={textureRef}>` doesn't actually mount.
- The effect runs, finds `textureRef.current` is null, and bails — never sets a mask.
- Later, when conditions become valid, the JSX renders and the ref attaches — but the effect's deps haven't changed, so it doesn't re-run. The freshly-mounted div is left **unmasked**, and CSS treats unmasked as fully visible → full-canvas fog wisps until something else triggers a re-render.

The current symptom: load a fresh asset, see fog covering the map. Any interaction (toggling enabled, dragging a slider) creates a new region object → `enabledRegions` identity changes → effect re-runs → mask gets set → fog disappears.

The patch we considered (adding `imgDims` to the effect deps) would fix the symptom but it's a band-aid. The root issue is that the layer is being mounted before it has everything it needs to operate.

## Critical files

- [rollplay/app/fog_management/components/FogRegionStack.js](rollplay/app/fog_management/components/FogRegionStack.js) — the parent. Currently gates only on `regions.some((r) => r.enabled)` and per-region `if (!engine) return null`. Will become the single source of truth for "is this layer ready to mount?".
- [rollplay/app/fog_management/components/FogSharedTextureLayer.js](rollplay/app/fog_management/components/FogSharedTextureLayer.js) — drop internal `imgDims`/`hasReadyEngine` early-returns and the now-unreachable `if (!refCanvas)` empty-state branch in `rebuildUnion`.
- [rollplay/app/fog_management/components/FogHideLayer.js](rollplay/app/fog_management/components/FogHideLayer.js) — already has implicit engine readiness via `if (!engine) return` in its effect; just needs the parent to also gate on `imgDims`.

## Plan

### Step 1 — Move readiness gates to FogRegionStack

In `FogRegionStack`, derive a single ready flag:

```js
const ready = imgDims.w > 0 && imgDims.h > 0;
```

Render layers conditionally:

- For each region in `regions`: render `<FogHideLayer>` only when `region.enabled && ready && getEngine(region.id)` is truthy.
- Render the texture layer only when `ready` AND at least one enabled region has an engine — i.e. compute `hasReadyEngine` here, not inside the child.

### Step 2 — Remove internal gates from FogSharedTextureLayer

Delete:

- `const hasReadyEngine = ...` derivation.
- `if (!imgDims?.w || !imgDims?.h) return null;`
- `if (!hasReadyEngine) return null;`
- The `if (!refCanvas) { tex.style.maskImage = ''; ... }` branch in `rebuildUnion` — by contract, if the layer is mounted, at least one engine exists with a canvas. The branch is dead code that, if reached, would misset the mask anyway.

The component becomes a contract: "I'm only mounted when ready; I always do real work." Its `useLayoutEffect` reliably finds `textureRef.current` attached and at least one engine canvas to read.

### Step 3 — Remove internal `imgDims` chasing from FogHideLayer

`FogHideLayer` already tracks `imgDims` itself via its own `ResizeObserver` for the same reason — to know when it can size its mask. Once the parent guarantees `ready` before mounting, the child doesn't need to track this separately.

Two options:
- **a.** Pass `imgDims` from `FogRegionStack` as a prop (mirrors how the texture layer already receives it).
- **b.** Keep the internal observer but drop any `if (!imgDims) return null` style early-returns since the layer only mounts when imgDims is already known.

Pick (a) for consistency — single observer in the parent, both children consume it. Saves redundant resize listeners.

### Step 4 — Sanity-check the empty-state cases

After the refactor, walk through:

- **Fresh asset (config null)** → hook synthesizes implicit Default region with `mask: null` → engine created with empty canvas → `ready` true once image loads → layers mount → priming reads empty engine → union compositor produces transparent mask → texture invisible. Hide layer mask similarly transparent. Map fully visible. ✓
- **All regions disabled** → no `<FogHideLayer>` rendered (per-region gate); `hasReadyEngine` false at parent → texture not rendered. ✓
- **Region toggled off mid-session** → that region's `<FogHideLayer>` unmounts; if it was the last enabled region, texture layer also unmounts. ✓
- **Region toggled back on** → engine still exists in `enginesRef`; layer remounts; effect runs once with everything valid; mask set from current canvas state. ✓
- **First paint stroke on a fresh region** → engine fires `change` event → existing onChange callback re-builds union mask → mask updates. (Unchanged from current.)

## Verification

- Workshop: hard reload on the existing asset (config null in DB). On image load, no fog appears. Click fog tool → still no fog. Paint a stroke → fog appears in painted area. ✓
- Workshop: paint, save, reload → fog appears in painted area immediately on image load (no flash of full-map fog). ✓
- Workshop: toggle the default region off → all fog disappears. Toggle on → fog reappears (matching engine state). ✓
- Game runtime: same scenarios in DM and player views.
- Multi-region: paint two regions, disable one, re-enable → only that region's fog reappears.

## Out of scope

- The `useLayoutEffect` priming itself stays as-is — it remains the right hook for synchronously seeding the mask before paint. The fix is about *when* the component is alive to receive that priming, not how priming works.
- No changes to engine state, persistence, serialization, or paint flow.
