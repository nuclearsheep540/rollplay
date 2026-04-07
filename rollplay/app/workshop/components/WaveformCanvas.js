/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { COLORS } from '@/app/styles/colorTheme';

/**
 * Renders a static waveform from a decoded AudioBuffer onto a canvas.
 * Supports click-and-drag to create/modify a loop region overlay.
 *
 * Props:
 *   audioBuffer   — decoded AudioBuffer
 *   duration      — track duration in seconds (for pixel↔time conversion)
 *   regionStart   — loop region start in seconds (or null)
 *   regionEnd     — loop region end in seconds (or null)
 *   onRegionChange(start, end) — called when user drags a new region
 *   color         — waveform fill color
 */
export default memo(function WaveformCanvas({
  audioBuffer,
  duration = 0,
  regionStart = null,
  regionEnd = null,
  onRegionChange,
  color = COLORS.silver,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [renderKey, setRenderKey] = useState(0);

  // Drag state for creating regions
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null); // px
  const [dragEnd, setDragEnd] = useState(null);     // px

  // ── Draw waveform ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

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

    const samplesPerPixel = Math.floor(length / width) || 1;
    const midY = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(0, midY);

    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, length);
      let max = 0;
      for (let i = start; i < end; i++) {
        if (samples[i] > max) max = samples[i];
      }
      ctx.lineTo(x, midY - max * midY);
    }

    for (let x = width - 1; x >= 0; x--) {
      const start = x * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, length);
      let min = 0;
      for (let i = start; i < end; i++) {
        if (samples[i] < min) min = samples[i];
      }
      ctx.lineTo(x, midY - min * midY);
    }

    ctx.closePath();
    ctx.fill();
  }, [audioBuffer, color, renderKey]);

  // ── Resize observer ────────────────────────────────────────────────────
  const lastSizeRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w !== lastSizeRef.current.w || h !== lastSizeRef.current.h) {
        lastSizeRef.current = { w, h };
        setRenderKey(k => k + 1);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // ── Drag to create region ──────────────────────────────────────────────
  const pxToTime = useCallback((px) => {
    const el = containerRef.current;
    if (!el || !duration) return 0;
    return Math.max(0, Math.min(duration, (px / el.clientWidth) * duration));
  }, [duration]);

  const handleMouseDown = useCallback((e) => {
    if (!duration) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setDragging(true);
    setDragStart(x);
    setDragEnd(x);
  }, [duration]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setDragEnd(x);
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    if (!dragging || dragStart == null || dragEnd == null) {
      setDragging(false);
      return;
    }

    const t1 = pxToTime(dragStart);
    const t2 = pxToTime(dragEnd);
    const start = Math.min(t1, t2);
    const end = Math.max(t1, t2);

    setDragging(false);
    setDragStart(null);
    setDragEnd(null);

    // Only commit if the region is at least 0.1s wide (prevents accidental clicks)
    if (end - start > 0.1 && onRegionChange) {
      onRegionChange(parseFloat(start.toFixed(3)), parseFloat(end.toFixed(3)));
    }
  }, [dragging, dragStart, dragEnd, pxToTime, onRegionChange]);

  // Global mouse listeners for drag (so dragging outside the element still works)
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => handleMouseMove(e);
    const onUp = () => handleMouseUp();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  // ── Compute region overlay positions ───────────────────────────────────
  const containerWidth = containerRef.current?.clientWidth || 1;

  // Active drag region (while dragging)
  const dragLeft = dragging && dragStart != null && dragEnd != null
    ? Math.min(dragStart, dragEnd) : null;
  const dragWidth = dragging && dragStart != null && dragEnd != null
    ? Math.abs(dragEnd - dragStart) : null;

  // Committed region (from props)
  const regionLeft = regionStart != null && duration > 0
    ? (regionStart / duration) * containerWidth : null;
  const regionWidth = regionStart != null && regionEnd != null && duration > 0
    ? ((regionEnd - regionStart) / duration) * containerWidth : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onMouseDown={handleMouseDown}
      style={{ cursor: duration ? 'crosshair' : 'default' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Committed region overlay */}
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
