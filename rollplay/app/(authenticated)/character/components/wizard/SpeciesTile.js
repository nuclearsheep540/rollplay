/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME } from '@/app/styles/colorTheme'

import ExpandableTile from './ExpandableTile'
import FeatureChoicePicker from './FeatureChoicePicker'

/**
 * One species tile, wrapping ``ExpandableTile`` with species info +
 * (in ``selected`` mode) the "choose N more languages" picker. Mirrors the
 * ClassTile / BackgroundTile pattern so the wizard reads consistently.
 */

function SpeciesInfoBody({ species }) {
  return (
    <div className="space-y-3 text-sm" style={{ color: THEME.textOnDark }}>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Size</div>
          <div>{species.size}</div>
        </div>
        <div>
          <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Speed</div>
          <div>{species.speed} ft</div>
        </div>
        <div>
          <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Creature type</div>
          <div>{species.creature_type}</div>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Default languages</div>
        <div>{species.default_languages.join(', ') || '—'}</div>
      </div>

      {species.traits?.length > 0 && (
        <div>
          <div className="text-xs uppercase mb-1" style={{ color: THEME.textSecondary }}>Traits</div>
          <ul className="space-y-2">
            {species.traits.map((t) => (
              <li key={t.name} className="text-sm">
                <span className="font-semibold">{t.name}.</span>{' '}
                <span style={{ color: THEME.textSecondary }}>{t.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function LanguagePicker({ count, languages, onChange }) {
  if (!count) return null
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>
        Extra languages — choose {count}
      </div>
      {Array.from({ length: count }).map((_, idx) => (
        <input
          key={idx}
          type="text"
          value={languages[idx] ?? ''}
          onChange={(e) => onChange(idx, e.target.value)}
          placeholder={`Language ${idx + 1}`}
          className="w-full px-3 py-2 border rounded-sm focus:outline-none focus:ring-1 text-sm"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark,
          }}
        />
      ))}
    </div>
  )
}

export default function SpeciesTile({
  species,
  mode,
  extraLanguages = [],
  onExtraLanguageChange,
  editionCode,
  subChoices = {},
  onSubChoiceChange,
  alreadyOwnedSkills = [],
  onExpand,
  onCollapse,
  onSelect,
  onRemove,
}) {
  // Summary chip — quick at-a-glance pre-screen for the picker so the player
  // doesn't have to expand every tile to compare size/speed.
  const summary = `${species.size} · ${species.speed} ft · ${species.creature_type}`
  const languageChoiceCount = species.language_choices?.count ?? 0

  return (
    <ExpandableTile
      name={species.name}
      summary={summary}
      mode={mode}
      selectLabel={species.name}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onSelect={onSelect}
      onRemove={onRemove}
    >
      <SpeciesInfoBody species={species} />

      {mode === 'selected' && languageChoiceCount > 0 && (
        <div className="pt-2 border-t" style={{ borderColor: THEME.borderSubtle }}>
          <LanguagePicker
            count={languageChoiceCount}
            languages={extraLanguages}
            onChange={onExtraLanguageChange}
          />
        </div>
      )}

      {mode === 'selected' && (species.sub_choices?.length ?? 0) > 0 && (
        <div className="pt-2 border-t space-y-3" style={{ borderColor: THEME.borderSubtle }}>
          {species.sub_choices.map((choice) => (
            <FeatureChoicePicker
              key={choice.code}
              choice={choice}
              editionCode={editionCode}
              value={subChoices[choice.code] ?? []}
              onChange={(next) => onSubChoiceChange?.(choice.code, next)}
              alreadyOwnedSkills={alreadyOwnedSkills}
              contextLabel={`${species.name} trait`}
            />
          ))}
        </div>
      )}
    </ExpandableTile>
  )
}
