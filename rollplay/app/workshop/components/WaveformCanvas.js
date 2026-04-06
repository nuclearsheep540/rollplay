/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useEffect, useState, memo } from 'react';
import { COLORS } from '@/app/styles/colorTheme';

/**
 * Renders a static waveform from a decoded AudioBuffer onto a canvas.
 *
 * No dependencies, no audio playback, no library overhead.
 * Just reads PCM samples and draws vertical bars.
 */
export default memo(function WaveformCanvas({ audioBuffer, color = COLORS.silver }) {
  const canvasRef = useRef(null);
  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Size canvas for sharp rendering on HiDPI
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Mix to mono
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

    // Compute min/max per pixel column
    const samplesPerPixel = Math.floor(length / width);
    const midY = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;

    // Draw as a continuous filled waveform
    ctx.beginPath();
    ctx.moveTo(0, midY);

    // Upper envelope (max values)
    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, length);
      let max = 0;
      for (let i = start; i < end; i++) {
        if (samples[i] > max) max = samples[i];
      }
      ctx.lineTo(x, midY - max * midY);
    }

    // Lower envelope (min values) — draw right-to-left to close the shape
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

  // Re-draw when container resizes (zoom changes content width)
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

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  );
});
