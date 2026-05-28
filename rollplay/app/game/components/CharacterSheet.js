/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBolt,
  faMinus,
  faPlus,
  faStar,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'

import { useRuntimePatch } from '../hooks/useCharacterRuntime'

/**
 * Runtime character sheet — used inside an active game session.
 *
 * The "own" mode (default) renders inline editors backed by
 * PATCH /characters/{id}/runtime. The DM party view in Phase 5 passes
 * readOnly=true to hide every editor without changing the layout.
 *
 * Click-to-roll on ability / save / skill rows delegates to onRoll(rollData),
 * which the parent wires up to the game's existing dice infrastructure.
 */

const ABILITY_LABELS = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
}

const titleize = (code) =>
  (code ?? '').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())

const modSign = (n) => (n >= 0 ? `+${n}` : `${n}`)

function Section({ title, children, className = '' }) {
  return (
    <section className={`space-y-2 ${className}`}>
      <h3 className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
        {title}
      </h3>
      {children}
    </section>
  )
}

function RollableRow({ label, modifier, marker, onRoll, readOnly }) {
  return (
    <button
      type="button"
      disabled={readOnly || !onRoll}
      onClick={onRoll}
      className="w-full flex justify-between items-center px-2 py-1.5 rounded text-left text-sm hover:bg-slate-700/50 disabled:hover:bg-transparent disabled:cursor-default text-slate-100"
    >
      <span className="flex items-center gap-2">
        {marker}
        {label}
      </span>
      <span className="text-slate-300 font-mono">{modSign(modifier)}</span>
    </button>
  )
}

function AbilityBlock({ code, score, modifier, onRoll, readOnly }) {
  return (
    <button
      type="button"
      disabled={readOnly || !onRoll}
      onClick={onRoll}
      className="rounded border border-slate-700 bg-slate-800/60 px-2 py-2 text-center hover:border-slate-500 disabled:hover:border-slate-700 disabled:cursor-default"
    >
      <div className="text-xs uppercase text-slate-400">{ABILITY_LABELS[code] ?? code}</div>
      <div className="text-lg font-bold text-slate-100">{score}</div>
      <div className="text-xs text-slate-300">{modSign(modifier)}</div>
    </button>
  )
}

function HpStepper({ character, onPatch, disabled }) {
  const [delta, setDelta] = useState('')

  const apply = (sign) => {
    const value = Math.max(0, Number(delta) || 0)
    if (value === 0) return
    const next = sign > 0
      ? Math.min(character.hp_max, character.hp_current + value)
      : Math.max(0, character.hp_current - value)
    onPatch({ hp_current: next })
    setDelta('')
  }

  return (
    <div className="rounded border border-slate-700 bg-slate-800/60 p-3">
      <div className="text-xs uppercase text-slate-400 mb-1">Hit points</div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold text-slate-100">{character.hp_current}</div>
        <div className="text-sm text-slate-400">/ {character.hp_max}</div>
        {character.hp_temp > 0 && (
          <div className="text-xs text-emerald-400">+{character.hp_temp} temp</div>
        )}
      </div>
      {!disabled && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => apply(-1)}
            className="h-8 w-8 rounded border border-rose-600 text-rose-300 hover:bg-rose-900/30"
            title="Take damage"
          >
            <FontAwesomeIcon icon={faMinus} />
          </button>
          <input
            type="number"
            min={0}
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="±"
            className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-center text-slate-100"
          />
          <button
            type="button"
            onClick={() => apply(1)}
            className="h-8 w-8 rounded border border-emerald-600 text-emerald-300 hover:bg-emerald-900/30"
            title="Heal"
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
      )}
    </div>
  )
}

function TempHpInput({ character, onPatch, disabled }) {
  const [value, setValue] = useState('')

  const apply = () => {
    const next = Math.max(0, Number(value) || 0)
    onPatch({ hp_temp: next })
    setValue('')
  }

  return (
    <div className="rounded border border-slate-700 bg-slate-800/60 p-3">
      <div className="text-xs uppercase text-slate-400 mb-1">Temp HP</div>
      <div className="text-2xl font-bold text-slate-100">{character.hp_temp}</div>
      {!disabled && (
        <div className="mt-3 flex gap-2">
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Set"
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={apply}
            className="px-3 py-1 rounded border border-slate-600 text-slate-100 text-sm hover:bg-slate-700"
          >
            Set
          </button>
        </div>
      )}
    </div>
  )
}

