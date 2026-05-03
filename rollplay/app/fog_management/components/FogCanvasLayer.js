/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * FogCanvasLayer — mounts the FogEngine canvas into the DOM, sized
 * to overlay the map image.
 *
 * Layer composition (back-to-front inside the wrapper):
 *   1. Hide layer — solid-coloured div (FOG_HIDE_COLOR), masked by the
 *      engine canvas's alpha as drawn. Occludes the map.
 *   2. Texture layer — GIF tiles + displacement filter, masked by a
 *      DILATED copy of the engine canvas. Sits on top of the hide
 *      layer with mix-blend-mode: screen so wisps lift the dark hide
 *      colour. The dilation lets wisps drift past the hide edge into
 *      the revealed area without compromising what's hidden.
 *   3. The engine <canvas> itself, mounted but visually hidden — it's
 *      the source of truth for paint/erase, not a visible surface.
 *
 * The animated GIF can't be painted into a canvas (drawImage captures
 * a single frame), so the texture has to live as a DOM background. The
 * canvas serves purely as the alpha-shape mask. Saved fog data stays
 * clean — just the alpha bitmap, no baked texture pixels.
 *
 * Used in two contexts:
 *  - Game runtime: positioned inside MapDisplay's transformed content
 *    wrapper, between the <img> and <GridOverlay>. Inherits pan/zoom
 *    from the parent transform.
 *  - Workshop: same component, mounted in the FogMaskTool preview.
 *
 * When `paintMode` is true, pointer events are captured and translated
 * into mask-space coords (0..mask.width) for the engine. When false,
 * the layer is pointer-transparent so map pan/zoom works normally.
 */

const FOG_TEXTURE_URL = '/ui/fog_loop_2.gif';

// Tile geometry for the fog texture.
//
// FOG_TILE_SIZE_PX matches the GIF's natural pixel dimensions so each
// tile renders unscaled. FOG_OVERLAP_FRACTION controls how much each
// tile overlaps its neighbours: 0.8 means each tile shares 80% of its
// area with neighbours (stride between tile origins = 20% of tile).
//
// Implementation: render a grid of <div> elements, one per tile,
// each containing one full GIF, positioned absolutely with the
// stride. They screen-blend with each other via mix-blend-mode so
// bright wisps from overlapping tiles compound into denser fog — the
// "shingle" effect. The CSS-background workaround we used previously
// hit a layer-count ceiling around 16 in Chrome; this approach has
// no such limit (every tile is its own DOM element). The browser
// fetches and decodes the GIF only once even if it's referenced by
// many divs.
//
// Tile count grows roughly with 1 / (1 − overlap)², so 0.9 is ~4× the
// cost of 0.8. Keep FOG_OVERLAP_FRACTION sensible (0.6–0.85).
const FOG_TILE_SIZE_PX = 960;
const FOG_OVERLAP_FRACTION = 0.5;
const FOG_STRIDE_PX = Math.max(1, Math.round(FOG_TILE_SIZE_PX * (1 - FOG_OVERLAP_FRACTION)));

// Blend mode used both tile-against-tile (inside the masked composite)
// and composite-against-map (at the wrapper level). 'screen' lifts dark
// areas of the GIF so they let the map show through; 'lighten' is a
// harder-edged variant; 'multiply' inverts the effect (dark fog stays
// dark on the map). Tweak here to change both layers at once.
const FOG_BLEND_MODE = 'screen';

// Boundary displacement — feTurbulence noise + feDisplacementMap
// pushes the masked alpha edge in/out by an organic noise field, so
// the fog perimeter doesn't read as a perfect circle. Animated via a
// slow baseFrequency wobble so the wisps drift over time.
//
// FOG_DISPLACE_FREQUENCY: lower = larger wisp blobs (0.005 = big puffs,
//   0.05 = fine grain). 0.015 ≈ cloud-edge scale.
// FOG_DISPLACE_OCTAVES: noise complexity. 1 = smooth, 3+ = busier edge.
// FOG_DISPLACE_SCALE: max displacement in CSS pixels — how far the
//   boundary can wander from its painted shape. Keep ≤ ~half the brush
//   radius or strokes start to disconnect from where you painted.
// FOG_FEATHER_PX: post-displacement Gaussian blur in CSS pixels —
//   softens the wispy boundary so the displaced edge has a smoke-like
//   falloff rather than a hard line. 0 disables feathering.
const FOG_DISPLACE_FREQUENCY = 0.005;
const FOG_DISPLACE_OCTAVES = 1;
const FOG_DISPLACE_SCALE = 64;
const FOG_FEATHER_PX = 6;

