/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { COLORS } from '@/app/styles/colorTheme';

// WaveSurfer operates as a pure visual component here — no playback.
// Audio goes through the AudioEngine so effects apply; we only drive
// the cursor via setTime() from the engine's timeupdate events.

const REGION_ID = 'loop-region';

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
}, ref) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsPluginRef = useRef(null);
  const currentRegionRef = useRef(null);
  const onRegionChangeRef = useRef(onRegionChange);
  const onSeekRef = useRef(onSeek);

  // Keep callback refs current without forcing rebuilds
  useEffect(() => { onRegionChangeRef.current = onRegionChange; }, [onRegionChange]);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);

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
    });

    const regions = ws.registerPlugin(RegionsPlugin.create());
    wavesurferRef.current = ws;
    regionsPluginRef.current = regions;

    const onInteraction = (time) => {
      if (typeof time === 'number' && onSeekRef.current) onSeekRef.current(time);
    };
    ws.on('interaction', onInteraction);

    const onRegionUpdate = (region) => {
      if (region.id !== REGION_ID) return;
      if (onRegionChangeRef.current) onRegionChangeRef.current(region.start, region.end);
    };
    regions.on('region-updated', onRegionUpdate);

    const onRegionCreated = (region) => {
      if (region.id === REGION_ID) return;
      const start = region.start;
      const end = region.end;
      region.remove();
      if (onRegionChangeRef.current) onRegionChangeRef.current(start, end);
    };
    regions.on('region-created', onRegionCreated);

    return () => {
      ws.un('interaction', onInteraction);
      regions.un('region-updated', onRegionUpdate);
      regions.un('region-created', onRegionCreated);
      try { ws.destroy(); } catch {}
      wavesurferRef.current = null;
      regionsPluginRef.current = null;
      currentRegionRef.current = null;
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
  }, [regionStart, regionEnd, regionEditEnabled, regionColor]);

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
  }, [regionEditEnabled, regionColor]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full" />
    </div>
  );
});

export default WaveformViewer;
