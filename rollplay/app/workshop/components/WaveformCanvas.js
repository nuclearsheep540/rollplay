/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { COLORS } from '@/app/styles/colorTheme';

/**
 * Renders a waveform from a decoded AudioBuffer.
 *
 * Performance strategy (informed by MDN canvas optimization + HN discussion):
 * 1. Pre-compute min/max peaks per pixel once (the expensive part)
 * 2. Render to a single offscreen canvas (capped at 8192px for GPU safety)
 * 3. No scroll listeners or redraws — the canvas sits in the DOM at full
 *    content width and scrolls naturally with the container, same as the ruler.
 *    For content wider than 8192px, CSS transform scales the offscreen image.
 * 4. Alpha disabled, integer coordinates, batched path operations.
 */

const MAX_CANVAS_WIDTH = 8192;

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
  const monoRef = useRef(null);
  const monoBufferIdRef = useRef(null);
  const drawnKeyRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);

  // ── Cache mono mix (once per buffer) ───────────────────────────────────
  useEffect(() => {
    if (!audioBuffer) { monoRef.current = null; monoBufferIdRef.current = null; return; }
    const bufferId = `${audioBuffer.length}_${audioBuffer.sampleRate}`;
    if (monoBufferIdRef.current === bufferId) return;

    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const samples = new Float32Array(length);
    for (let ch = 0; ch < numChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) samples[i] += data[i];
    }
    if (numChannels > 1) {
      const scale = 1 / numChannels;
      for (let i = 0; i < length; i++) samples[i] *= scale;
    }

    monoRef.current = samples;
    monoBufferIdRef.current = bufferId;
    drawnKeyRef.current = null; // Force redraw
  }, [audioBuffer]);

  // ── Draw waveform to canvas ────────────────────────────────────────────
  // Canvas sits in the DOM at contentWidth (or MAX_CANVAS_WIDTH, whichever
  // is smaller). It scrolls naturally with the parent — no JS scroll handling.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const samples = monoRef.current;
    if (!canvas || !container || !samples) return;

    const contentWidth = container.clientWidth;
    const height = container.clientHeight;
    if (contentWidth <= 0 || height <= 0) return;

    const drawKey = `${monoBufferIdRef.current}_${contentWidth}_${height}`;
    if (drawnKeyRef.current === drawKey) return; // Already drawn at this size
    drawnKeyRef.current = drawKey;

    // Canvas width: full content width if it fits, otherwise cap + scale via CSS
    const canvasWidth = Math.min(contentWidth, MAX_CANVAS_WIDTH);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${contentWidth}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.scale(dpr * (canvasWidth / contentWidth) > 0 ? (canvasWidth * dpr) / (contentWidth * dpr) * dpr : dpr, dpr);

    // Simpler: just scale so drawing coords are in contentWidth space
    ctx.resetTransform();
    ctx.scale((canvasWidth * dpr) / contentWidth, dpr);

    const totalSamples = samples.length;
    const midY = height / 2;

    // Background
    ctx.fillStyle = 'transparent';
    ctx.clearRect(0, 0, contentWidth, height);

    // Waveform — compute min/max per pixel and draw filled shape
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, midY | 0);

    const samplesPerPx = totalSamples / contentWidth;

    // Upper envelope
    for (let px = 0; px < contentWidth; px++) {
      const s = (px * samplesPerPx) | 0;
      const e = Math.min(((px + 1) * samplesPerPx) | 0, totalSamples);
      let max = 0;
      for (let i = s; i < e; i++) { if (samples[i] > max) max = samples[i]; }
      ctx.lineTo(px, (midY - max * midY) | 0);
    }

    // Lower envelope (right to left)
    for (let px = contentWidth - 1; px >= 0; px--) {
      const s = (px * samplesPerPx) | 0;
      const e = Math.min(((px + 1) * samplesPerPx) | 0, totalSamples);
      let min = 0;
      for (let i = s; i < e; i++) { if (samples[i] < min) min = samples[i]; }
      ctx.lineTo(px, (midY - min * midY) | 0);
    }

    ctx.closePath();
    ctx.fill();
  }, [color]);

  // Draw on buffer change or container resize
  useEffect(() => { draw(); }, [audioBuffer, draw]);

  const lastSizeRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w !== lastSizeRef.current.w || h !== lastSizeRef.current.h) {
        lastSizeRef.current = { w, h };
        drawnKeyRef.current = null;
        draw();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  // ── Drag: region select or pan ─────────────────────────────────────────
  const pxToTime = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const contentWidth = el.clientWidth;
    return Math.max(0, Math.min(duration, (px / contentWidth) * duration));
  }, [duration]);

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
    setDragEnd(Math.max(0, Math.min(e.clientX - rect.left, rect.width)));
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    if (!dragging || dragStart == null || dragEnd == null) { setDragging(false); return; }
    const t1 = pxToTime(containerRef.current.getBoundingClientRect().left + dragStart);
    const t2 = pxToTime(containerRef.current.getBoundingClientRect().left + dragEnd);
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

  // ── Region overlay (positioned in content space, scrolls naturally) ────
  const containerWidth = containerRef.current?.clientWidth || 1;
  const regionLeft = regionStart != null && duration > 0 ? (regionStart / duration) * containerWidth : null;
  const regionWidth = regionStart != null && regionEnd != null && duration > 0
    ? ((regionEnd - regionStart) / duration) * containerWidth : null;

  const dragLeft = dragging && dragStart != null && dragEnd != null ? Math.min(dragStart, dragEnd) : null;
  const dragW = dragging && dragStart != null && dragEnd != null ? Math.abs(dragEnd - dragStart) : null;

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

      {regionLeft != null && regionWidth != null && !dragging && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${regionLeft}px`,
            width: `${regionWidth}px`,
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            borderLeft: '1px solid rgba(59, 130, 246, 0.5)',
            borderRight: '1px solid rgba(59, 130, 246, 0.5)',
          }}
        />
      )}

      {dragLeft != null && dragW != null && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${dragLeft}px`,
            width: `${dragW}px`,
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
          }}
        />
      )}
    </div>
  );
});