// Two-layer fog composition:
//   1. Hide layer  — solid-coloured div, masked by the painted alpha as
//      drawn. Its only job is to occlude the map. Reliable hiding,
//      because the colour doesn't depend on the GIF's dark areas.
//   2. Texture layer — GIF tiles + displacement + feather. Decoration
//      on top of the hide layer; uses a DILATED copy of the mask so
//      wisps extend past the hide edge into the revealed area.
//
// FOG_HIDE_COLOR: the occluding fill. Slight blue tint reads as deep
//   shadow rather than ink-black. Drop alpha below ~0.85 and map shapes
//   start showing through.
// FOG_HIDE_FEATHER_PX: blur radius applied to the hide mask, in mask-
//   space pixels. Softens the brush boundary so the hide-to-reveal
//   transition has a smoke-like falloff rather than a stamp edge.
//   Bigger = softer edge but lower peak alpha at the centre, which is
//   why we follow up with a contrast multiply to keep the interior
//   solid.
// FOG_TEXTURE_DILATE_PX: how far the texture mask extends past the hide
//   mask, in mask-space pixels. Bigger = wisps drift further past the
//   revealed edge before fading. Combined with FOG_DISPLACE_SCALE this
//   controls how "blown" the fog looks beyond the painted area.
const FOG_HIDE_COLOR = 'rgba(20, 20, 30, 0.95)';
const FOG_HIDE_FEATHER_PX = 20;
const FOG_TEXTURE_DILATE_PX = 30;