function InspirationToggle({ character, onPatch, disabled }) {
  const active = character.inspiration
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPatch({ inspiration: !active })}
      className={`w-full rounded border p-3 flex items-center justify-between transition-colors ${
        active
          ? 'border-amber-500 bg-amber-500/10'
          : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
      } disabled:cursor-default disabled:hover:border-slate-700`}
      title="Heroic Inspiration"
    >
      <span className="flex items-center gap-2">
        <FontAwesomeIcon icon={faBolt} className={active ? 'text-amber-400' : 'text-slate-500'} />
        <span className={`text-sm font-semibold uppercase ${active ? 'text-amber-300' : 'text-slate-400'}`}>
          Inspiration
        </span>
      </span>
      <span className={active ? 'text-amber-300' : 'text-slate-500'}>
        {active ? 'YES' : 'NO'}
      </span>
    </button>
  )
}

function DeathSaveTracker({ character, onPatch, disabled }) {
  if (character.hp_current > 0) return null
  const successes = character.death_save_successes ?? 0
  const failures = character.death_save_failures ?? 0

  const setSuccesses = (next) => onPatch({ death_save_successes: Math.max(0, Math.min(3, next)) })
  const setFailures = (next) => onPatch({ death_save_failures: Math.max(0, Math.min(3, next)) })

  const Pip = ({ filled, color, onClick }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-5 w-5 rounded-full border-2 ${color} ${filled ? 'opacity-100' : 'opacity-30'}`}
    />
  )

  return (
    <Section title="Death saves">
      <div className="rounded border border-rose-700/50 bg-rose-900/20 p-3 space-y-2">
        <div className="flex items-center gap-3">
          <span className="w-20 text-xs uppercase text-emerald-300">Successes</span>
          {[1, 2, 3].map((n) => (
            <Pip
              key={n}
              filled={successes >= n}
              color="border-emerald-500 bg-emerald-500"
              onClick={() => setSuccesses(successes >= n ? n - 1 : n)}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="w-20 text-xs uppercase text-rose-300">Failures</span>
          {[1, 2, 3].map((n) => (
            <Pip
              key={n}
              filled={failures >= n}
              color="border-rose-500 bg-rose-500"
              onClick={() => setFailures(failures >= n ? n - 1 : n)}
            />
          ))}
        </div>
      </div>
    </Section>
  )
}

function StatusEffectsEditor({ character, onPatch, disabled }) {
  const [input, setInput] = useState('')

  const add = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    const next = [...character.status_effects, trimmed]
    onPatch({ status_effects: next })
    setInput('')
  }

  const remove = (status) => {
    onPatch({
      status_effects: character.status_effects.filter((s) => s !== status),
    })
  }

  return (
    <Section title="Status effects">
      <div className="flex flex-wrap gap-2">
        {character.status_effects.length === 0 && (
          <span className="text-xs text-slate-500">None</span>
        )}
        {character.status_effects.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-600 bg-slate-800/60 text-slate-200"
          >
            {s}
            {!disabled && (
              <button type="button" onClick={() => remove(s)} className="text-slate-500 hover:text-rose-400">
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder="Add status (e.g. Poisoned)"
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={add}
            className="px-3 py-1 rounded border border-slate-600 text-slate-100 text-sm hover:bg-slate-700"
          >
            Add
          </button>
        </div>
      )}
    </Section>
  )
}

function XpAndLevelUp({ character, onPatch, onOpenLevelUp, disabled }) {
  const [delta, setDelta] = useState('')
  const pending = character.derived?.pending_level_up
  const nextXp = character.derived?.next_level_xp

  const award = () => {
    const value = Number(delta) || 0
    if (value === 0) return
    onPatch({ xp: character.xp + value })
    setDelta('')
  }

  return (
    <Section title="Experience">
      <div className="rounded border border-slate-700 bg-slate-800/60 p-3 space-y-2">
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold text-slate-100">{character.xp}</div>
          <div className="text-sm text-slate-400">XP</div>
          {nextXp && (
            <div className="text-xs text-slate-500 ml-auto">Next: {nextXp.toLocaleString()}</div>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="Award XP"
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
            />
            <button
              type="button"
              onClick={award}
              className="px-3 py-1 rounded border border-slate-600 text-slate-100 text-sm hover:bg-slate-700"
            >
              Add
            </button>
          </div>
        )}
        {pending && !disabled && (
          <button
            type="button"
            onClick={onOpenLevelUp}
            className="w-full mt-2 px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-amber-50 text-sm font-semibold"
          >
            ⭐ Level up
          </button>
        )}
      </div>
    </Section>
  )
}

/**
 * Build a rollData payload compatible with GameContent's handlePlayerDiceRoll.
 *
 * Sticks to the minimal shape — D20 + modifier — since ability checks, saves
 * and skill checks all share the same dice math.
 */
function abilityCheckRoll(label, modifier) {
  return {
    rollFor: label,
    dice: 'D20',
    primaryMultiplier: 1,
    secondDice: null,
    secondMultiplier: 0,
    advantageMode: 'normal',
    bonus: modifier >= 0 ? `+${modifier}` : `${modifier}`,
  }
}

export default function CharacterSheet({
  character,
  userId,
  onRoll,
  onOpenLevelUp,
  readOnly = false,
}) {
  const patch = useRuntimePatch(character?.id)
  // `error` surfaces inline near vitals; cleared on the next successful patch.
  const [error, setError] = useState(null)

  // Inline patch wrapper that holds the indicator + flushes the error pill
  // on success. Optimistic update happens in the hook.
  const onPatch = (updates) => {
    setError(null)
    patch.mutate(updates, {
      onError: (err) => setError(err.message),
    })
  }

  const derived = character?.derived
  if (!character) return null

  const isOwner = !readOnly && (!userId || userId === character.user_id)

  const handleAbilityRoll = (code) => {
    if (!onRoll) return
    const mod = Math.floor((character.ability_scores?.[code] - 10) / 2) || 0
    onRoll(character.user_id, abilityCheckRoll(`${ABILITY_LABELS[code]} check`, mod))
  }

  const handleSaveRoll = (ability) => {
    if (!onRoll) return
    const save = derived?.saves?.find((s) => s.ability === ability)
    const mod = save?.modifier ?? 0
    onRoll(character.user_id, abilityCheckRoll(`${ABILITY_LABELS[ability]} save`, mod))
  }

  const handleSkillRoll = (skill) => {
    if (!onRoll) return
    onRoll(character.user_id, abilityCheckRoll(`${titleize(skill.skill_code)}`, skill.modifier))
  }

  const handleInitiativeRoll = () => {
    if (!onRoll) return
    onRoll(character.user_id, abilityCheckRoll('Initiative', derived?.initiative ?? 0))
  }

  return (
    <div className="space-y-4 text-slate-100 px-2 pb-6">
      {/* Header */}
      <header className="border-b border-slate-700 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold font-[family-name:var(--font-metamorphous)]">
              {character.character_name}
            </h2>
            <p className="text-xs text-slate-400">
              {titleize(character.species_code)} •{' '}
              {character.class_entries
                .map((e) => `${titleize(e.class_code)} ${e.level}`)
                .join(' / ')}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {titleize(character.background_code)} • {character.edition_code}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-slate-500">Level</div>
            <div className="text-2xl font-bold leading-none">{character.level}</div>
          </div>
        </div>
      </header>

      {/* Vitals */}
      <div className="grid grid-cols-2 gap-2">
        <HpStepper character={character} onPatch={onPatch} disabled={!isOwner} />
        <TempHpInput character={character} onPatch={onPatch} disabled={!isOwner} />
        <div className="rounded border border-slate-700 bg-slate-800/60 p-3 text-center">
          <div className="text-xs uppercase text-slate-400">AC</div>
          <div className="text-2xl font-bold">{character.ac}</div>
        </div>
        <button
          type="button"
          onClick={handleInitiativeRoll}
          disabled={!onRoll}
          className="rounded border border-slate-700 bg-slate-800/60 p-3 text-center hover:border-slate-500 disabled:hover:border-slate-700 disabled:cursor-default"
        >
          <div className="text-xs uppercase text-slate-400">Initiative</div>
          <div className="text-2xl font-bold">{modSign(derived?.initiative ?? 0)}</div>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-slate-700 bg-slate-800/60 p-3 text-center">
          <div className="text-xs uppercase text-slate-400">Speed</div>
          <div className="text-lg font-bold">{character.speed} ft</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-800/60 p-3 text-center">
          <div className="text-xs uppercase text-slate-400">Prof bonus</div>
          <div className="text-lg font-bold">{modSign(derived?.proficiency_bonus ?? 0)}</div>
        </div>
      </div>

      <InspirationToggle character={character} onPatch={onPatch} disabled={!isOwner} />

      <DeathSaveTracker character={character} onPatch={onPatch} disabled={!isOwner} />

      {error && (
        <div className="rounded border border-rose-700 bg-rose-900/30 text-rose-200 text-xs px-2 py-1">
          {error}
        </div>
      )}

      {/* Ability scores */}
      <Section title="Ability scores">
        <div className="grid grid-cols-3 gap-1">
          {Object.keys(ABILITY_LABELS).map((code) => {
            const score = character.ability_scores?.[code] ?? 10
            const mod = Math.floor((score - 10) / 2)
            return (
              <AbilityBlock
                key={code}
                code={code}
                score={score}
                modifier={mod}
                onRoll={() => handleAbilityRoll(code)}
                readOnly={readOnly}
              />
            )
          })}
        </div>
      </Section>

      {/* Saving throws */}
      <Section title="Saving throws">
        <div className="space-y-1">
          {(derived?.saves ?? []).map((save) => (
            <RollableRow
              key={save.ability}
              label={<span className="capitalize">{save.ability}</span>}
              marker={
                <span
                  aria-label={save.proficient ? 'proficient' : 'not proficient'}
                  className={save.proficient ? 'text-amber-400' : 'text-slate-700'}
                >
                  ●
                </span>
              }
              modifier={save.modifier}
              onRoll={() => handleSaveRoll(save.ability)}
              readOnly={readOnly}
            />
          ))}
        </div>
      </Section>

      {/* Skills */}
      <Section title="Skills">
        <div className="space-y-1">
          {(derived?.skills ?? []).map((skill) => (
            <RollableRow
              key={skill.skill_code}
              label={
                <>
                  <span>{titleize(skill.skill_code)}</span>
                  <span className="ml-2 text-[10px] text-slate-500 uppercase">
                    {skill.ability.slice(0, 3)}
                  </span>
                  {skill.expertise && (
                    <FontAwesomeIcon icon={faStar} className="ml-1 text-amber-400 h-3 w-3" />
                  )}
                </>
              }
              marker={
                <span
                  aria-label={skill.proficient ? 'proficient' : 'not proficient'}
                  className={skill.proficient ? 'text-amber-400' : 'text-slate-700'}
                >
                  ●
                </span>
              }
              modifier={skill.modifier}
              onRoll={() => handleSkillRoll(skill)}
              readOnly={readOnly}
            />
          ))}
        </div>
      </Section>

      <StatusEffectsEditor character={character} onPatch={onPatch} disabled={!isOwner} />

      <XpAndLevelUp
        character={character}
        onPatch={onPatch}
        onOpenLevelUp={onOpenLevelUp}
        disabled={!isOwner}
      />

      {character.feats?.length > 0 && (
        <Section title="Feats">
          <ul className="space-y-1 text-sm">
            {character.feats.map((feat, idx) => (
              <li key={`${feat.feat_code}-${idx}`} className="flex justify-between">
                <span>{titleize(feat.feat_code)}</span>
                <span className="text-xs text-slate-500">L{feat.level}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {character.languages?.length > 0 && (
        <Section title="Languages">
          <p className="text-sm text-slate-300">{character.languages.join(', ')}</p>
        </Section>
      )}
    </div>
  )
}
