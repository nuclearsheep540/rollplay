/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useMemo, useEffect, useRef } from 'react';
import {
  generateWaypoints,
  computeAutoScale,
  buildKeyframesCSS,
  computeDuration,
} from '@/app/map_management/utils/cameraMotion';

let idCounter = 0;

/**
 * React hook that manages the hand-held camera motion animation lifecycle.
 *
 * Generates random waypoints on config change, injects a dynamic CSS
 * @keyframes rule into <head>, and returns a style object to apply to
 * the <img> element.
 *
 * @param {Object|null} handHeldConfig - Hand-held motion config from image_config.motion.hand_held
 * @returns {{ style: Object }} Style object to spread onto the <img> element
 */
export function useCameraMotion(handHeldConfig) {
  const animNameRef = useRef(`hh-motion-${++idCounter}`);

  const enabled = handHeldConfig?.enabled ?? false;
  const trackPoints = handHeldConfig?.track_points ?? 4;
  const distance = handHeldConfig?.distance ?? 10;
  const speed = handHeldConfig?.speed ?? 3;
  const xBias = handHeldConfig?.x_bias ?? 0;
  const randomness = handHeldConfig?.randomness ?? 0;

  // Generate waypoints and compute animation data — only when params change
  const animationData = useMemo(() => {
    if (!enabled) return null;

    const waypoints = generateWaypoints(trackPoints, distance, xBias);
    const scale = computeAutoScale(waypoints);
    const duration = computeDuration(speed);
    const css = buildKeyframesCSS(animNameRef.current, waypoints, scale, randomness);

    return { css, scale, duration };
  }, [enabled, trackPoints, distance, speed, xBias, randomness]);

  // Inject/remove <style> element in <head>
  useEffect(() => {
    if (!animationData) return;

    const style = document.createElement('style');
    style.setAttribute('data-camera-motion', animNameRef.current);
    style.textContent = animationData.css;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, [animationData]);

  if (!animationData) {
    return { style: {} };
  }

  return {
    style: {
      transform: `scale(${animationData.scale})`,
      animation: `${animNameRef.current} ${animationData.duration}s ease-in-out infinite`,
    },
  };
}
