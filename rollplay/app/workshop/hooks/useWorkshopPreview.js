/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useCallback, useEffect } from 'react';
import { AudioEngine } from '@/app/audio_management/engine';
import { CHANNEL_PRESETS } from '@/app/audio_management/engine/presets';
import { assetToEngineConfig } from '@/app/audio_management/adapters/assetAdapter';

const CHANNEL_ID = 'workshop_preview';

// Single-channel preview for the per-asset Audio Workstation tool.
// Audio flows through the engine's full effect chain (HPF/LPF/reverb)
// so what the DM hears matches in-game playback.
export function useWorkshopPreview() {
  const engineRef = useRef(null);
  const channelRef = useRef(null);
  const initializedRef = useRef(false);

  const init = useCallback(async () => {
    if (initializedRef.current) return;
    const engine = new AudioEngine();
    await engine.init();
    await engine.unlock();
    engineRef.current = engine;
    channelRef.current = engine.createChannel(CHANNEL_ID, CHANNEL_PRESETS.BGM);
    initializedRef.current = true;
  }, []);

  const initChannelFromAsset = useCallback((asset) => {
    const channel = channelRef.current;
    if (!channel?.effectChain) return;
    const config = assetToEngineConfig(asset);
    if (!config) return;
    channel.effectChain.applyEffects(config.effects);
  }, []);

  const destroy = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
      channelRef.current = null;
      initializedRef.current = false;
    }
  }, []);

  useEffect(() => {
    return () => destroy();
  }, [destroy]);

  return {
    init,
    initChannelFromAsset,
    destroy,
    engine: engineRef,
    channel: channelRef,
  };
}
