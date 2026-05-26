/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME, COLORS } from '@/app/styles/colorTheme'

/**
 * Read-only character sheet view — used by ReviewStep and the [id] page.
 *
 * Pulls everything off the response body (the API returns derived stats
 * alongside stored state, so we don't have to recompute anything client-side).
 */

const ABILITY_LABELS = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide" style={{ color: THEME.textSecondary }}>{title}</h3>
      {children}
    </section>
  )
}

function titleize(code) {
  return (code ?? '').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function modSign(n) {
  return n >= 0 ? `+${n}` : `${n}`
}

export default function CharacterSheet({ character }) {
  if (!character) return null
  const c = character
  const d = c.derived

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold font-[family-name:var(--font-metamorphous)]" style={{ color: THEME.textOnDark }}>
            {c.character_name}
          </h2>
          <p className="text-sm" style={{ color: THEME.textSecondary }}>
            {titleize(c.species_code)} — {titleize(c.background_code)} — Edition: {c.edition_code}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Level</div>
          <div className="text-3xl font-bold" style={{ color: THEME.textOnDark }}>{c.level}</div>
          <div className="text-xs" style={{ color: THEME.textSecondary }}>{c.xp} XP</div>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="HP" value={`${c.hp_current}/${c.hp_max}${c.hp_temp ? ` (+${c.hp_temp})` : ''}`} />
        <Stat label="AC" value={c.ac} />
        <Stat label="Speed" value={`${c.speed} ft`} />
        <Stat label="Prof" value={modSign(d.proficiency_bonus)} />
      </div>

      <Section title="Classes">
        <ul className="text-sm space-y-1" style={{ color: THEME.textOnDark }}>
          {c.class_entries.map((e) => (
            <li key={e.class_code}>
              {e.is_primary && '★ '}
              <span className="font-semibold">{titleize(e.class_code)}</span>
              <span className="ml-2" style={{ color: THEME.textSecondary }}>Level {e.level}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Ability scores">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Object.entries(ABILITY_LABELS).map(([code, label]) => {
            const score = c.ability_scores?.[code] ?? 10
            const mod = Math.floor((score - 10) / 2)
            return (
              <div
                key={code}
                className="rounded-sm border px-2 py-2 text-center"
                style={{ borderColor: THEME.borderSubtle, backgroundColor: `${COLORS.smoke}05` }}
              >
                <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>{label}</div>
                <div className="text-lg font-bold" style={{ color: THEME.textOnDark }}>{score}</div>
                <div className="text-xs" style={{ color: THEME.textSecondary }}>{modSign(mod)}</div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Saving throws">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {d.saves.map((s) => (
            <div key={s.ability} className="flex justify-between" style={{ color: THEME.textOnDark }}>
              <span>
                <span className="mr-2" style={{ color: s.proficient ? COLORS.silver : THEME.borderDefault }}>●</span>
                <span className="capitalize">{s.ability}</span>
              </span>
              <span>{modSign(s.modifier)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Skills">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {d.skills.map((s) => (
            <div key={s.skill_code} className="flex justify-between" style={{ color: THEME.textOnDark }}>
              <span>
                <span className="mr-2" style={{ color: s.proficient ? (s.expertise ? COLORS.silver : COLORS.silver) : THEME.borderDefault }}>●</span>
                {titleize(s.skill_code)}
                <span className="ml-1 text-xs" style={{ color: THEME.textSecondary }}>
                  ({s.ability.slice(0, 3).toUpperCase()})
                </span>
                {s.expertise && <span className="ml-1 text-xs">[Exp]</span>}
              </span>
              <span>{modSign(s.modifier)}</span>
            </div>
          ))}
        </div>
      </Section>

      {c.feats.length > 0 && (
        <Section title="Feats">
          <ul className="text-sm space-y-1" style={{ color: THEME.textOnDark }}>
            {c.feats.map((f, idx) => (
              <li key={`${f.feat_code}-${idx}`}>
                <span className="font-semibold">{titleize(f.feat_code)}</span>
                <span className="ml-2 text-xs" style={{ color: THEME.textSecondary }}>
                  (Lvl {f.level}, {f.source.toLowerCase().replace(/_/g, ' ')})
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {c.languages.length > 0 && (
        <Section title="Languages">
          <p className="text-sm" style={{ color: THEME.textOnDark }}>
            {c.languages.join(', ')}
          </p>
        </Section>
      )}

      {c.status_effects.length > 0 && (
        <Section title="Status effects">
          <div className="flex flex-wrap gap-2">
            {c.status_effects.map((s) => (
              <span
                key={s}
                className="text-xs px-2 py-0.5 rounded-sm border"
                style={{ borderColor: THEME.borderDefault, color: THEME.textOnDark }}
              >
                {s}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div
      className="rounded-sm border px-3 py-2 text-center"
      style={{ borderColor: THEME.borderSubtle, backgroundColor: `${COLORS.smoke}05` }}
    >
      <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: THEME.textOnDark }}>{value}</div>
    </div>
  )
}
