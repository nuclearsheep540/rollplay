/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useCallback, useEffect } from 'react';
import { AudioEngine } from '@/app/audio_management/engine';
import { CHANNEL_PRESETS } from '@/app/audio_management/engine/presets';
import { assetToEngineConfig } from '@/app/audio_management/adapters/assetAdapter';

/**
 * Workshop audio preview — single-channel playback through the engine's
 * full effect chain (HPF/LPF/reverb). DM hears the track as it would
 * sound in-game while editing loop points.
 *
 * WaveSurfer handles waveform visualization.
 * This hook handles audition playback through the effect chain.
 */
export function useWorkshopPreview() {
  const engineRef = useRef(null);
  const channelRef = useRef(null);
  const initializedRef = useRef(false);

  const init = useCallback(async () => {
    if (initializedRef.current) return;

    const engine = new AudioEngine();
    await engine.init();
    await engine.unlock();

    const channel = engine.createChannel('preview', CHANNEL_PRESETS.BGM);

    engineRef.current = engine;
    channelRef.current = channel;
    initializedRef.current = true;
  }, []);

  /**
   * Apply asset's stored effect defaults to the preview channel.
   * Uses the adapter to translate backend fields → engine config.
   */
  const initFromAsset = useCallback((asset) => {
    const channel = channelRef.current;
    if (!channel?.effectChain) return;

    const config = assetToEngineConfig(asset);
    if (!config) return;

    channel.effectChain.applyEffects(config.effects);
  }, []);

  /**
   * Load and play a buffer through the preview channel.
   * @param {AudioBuffer} buffer - Decoded audio buffer
   * @param {object} options - { offset, volume }
   */
  const play = useCallback(async (buffer, options = {}) => {
    const channel = channelRef.current;
    if (!channel) return false;
    return channel.play(buffer, options);
  }, []);

  const stop = useCallback(() => {
    channelRef.current?.stop();
  }, []);

  const pause = useCallback(() => {
    channelRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    return channelRef.current?.resume();
  }, []);

  const destroy = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
      channelRef.current = null;
      initializedRef.current = false;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => destroy();
  }, [destroy]);

  return {
    init,
    initFromAsset,
    play,
    stop,
    pause,
    resume,
    destroy,
    engine: engineRef,
    channel: channelRef,
  };
}
