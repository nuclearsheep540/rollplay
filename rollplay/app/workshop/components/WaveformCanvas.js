/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { COLORS } from '@/app/styles/colorTheme';

/**
 * Renders a waveform from a decoded AudioBuffer.
 *
 * Uses virtual rendering — the canvas stays viewport-sized and only draws
 * the samples currently visible based on scroll position. This avoids
 * creating enormous canvases at high zoom levels.
 *
 * Supports click-and-drag to create loop regions (when regionEditEnabled)
 * or horizontal pan scrolling (default).
 */
export default memo(function WaveformCanvas({
  audioBuffer,
  duration = 0,
  regionStart = null,
  regionEnd = null,
  onRegionChange,
  regionEditEnabled = false,
  scrollContainerRef = null,
  color = COLORS.silver,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const monoRef = useRef(null);        // Cached mono-mixed samples
  const monoBufferIdRef = useRef(null); // Track which buffer was mixed

  // Drag state for creating regions
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);

  // ── Cache mono mix ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!audioBuffer) { monoRef.current = null; monoBufferIdRef.current = null; return; }
    // Only remix if the buffer changed
    const bufferId = `${audioBuffer.length}_${audioBuffer.sampleRate}_${audioBuffer.numberOfChannels}`;
    if (monoBufferIdRef.current === bufferId) return;

    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const samples = new Float32Array(length);
    for (let ch = 0; ch < numChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        samples[i] += data[i];
      }
    }
    const scale = 1 / numChannels;
    for (let i = 0; i < length; i++) samples[i] *= scale;

    monoRef.current = samples;
    monoBufferIdRef.current = bufferId;
  }, [audioBuffer]);

  // ── Draw waveform (visible portion only) ───────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const samples = monoRef.current;
    if (!canvas || !container || !samples || !duration) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Canvas is sized to the VISIBLE area (container's viewport), not the full content width
    const visibleWidth = container.clientWidth;
    const visibleHeight = container.clientHeight;
    if (visibleWidth === 0 || visibleHeight === 0) return;

    canvas.width = visibleWidth * dpr;
    canvas.height = visibleHeight * dpr;
    ctx.scale(dpr, dpr);

    // Figure out which portion of the waveform is visible based on scroll
    const scrollEl = scrollContainerRef?.current;
    const parentEl = container.parentElement; // the explicit-width content div
    const contentWidth = parentEl?.clientWidth || visibleWidth;
    const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;

    // The container is positioned inside the content row. Its offset from the content start
    // is its offsetLeft. The visible window within the content is [scrollLeft, scrollLeft + visibleWidth].
    const containerOffset = container.offsetLeft || 0;
    const visibleStartPx = Math.max(0, scrollLeft - containerOffset);
    const visibleEndPx = Math.min(contentWidth, scrollLeft - containerOffset + visibleWidth);

    // Convert to sample range
    const totalSamples = samples.length;
    const samplesPerPx = totalSamples / contentWidth;
    const sampleStart = Math.floor(visibleStartPx * samplesPerPx);
    const sampleEnd = Math.ceil(visibleEndPx * samplesPerPx);

    const midY = visibleHeight / 2;
    ctx.clearRect(0, 0, visibleWidth, visibleHeight);
    ctx.fillStyle = color;

    // Draw the waveform for the visible pixel range
    const pxCount = visibleWidth;
    const samplesPerVisiblePx = (sampleEnd - sampleStart) / pxCount;

    ctx.beginPath();
    ctx.moveTo(0, midY);

    // Upper envelope
    for (let px = 0; px < pxCount; px++) {
      const s = Math.floor(sampleStart + px * samplesPerVisiblePx);
      const e = Math.min(Math.floor(sampleStart + (px + 1) * samplesPerVisiblePx), totalSamples);
      let max = 0;
      for (let i = s; i < e; i++) {
        if (samples[i] > max) max = samples[i];
      }
      ctx.lineTo(px, midY - max * midY);
    }

    // Lower envelope (right to left)
    for (let px = pxCount - 1; px >= 0; px--) {
      const s = Math.floor(sampleStart + px * samplesPerVisiblePx);
      const e = Math.min(Math.floor(sampleStart + (px + 1) * samplesPerVisiblePx), totalSamples);
      let min = 0;
      for (let i = s; i < e; i++) {
        if (samples[i] < min) min = samples[i];
      }
      ctx.lineTo(px, midY - min * midY);
    }

    ctx.closePath();
    ctx.fill();
  }, [duration, color, scrollContainerRef]);

  // Redraw on buffer change
  useEffect(() => {
    draw();
  }, [audioBuffer, draw]);

  // Redraw on scroll (virtual rendering)
  useEffect(() => {
    const scrollEl = scrollContainerRef?.current;
    if (!scrollEl) return;
    const onScroll = () => draw();
    scrollEl.addEventListener('scroll', onScroll);
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [scrollContainerRef, draw]);

  // Redraw on resize
  const lastSizeRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w !== lastSizeRef.current.w || h !== lastSizeRef.current.h) {
        lastSizeRef.current = { w, h };
        draw();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  // ── Drag: region select (when enabled) or horizontal pan (default) ────
  const pxToTime = useCallback((px) => {
    const el = containerRef.current;
    const parentEl = el?.parentElement;
    if (!el || !parentEl || !duration) return 0;
    const contentWidth = parentEl.clientWidth;
    const scrollEl = scrollContainerRef?.current;
    const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;
    const containerOffset = el.offsetLeft || 0;
    // px is relative to the visible canvas; convert to content position then to time
    const contentPx = scrollLeft - containerOffset + px;
    return Math.max(0, Math.min(duration, (contentPx / contentWidth) * duration));
  }, [duration, scrollContainerRef]);

  const handleMouseDown = useCallback((e) => {
    if (regionEditEnabled) {
      if (!duration) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setDragging(true);
      setDragStart(x);
      setDragEnd(x);
    } else {
      const scrollEl = scrollContainerRef?.current;
      if (!scrollEl) return;
      const startX = e.clientX;
      const startScroll = scrollEl.scrollLeft;
      const onMove = (ev) => { scrollEl.scrollLeft = startScroll + (startX - ev.clientX); };
      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  }, [regionEditEnabled, duration, scrollContainerRef]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setDragEnd(x);
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    if (!dragging || dragStart == null || dragEnd == null) { setDragging(false); return; }
    const t1 = pxToTime(dragStart);
    const t2 = pxToTime(dragEnd);
    const start = Math.min(t1, t2);
    const end = Math.max(t1, t2);
    setDragging(false);
    setDragStart(null);
    setDragEnd(null);
    if (end - start > 0.1 && onRegionChange) {
      onRegionChange(parseFloat(start.toFixed(3)), parseFloat(end.toFixed(3)));
    }
  }, [dragging, dragStart, dragEnd, pxToTime, onRegionChange]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => handleMouseMove(e);
    const onUp = () => handleMouseUp();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, handleMouseMove, handleMouseUp]);

  // ── Region overlay positions ───────────────────────────────────────────
  // These are relative to the full content width, converted to visible canvas px
  const getRegionPx = () => {
    const el = containerRef.current;
    const parentEl = el?.parentElement;
    if (!el || !parentEl || !duration) return null;
    if (regionStart == null || regionEnd == null) return null;
    const contentWidth = parentEl.clientWidth;
    const scrollEl = scrollContainerRef?.current;
    const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;
    const containerOffset = el.offsetLeft || 0;
    const rStartPx = (regionStart / duration) * contentWidth - scrollLeft + containerOffset;
    const rEndPx = (regionEnd / duration) * contentWidth - scrollLeft + containerOffset;
    const visibleWidth = el.clientWidth;
    const left = Math.max(0, rStartPx);
    const right = Math.min(visibleWidth, rEndPx);
    if (right <= left) return null;
    return { left, width: right - left };
  };

  const regionPx = getRegionPx();

  // Drag overlay
  const dragLeft = dragging && dragStart != null && dragEnd != null ? Math.min(dragStart, dragEnd) : null;
  const dragWidth = dragging && dragStart != null && dragEnd != null ? Math.abs(dragEnd - dragStart) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onMouseDown={handleMouseDown}
      style={{ cursor: regionEditEnabled ? 'crosshair' : duration ? 'grab' : 'default' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />

      {/* Committed region overlay */}
      {regionPx && !dragging && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${regionPx.left}px`,
            width: `${regionPx.width}px`,
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            borderLeft: '1px solid rgba(59, 130, 246, 0.5)',
            borderRight: '1px solid rgba(59, 130, 246, 0.5)',
          }}
        />
      )}

      {/* Active drag region overlay */}
      {dragLeft != null && dragWidth != null && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${dragLeft}px`,
            width: `${dragWidth}px`,
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
          }}
        />
      )}
    </div>
  );
});
