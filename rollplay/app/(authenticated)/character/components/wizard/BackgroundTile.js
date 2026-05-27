/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME, COLORS } from '@/app/styles/colorTheme'

import ExpandableTile from './ExpandableTile'

/**
 * One background tile, wrapping ``ExpandableTile`` with background info +
 * (in ``selected`` mode) the +2/+1 vs +1/+1/+1 ability-bonus distribution
 * picker. Matches ClassTile's pattern visually so the wizard's picker rows
 * read consistently across steps.
 */

// 5.5e rules: each background grants +3 split across its three offered
// abilities, either as +2/+1 (across two of the three) or +1/+1/+1 (one to each).
const PRESETS = [
  { id: '2_1', label: '+2 / +1', shape: [2, 1] },
  { id: '1_1_1', label: '+1 / +1 / +1', shape: [1, 1, 1] },
]

function BackgroundInfoBody({ background, feat, skillsByCode }) {
  return (
    <div className="space-y-3 text-sm" style={{ color: THEME.textOnDark }}>
      <div>
        <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Origin feat</div>
        <div className="font-semibold">{feat?.name ?? background.origin_feat_code}</div>
        {feat && (
          <p className="text-sm mt-1" style={{ color: THEME.textSecondary }}>
            {feat.description.slice(0, 240)}
            {feat.description.length > 240 ? '…' : ''}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Skill proficiencies</div>
          <div>
            {background.skill_proficiencies
              .map((c) => skillsByCode?.get(c)?.name ?? c)
              .join(', ')}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Tool proficiency</div>
          <div>{background.tool_proficiency}</div>
        </div>
      </div>

      {background.equipment_text && (
        <div>
          <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Equipment</div>
          <p className="text-sm" style={{ color: THEME.textSecondary }}>
            {background.equipment_text}
          </p>
        </div>
      )}
    </div>
  )
}

function AbilityBonusConfig({ background, presetId, onPresetChange, increases, onAbilityChange }) {
  return (
    <div>
      <div className="text-xs uppercase mb-2" style={{ color: THEME.textSecondary }}>
        Ability bonus distribution
      </div>
      <div className="flex gap-2 mb-3">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPresetChange(p.id)}
            className="px-3 py-1 rounded-sm border text-sm"
            style={{
              borderColor: presetId === p.id ? COLORS.silver : THEME.borderDefault,
              backgroundColor: presetId === p.id ? `${COLORS.silver}1A` : 'transparent',
              color: THEME.textOnDark,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {increases.map((row, idx) => (
          <div key={idx} className="flex items-center gap-3 text-sm">
            <span
              className="inline-flex h-7 w-10 items-center justify-center rounded-sm font-semibold"
              style={{ backgroundColor: COLORS.silver, color: COLORS.onyx }}
            >
              +{row.increase}
            </span>
            <select
              value={row.ability}
              onChange={(e) => onAbilityChange(idx, e.target.value)}
              className="px-3 py-1.5 border rounded-sm text-sm capitalize"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderDefault,
                color: THEME.textOnDark,
              }}
            >
              {background.ability_scores.map((ab) => (
                <option key={ab} value={ab}>{ab}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BackgroundTile({
  background,
  feat,
  skillsByCode,
  mode,
  presetId,
  increases,
  onPresetChange,
  onAbilityChange,
  onExpand,
  onCollapse,
  onSelect,
  onRemove,
}) {
  // Background summary chip — short hint at granted skills so the player can
  // pre-screen tiles in the picker without expanding them all.
  const skillNames = background.skill_proficiencies
    .map((c) => skillsByCode?.get(c)?.name ?? c)
    .join(', ')

  return (
    <ExpandableTile
      name={background.name}
      summary={skillNames}
      mode={mode}
      selectLabel={background.name}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onSelect={onSelect}
      onRemove={onRemove}
    >
      <BackgroundInfoBody
        background={background}
        feat={feat}
        skillsByCode={skillsByCode}
      />

      {mode === 'selected' && (
        <div className="pt-2 border-t" style={{ borderColor: THEME.borderSubtle }}>
          <AbilityBonusConfig
            background={background}
            presetId={presetId}
            onPresetChange={onPresetChange}
            increases={increases}
            onAbilityChange={onAbilityChange}
          />
        </div>
      )}
    </ExpandableTile>
  )
}
