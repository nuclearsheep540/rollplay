/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Lightweight event emitter mixin for fog engine classes.
 *
 * Mirrors audio_management/engine/EventEmitter.js — same .on/.off/.once/.emit
 * surface, kept local so fog_management has no cross-module dependencies.
 */
export default class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return this;
  }

  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) this._listeners.delete(event);
    }
    return this;
  }

  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    wrapper._original = callback;
    return this.on(event, wrapper);
  }

  emit(event, data) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        callback(data);
      }
    }
    return this;
  }

  removeAllListeners(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }
}
