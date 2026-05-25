/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { renderMaskCanvas } from '../utils/renderMaskCanvas';
import { useRenderTracker } from '@/app/shared/utils/renderTracker';

// Hard cap matching FOG_REGIONS_MAX in useFogRegions.js. The shader
// declares samplers and opacity slots for exactly this many regions;
// padding texture occupies any unused slot so all sampler bindings
// stay valid.
const MAX_REGIONS = 12;

// Contrast applied during the per-region CPU pre-blur. The blur extends
// the painted alpha outwards by `texture_dilate_px`; contrast then
// steepens it back up so the interior stays near peak alpha. Same value
// the previous layer used — kept here for visual parity.
const MASK_CONTRAST = 2;

const FOG_BLEND_MODE = 'screen';

const VERT_SRC = `#version 300 es
in vec2 aPosition;
in vec2 aUV;

out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

// Ashima Arts 2D simplex noise (public domain). Domain-warps the sample
// position with another noise read so wisp edges look organic — this is
// what replaces feDisplacementMap from the previous SVG-filter path.
// Multi-octave sum gives base shape + fine detail. Final intensity is
// modulated by the per-pixel max alpha across all bound region masks
// (each weighted by its own opacity uniform), so each region's painted
// area contributes its own visible fog. Samplers are unrolled because
// WebGL2 sampler indexing requires a constant expression.
const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 finalColor;

uniform float uTime;
uniform float uNoiseScale;
uniform float uDriftSpeed;
uniform float uWarpAmount;
uniform vec3 uFogTintThin;
uniform vec3 uFogTintDense;
uniform int uMaskCount;
uniform float uMaskOpacities[${MAX_REGIONS}];

${Array.from({ length: MAX_REGIONS }, (_, i) => `uniform sampler2D uMask${i};`).join('\n')}

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                          dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float sampleMaskAlpha(int idx, vec2 uv) {
${Array.from({ length: MAX_REGIONS }, (_, i) =>
  `  if (idx == ${i}) return texture(uMask${i}, uv).a * uMaskOpacities[${i}];`
).join('\n')}
  return 0.0;
}

void main() {
  vec2 uv = vUV;

  vec2 warp = vec2(
    snoise(uv * 4.0 + vec2(uTime * uDriftSpeed, 0.0)),
    snoise(uv * 4.0 + vec2(0.0, uTime * uDriftSpeed))
  ) * uWarpAmount;

  vec2 sampleUV = uv + warp;

  float rawNoise =
      snoise(sampleUV * uNoiseScale)        * 0.6
    + snoise(sampleUV * uNoiseScale * 2.0)  * 0.3
    + snoise(sampleUV * uNoiseScale * 4.0)  * 0.1;
  // colorMix uses the unbiased noise so we get the full 0..1 range for
  // the warm/cool tint blend — otherwise the +0.9 density bias would
  // saturate it near 1.0 everywhere.
  float colorMix = clamp(rawNoise * 0.5 + 0.5, 0.0, 1.0);
  float n = clamp(rawNoise * 0.5 + 0.8, 0.0, 1.0);

  float unionMask = 0.0;
  for (int i = 0; i < ${MAX_REGIONS}; i++) {
    if (i >= uMaskCount) break;
    unionMask = max(unionMask, sampleMaskAlpha(i, uv));
  }

  float intensity = n * unionMask;

  // Tonal variation within wisps: thinner parts get the darker grey
  // tint, denser parts get the lighter grey. Output is premultiplied
  // for the screen blend mode so the map lifts toward the tint at peak
  // intensity.
  vec3 tint = mix(uFogTintThin, uFogTintDense, colorMix);

  finalColor = vec4(tint * intensity, intensity);
}
`;

/**
 * FogPixiTextureLayer — GPU-rendered procedural fog texture.
 *
 * Replaces the previous CSS-tiled animated-GIF + SVG-filter +
 * offscreen-union-canvas approach with a single fragment shader that:
 *   1. Generates the fog texture procedurally (multi-octave simplex
 *      noise with domain warping, animated via a time uniform).
 *   2. Reads each enabled region's mask canvas as a GPU texture and
 *      composites the per-pixel max alpha across them in-shader —
 *      no offscreen union canvas, no toDataURL roundtrips.
 *   3. Modulates the noise by the union mask to confine fog to the
 *      painted areas.
 *
 * Per-region `texture_dilate_px` is preserved via the existing
 * renderMaskCanvas CPU blur into a scratch canvas, which is then
 * uploaded to GPU on each engine change. Per-region opacity flows
 * through the shader's uMaskOpacities array. Region enable toggles
 * adjust uMaskCount + the textures bound to the sampler slots.
 */
