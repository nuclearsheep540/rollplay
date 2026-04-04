/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Detect BPM from a decoded AudioBuffer using realtime-bpm-analyzer.
 *
 * Uses offline full-buffer analysis with a lowpass filter to isolate
 * bass frequencies for reliable beat detection. Returns the highest-
 * confidence BPM candidate, or null if no clear beat is found.
 *
 * The library is dynamically imported to avoid SSR issues (it uses
 * CustomEvent which doesn't exist in Node.js).
 *
 * @param {AudioBuffer} audioBuffer - Decoded audio buffer from Web Audio API
 * @returns {Promise<number|null>} BPM value or null if detection fails
 */
export async function detectBpm(audioBuffer) {
  if (!audioBuffer || audioBuffer.length === 0) return null;

  try {
    const { analyzeFullBuffer } = await import('realtime-bpm-analyzer');
    const tempos = await analyzeFullBuffer(audioBuffer);

    if (!tempos || tempos.length === 0) return null;

    return Math.round(tempos[0].tempo);
  } catch (error) {
    console.warn('BPM analysis failed:', error);
    return null;
  }
}
