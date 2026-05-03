/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React, { useState, useEffect, useRef } from 'react';

/**
 * RegionListPanel — DM-side region management for the workshop.
 *
 * Lists each fog region with:
 *   • Visibility checkbox (enabled flag)
 *   • Name (inline-editable on double-click; Enter commits, Escape cancels)
 *   • Active highlight + click-to-activate (paint strokes route here)
 *   • Delete button (hidden for the live region — structural)
 *
 * Plus a "+ Add region" button at the bottom, disabled at the cap.
 *
 * Pure presentational — all state changes go through callbacks the
 * parent wires to useFogRegions helpers. Keeps the panel testable
 * and decoupled from the hook.
 */
export default function RegionListPanel({
  regions = [],
  activeId = null,
  maxRegions = 12,
  onSetActive,
  onAddRegion,
  onDeleteRegion,
  onRenameRegion,
  onToggleEnabled,
}) {
  const atCap = regions.length >= maxRegions;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wider text-content-secondary">
          Regions
        </div>
        <div className="text-[10px] text-content-secondary">
          {regions.length} / {maxRegions}
        </div>
      </div>
      <div className="space-y-1">
        {regions.map((region) => (
          <RegionRow
            key={region.id}
            region={region}
            isActive={region.id === activeId}
            onSetActive={() => onSetActive?.(region.id)}
            onDelete={() => onDeleteRegion?.(region.id)}
            onRename={(name) => onRenameRegion?.(region.id, name)}
            onToggleEnabled={(enabled) => onToggleEnabled?.(region.id, enabled)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => onAddRegion?.()}
        disabled={atCap}
        className="w-full text-xs rounded px-2 py-1.5 border bg-rose-900/30 border-rose-400/40 text-rose-200 hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed"
        title={atCap ? `Region cap reached (${maxRegions})` : 'Add a new region'}
      >
        + Add region{atCap ? ' (cap reached)' : ''}
      </button>
    </div>
  );
}

function RegionRow({
  region,
  isActive,
  onSetActive,
  onDelete,
  onRename,
  onToggleEnabled,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(region.name);
  const inputRef = useRef(null);

  // Sync draft with region.name when not editing — handles external
  // updates (e.g. from a remote region rename in step 5+).
  useEffect(() => {
    if (!editing) setDraft(region.name);
  }, [region.name, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const isLive = region.role === 'live';

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== region.name) {
      onRename(trimmed);
    } else {
      setDraft(region.name);
    }
    setEditing(false);
  };

  const cancelRename = () => {
    setDraft(region.name);
    setEditing(false);
  };

  return (
    <div
      className={[
        'group flex items-center gap-2 px-2 py-1.5 rounded border text-sm transition-colors',
        isActive
          ? 'bg-rose-900/50 border-rose-400/60 text-rose-100'
          : 'bg-slate-800/40 border-slate-700/40 text-slate-200 hover:bg-slate-700/40',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={!!region.enabled}
        onChange={(e) => onToggleEnabled(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className="cursor-pointer"
        title={region.enabled ? 'Hide this region' : 'Show this region'}
      />
      <button
        type="button"
        onClick={() => !editing && onSetActive()}
        onDoubleClick={() => !isLive && setEditing(true)}
        className="flex-1 min-w-0 text-left truncate"
        title={isActive ? 'Currently active (paint target)' : 'Click to activate'}
      >
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') cancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            maxLength={64}
            className="w-full bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-xs"
          />
        ) : (
          <span className="truncate">
            {region.name}
            {isLive && (
              <span className="ml-1.5 text-[10px] uppercase tracking-wider text-blue-300/80">
                live
              </span>
            )}
          </span>
        )}
      </button>
      {!isLive && !editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-rose-300/70 hover:text-rose-300 px-1"
          title="Delete region"
          aria-label={`Delete region ${region.name}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
