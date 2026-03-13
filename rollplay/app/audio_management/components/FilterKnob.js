/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPowerOff } from '@fortawesome/free-solid-svg-icons';

// Logarithmic frequency mapping — matches useUnifiedAudio.js
const FREQ_RANGES = {
  hpf: { min: 20, max: 5000 },
  lpf: { min: 200, max: 20000 },
};

function mapFrequency(faderValue, filterType) {
  const range = FREQ_RANGES[filterType] || FREQ_RANGES.hpf;
  const minLog = Math.log(range.min);
  const maxLog = Math.log(range.max);
  return Math.exp(minLog + faderValue * (maxLog - minLog));
}

function formatHz(hz) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
  return `${Math.round(hz)}`;
}

/**
 * Rotary knob for HPF/LPF frequency control on channel strips.
 * Drag up/down to adjust. Visual arc shows current position.
 *
 * value: 0.0–1.0 (normalized fader position, mapped to frequency externally)
 * filterType: 'hpf' | 'lpf' — determines frequency range for Hz readout
 */
const SVG_SIZE = 100; // viewBox units — SVG scales to fill container
const ARC_START = 0.75 * Math.PI;
const ARC_END = 2.25 * Math.PI;
const ARC_RANGE = ARC_END - ARC_START;

export default function FilterKnob({
  label,
  value = 0,
  color = '#f97316', // orange default
  filterType = 'hpf',
  enabled = false,
  onToggle,
  onChange,
  onChangeEnd,
  disabled = false,
}) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const clamp = (v) => Math.max(0, Math.min(1, v));

  const handlePointerDown = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    e.target.setPointerCapture(e.pointerId);
  }, [value, disabled]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return;
    e.preventDefault();
    // Drag up = increase, 150px drag = full range
    const delta = (startY.current - e.clientY) / 150;
    const newVal = clamp(startVal.current + delta);
    onChange?.(newVal);
  }, [onChange]);

  const handlePointerUp = useCallback((e) => {
    if (!dragging.current) return;
    dragging.current = false;
    const delta = (startY.current - e.clientY) / 150;
    const newVal = clamp(startVal.current + delta);
    onChangeEnd?.(newVal);
  }, [onChangeEnd]);

  // SVG arc path (viewBox coordinates — scales to container)
  const r = (SVG_SIZE / 2) - 10;
  const cx = SVG_SIZE / 2;
  const cy = SVG_SIZE / 2;

  const arcPath = (startAngle, endAngle) => {
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const valueAngle = ARC_START + value * ARC_RANGE;

  // Indicator line from center toward value angle
  const indicatorLen = r - 2;
  const ix = cx + indicatorLen * Math.cos(valueAngle);
  const iy = cy + indicatorLen * Math.sin(valueAngle);

  const knobDisabled = disabled || !enabled;

  return (
    <div
      className={`flex flex-col items-center flex-1 min-h-0 w-full ${disabled ? 'opacity-30 pointer-events-none' : ''}`}
      title={label}
    >
      {/* Label */}
      <span className={`text-[11px] font-bold leading-none shrink-0 pt-1 ${enabled ? '' : 'opacity-40'}`} style={{ color }}>
        {label}
      </span>
      {/* Power toggle */}
      <button
        onClick={onToggle}
        className={`w-full mx-1 h-4 flex items-center justify-center rounded shrink-0 transition-colors ${
          enabled
            ? 'bg-green-600 text-white'
            : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
        }`}
        title={enabled ? `Disable ${label}` : `Enable ${label}`}
      >
        <FontAwesomeIcon icon={faPowerOff} className="text-[10px]" />
      </button>
      <div className={`flex-1 flex flex-col items-center justify-center min-h-0 w-full ${knobDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
        <svg
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          className={`select-none w-full max-w-[52px] ${knobDisabled ? 'cursor-default' : 'cursor-ns-resize'}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: 'none' }}
        >
          {/* Background arc (full range) */}
          <path
            d={arcPath(ARC_START, ARC_END)}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Value arc */}
          {value > 0.005 && (
            <path
              d={arcPath(ARC_START, valueAngle)}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
            />
          )}
          {/* Center dot */}
          <circle cx={cx} cy={cy} r="10" fill="#374151" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          {/* Indicator line */}
          <line
            x1={cx}
            y1={cy}
            x2={ix}
            y2={iy}
            stroke="rgba(255,255,255,0.7)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
        <span className={`text-[11px] font-mono leading-none ${knobDisabled ? 'text-gray-600' : 'text-gray-400'}`}>
          {formatHz(mapFrequency(value, filterType))}
        </span>
      </div>
    </div>
  );
}
