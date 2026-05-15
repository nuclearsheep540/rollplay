# Fog rendering migration to PixiJS

## Context

The current fog texture layer (`FogSharedTextureLayer`) uses an animated GIF tiled via CSS, masked by a union of region-engine canvases, composited via SVG filter + CSS mix-blend-mode. **It tanks fps from 120 → 13 when the map is visible**, regardless of map size or audio state. The dominant cost is per-frame GIF decoding + paint over a large screen area, multiplied by the SVG filter chain re-running when its input pixels change.

Earlier optimisation attempts narrowed it down:

- **Sentry instrumentation overhead**: removed (already done, ~25% recovered).
- **Audio meter rAF cascade**: gated on drawer open (already done).
- **88 tile divs → 1 div with 2 background layers**: small win (13 → 17fps). Confirmed the tile multiplier wasn't the dominant cost — the GIF animation itself is.
- **Static GIF (`FOG_DEBUG_NO_GIF = true`)**: confirms 120fps achievable. The GIF animation IS the bottleneck.

A pure-CSS-animation alternative was considered but:

- CSS gradient blobs don't look like wispy fog.
- SVG `feTurbulence` animated via SMIL is what we already removed for the same reason.
- "Static texture + CSS transform drift" preserves the visual but doesn't match the current "morphing in place" look.

**Project trajectory**: weather effects (rain, snow), 2D dynamic lighting (torches, line-of-sight), atmospheric tints are likely future asks. A GPU-based 2D rendering layer pays off if we're going to add more visual effects.

**Library choice**: PixiJS over Three.js because:

- 2D-native — matches the app's mental model. Three.js is a 3D framework configured for 2D.
- Smaller bundle (~100KB gz vs ~150KB gz tree-shaken).
- Particle systems (`PIXI.ParticleContainer`) built-in for future weather effects — thousands of sprites at 60fps.
- `RenderTexture` + `Sprite.mask` is a first-class pattern that maps onto our region-mask architecture cleanly.
- Community packages for top-down 2D lighting exist (`pixi-lights`, `@pixi/layers`).

## Goal

Replace `FogSharedTextureLayer` with a PixiJS-based renderer that:

1. Generates the fog texture **procedurally on the GPU** (no animated raster image), via Perlin/simplex noise + domain warping in a fragment shader.
2. Reads region engine canvases as **GPU textures** for masking. Single render pass combines them — replaces the offscreen union-canvas compositor.
3. Animates via a **time uniform** updated per frame — pure GPU, no main-thread paint cost per frame.
4. Sustains 60fps with map visible.

Lays the foundation for future weather/lighting via the same Pixi context.

## Critical files

- [rollplay/app/fog_management/components/FogSharedTextureLayer.js](rollplay/app/fog_management/components/FogSharedTextureLayer.js) — to be replaced (or co-exist behind a flag during transition).
- [rollplay/app/fog_management/components/FogRegionStack.js](rollplay/app/fog_management/components/FogRegionStack.js) — swaps `FogSharedTextureLayer` import for the new component. Otherwise unchanged.
- [rollplay/app/fog_management/components/FogHideLayer.js](rollplay/app/fog_management/components/FogHideLayer.js) — **stays as-is**. It's a cheap solid-colour div with a CSS mask. No perf issue. Pixi only replaces the texture layer.
- [rollplay/app/fog_management/engine/FogEngine.js](rollplay/app/fog_management/engine/FogEngine.js) — no change. Engine canvases are the source-of-truth, consumed by Pixi as textures.
- [rollplay/package.json](rollplay/package.json) — add `pixi.js` (v8+) as a dependency.

## Architecture

### Component layout (unchanged at the FogRegionStack level)

```
<FogRegionStack> (wrapper, owns pointer events for paint)
  ├ <FogHideLayer />   per enabled region — CSS, unchanged
  ├ <FogHideLayer />
  ├ ...
  └ <FogPixiTextureLayer />  ← NEW; replaces FogSharedTextureLayer
```

### New component: `FogPixiTextureLayer`

Same props interface as the existing `FogSharedTextureLayer`:

```js
<FogPixiTextureLayer regions={...} getEngine={...} imgDims={...} />
```

Internals:

