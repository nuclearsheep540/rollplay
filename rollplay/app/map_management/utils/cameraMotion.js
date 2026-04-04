/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Camera motion animation engine — pure functions for generating
 * hand-held drift animations. No React dependencies.
 */

/**
 * Generate random waypoints for a hand-held camera drift path.
 *
 * Uses a center-gravity model: maxRadius = distance (in % of container)
 * caps how far the path can wander from origin on ANY axis, regardless
 * of bias or track count. Bias only affects per-step direction preference,
 * not the boundary. As the path approaches the boundary, waypoints are
 * biased back toward center — creating a natural "rubber band" effect.
 *
 * @param {number} trackPoints - Number of waypoints (2–30)
 * @param {number} distance - Max Manhattan distance between consecutive points AND max wander radius (2–20)
 * @param {number} xBias - Axis bias (-100 to 100). Positive = more horizontal, negative = more vertical.
 * @returns {Array<{x: number, y: number}>} Waypoints in percentage units
 */
export function generateWaypoints(trackPoints, distance, xBias) {
  const waypoints = [{ x: 0, y: 0 }];

  // Max displacement from origin on any single axis (in %).
  // Tied to distance only — track count adds path complexity, not wander space.
  const maxRadius = distance;

  // Compute axis split from bias. 0 bias = 50/50, +100 = 85/15, -100 = 15/85
  const xFraction = Math.min(0.85, Math.max(0.15, 0.5 + xBias / 200));

  for (let i = 1; i < trackPoints; i++) {
    const prev = waypoints[i - 1];

    // How far are we from the boundary? Per-axis check, uniform cap on each.
    const xRatio = maxRadius > 0 ? Math.abs(prev.x) / maxRadius : 0;
    const yRatio = maxRadius > 0 ? Math.abs(prev.y) / maxRadius : 0;
    const pullStrength = Math.max(xRatio, yRatio);

    const xBudget = Math.round(distance * xFraction);
    const yBudget = distance - xBudget;

    let dx, dy, attempts = 0;
    do {
      dx = randomInt(-xBudget, xBudget);
      dy = randomInt(-yBudget, yBudget);

      // Bias toward center proportional to how close we are to the boundary.
      // At pullStrength ~0 (near center): no bias, free wandering.
      // At pullStrength ~1 (near boundary): strongly favor moving toward origin.
      if (pullStrength > 0.3) {
        const bias = pullStrength * pullStrength; // quadratic ramp
        if (prev.x > 0 && dx > 0) dx = Math.round(dx * (1 - bias));
        if (prev.x < 0 && dx < 0) dx = Math.round(dx * (1 - bias));
        if (prev.y > 0 && dy > 0) dy = Math.round(dy * (1 - bias));
        if (prev.y < 0 && dy < 0) dy = Math.round(dy * (1 - bias));
      }

      attempts++;
    } while (Math.abs(dx) + Math.abs(dy) < Math.ceil(distance / 3) && attempts < 50);

    // Hard clamp: never exceed maxRadius on either axis independently
    const nx = Math.max(-maxRadius, Math.min(maxRadius, prev.x + dx));
    const ny = Math.max(-maxRadius, Math.min(maxRadius, prev.y + dy));

    waypoints.push({ x: nx, y: ny });
  }

  return waypoints;
}

/**
 * Compute the minimum scale factor needed to prevent overflow at any waypoint.
 *
 * @param {Array<{x: number, y: number}>} waypoints - Waypoints in percentage units
 * @returns {number} Scale factor (>= 1.0)
 */
export function computeAutoScale(waypoints) {
  let maxAbsX = 0;
  let maxAbsY = 0;

  for (const wp of waypoints) {
    maxAbsX = Math.max(maxAbsX, Math.abs(wp.x));
    maxAbsY = Math.max(maxAbsY, Math.abs(wp.y));
  }

  // The image needs extra coverage on both sides of each axis.
  // scale = 1 + 2 * maxDisplacement / 100, with a small safety margin.
  const scaleX = 1 + (2 * maxAbsX) / 100;
  const scaleY = 1 + (2 * maxAbsY) / 100;

  return Math.max(scaleX, scaleY) * 1.02;
}

/**
 * Build a CSS @keyframes rule for the hand-held drift animation.
 *
 * @param {string} animationName - Unique name for the @keyframes rule
 * @param {Array<{x: number, y: number}>} waypoints - Waypoints in percentage units
 * @param {number} scale - Auto-scale factor from computeAutoScale
 * @param {number} randomness - Timing variance (0 = uniform, 100 = highly varied)
 * @returns {string} Complete @keyframes CSS rule
 */
export function buildKeyframesCSS(animationName, waypoints, scale, randomness = 0) {
  // Total segments = waypoints + return-to-origin
  const totalSegments = waypoints.length;
  const lines = [`@keyframes ${animationName} {`];

  // Generate timing weights per segment — randomness controls variance
  const weights = [];
  for (let i = 0; i < totalSegments; i++) {
    const variance = (Math.random() * 2 - 1) * (randomness / 100);
    weights.push(Math.max(0.1, 1.0 + variance));
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Convert weights to cumulative percentages (1 decimal to avoid duplicates)
  const percentages = [0];
  let cumulative = 0;
  for (let i = 0; i < totalSegments; i++) {
    cumulative += weights[i] / totalWeight * 100;
    const pct = parseFloat(cumulative.toFixed(1));
    // Ensure strictly increasing — nudge forward if duplicate
    const prev = percentages[percentages.length - 1];
    percentages.push(pct <= prev ? prev + 0.1 : pct);
  }
  percentages[percentages.length - 1] = 100; // ensure exact 100%

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    lines.push(`  ${percentages[i]}% { transform: scale(${scale}) translate(${wp.x.toFixed(2)}%, ${wp.y.toFixed(2)}%); }`);
  }

  // Final keyframe returns to origin for seamless loop
  lines.push(`  100% { transform: scale(${scale}) translate(0%, 0%); }`);
  lines.push('}');

  return lines.join('\n');
}

/**
 * Map speed parameter (1–15) to animation duration in seconds.
 * Speed 1 = 60s (slow cinematic drift), speed 15 = 6s (faster motion).
 *
 * @param {number} speed - Speed value (1–15)
 * @returns {number} Duration in seconds
 */
export function computeDuration(speed) {
  return Math.round(60 - (speed - 1) * (54 / 14));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