export default function FogPixiTextureLayer({
  regions = [],
  getEngine,
  imgDims,
}) {
  useRenderTracker('FogPixiTextureLayer');
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  // Pixi runtime handles, stashed in refs so the sync effects below can
  // address them without re-importing the namespace or going through the
  // async init pipeline a second time.
  const pixiRef = useRef(null);            // PIXI namespace
  const appRef = useRef(null);             // PIXI.Application
  const shaderRef = useRef(null);          // PIXI.Shader
  const meshRef = useRef(null);            // PIXI.Mesh (for geometry resize)
  const padSourceRef = useRef(null);       // shared 1×1 CanvasSource for unused slots
  const tickerCallbackRef = useRef(null);
  const startTimeRef = useRef(0);
  // Per-region tracking: scratch canvas (pre-blurred mask), Pixi texture
  // wrapping that canvas, engine subscription handler, last-known dilate.
  // Keyed by region id.
  const regionStateRef = useRef(new Map());

  // Flips to true once `app.init()` resolves so the sync effect below
  // knows it can safely manipulate shader resources. Using a state
  // variable (rather than a ref) so React re-runs the sync effect with
  // the same enabledRegions input after init completes.
  const [pixiReady, setPixiReady] = useState(false);

  const enabledRegions = useMemo(() => {
    return regions
      .filter((r) => r.enabled)
      .slice(0, MAX_REGIONS)
      .map((r) => ({
        id: r.id,
        opacity: r.opacity ?? 1.0,
        textureDilatePx: r.texture_dilate_px,
      }));
  }, [regions]);

  // Mount the Pixi application once. The whole init is async, so guard
  // against unmount-during-init via a cancelled flag.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      const PIXI = await import('pixi.js');
      if (cancelled) return;

      const app = new PIXI.Application();
      await app.init({
        canvas,
        width: imgDims?.w || 1,
        height: imgDims?.h || 1,
        antialias: false,
        autoStart: false, // ticker controlled manually via visibilitychange
        backgroundAlpha: 0,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        preference: 'webgl', // shader is GLSL; force WebGL backend over WebGPU
      });
      if (cancelled) {
        app.destroy(true, { children: true, texture: true });
        return;
      }

      // 1×1 transparent canvas for any sampler slot we don't have a
      // region for. Pixi-side source kept here so we can both bind it
      // initially AND fall back to it when a region is removed.
      const padCanvas = document.createElement('canvas');
      padCanvas.width = 1;
      padCanvas.height = 1;
      const padTexture = PIXI.Texture.from(padCanvas);

      const w = Math.max(1, imgDims?.w || 1);
      const h = Math.max(1, imgDims?.h || 1);
      const geometry = new PIXI.Geometry({
        attributes: {
          aPosition: {
            buffer: new Float32Array([0, 0, w, 0, w, h, 0, h]),
            format: 'float32x2',
          },
          aUV: {
            buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
            format: 'float32x2',
          },
        },
        indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
      });

      const glProgram = PIXI.GlProgram.from({
        vertex: VERT_SRC,
        fragment: FRAG_SRC,
      });

      const samplerResources = {};
      for (let i = 0; i < MAX_REGIONS; i++) {
        samplerResources[`uMask${i}`] = padTexture.source;
      }
      const shader = PIXI.Shader.from({
        gl: glProgram,
        resources: {
          fogUniforms: {
            uTime: { value: 0, type: 'f32' },
            uNoiseScale: { value: 3.0, type: 'f32' },
            uDriftSpeed: { value: 0.08, type: 'f32' },
            uWarpAmount: { value: 0.06, type: 'f32' },
            // Tonal variation: thinner wisps tint toward the darker
            // grey (30% black ≈ rgb(0.7)), denser wisps toward the
            // lighter grey (10% black ≈ rgb(0.9)). Both still light
            // enough to lift the map under screen blend.
            uFogTintThin: { value: new Float32Array([0.7, 0.7, 0.7]), type: 'vec3<f32>' },
            uFogTintDense: { value: new Float32Array([0.9, 0.9, 0.9]), type: 'vec3<f32>' },
            uMaskCount: { value: 0, type: 'i32' },
            uMaskOpacities: {
              value: new Float32Array(MAX_REGIONS),
              type: 'f32',
              size: MAX_REGIONS,
            },
          },
          ...samplerResources,
        },
      });

      const mesh = new PIXI.Mesh({ geometry, shader });
      app.stage.addChild(mesh);

      pixiRef.current = PIXI;
      appRef.current = app;
      shaderRef.current = shader;
      meshRef.current = mesh;
      padSourceRef.current = padTexture.source;

      startTimeRef.current = performance.now();
      const tickerCallback = () => {
        const t = (performance.now() - startTimeRef.current) / 1000;
        shader.resources.fogUniforms.uniforms.uTime = t;
      };
      tickerCallbackRef.current = tickerCallback;
      app.ticker.add(tickerCallback);
      app.ticker.start();

      setPixiReady(true);
    })();

    return () => {
      cancelled = true;
      // Tear down per-region subscriptions before destroying the app —
      // destroying Pixi textures while the engine could still fire events
      // is fine (the handlers just call `.update()` on a destroyed
      // source, which no-ops in v8), but cleaner to detach explicitly.
      for (const [id, state] of regionStateRef.current) {
        const engine = getEngine?.(id);
        if (engine && state.onChange) {
          engine.off('change', state.onChange);
          engine.off('load', state.onChange);
        }
      }
      regionStateRef.current.clear();

      const app = appRef.current;
      if (app) {
        if (tickerCallbackRef.current) {
          app.ticker.remove(tickerCallbackRef.current);
          tickerCallbackRef.current = null;
        }
        app.destroy(true, { children: true, texture: true });
      }
      pixiRef.current = null;
      appRef.current = null;
      shaderRef.current = null;
      meshRef.current = null;
      padSourceRef.current = null;
      setPixiReady(false);
    };
    // Initialise once; resizes/region changes handled by dedicated
    // effects below so we don't tear down the GPU pipeline on every prop tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize the renderer + geometry quad when imgDims changes.
  useEffect(() => {
    if (!pixiReady) return;
    const app = appRef.current;
    const mesh = meshRef.current;
    if (!app || !mesh || !imgDims?.w || !imgDims?.h) return;
    app.renderer.resize(imgDims.w, imgDims.h);
    const posBuffer = mesh.geometry.attributes.aPosition?.buffer;
    if (posBuffer) {
      posBuffer.data = new Float32Array([
        0, 0, imgDims.w, 0, imgDims.w, imgDims.h, 0, imgDims.h,
      ]);
      posBuffer.update();
    }
  }, [pixiReady, imgDims?.w, imgDims?.h]);

  // Sync the enabled-regions set with our region state map. Creates
  // scratch canvases + Pixi textures + engine subscriptions for new
  // regions, tears down state for removed ones, and rebinds sampler
  // slots + opacity uniforms accordingly.
  useEffect(() => {
    if (!pixiReady) return;
    const PIXI = pixiRef.current;
    const shader = shaderRef.current;
    const padSource = padSourceRef.current;
    if (!PIXI || !shader || !padSource) return;

    const liveIds = new Set(enabledRegions.map((r) => r.id));

    // Drop regions that are no longer enabled.
    for (const [id, state] of regionStateRef.current) {
      if (liveIds.has(id)) continue;
      const engine = getEngine?.(id);
      if (engine && state.onChange) {
        engine.off('change', state.onChange);
        engine.off('load', state.onChange);
      }
      // Only destroy textures we created ourselves; pad source is owned
      // by the mount effect.
      if (state.texture) state.texture.destroy(true);
      regionStateRef.current.delete(id);
    }

    const fogUniforms = shader.resources.fogUniforms.uniforms;
    const opacities = fogUniforms.uMaskOpacities;

    enabledRegions.forEach((r, idx) => {
      const engine = getEngine?.(r.id);
      if (!engine) return;

      let state = regionStateRef.current.get(r.id);
      if (!state) {
        const scratchRef = { current: null };
        const scratch = renderMaskCanvas(
          engine.canvas,
          scratchRef,
          r.textureDilatePx,
          MASK_CONTRAST,
        );
        // engine.canvas always exists in the browser (FogEngine creates
        // it in its constructor when document is defined), so scratch is
        // expected to be non-null here. Guard anyway — if something is
        // genuinely missing we'd rather skip this region than crash.
        if (!scratch) return;
        const texture = PIXI.Texture.from(scratch);

        const onChange = () => {
          const s = regionStateRef.current.get(r.id);
          if (!s) return;
          const c = renderMaskCanvas(
            engine.canvas,
            s.scratchRef,
            s.textureDilatePx,
            MASK_CONTRAST,
          );
          if (!c) return;
          s.texture.source.update();
        };
        engine.on('change', onChange);
        engine.on('load', onChange);

        state = {
          scratchRef,
          texture,
          onChange,
          textureDilatePx: r.textureDilatePx,
        };
        regionStateRef.current.set(r.id, state);
      } else if (state.textureDilatePx !== r.textureDilatePx) {
        // Dilate slider moved — rebuild the scratch and re-upload.
        state.textureDilatePx = r.textureDilatePx;
        renderMaskCanvas(
          engine.canvas,
          state.scratchRef,
          r.textureDilatePx,
          MASK_CONTRAST,
        );
        state.texture.source.update();
      }

      shader.resources[`uMask${idx}`] = state.texture.source;
      opacities[idx] = r.opacity;
    });

    // Pad remaining sampler slots and zero out unused opacities.
    for (let i = enabledRegions.length; i < MAX_REGIONS; i++) {
      shader.resources[`uMask${i}`] = padSource;
      opacities[i] = 0;
    }

    fogUniforms.uMaskCount = enabledRegions.length;
  }, [pixiReady, enabledRegions, getEngine]);

  // Pause/resume ticker on document visibilitychange. The animation IS
  // the time uniform; no point running it while the tab is hidden.
  useEffect(() => {
    if (!pixiReady) return;
    const onVisibility = () => {
      const app = appRef.current;
      if (!app) return;
      if (document.hidden) app.ticker.stop();
      else app.ticker.start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pixiReady]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          mixBlendMode: FOG_BLEND_MODE,
        }}
      />
    </div>
  );
}
