/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME, COLORS } from '@/app/styles/colorTheme'
import { titleize } from '@/app/shared/utils/titleize'

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

      <ChoicesSection character={c} />
      <SpellcastingSection character={c} />
      <ResourcesSection pools={d.resource_pools} />

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

// --- PR 7 (G.1) / deferral #7 sections — all derived from the response body --- //

/** Species + class feature picks, code→label via titleize (e.g. "Fighting Style: Defense"). */
function ChoicesSection({ character }) {
  const rows = [
    ...Object.entries(character.species_sub_choices || {}),
    ...(character.class_entries || []).flatMap((e) => Object.entries(e.sub_choices || {})),
  ].filter(([, picks]) => Array.isArray(picks) && picks.length > 0)
  if (rows.length === 0) return null
  return (
    <Section title="Choices">
      <ul className="text-sm space-y-1">
        {rows.map(([code, picks]) => (
          <li key={code} className="flex justify-between gap-3" style={{ color: THEME.textOnDark }}>
            <span style={{ color: THEME.textSecondary }}>{titleize(code)}</span>
            <span className="text-right">{picks.map(titleize).join(', ')}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** Spells (cantrips + leveled), spell slots, pact slots, save DC / attack — for casters. */
function SpellcastingSection({ character }) {
  const c = character
  const d = c.derived || {}
  const spells = c.spells || []
  const slots = d.spell_slots || {}
  const hasSlots = Object.keys(slots).length > 0
  if (spells.length === 0 && !hasSlots && !d.pact_slots) return null
  const cantrips = spells.filter((s) => s.spell_level === 0)
  const leveled = spells.filter((s) => s.spell_level > 0)
  const dcs = Object.entries(d.spell_save_dc_by_ability || {})
  return (
    <Section title="Spellcasting">
      {cantrips.length > 0 && (
        <SpellLine label="Cantrips" names={cantrips.map((s) => titleize(s.spell_code))} />
      )}
      {leveled.length > 0 && (
        <SpellLine label="Prepared / known" names={leveled.map((s) => titleize(s.spell_code))} />
      )}
      {hasSlots && (
        <div className="text-sm flex flex-wrap gap-x-3" style={{ color: THEME.textOnDark }}>
          <span className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Slots</span>
          {Object.entries(slots).map(([lvl, n]) => (
            <span key={lvl}>L{lvl}: {n}</span>
          ))}
        </div>
      )}
      {d.pact_slots && (
        <div className="text-sm" style={{ color: THEME.textOnDark }}>
          <span className="text-xs uppercase mr-2" style={{ color: THEME.textSecondary }}>Pact Magic</span>
          {d.pact_slots.count} × L{d.pact_slots.slot_level}
        </div>
      )}
      {dcs.map(([ability, dc]) => (
        <div key={ability} className="text-sm" style={{ color: THEME.textOnDark }}>
          <span className="text-xs uppercase mr-2" style={{ color: THEME.textSecondary }}>
            {ability.slice(0, 3)}
          </span>
          Save DC {dc} · Attack {modSign(d.spell_attack_bonus_by_ability?.[ability] ?? 0)}
        </div>
      ))}
    </Section>
  )
}

function SpellLine({ label, names }) {
  return (
    <div className="text-sm">
      <span className="text-xs uppercase mr-2" style={{ color: THEME.textSecondary }}>{label}</span>
      <span style={{ color: THEME.textOnDark }}>{names.join(', ')}</span>
    </div>
  )
}

/** Resource pools — remaining/max + recharge cadence. */
function ResourcesSection({ pools }) {
  if (!pools || pools.length === 0) return null
  return (
    <Section title="Resources">
      <ul className="text-sm space-y-1">
        {pools.map((p) => (
          <li key={p.pool_code} className="flex justify-between gap-3" style={{ color: THEME.textOnDark }}>
            <span style={{ color: THEME.textSecondary }}>{titleize(p.pool_code)}</span>
            <span>
              {p.max_value - p.current_value}/{p.max_value}
              <span className="ml-2 text-xs" style={{ color: THEME.textSecondary }}>
                {p.recharge.replace(/_/g, ' ')}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
