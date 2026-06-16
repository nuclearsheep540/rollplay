/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME, COLORS } from '@/app/styles/colorTheme'

import ExpandableTile from './ExpandableTile'
import FeatureChoicePicker from './FeatureChoicePicker'

/**
 * One class tile, wrapping ``ExpandableTile`` with class-specific info +
 * configuration. The wrapper owns the header/chevron/select/remove
 * affordances; this module just renders the class info body and (in
 * ``selected`` mode) the level + skill-checkbox controls.
 */

function ClassInfoBody({ classDef }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm" style={{ color: THEME.textOnDark }}>
      <div>
        <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Hit die</div>
        <div>d{classDef.hit_die}</div>
      </div>
      <div>
        <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Primary ability</div>
        <div className="capitalize">{(classDef.primary_ability || []).join(' / ')}</div>
      </div>
      <div>
        <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Saves</div>
        <div className="capitalize">{classDef.saving_throw_proficiencies.join(', ')}</div>
      </div>
      <div className="col-span-2 sm:col-span-3">
        <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Armor training</div>
        <div>{classDef.armor_training.join(', ') || '—'}</div>
      </div>
      <div className="col-span-2 sm:col-span-3">
        <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Weapon proficiencies</div>
        <div>{classDef.weapon_proficiencies.join(', ')}</div>
      </div>
    </div>
  )
}

function SkillChecklist({ classDef, chosenSkills, skillsByCode, onChange }) {
  const offered = classDef.skill_choices?.from ?? []
  const allowed = classDef.skill_choices?.count ?? 0
  const limitReached = chosenSkills.length >= allowed

  const toggle = (code) => {
    if (chosenSkills.includes(code)) {
      onChange(chosenSkills.filter((c) => c !== code))
    } else if (!limitReached) {
      onChange([...chosenSkills, code])
    }
  }

  if (allowed === 0) return null

  return (
    <div>
      <div className="text-xs uppercase mb-2" style={{ color: THEME.textSecondary }}>
        Skill proficiencies — choose {allowed}
        <span className="ml-2 normal-case" style={{ opacity: 0.7 }}>
          ({chosenSkills.length}/{allowed} picked)
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
        {offered.map((skillCode) => {
          const skill = skillsByCode?.get(skillCode)
          const checked = chosenSkills.includes(skillCode)
          const disabled = limitReached && !checked
          if (!skill) return null
          return (
            <label
              key={skillCode}
              className="flex items-center gap-2 px-2 py-1 rounded-sm text-sm"
              style={{
                backgroundColor: checked ? `${COLORS.silver}1A` : 'transparent',
                color: disabled ? THEME.textSecondary : THEME.textOnDark,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(skillCode)}
              />
              {skill.name}
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default function ClassTile({
  classDef,
  mode,
  pick,
  isPrimary = false,
  skillsByCode,
  editionCode,
  onExpand,
  onCollapse,
  onSelect,
  onChange,
  onRemove,
}) {
  // Composed summary chip — base info always, plus the selected-state
  // breadcrumbs (level + Primary tag) when this tile represents an
  // already-picked class.
  const baseSummary = `d${classDef.hit_die} · ${(classDef.primary_ability || []).join(' / ')}`
  const summary =
    mode === 'selected' && pick
      ? `${baseSummary} · Level ${pick.level}${isPrimary ? ' · Primary' : ''}`
      : baseSummary

  // Level-1 feature choices (Fighting Style, Weapon Mastery, …) merged onto the
  // class's features by the registry. Only the primary class grants them here
  // (matches the skill-pick rule; multiclass entries grant a limited subset).
  const l1Choices = (classDef.features_by_level?.['1']?.features ?? []).flatMap(
    (f) => f.choices ?? [],
  )

  return (
    <ExpandableTile
      name={classDef.name}
      summary={summary}
      mode={mode}
      selectLabel={classDef.name}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onSelect={onSelect}
      onRemove={onRemove}
    >
      <ClassInfoBody classDef={classDef} />

      {mode === 'selected' && pick && (
        <div className="space-y-3 pt-2 border-t" style={{ borderColor: THEME.borderSubtle }}>
          <div>
            <label className="block text-xs uppercase mb-1" style={{ color: THEME.textSecondary }}>
              Level in {classDef.name}
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={pick.level}
              onChange={(e) =>
                onChange?.({
                  ...pick,
                  level: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                })
              }
              className="w-24 px-3 py-1 border rounded-sm text-sm"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderDefault,
                color: THEME.textOnDark,
              }}
            />
          </div>

          {isPrimary && (
            <SkillChecklist
              classDef={classDef}
              chosenSkills={pick.chosen_skills || []}
              skillsByCode={skillsByCode}
              onChange={(next) => onChange?.({ ...pick, chosen_skills: next })}
            />
          )}

          {isPrimary && l1Choices.length > 0 && (
            <div className="space-y-3 pt-2 border-t" style={{ borderColor: THEME.borderSubtle }}>
              <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>
                Level 1 choices
              </div>
              {l1Choices.map((choice) => (
                <FeatureChoicePicker
                  key={choice.code}
                  choice={choice}
                  editionCode={editionCode}
                  value={(pick.sub_choices || {})[choice.code] ?? []}
                  onChange={(next) =>
                    onChange?.({
                      ...pick,
                      sub_choices: { ...(pick.sub_choices || {}), [choice.code]: next },
                    })
                  }
                />
              ))}
            </div>
          )}

          {!isPrimary && classDef.skill_choices?.count > 0 && (
            <div className="text-xs italic" style={{ color: THEME.textSecondary }}>
              Multi-class entries don't grant skill picks
              (5.5e rule — only the primary class does).
            </div>
          )}
        </div>
      )}
    </ExpandableTile>
  )
}
