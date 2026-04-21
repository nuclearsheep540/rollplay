/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { COLORS } from '@/app/styles/colorTheme';

// WaveSurfer operates as a pure visual component here — no playback.
// Audio goes through the AudioEngine so effects apply; we only drive
// the cursor via setTime() from the engine's timeupdate events.

const REGION_ID = 'loop-region';
const SVG_NS = 'http://www.w3.org/2000/svg';

function parseBeatsPerBar(timeSignature) {
  if (!timeSignature || typeof timeSignature !== 'string') return 4;
  const top = parseInt(timeSignature.split('/')[0], 10);
  return Number.isFinite(top) && top > 0 ? top : 4;
}

// Snap `t` (seconds) to the nearest beat given a BPM. Passthrough if snap
// is off or bpm is missing.
function snapToBeat(t, bpm, enabled) {
  if (!enabled || !bpm || bpm <= 0 || t == null) return t;
  const beatSeconds = 60 / bpm;
  return Math.round(t / beatSeconds) * beatSeconds;
}

const WaveformViewer = forwardRef(function WaveformViewer({
  audioBuffer,
  regionStart = null,
  regionEnd = null,
  onRegionChange,
  regionEditEnabled = false,
  onSeek,
  waveColor = COLORS.silver,
  progressColor = COLORS.silver,
  cursorColor = COLORS.smoke,
  regionColor = 'rgba(59, 130, 246, 0.25)',
  height = 128,
  // Beat grid
  bpm = null,
  timeSignature = '4/4',
  snapToBeats = false,
  // Auto-scroll the waveform to keep the playhead in view (WaveSurfer default).
  followPlayhead = true,
}, ref) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsPluginRef = useRef(null);
  const currentRegionRef = useRef(null);
  const gridSvgRef = useRef(null);
  const onRegionChangeRef = useRef(onRegionChange);
  const onSeekRef = useRef(onSeek);
  const snapToBeatsRef = useRef(snapToBeats);
  const bpmRef = useRef(bpm);
  const timeSignatureRef = useRef(timeSignature);
  // Bumped at the end of the build effect to signal that the WaveSurfer
  // instance + regions plugin are ready.
  const [pluginBuildId, setPluginBuildId] = useState(0);

  // Keep callback refs current without forcing rebuilds
  useEffect(() => { onRegionChangeRef.current = onRegionChange; }, [onRegionChange]);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);
  useEffect(() => { snapToBeatsRef.current = snapToBeats; }, [snapToBeats]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { timeSignatureRef.current = timeSignature; }, [timeSignature]);

  useImperativeHandle(ref, () => ({
    setTime: (seconds) => {
      const ws = wavesurferRef.current;
      if (!ws) return;
      try { ws.setTime(seconds); } catch {}
    },
    zoom: (pxPerSec) => {
      const ws = wavesurferRef.current;
      if (!ws) return;
      try { ws.zoom(pxPerSec); } catch {}
    },
  }), []);

  // ── Build / teardown: only when the buffer itself changes ──────────────
  useEffect(() => {
    if (!containerRef.current || !audioBuffer) return;

    const peaks = [];
    for (let ch = 0; ch < Math.min(audioBuffer.numberOfChannels, 2); ch++) {
      peaks.push(audioBuffer.getChannelData(ch));
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      cursorColor,
      cursorWidth: 2,
      height,
      peaks,
      duration: audioBuffer.duration,
      interact: true,
      normalize: true,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      barAlign: '',
      autoScroll: followPlayhead,
    });

    const regions = ws.registerPlugin(RegionsPlugin.create());
    wavesurferRef.current = ws;
    regionsPluginRef.current = regions;

    const onInteraction = (time) => {
      if (typeof time === 'number' && onSeekRef.current) onSeekRef.current(time);
    };
    ws.on('interaction', onInteraction);

    // During drag we forward raw values so the visible region tracks the
    // mouse. Snapping happens in `region-update-end` (drop) only — simpler
    // and matches the default behaviour in Reaper/Logic/Ableton.
    const onRegionUpdate = (region) => {
      if (region.id !== REGION_ID) return;
      if (!onRegionChangeRef.current) return;
      onRegionChangeRef.current(region.start, region.end);
    };
    regions.on('region-updated', onRegionUpdate);

    const onRegionUpdateEnd = (region) => {
      if (region.id !== REGION_ID) return;
      if (!onRegionChangeRef.current) return;
      const start = snapToBeat(region.start, bpmRef.current, snapToBeatsRef.current);
      const end = snapToBeat(region.end, bpmRef.current, snapToBeatsRef.current);
      onRegionChangeRef.current(start, end);
    };
    regions.on('region-update-end', onRegionUpdateEnd);

    // Drag-to-create fires once on release — always snap if enabled.
    const onRegionCreated = (region) => {
      if (region.id === REGION_ID) return;
      const start = snapToBeat(region.start, bpmRef.current, snapToBeatsRef.current);
      const end = snapToBeat(region.end, bpmRef.current, snapToBeatsRef.current);
      region.remove();
      if (onRegionChangeRef.current) onRegionChangeRef.current(start, end);
    };
    regions.on('region-created', onRegionCreated);

    // Inject the SVG beat-grid overlay into WaveSurfer's scroll wrapper so
    // it scrolls naturally with the waveform when zoomed.
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';
    svg.style.width = '100%';
    svg.style.height = '100%';
    try {
      const wrapper = typeof ws.getWrapper === 'function' ? ws.getWrapper() : null;
      if (wrapper) {
        if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
        wrapper.prepend(svg);
      }
    } catch {}
    gridSvgRef.current = svg;

    // Redraw the grid on every WaveSurfer redraw (zoom, resize, etc.)
    const onRedraw = () => drawGrid();
    ws.on('redraw', onRedraw);
    ws.on('zoom', onRedraw);

    // Wake up the region-apply effect now that the plugin is in place.
    setPluginBuildId(id => id + 1);

    return () => {
      ws.un('interaction', onInteraction);
      ws.un('redraw', onRedraw);
      ws.un('zoom', onRedraw);
      regions.un('region-updated', onRegionUpdate);
      regions.un('region-update-end', onRegionUpdateEnd);
      regions.un('region-created', onRegionCreated);
      try { svg.remove(); } catch {}
      try { ws.destroy(); } catch {}
      wavesurferRef.current = null;
      regionsPluginRef.current = null;
      currentRegionRef.current = null;
      gridSvgRef.current = null;
    };
  }, [audioBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply height/colour changes without tearing down WaveSurfer ────────
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    try {
      ws.setOptions({ height, waveColor, progressColor, cursorColor });
    } catch {}
  }, [height, waveColor, progressColor, cursorColor]);

  // Toggle WaveSurfer's autoScroll when the user flips the follow button.
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    try { ws.setOptions({ autoScroll: followPlayhead }); } catch {}
  }, [followPlayhead]);

  // ── Reflect region props onto the WaveSurfer region ────────────────────
  useEffect(() => {
    const regions = regionsPluginRef.current;
    if (!regions) return;

    if (currentRegionRef.current) {
      try { currentRegionRef.current.remove(); } catch {}
      currentRegionRef.current = null;
    }

    if (regionStart != null && regionEnd != null && regionEnd > regionStart) {
      currentRegionRef.current = regions.addRegion({
        id: REGION_ID,
        start: regionStart,
        end: regionEnd,
        drag: regionEditEnabled,
        resize: regionEditEnabled,
        color: regionColor,
      });
    }
  }, [regionStart, regionEnd, regionEditEnabled, regionColor, pluginBuildId]);

  // ── Toggle drag-to-create on enable/disable ────────────────────────────
  useEffect(() => {
    const regions = regionsPluginRef.current;
    if (!regions) return;
    let cleanup = null;
    if (regionEditEnabled) {
      cleanup = regions.enableDragSelection({ color: regionColor });
    }
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [regionEditEnabled, regionColor, pluginBuildId]);

  // ── Beat / bar grid ────────────────────────────────────────────────────
  // Reads bpm / timeSignature from refs — the WaveSurfer `redraw` and
  // `zoom` handlers are registered in the build effect (deps:
  // [audioBuffer]) so they close over an older drawGrid. Using refs
  // guarantees the latest values even when the handler closure is stale.
  function drawGrid() {
    const svg = gridSvgRef.current;
    const ws = wavesurferRef.current;
    if (!svg || !ws) return;

    // Clear existing contents
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const bpmValue = bpmRef.current;
    const timeSig = timeSignatureRef.current;
    const duration = ws.getDuration ? ws.getDuration() : (audioBuffer?.duration ?? 0);
    if (!bpmValue || bpmValue <= 0 || !duration || duration <= 0) return;

    const wrapper = typeof ws.getWrapper === 'function' ? ws.getWrapper() : null;
    if (!wrapper) return;
    const totalWidth = wrapper.scrollWidth || wrapper.offsetWidth || 0;
    const totalHeight = wrapper.offsetHeight || 0;
    if (totalWidth <= 0 || totalHeight <= 0) return;

    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    svg.setAttribute('width', totalWidth);
    svg.setAttribute('height', totalHeight);

    const pxPerSec = totalWidth / duration;
    const beatSeconds = 60 / bpmValue;
    const beatsPerBar = parseBeatsPerBar(timeSig);
    const totalBeats = Math.ceil(duration / beatSeconds);

    // Alternate bar shading first (behind lines)
    for (let bar = 0; bar * beatsPerBar < totalBeats; bar++) {
      if (bar % 2 !== 1) continue; // shade every other bar
      const startSec = bar * beatsPerBar * beatSeconds;
      const endSec = Math.min((bar + 1) * beatsPerBar * beatSeconds, duration);
      const x = startSec * pxPerSec;
      const w = (endSec - startSec) * pxPerSec;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', 0);
      rect.setAttribute('width', w);
      rect.setAttribute('height', totalHeight);
      rect.setAttribute('fill', 'rgba(255, 255, 255, 0.04)');
      svg.appendChild(rect);
    }

    // Beat + bar lines
    for (let n = 0; n <= totalBeats; n++) {
      const x = n * beatSeconds * pxPerSec;
      if (x > totalWidth + 0.5) break;
      const isBar = n % beatsPerBar === 0;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', x);
      line.setAttribute('x2', x);
      line.setAttribute('y1', 0);
      line.setAttribute('y2', totalHeight);
      line.setAttribute('stroke', isBar ? 'rgba(255, 255, 255, 0.30)' : 'rgba(255, 255, 255, 0.12)');
      line.setAttribute('stroke-width', isBar ? 1.25 : 0.75);
      svg.appendChild(line);
    }
  }

  // Redraw the grid whenever the inputs change
  useEffect(() => {
    drawGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, timeSignature, height, pluginBuildId]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full" />
    </div>
  );
});

export default WaveformViewer;
