/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useCallback, useEffect } from 'react';
import { AudioEngine } from '@/app/audio_management/engine';
import { CHANNEL_PRESETS } from '@/app/audio_management/engine/presets';
import { assetToEngineConfig } from '@/app/audio_management/adapters/assetAdapter';

/**
 * Workshop audio preview — multi-channel playback through the engine's
 * full effect chain (HPF/LPF/reverb). One channel per DAW track.
 *
 * The engine's AudioChannel uses native Web Audio API `source.loopStart` /
 * `source.loopEnd`, so loop regions are sample-accurate (no JS polling).
 */
export function useWorkshopPreview() {
  const engineRef = useRef(null);
  const channelsRef = useRef({}); // { [trackIndex]: AudioChannel }
  const initializedRef = useRef(false);

  const init = useCallback(async () => {
    if (initializedRef.current) return;

    const engine = new AudioEngine();
    await engine.init();
    await engine.unlock();

    engineRef.current = engine;
    initializedRef.current = true;
  }, []);

  /**
   * Get or create a channel for a specific track index.
   */
  const getChannel = useCallback((trackIndex) => {
    const engine = engineRef.current;
    if (!engine) return null;
    if (!channelsRef.current[trackIndex]) {
      const channelId = `preview_${trackIndex}`;
      channelsRef.current[trackIndex] = engine.createChannel(channelId, CHANNEL_PRESETS.BGM);
    }
    return channelsRef.current[trackIndex];
  }, []);

  /**
   * Apply asset's stored effect defaults to a track's channel.
   */
  const initChannelFromAsset = useCallback((trackIndex, asset) => {
    const channel = getChannel(trackIndex);
    if (!channel?.effectChain) return;
    const config = assetToEngineConfig(asset);
    if (!config) return;
    channel.effectChain.applyEffects(config.effects);
  }, [getChannel]);

  const destroy = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
      channelsRef.current = {};
      initializedRef.current = false;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => destroy();
  }, [destroy]);

  return {
    init,
    getChannel,
    initChannelFromAsset,
    destroy,
    engine: engineRef,
  };
}