- `<canvas>` element rendered into the DOM. Sized to match `imgDims` via parent wrapper.
- On mount: `new PIXI.Application({ view: canvas, antialias: false, autoStart: true, ... })`.
- Single `PIXI.Sprite` covering the full canvas, using a `PIXI.Mesh` with a `PIXI.Shader` (custom fragment shader doing the fog work).
- Per region:
  - `PIXI.Texture.from(engine.canvas)` — wraps the engine's `<canvas>` element as a GPU texture.
  - Subscribe to engine `'change'` / `'load'` events; call `texture.update()` on fire to push new pixels to GPU.
  - Pass textures + per-region opacities as shader uniforms.
- Render loop driven by `PIXI.Ticker`. Each tick: increment time uniform, render. ~60fps.
- Pan/zoom: the canvas DOM element sits inside `contentRef` (current pattern). CSS transform on `contentRef` scales the canvas pixels — works transparently.

### Shader (sketch)

```glsl
// Fragment shader
precision mediump float;

uniform sampler2D uMask0;
uniform sampler2D uMask1;
// ... up to uMask11 (FOG_REGIONS_MAX = 12)

uniform float uMaskOpacities[12];
uniform int uMaskCount;
uniform float uTime;
uniform float uNoiseScale;       // tunable density
uniform float uDriftSpeed;       // tunable animation rate

varying vec2 vTextureCoord;

// Simplex noise function included via shader include or inlined.
float snoise(vec2 v) { ... }

void main() {
  vec2 uv = vTextureCoord;

  // Domain warp: shift the sampling position by another noise sample.
  // This produces the organic "wispy edge" look that feDisplacementMap
  // was giving us.
  vec2 warp = vec2(
    snoise(uv * 4.0 + vec2(uTime * uDriftSpeed, 0.0)),
    snoise(uv * 4.0 + vec2(0.0, uTime * uDriftSpeed))
  ) * 0.05;

  // Multi-octave noise for richness — base + fine detail.
  float n =
      snoise((uv + warp) * uNoiseScale)        * 0.6
    + snoise((uv + warp) * uNoiseScale * 2.0)  * 0.3
    + snoise((uv + warp) * uNoiseScale * 4.0)  * 0.1;
  n = n * 0.5 + 0.5;  // remap to 0..1

  // Combine region masks with max-blending (matches current union behaviour).
  float unionMask = 0.0;
  if (uMaskCount > 0) unionMask = max(unionMask, texture2D(uMask0, uv).a * uMaskOpacities[0]);
  if (uMaskCount > 1) unionMask = max(unionMask, texture2D(uMask1, uv).a * uMaskOpacities[1]);
  // ... up to uMask11
  // (Loop with constant bound for GLSL 1.0 compat, or use WebGL2 with proper loop.)

  // Fog intensity = noise modulated by mask.
  float intensity = n * unionMask;

  // Output white at fog intensity, alpha at same. Page-level mix-blend-mode: screen
  // (on the canvas element via CSS) blends it with the map underneath, same as today.
  gl_FragColor = vec4(intensity, intensity, intensity, intensity);
}
```

Notes:
- Use `unrolled-for` for the mask sampling to stay GLSL 1.0 compatible (WebGL1 backend). Pixi can target WebGL2 if preferred; check browser support requirements.
- Mix-blend-mode stays as a CSS property on the canvas element — same outcome as the current setup.

### Mask texture lifecycle

```
On region engine 'change'/'load' event:
  → maskTextures[regionId].update()  // upload new canvas pixels to GPU

On region added / removed:
  → recreate the textures array, update shader uniforms

On region enabled toggle:
  → flip uMaskOpacities[i] uniform; no texture work
```

This replaces the entire offscreen union-canvas compositor — the GPU does it per-pixel in the shader.

### Render-loop gating

The Pixi ticker runs every frame by default. We don't need to render at 60fps if the scene isn't changing. Optimisation candidates:

- Skip render when nothing has changed (no time-uniform tick needed because the animation IS the time uniform — so we DO need to tick continuously while fog is visible).
- Pause ticker when no enabled regions exist (early return at `FogRegionStack` already handles this — Pixi never mounts in that case).
- Pause when document is hidden (visibilitychange listener). Easy win.

## Implementation plan

### Phase 1 — Setup