export default function FogCanvasLayer({
  engine,
  mapImageRef,
  paintMode = false,
  fogOpacity = 1.0,
}) {
  const wrapperRef = useRef(null);
  const hideRef = useRef(null);
  const textureRef = useRef(null);
  // Offscreen scratch canvases — hold blurred copies of the engine
  // canvas, used as the per-layer masks. Lazily created on first sync.
  // hideMaskCanvasRef: light blur for the soft hide-layer edge.
  // dilatedCanvasRef: heavier blur to extend the texture mask past the
  // hide edge so wisps drift outward.
  const hideMaskCanvasRef = useRef(null);
  const dilatedCanvasRef = useRef(null);
  const rafPendingRef = useRef(false);
  const isPaintingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });

  // Track image rendered size — fog overlay must match the visible map
  useEffect(() => {
    const img = mapImageRef?.current;
    if (!img) return;
    const update = () => setImgDims({ w: img.clientWidth, h: img.clientHeight });
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(img);
      return () => ro.disconnect();
    } else {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
  }, [mapImageRef]);

  // Mount the engine's canvas element into our wrapper. The canvas
  // is permanently hidden — it exists only as the mask source for the
  // textured div. Never visible to the user; just data.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!engine || !wrapper) return;
    const canvas = engine.canvas;
    if (!canvas) return;

    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.visibility = 'hidden';
    wrapper.appendChild(canvas);

    return () => {
      if (canvas.parentNode === wrapper) {
        wrapper.removeChild(canvas);
      }
    };
  }, [engine]);

  // Live opacity adjustments apply to the textured div (the visible
  // surface) rather than the now-hidden canvas.
  useEffect(() => {
    if (textureRef.current) {
      textureRef.current.style.opacity = String(fogOpacity);
    }
  }, [fogOpacity]);

  // Mask sync — encode the canvas to data URLs and apply them as CSS
  // masks on both fog layers whenever the engine changes. Synchronous
  // toDataURL ensures the mask lands in the SAME frame as the paint
  // stroke — no lag, no losing the path mid-drag. rAF-throttling
  // collapses bursts of change events from a fast drag into at most
  // one mask regen per frame.
  //
  // Two URLs:
  //   • hideUrl — engine canvas blurred lightly (FOG_HIDE_FEATHER_PX),
  //     contrast-restored. Soft brush boundary while keeping a solid
  //     interior so the hide colour fully occludes the map.
  //   • textureUrl — engine canvas blurred heavily (FOG_TEXTURE_DILATE_PX),
  //     contrast-restored. The texture layer's mask extends past the
  //     hide edge so wisps drift into the revealed area.
  //
  // Both passes use the same blur+contrast trick: blur extends alpha
  // outward and softens the falloff; contrast steepens it back up to
  // keep peak alpha near 1.0 in the interior. The difference between
  // hide and texture is just the blur radius.
  useEffect(() => {
    if (!engine) return;

    const renderMaskCanvas = (ref, blurPx, contrast) => {
      const src = engine.canvas;
      if (!src) return null;
      let dst = ref.current;
      if (!dst) {
        dst = document.createElement('canvas');
        ref.current = dst;
      }
      if (dst.width !== src.width) dst.width = src.width;
      if (dst.height !== src.height) dst.height = src.height;
      const ctx = dst.getContext('2d');
      ctx.clearRect(0, 0, dst.width, dst.height);
      ctx.filter = `blur(${blurPx}px) contrast(${contrast})`;
      ctx.drawImage(src, 0, 0);
      ctx.filter = 'none';
      return `url(${dst.toDataURL('image/png')})`;
    };

    const updateMask = () => {
      const canvas = engine.canvas;
      if (!canvas) return;

      const hideUrl = renderMaskCanvas(hideMaskCanvasRef, FOG_HIDE_FEATHER_PX, 2);
      const hide = hideRef.current;
      if (hide && hideUrl) {
        hide.style.maskImage = hideUrl;
        hide.style.webkitMaskImage = hideUrl;
      }

      const textureUrl = renderMaskCanvas(dilatedCanvasRef, FOG_TEXTURE_DILATE_PX, 2);
      const tex = textureRef.current;
      if (tex && textureUrl) {
        tex.style.maskImage = textureUrl;
        tex.style.webkitMaskImage = textureUrl;
      }
    };

    const onChange = () => {
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        updateMask();
      });
    };

    engine.on('change', onChange);
    engine.on('load', onChange);
    // Prime the mask once on mount in case the engine already has fog
    // (e.g. just loaded from the asset).
    updateMask();

    return () => {
      engine.off('change', onChange);
      engine.off('load', onChange);
    };
  }, [engine]);

  const screenToMask = useCallback((clientX, clientY) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !engine) return null;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const xRatio = (clientX - rect.left) / rect.width;
    const yRatio = (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(engine.width, xRatio * engine.width)),
      y: Math.max(0, Math.min(engine.height, yRatio * engine.height)),
    };
  }, [engine]);

  const handlePointerDown = useCallback((e) => {
    if (!paintMode || !engine) return;
    e.preventDefault();
    e.stopPropagation();
    const point = screenToMask(e.clientX, e.clientY);
    if (!point) return;
    try { wrapperRef.current.setPointerCapture(e.pointerId); } catch {}
    // Open a stroke on the engine BEFORE the first dab — the engine
    // captures a "before" snapshot here that pairs with the snapshot
    // taken on endStroke. The undo system listens for `strokeend`.
    engine.beginStroke(engine.mode); // 'paint' or 'erase' as the kind hint
    isPaintingRef.current = true;
    lastPointRef.current = point;
    engine.paintStroke([point]);
  }, [paintMode, engine, screenToMask]);

  const handlePointerMove = useCallback((e) => {
    if (!paintMode || !engine || !isPaintingRef.current) return;
    const point = screenToMask(e.clientX, e.clientY);
    if (!point) return;
    const last = lastPointRef.current;
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.5) return;
    engine.paintStroke([last, point]);
    lastPointRef.current = point;
  }, [paintMode, engine, screenToMask]);

  const handlePointerUp = useCallback((e) => {
    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;
    lastPointRef.current = null;
    try { wrapperRef.current.releasePointerCapture(e.pointerId); } catch {}
    if (engine) engine.endStroke(); // emits 'strokeend' for the undo subscriber
  }, [engine]);

  // Render the wrapper unconditionally — even at 0×0 — so the ref is
  // attached on first render and the mount-canvas effect can append the
  // engine canvas immediately. Conditionally returning null here would
  // strand the canvas off-DOM forever, because the [engine] mount effect
  // doesn't re-run when imgDims later become non-zero.
  const ready = imgDims.w > 0 && imgDims.h > 0;

  // Compute the grid of tile positions that covers the visible map
  // area. Each entry becomes one DOM element below; they overlap by
  // FOG_OVERLAP_FRACTION × FOG_TILE_SIZE_PX in both axes and screen-
  // blend with each other for a denser, less-repetitive look.
  //
  // The grid extends BEYOND the (0, 0) origin into negative
  // coordinates by `overlapTiles` positions, so the top-left corner
  // gets the same overlap density as the interior. Without this, a
  // point near (0, 0) is reached by only ONE tile (since tiles can
  // only start at >= 0 positions), while a point in the interior is
  // reached by `overlapTiles + 1` tiles — giving the visual impression
  // that fog is "shifted" away from the top-left. Same logic for the
  // bottom-right edge via `+ overlapTiles` instead of `+ 1`.
  const fogTiles = useMemo(() => {
    if (!imgDims.w || !imgDims.h) return [];
    const overlapTiles = Math.max(0, Math.ceil(FOG_TILE_SIZE_PX / FOG_STRIDE_PX) - 1);
    const cols = Math.ceil(imgDims.w / FOG_STRIDE_PX);
    const rows = Math.ceil(imgDims.h / FOG_STRIDE_PX);
    const out = [];
    for (let r = -overlapTiles; r <= rows; r++) {
      for (let c = -overlapTiles; c <= cols; c++) {
        out.push({ x: c * FOG_STRIDE_PX, y: r * FOG_STRIDE_PX });
      }
    }
    return out;
  }, [imgDims.w, imgDims.h]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: imgDims.w || 0,
        height: imgDims.h || 0,
        pointerEvents: paintMode && ready ? 'auto' : 'none',
        cursor: paintMode ? 'crosshair' : 'default',
        // touch-action:none is what flips React's onPointerDown listener
        // from passive to active so e.preventDefault() actually works
        // and the browser doesn't try to scroll/pan during a paint stroke.
        touchAction: 'none',
        // Sit above GridOverlay (z=5 / z=20 in edit mode). The grid
        // SVG has pointerEvents:'all' for hover-cell info and would
        // otherwise eat clicks meant for fog painting. The wrapper's
        // own pointerEvents flips to 'none' when paintMode is off, so
        // grid hover still works in non-paint contexts. The fog canvas
        // is mostly transparent so the grid remains visible underneath.
        zIndex: 25,
        opacity: paintMode ? Math.min(0.5, fogOpacity) : fogOpacity,
        // No mix-blend-mode at the wrapper level any more. The hide
        // layer needs NORMAL blending against the map (so it actually
        // hides), while the texture layer needs SCREEN blending (so
        // wisps lift the dark hide-layer below). Those goals conflict
        // at the wrapper level — split per-layer below.
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Boundary displacement filter — feTurbulence generates a 2D
          noise field; feDisplacementMap uses its R/G channels to push
          each pixel of the masked fog up to FOG_DISPLACE_SCALE px in
          x and y. The masked alpha edge gets jittered by the noise,
          producing wispy organic boundaries instead of a clean curve.
          Animating baseFrequency in a tight range continuously morphs
          the noise field so the wisps drift — cheap "fog blowing"
          motion without re-rendering the canvas. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <filter id="fog-displace" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={FOG_DISPLACE_FREQUENCY}
              numOctaves={FOG_DISPLACE_OCTAVES}
              seed="3"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                values={`${FOG_DISPLACE_FREQUENCY};${FOG_DISPLACE_FREQUENCY * 1.15};${FOG_DISPLACE_FREQUENCY}`}
                dur="14s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={FOG_DISPLACE_SCALE}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation={FOG_FEATHER_PX} />
          </filter>
        </defs>
      </svg>

      {/* Hide layer — solid colour, masked by the painted alpha. Its
          only job is to occlude the map. Sits beneath the texture
          layer so the texture's screen blend lifts the dark hide colour
          where wisps are bright, leaving deep shadow where wisps are
          dark. Mounts unconditionally; updateMask() applies maskImage. */}
      <div
        ref={hideRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundColor: FOG_HIDE_COLOR,
          maskRepeat: 'no-repeat',
          maskSize: '100% 100%',
          maskMode: 'alpha',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskSize: '100% 100%',
        }}
      />

      {/* On a single element, CSS applies `filter` BEFORE `mask`, so a
          filter on the masked div would jitter the GIF tiles but the
          mask would still cut a clean edge through the result. We need
          the filter to operate on the POST-MASK output, so we put the
          mask on textureRef and the filter on this parent wrapper. The
          displacement then warps the already-masked alpha edge, giving
          the wispy boundary we want.

          mix-blend-mode lives here (not on the wrapper) so the texture
          layer screen-blends with the hide layer underneath: bright
          wisps lift the dark hide colour to mid-bright, dark wisps stay
          dark. In the dilated overhang region (where the hide layer is
          transparent), the texture screens against the map directly,
          giving a "fog drifting past the edge" feel. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          filter: 'url(#fog-displace)',
          mixBlendMode: FOG_BLEND_MODE,
        }}
      >
        <div
          ref={textureRef}
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            maskRepeat: 'no-repeat',
            maskSize: '100% 100%',
            maskMode: 'alpha',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskSize: '100% 100%',
          }}
        >
          {fogTiles.map((t, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: `${t.x}px`,
                top: `${t.y}px`,
                width: `${FOG_TILE_SIZE_PX}px`,
                height: `${FOG_TILE_SIZE_PX}px`,
                backgroundImage: `url(${FOG_TEXTURE_URL})`,
                backgroundSize: `${FOG_TILE_SIZE_PX}px ${FOG_TILE_SIZE_PX}px`,
                backgroundRepeat: 'no-repeat',
                mixBlendMode: FOG_BLEND_MODE,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
