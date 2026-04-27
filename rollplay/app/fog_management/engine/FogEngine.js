/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import EventEmitter from './EventEmitter';

const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;
const DEFAULT_BRUSH_PX = 40;
const MIN_BRUSH_PX = 2;
const MAX_BRUSH_PX = 500;

const FOG_FILL = 'rgba(0, 0, 0, 1)';

/**
 * FogEngine — pure-JS owner of a fog-of-war bitmap.
 *
 * Owns a single off-DOM canvas (the source of truth for the mask).
 * Exposes paint/erase ops in mask-space coords, atomic load via data
 * URL, and serialise to data URL. No React, no WebSocket — engine is
 * shared verbatim between the in-game DM panel and the workshop tool.
 *
 * No-flicker contract: loadFromDataUrl decodes into an Image first;
 * only after onload fires does it paint to the canvas. Old fog stays
 * on screen until the new mask is fully decoded.
 */
export default class FogEngine extends EventEmitter {
  constructor({ width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) {
    super();
    this._canvas = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : null;
    if (this._canvas) {
      this._canvas.width = width;
      this._canvas.height = height;
      this._ctx = this._canvas.getContext('2d');
    }
    this._brushSize = DEFAULT_BRUSH_PX;
    this._mode = 'paint'; // 'paint' | 'erase'
    this._isDirty = false;
    this._strokeBefore = null;     // snapshot at beginStroke()
    this._strokeKindHint = null;   // descriptive label set on beginStroke
  }

  // ── Read-only state ────────────────────────────────────────────────

  get canvas() { return this._canvas; }
  get width()  { return this._canvas ? this._canvas.width  : 0; }
  get height() { return this._canvas ? this._canvas.height : 0; }
  get brushSize() { return this._brushSize; }
  get mode()  { return this._mode; }
  get isDirty() { return this._isDirty; }

  // ── Settings ──────────────────────────────────────────────────────

  setBrushSize(px) {
    const next = Math.max(MIN_BRUSH_PX, Math.min(MAX_BRUSH_PX, Math.round(px)));
    if (next === this._brushSize) return;
    this._brushSize = next;
    this.emit('brushchange', { brushSize: next });
  }

  setMode(mode) {
    if (mode !== 'paint' && mode !== 'erase') return;
    if (mode === this._mode) return;
    this._mode = mode;
    this.emit('modechange', { mode });
  }

  /**
   * Resize the underlying mask, scaling existing content. Used when a
   * remote mask arrives at a different resolution than ours.
   */
  resize(width, height) {
    if (!this._canvas) return;
    if (width === this._canvas.width && height === this._canvas.height) return;
    const scratch = document.createElement('canvas');
    scratch.width = this._canvas.width;
    scratch.height = this._canvas.height;
    scratch.getContext('2d').drawImage(this._canvas, 0, 0);
    this._canvas.width = width;
    this._canvas.height = height;
    this._ctx.drawImage(scratch, 0, 0, width, height);
    this.emit('change');
  }

  // ── Painting (mask-space coords) ──────────────────────────────────

  /**
   * Paint or erase a single dab at (x, y). Honours the current mode.
   */
  dabAt(x, y) {
    if (!this._ctx) return;
    this._applyDab(x, y, this._mode);
    this._isDirty = true;
    this.emit('change');
  }

  /**
   * Paint or erase a polyline of points. Used for continuous strokes
   * — the wrapper interpolates between successive pointer events so
   * fast drags don't leave gaps. Honours the current mode.
   */
  paintStroke(points) {
    if (!this._ctx || !points || points.length === 0) return;
    const ctx = this._ctx;
    ctx.save();
    ctx.globalCompositeOperation =
      this._mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = FOG_FILL;
    ctx.fillStyle = FOG_FILL;
    ctx.lineWidth = this._brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, this._brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
    this._isDirty = true;
    this.emit('change');
  }

  _applyDab(x, y, mode) {
    const ctx = this._ctx;
    ctx.save();
    ctx.globalCompositeOperation =
      mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.fillStyle = FOG_FILL;
    ctx.beginPath();
    ctx.arc(x, y, this._brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Stroke lifecycle (for undo/redo) ──────────────────────────────

  /**
   * Mark the start of a discrete user action (a stroke, a fill, a
   * clear). Captures a "before" snapshot the matching endStroke() can
   * pair with. Calling beginStroke() while one is already in progress
   * is a no-op so nested calls don't lose the original baseline.
   */
  beginStroke(kindHint = 'stroke') {
    if (!this._canvas) return;
    if (this._strokeBefore) return;        // already mid-stroke
    this._strokeBefore = this.toDataUrl();
    this._strokeKindHint = kindHint;
  }

  /**
   * Mark the end of a discrete user action. Emits 'strokeend' with the
   * before/after canvas snapshots so subscribers (undo history) can
   * push a typed action. Returns the snapshot pair, or null if no
   * stroke was open or the canvas didn't actually change.
   */
  endStroke() {
    if (!this._canvas || !this._strokeBefore) return null;
    const before = this._strokeBefore;
    const after = this.toDataUrl();
    const kind = this._strokeKindHint || 'stroke';
    this._strokeBefore = null;
    this._strokeKindHint = null;
    if (before === after) return null;     // no-op stroke (click without drag, etc.)
    const payload = { before, after, kind };
    this.emit('strokeend', payload);
    return payload;
  }

  // ── Bulk ops ──────────────────────────────────────────────────────
  // Bulk ops are auto-wrapped in begin/end so they emit strokeend like
  // a normal user stroke. Subscribers don't need to special-case them.

  /** Cover the whole map in opaque fog. */
  fillAll() {
    if (!this._ctx) return;
    this.beginStroke('fill');
    const ctx = this._ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = FOG_FILL;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
    ctx.restore();
    this._isDirty = true;
    this.emit('change');
    this.endStroke();
  }

  /** Wipe the canvas to fully transparent (no fog anywhere). */
  clear() {
    if (!this._ctx) return;
    this.beginStroke('clear');
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._isDirty = true;
    this.emit('change');
    this.endStroke();
  }

  /**
   * Force isDirty to a specific value. Used when undo/redo swaps the
   * canvas to a snapshot — the resulting state may or may not match
   * the last server commit, so the caller decides.
   */
  setDirty(value) {
    this._isDirty = !!value;
    this.emit('change');
  }

  // ── Serialization ─────────────────────────────────────────────────

  toDataUrl() {
    return this._canvas ? this._canvas.toDataURL('image/png') : null;
  }

  /**
   * Build the fog_config payload for the network — matches the
   * shared_contracts.map.FogConfig shape (mask, mask_width,
   * mask_height, version).
   */
  serialize() {
    if (!this._canvas) return null;
    return {
      mask: this.toDataUrl(),
      mask_width: this._canvas.width,
      mask_height: this._canvas.height,
      version: 1,
    };
  }

  /**
   * Atomically replace the canvas with a remote mask. Decode-then-swap
   * so the old fog stays on screen until the new image is ready.
   *
   * Pass null/undefined to clear instead.
   */
  async loadFromDataUrl(dataUrl) {
    if (!this._ctx) return;
    if (!dataUrl) {
      this.clear();
      this._isDirty = false;
      this.emit('load', { cleared: true });
      return;
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth !== this._canvas.width
            || img.naturalHeight !== this._canvas.height) {
          this._canvas.width = img.naturalWidth;
          this._canvas.height = img.naturalHeight;
        }
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._ctx.drawImage(img, 0, 0);
        this._isDirty = false; // matches remote state
        this.emit('load', { width: img.naturalWidth, height: img.naturalHeight });
        this.emit('change');
        resolve();
      };
      img.onerror = (err) => {
        // Don't blank the canvas on decode failure — keep the old fog.
        this.emit('error', { error: err });
        reject(err);
      };
      img.src = dataUrl;
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  destroy() {
    this.removeAllListeners();
    this._canvas = null;
    this._ctx = null;
  }
}