1. **Add dependency**: `npm install pixi.js@^8.0.0` in `rollplay/`.
2. **Create skeleton component** `app/fog_management/components/FogPixiTextureLayer.js`:
   - Same props as `FogSharedTextureLayer`.
   - On mount, create a `PIXI.Application` rendering a solid color to a canvas.
   - Verify the canvas appears in the DOM at the right size/position.
   - Verify pan/zoom inheritance through `contentRef` works.

### Phase 2 — Mask textures from engine canvases

3. **Wire engine canvases as Pixi textures**:
   - For each enabled region, `PIXI.Texture.from(engine.canvas)`.
   - Subscribe to engine `'change'` / `'load'` events.
   - On fire, `texture.update()`.
4. **Render a debug sprite**: full-canvas plane with a simple shader that just samples one mask and outputs `vec4(alpha, alpha, alpha, alpha)`. Verify masks update when painting.

### Phase 3 — Fog shader

5. **Write the fragment shader** (above sketch). Start with single-mask version, then expand to multi-region union.
6. **Tune**:
   - `uNoiseScale` — density of wisps.
   - `uDriftSpeed` — animation rate.
   - Domain warp amplitude — organic edge intensity (replaces `feDisplacementMap`'s effect).
   - Octave weights — richness.
7. **Visual A/B against current GIF version**: side-by-side reload. Adjust until acceptable.

### Phase 4 — Integration

8. **Swap in `FogRegionStack`**: replace `<FogSharedTextureLayer ... />` with `<FogPixiTextureLayer ... />`.
9. **Verify**:
   - Workshop fog paint: stroke → mask updates → shader sees new alpha → fog updates in shape.
   - Game runtime: same.
   - Pan/zoom: smooth, correct scaling.
   - Multi-region: 3+ regions render correctly, per-region opacity slider works (via `uMaskOpacities`).
   - Region enable toggle: hides/shows correctly.
   - Per-region feather/dilate: these were CSS-mask blur passes. In Pixi, the engine canvas pixels can be pre-blurred in the same way as before, OR we move blur into the shader. **Simpler initially**: keep the existing `renderMaskCanvas` util that blurs into a scratch canvas; the shader samples the pre-blurred result.
10. **Performance verification**:
    - Map up: target 60fps sustained.
    - 12 regions painted: still 60fps.
    - Mid-stroke: stable, no jank.
    - Compare against debug-with-`FOG_DEBUG_NO_GIF=true` baseline (120fps) — should be similar.

### Phase 5 — Cleanup

11. **Remove old code**: delete `FogSharedTextureLayer.js` and the `FOG_DEBUG_*` flags. Remove unused fields from `FogRegionStack` if any. Update plan files.
12. **Update Workshop** — no change should be needed, same component swap applies.

## Visual considerations

The current fog has a specific look (the artist-made `fog_loop_2.gif`). The shader-generated fog won't match it pixel-for-pixel — it'll be procedural noise that *looks like* fog, with tunable parameters.

Acceptable trade if:
- The shader version looks "good enough" to the user.
- The performance recovery is dramatic (which it should be).

If the user wants to preserve the artist-made GIF aesthetic exactly, an alternative path is:
- Render the GIF into a one-frame texture **once** at app load (decode-then-freeze).
- Use that as a static texture in Pixi.
- Add CSS-translated drift via a tiled `RenderTexture` and animate the drift.
- Same perf characteristic, preserves the exact look, but adds asset/decode complexity.

**Recommendation for initial implementation**: pure procedural shader. Iterate on the visual until acceptable. If unable to match the artistic intent, fall back to the "frozen GIF as static texture + animated drift" approach.

## Trade-offs

| Pro | Con |
|---|---|
| 60fps achievable | ~100KB bundle addition |
| Replaces GIF, SVG filter, and union compositor with one shader | Visual differs from current GIF aesthetic; requires tuning |
| Mask compositing in-shader (no offscreen canvas work) | New dependency to maintain |
| Foundation for weather/lighting features | WebGL required — extremely high availability but not 100% |
| `texture.update()` per engine event is GPU-side, cheaper than `toDataURL` + `mask-image` | Asynchronous initial setup (shader compile, first texture upload) — minor first-frame delay |
| Workshop and runtime both benefit | Pan/zoom interaction with canvas resolution may need tuning at high zoom (canvas pixels stretch) |

## Risks

- **WebGL unavailability**: very rare on modern browsers/devices. Should provide a fallback — at minimum, don't crash. Could fall back to a static (non-animated) fog texture rendered via the existing CSS path. Detect with `PIXI.utils.isWebGLSupported()` before mounting.
- **High-DPI mismatch**: Pixi's `resolution` setting controls device-pixel-ratio. Need to set this to `window.devicePixelRatio` for sharp rendering on retina. Verify visually.
- **Pan/zoom blur at high zoom**: the canvas is rasterised at one resolution. At 5× zoom, pixels stretch. Mitigation: render the canvas at a multiple of the map size and let CSS scale down. Or pre-emptively re-render at higher resolution when zoom level changes. Defer until measured.
- **Bundle size impact on cold load**: 100KB gz is real. If the app already has slow first-load, this adds to it. Pixi can be code-split — load only when a map is active. Defer optimisation; measure first.
- **Memory**: each region's canvas becomes a GPU texture. At 1024×1024 RGBA, that's 4MB per region × 12 regions max = 48MB GPU memory. Within budget for any modern device.

## Future extensibility (out of scope for this work, but enabled by it)

Once the Pixi context is in place, future features integrate cleanly:

- **Weather overlays**: `PIXI.ParticleContainer` for rain/snow/embers. Sprites with shared texture. Thousands at 60fps.
- **2D dynamic lighting**: additional render pass with shadow-casting from obstacle polygons (passed as uniforms). Multiplicatively blend with map.
- **Atmospheric color grading**: a final post-processing filter on the Pixi stage (color matrix, contrast, vignette). Easy.
- **Animated transitions**: tween fog reveal/conceal between region toggles.

These are all additive on top of the fog-rendering work, not replacements.

## Verification

After Phase 4 integration:

- **Functional**:
  - [ ] Workshop: paint a stroke → fog appears in the painted area.
  - [ ] Workshop: erase a stroke → fog disappears.
  - [ ] Workshop: clear → no fog.
  - [ ] Workshop: add 2nd region → both visible, per-region params work.
  - [ ] Workshop: toggle region enabled → fog hides/shows.
  - [ ] Workshop: save asset → reload → fog appears in same shape.
  - [ ] Game runtime DM: paint, broadcast, players see fog.
  - [ ] Game runtime player: receives WS update, fog renders.
  - [ ] Pan/zoom: fog stays aligned with map at all scales.
- **Perf**:
  - [ ] Map up, no audio, idle: ≥55fps sustained.
  - [ ] Map up, audio playing, idle: ≥50fps (with the audio cascade still pending).
  - [ ] Mid-paint stroke: stable, no dropped frames.
  - [ ] 12 regions painted: still ≥50fps.
- **Visual**:
  - [ ] Side-by-side with current GIF: shader fog is "good enough" or better.
  - [ ] No visible seams or grid patterns.
  - [ ] Animation feels organic, not mechanical.
  - [ ] Mask edges feather correctly per region's `hide_feather_px` / `texture_dilate_px`.

## File touch summary (this plan)

- New: `app/fog_management/components/FogPixiTextureLayer.js`
- Modified: `app/fog_management/components/FogRegionStack.js` (one import + JSX swap)
- Removed: `app/fog_management/components/FogSharedTextureLayer.js` (after verification)
- Modified: `package.json` (`pixi.js` dependency added)
- Maybe touched: `app/fog_management/utils/renderMaskCanvas.js` — depends on whether we keep CPU-side blur for hide feather, or move to shader. Initial: keep as-is.

## How to resume this work

1. Read `runtime-perf-investigation.md` first to understand WHY we're doing this (Sentry, audio cascade, GIF cost — context).
2. Read this file end-to-end for the plan.
3. Confirm `FOG_DEBUG_*` flags in `FogSharedTextureLayer.js` are `false` (the current state should already match) before starting baseline measurements.
4. Start Phase 1. Don't skip ahead to writing the shader before the canvas is in the DOM and pan/zoom is verified — the integration plumbing is where most surprises live.
5. After Phase 3, take a screenshot/share with the user before doing Phase 4 swap. Visual tuning is subjective; sign-off matters.
