/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useMemo, useState } from 'react'

import { THEME, COLORS } from '@/app/styles/colorTheme'
import {
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  calculatePointsSpent,
  getDefaultPointBuyScores,
} from '../../utils/pointBuyCalculations'
import { rollAbilityScoresDetailed } from '../../utils/diceRolling'

import StepFooter from './StepFooter'

const ABILITIES = [
  { code: 'strength', label: 'STR' },
  { code: 'dexterity', label: 'DEX' },
  { code: 'constitution', label: 'CON' },
  { code: 'intelligence', label: 'INT' },
  { code: 'wisdom', label: 'WIS' },
  { code: 'charisma', label: 'CHA' },
]

const MODES = [
  { id: 'point_buy', label: 'Point-buy (27)' },
  { id: 'standard_array', label: 'Standard array' },
  { id: 'rolled', label: 'Roll 4d6 drop lowest' },
  { id: 'manual', label: 'Manual entry' },
]

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]

function modifier(score) {
  return Math.floor((score - 10) / 2)
}

// Reconstruct the per-ability score map from a stored roll_details object.
function scoresFromRollDetails(details) {
  const out = {}
  for (const ab of ABILITIES) {
    const detail = details?.[ab.code]
    if (detail?.total != null) out[ab.code] = detail.total
  }
  return out
}

function emptyScores() {
  return {
    strength: undefined,
    dexterity: undefined,
    constitution: undefined,
    intelligence: undefined,
    wisdom: undefined,
    charisma: undefined,
  }
}

export default function AbilityScoresStep({ draft, onSave, onSaveHpAc, onBack, onNext }) {
  // Background bonuses live on the draft as a separate dict — they're never
  // included in our local ``scores`` state, which always tracks the BASE.
  // We add them back for display, send only base values on save.
  const originBonuses = draft.origin_ability_bonuses ?? {}

  // Decompose final → base for the initial state. If the draft has stored
  // roll details from a previous visit, prefer those (server is the source
  // of truth for "the roll the player saw last time").
  const initial = useMemo(() => {
    const rollDetails = draft.ability_roll_details
    if (rollDetails && draft.ability_score_method === 'rolled') {
      return scoresFromRollDetails(rollDetails)
    }
    const final = draft.ability_scores
    if (final && Object.values(final).some((v) => v !== 10)) {
      const base = { ...final }
      for (const [ab, bonus] of Object.entries(originBonuses)) {
        base[ab] = (base[ab] ?? 10) - (bonus ?? 0)
      }
      return base
    }
    return getDefaultPointBuyScores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.ability_scores, draft.ability_roll_details, draft.ability_score_method])

  // Resume in whichever mode the player last persisted. Default to point-buy
  // for brand-new drafts (no method stored yet).
  const [mode, setMode] = useState(draft.ability_score_method || 'point_buy')
  const [scores, setScores] = useState(initial)
  const [hpMax, setHpMax] = useState(draft.hp_max > 1 ? draft.hp_max : 10)
  const [ac, setAc] = useState(draft.ac > 1 ? draft.ac : 10)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // For the "Roll 4d6 drop lowest" mode: per-ability roll details so the cell
  // can show the underlying dice + which die was dropped. This cache survives
  // mode switches — switching to point-buy and back to rolled restores the
  // exact dice the player saw before, instead of forcing a re-roll. Seeded
  // from the draft so a hard refresh also restores.
  const [rollDetails, setRollDetails] = useState(draft.ability_roll_details ?? null)
  const hasRolled = rollDetails != null

  const pointBuy = useMemo(() => {
    try {
      const spent = calculatePointsSpent(scores)
      return { spent, remaining: POINT_BUY_BUDGET - spent, valid: spent <= POINT_BUY_BUDGET }
    } catch {
      return { spent: 0, remaining: POINT_BUY_BUDGET, valid: false }
    }
  }, [scores])

  const handleScoreChange = (ability, delta) => {
    setScores((curr) => {
      const next = { ...curr }
      const nextValue = (next[ability] ?? 10) + delta
      if (mode === 'point_buy') {
        if (nextValue < POINT_BUY_MIN || nextValue > POINT_BUY_MAX) return curr
        next[ability] = nextValue
        const trial = calculatePointsSpent(next)
        if (trial > POINT_BUY_BUDGET) return curr
        return next
      }
      if (mode === 'manual') {
        if (nextValue < 1 || nextValue > 20) return curr
        next[ability] = nextValue
        return next
      }
      // Rolled mode is read-only after roll — values come strictly from
      // the dice. Re-roll to get a different set.
      return curr
    })
  }

  const handleStandardArrayPick = (ability, value) => {
    setScores((curr) => ({ ...curr, [ability]: value }))
  }

  // One-click roll: generate 6 batches of 4d6-drop-lowest and assign them
  // directly to STR/DEX/CON/INT/WIS/CHA in order. The roll details are
  // cached locally; nothing is PATCHed until the player hits Next.
  const handleRollAll = () => {
    const result = rollAbilityScoresDetailed('4d6-drop-lowest')
    setScores(result.scores)
    setRollDetails(result.details)
  }

  // Switching modes reshapes the displayed scores to that mode's canonical
  // starting state — point-buy defaults, empty for standard array, the
  // cached roll for rolled (or empty if no roll yet). The roll-details cache
  // is preserved across switches so the player can hop between modes and
  // return to their rolled set without re-rolling.
  const handleModeChange = (newMode) => {
    if (newMode === mode) return
    if (newMode === 'point_buy') {
      setScores(getDefaultPointBuyScores())
    } else if (newMode === 'standard_array') {
      setScores(emptyScores())
    } else if (newMode === 'rolled') {
      setScores(rollDetails ? scoresFromRollDetails(rollDetails) : emptyScores())
    }
    // Manual: keep current values as-is (any 1..20 is valid).
    setMode(newMode)
    setError(null)
  }

  const standardArrayState = useMemo(() => {
    // Track which standard-array values are still available based on
    // current assignments (each value is meant to be used once).
    const used = ABILITIES.map((a) => scores[a.code]).filter((v) => STANDARD_ARRAY.includes(v))
    const remaining = [...STANDARD_ARRAY]
    for (const value of used) {
      const idx = remaining.indexOf(value)
      if (idx >= 0) remaining.splice(idx, 1)
    }
    return remaining
  }, [scores])

  const validStandardArray = useMemo(() => {
    if (mode !== 'standard_array') return true
    const used = ABILITIES.map((a) => scores[a.code]).sort()
    return JSON.stringify(used) === JSON.stringify([...STANDARD_ARRAY].sort())
  }, [scores, mode])

  const handleNext = async () => {
    setError(null)
    if (mode === 'point_buy' && !pointBuy.valid) {
      setError('Point-buy budget exceeded.')
      return
    }
    if (mode === 'standard_array' && !validStandardArray) {
      setError('Assign each standard-array value to exactly one ability.')
      return
    }
    if (mode === 'rolled' && !hasRolled) {
      setError('Roll your scores before continuing.')
      return
    }
    setSaving(true)
    try {
      // Two PATCHes — ability_scores first, then hp_ac. ``method`` and
      // (for rolled) ``roll_details`` go up so a refresh resumes on the
      // same tab with the same dice still visible.
      await onSave({
        ...scores,
        method: mode,
        roll_details: mode === 'rolled' ? rollDetails : null,
      })
      await onSaveHpAc({ hp_max: hpMax, ac })
      onNext()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold" style={{ color: THEME.textOnDark }}>
          Ability scores, HP &amp; AC
        </h2>
        <p className="mt-1 text-sm" style={{ color: THEME.textSecondary }}>
          Background ability bonuses are already baked into the displayed
          scores from the previous step.
        </p>
      </header>

      <div>
        <div className="text-xs uppercase mb-2" style={{ color: THEME.textSecondary }}>Score mode</div>
        <div className="flex gap-2 flex-wrap">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleModeChange(m.id)}
              className="px-3 py-1.5 border rounded-sm text-sm"
              style={{
                borderColor: mode === m.id ? COLORS.silver : THEME.borderDefault,
                backgroundColor: mode === m.id ? `${COLORS.silver}1A` : 'transparent',
                color: THEME.textOnDark,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'point_buy' && (
        <div
          className="rounded-sm border px-3 py-2 text-sm flex justify-between"
          style={{
            borderColor: pointBuy.valid ? THEME.borderSubtle : '#f87171',
            color: pointBuy.valid ? THEME.textOnDark : '#f87171',
          }}
        >
          <span>Points spent: <strong>{pointBuy.spent}</strong> / {POINT_BUY_BUDGET}</span>
          <span>Remaining: <strong>{pointBuy.remaining}</strong></span>
        </div>
      )}

      {mode === 'standard_array' && (
        <p className="text-xs" style={{ color: THEME.textSecondary }}>
          Available: {standardArrayState.length > 0 ? standardArrayState.join(', ') : '— all assigned —'}
        </p>
      )}

      {mode === 'rolled' && (
        <div className="rounded-sm border p-3 flex items-center justify-between" style={{
          borderColor: THEME.borderSubtle,
          backgroundColor: `${COLORS.smoke}05`,
        }}>
          <p className="text-xs" style={{ color: THEME.textSecondary }}>
            {hasRolled
              ? 'Each ability got one 4d6-drop-lowest roll. Re-roll to get a new set, or switch modes to edit manually.'
              : 'Click Roll to assign one 4d6-drop-lowest result to each ability.'}
          </p>
          <button
            type="button"
            onClick={handleRollAll}
            className="ml-3 px-3 py-1 rounded-sm text-sm font-semibold whitespace-nowrap"
            style={{ backgroundColor: COLORS.silver, color: COLORS.onyx }}
          >
            {hasRolled ? 'Re-roll all' : 'Roll dice →'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ABILITIES.map((ab) => {
          const baseValue = scores[ab.code]
          const showBase = baseValue ?? (mode === 'rolled' && !hasRolled ? null : 10)
          const bonus = originBonuses[ab.code] ?? 0
          const finalValue = showBase != null ? showBase + bonus : null
          const mod = finalValue != null ? modifier(finalValue) : null
          const detail = mode === 'rolled' ? rollDetails?.[ab.code] : null
          return (
            <div
              key={ab.code}
              className="flex items-center justify-between border rounded-sm px-3 py-2"
              style={{ borderColor: THEME.borderSubtle, backgroundColor: `${COLORS.smoke}05` }}
            >
              <div>
                <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>{ab.label}</div>
                <div className="text-xl font-bold" style={{ color: THEME.textOnDark }}>
                  {finalValue ?? '—'}
                  {mod != null && (
                    <span className="ml-2 text-sm" style={{ color: THEME.textSecondary }}>
                      ({mod >= 0 ? '+' : ''}{mod})
                    </span>
                  )}
                </div>
                {bonus > 0 && showBase != null && (
                  <div className="text-[10px]" style={{ color: THEME.textSecondary }}>
                    base {showBase}{' '}
                    <span style={{ color: COLORS.silver }}>+{bonus} bg</span>
                  </div>
                )}
                {detail && (
                  <div className="mt-1 text-[10px]" style={{ color: THEME.textSecondary }}>
                    Rolled {detail.rolls.join(', ')} (drop <span className="line-through">{detail.dropped}</span>)
                  </div>
                )}
              </div>
              {mode === 'standard_array' ? (
                <select
                  value={STANDARD_ARRAY.includes(baseValue) ? baseValue : ''}
                  onChange={(e) => handleStandardArrayPick(ab.code, Number(e.target.value))}
                  className="px-2 py-1 border rounded-sm text-sm"
                  style={{
                    backgroundColor: THEME.bgSecondary,
                    borderColor: THEME.borderDefault,
                    color: THEME.textOnDark,
                  }}
                >
                  <option value="">—</option>
                  {STANDARD_ARRAY.map((v) => (
                    <option key={v} value={v} disabled={STANDARD_ARRAY.includes(baseValue) && baseValue !== v && !standardArrayState.includes(v)}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : mode === 'rolled' ? (
                // No editor — rolled scores are set by handleRollAll and only
                // change when the player clicks Re-roll all.
                null
              ) : (
                // Point-buy + manual modes share the +/- stepper.
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleScoreChange(ab.code, -1)}
                    className="h-8 w-8 rounded-sm border text-sm"
                    style={{
                      borderColor: THEME.borderDefault,
                      color: THEME.textOnDark,
                      backgroundColor: 'transparent',
                    }}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScoreChange(ab.code, 1)}
                    className="h-8 w-8 rounded-sm border text-sm"
                    style={{
                      borderColor: THEME.borderDefault,
                      color: THEME.textOnDark,
                      backgroundColor: 'transparent',
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <label className="block text-xs uppercase mb-1" style={{ color: THEME.textSecondary }}>Max HP</label>
          <input
            type="number"
            min={1}
            max={999}
            value={hpMax}
            onChange={(e) => setHpMax(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
            className="w-full px-3 py-2 border rounded-sm"
            style={{
              backgroundColor: THEME.bgSecondary,
              borderColor: THEME.borderDefault,
              color: THEME.textOnDark,
            }}
          />
        </div>
        <div>
          <label className="block text-xs uppercase mb-1" style={{ color: THEME.textSecondary }}>Armor class</label>
          <input
            type="number"
            min={1}
            max={50}
            value={ac}
            onChange={(e) => setAc(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-full px-3 py-2 border rounded-sm"
            style={{
              backgroundColor: THEME.bgSecondary,
              borderColor: THEME.borderDefault,
              color: THEME.textOnDark,
            }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: '#f87171', color: '#f87171' }}>
          {error}
        </div>
      )}

      <StepFooter
        onBack={onBack}
        onNext={handleNext}
        nextDisabled={
          saving ||
          (mode === 'point_buy' && !pointBuy.valid) ||
          (mode === 'standard_array' && !validStandardArray) ||
          (mode === 'rolled' && !hasRolled)
        }
        nextLabel={saving ? 'Saving…' : 'Next →'}
      />
    </div>
  )
}
