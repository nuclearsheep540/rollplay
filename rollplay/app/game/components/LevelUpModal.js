/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useMemo, useState } from 'react'

import Modal from '@/app/shared/components/Modal'

import { useApplyLevelUp, useLevelUpPreview } from '../hooks/useCharacterRuntime'

/**
 * Multi-step level-up wizard, modal-style.
 *
 * Steps:
 *   1. Class — skipped if the character only has one class
 *   2. HP    — average vs roll
 *   3. ASI / Feat — only when the picked class's new level is an ASI level
 *   4. Confirm
 *
 * Submits to POST /api/characters/{id}/level-up. The server applies all
 * changes atomically and writes audit rows to character_choices_log.
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

function StepHeader({ stepNumber, totalSteps, title }) {
  return (
    <div className="mb-3">
      <div className="text-xs uppercase text-slate-400">
        Step {stepNumber} of {totalSteps}
      </div>
      <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
    </div>
  )
}

function AsiPicker({ value, onChange }) {
  // Two valid 5.5e ASI shapes: +2 one ability, or +1 / +1 across two.
  const [mode, setMode] = useState(value?.mode ?? '2_into_one')
  const [primary, setPrimary] = useState(value?.primary ?? 'strength')
  const [secondary, setSecondary] = useState(value?.secondary ?? 'dexterity')

  useEffect(() => {
    const increases = mode === '2_into_one'
      ? { [primary]: 2 }
      : { [primary]: 1, [secondary]: 1 }
    onChange({ mode, primary, secondary, increases })
  }, [mode, primary, secondary])

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[
          { id: '2_into_one', label: '+2 to one ability' },
          { id: '1_into_two', label: '+1 / +1 across two' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMode(opt.id)}
            className={`px-3 py-1.5 rounded border text-sm ${
              mode === opt.id
                ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                : 'border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm space-y-1">
          <span className="text-xs uppercase text-slate-400 block">Primary +{mode === '2_into_one' ? 2 : 1}</span>
          <select
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 capitalize"
          >
            {Object.keys(ABILITY_LABELS).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        {mode === '1_into_two' && (
          <label className="text-sm space-y-1">
            <span className="text-xs uppercase text-slate-400 block">Secondary +1</span>
            <select
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 capitalize"
            >
              {Object.keys(ABILITY_LABELS).filter((a) => a !== primary).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

export default function LevelUpModal({ character, open, onClose, onComplete }) {
  const characterId = character?.id
  const preview = useLevelUpPreview(characterId, open)
  const apply = useApplyLevelUp(characterId)

  const [stepIdx, setStepIdx] = useState(0)
  const [classCode, setClassCode] = useState(null)
  const [hpChoice, setHpChoice] = useState('average')
  const [rollValue, setRollValue] = useState('')
  const [asiPick, setAsiPick] = useState({ mode: '2_into_one', primary: 'strength', secondary: 'dexterity', increases: { strength: 2 } })
  const [featCode, setFeatCode] = useState('')
  const [usingFeat, setUsingFeat] = useState(false)
  const [error, setError] = useState(null)

  // Default the class pick to the first available; only matters for multi-class.
  useEffect(() => {
    if (!classCode && preview.data?.available_classes?.length) {
      setClassCode(preview.data.available_classes[0])
    }
  }, [preview.data?.available_classes, classCode])

  // Reset on close so the next open is a clean slate.
  useEffect(() => {
    if (!open) {
      setStepIdx(0)
      setClassCode(null)
      setHpChoice('average')
      setRollValue('')
      setAsiPick({ mode: '2_into_one', primary: 'strength', secondary: 'dexterity', increases: { strength: 2 } })
      setFeatCode('')
      setUsingFeat(false)
      setError(null)
    }
  }, [open])

  const data = preview.data
  const isAsiLevel = data?.is_asi_level?.[classCode] === true
  const multiClass = (data?.available_classes?.length ?? 0) > 1

  // Build the step list dynamically. Classes step only appears for multi-class
  // characters; ASI step only appears when this level is an ASI level.
  const steps = useMemo(() => {
    const list = []
    if (multiClass) list.push('class')
    list.push('hp')
    if (isAsiLevel) list.push('asi')
    list.push('confirm')
    return list
  }, [multiClass, isAsiLevel])

  const totalSteps = steps.length
  const currentStep = steps[stepIdx] ?? 'hp'

  const goNext = () => setStepIdx((i) => Math.min(steps.length - 1, i + 1))
  const goBack = () => setStepIdx((i) => Math.max(0, i - 1))

  const handleApply = async () => {
    setError(null)
    const payload = {
      class_code: classCode,
      hp_choice: hpChoice,
    }
    if (hpChoice === 'roll') {
      const n = Number(rollValue)
      if (!n || n < 1) {
        setError('Enter a positive roll value.')
        return
      }
      payload.roll_value = n
    }
    if (isAsiLevel) {
      if (usingFeat) {
        if (!featCode) {
          setError('Pick a feat or switch to ASI.')
          return
        }
        payload.feat_choice = { feat_code: featCode }
      } else {
        payload.asi_choice = { increases: asiPick.increases }
      }
    }
    try {
      const fresh = await apply.mutateAsync(payload)
      onComplete?.(fresh)
      onClose()
    } catch (err) {
      setError(err.body?.detail || err.message)
    }
  }

  if (!character) return null

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        <header className="border-b border-slate-700 pb-2">
          <h2 className="text-xl font-semibold text-slate-100">
            Level up — {character.character_name}
          </h2>
          <p className="text-xs text-slate-400">
            Current level {character.level} → {data?.target_level ?? character.level + 1}
          </p>
        </header>

        {preview.isLoading && <p className="text-slate-300">Loading…</p>}
        {preview.error && (
          <p className="text-rose-400 text-sm">{preview.error.message}</p>
        )}

        {data && (
          <>
            {currentStep === 'class' && (
              <div>
                <StepHeader stepNumber={stepIdx + 1} totalSteps={totalSteps} title="Pick a class to level" />
                <div className="space-y-1">
                  {data.available_classes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setClassCode(code)}
                      className={`w-full text-left px-3 py-2 rounded border ${
                        classCode === code
                          ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                          : 'border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {titleize(code)}
                      {data.is_asi_level?.[code] && (
                        <span className="ml-2 text-xs text-amber-400">ASI</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 'hp' && (
              <div>
                <StepHeader stepNumber={stepIdx + 1} totalSteps={totalSteps} title="HP gain" />
                <div className="space-y-2">
                  {(['average', 'roll']).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setHpChoice(opt)}
                      className={`w-full text-left px-3 py-2 rounded border ${
                        hpChoice === opt
                          ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                          : 'border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {opt === 'average' ? (
                        <>Average ({data.hp_options?.[classCode]?.average ?? '—'} HP)</>
                      ) : (
                        <>Roll (up to {data.hp_options?.[classCode]?.max_roll ?? '—'} HP)</>
                      )}
                    </button>
                  ))}
                  {hpChoice === 'roll' && (
                    <input
                      type="number"
                      min={1}
                      value={rollValue}
                      onChange={(e) => setRollValue(e.target.value)}
                      placeholder="Enter d-roll result"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                    />
                  )}
                </div>
              </div>
            )}

            {currentStep === 'asi' && (
              <div className="space-y-3">
                <StepHeader stepNumber={stepIdx + 1} totalSteps={totalSteps} title="Ability Score Improvement or Feat" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUsingFeat(false)}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      !usingFeat
                        ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    ASI
                  </button>
                  <button
                    type="button"
                    onClick={() => setUsingFeat(true)}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      usingFeat
                        ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    Feat
                  </button>
                </div>
                {!usingFeat && (
                  <AsiPicker value={asiPick} onChange={setAsiPick} />
                )}
                {usingFeat && (
                  <select
                    value={featCode}
                    onChange={(e) => setFeatCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                  >
                    <option value="">Choose a feat…</option>
                    {(data.qualifying_feats ?? []).map((code) => (
                      <option key={code} value={code}>{titleize(code)}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {currentStep === 'confirm' && (
              <div>
                <StepHeader stepNumber={stepIdx + 1} totalSteps={totalSteps} title="Review" />
                <ul className="text-sm space-y-1 text-slate-200">
                  <li>Class: <strong>{titleize(classCode)}</strong></li>
                  <li>HP: <strong>{hpChoice}{hpChoice === 'roll' ? ` (rolled ${rollValue})` : ''}</strong></li>
                  {isAsiLevel && !usingFeat && (
                    <li>ASI: <strong>{Object.entries(asiPick.increases).map(([k, v]) => `+${v} ${ABILITY_LABELS[k]}`).join(', ')}</strong></li>
                  )}
                  {isAsiLevel && usingFeat && (
                    <li>Feat: <strong>{titleize(featCode)}</strong></li>
                  )}
                </ul>
              </div>
            )}

            {error && (
              <p className="text-sm text-rose-400">{error}</p>
            )}

            <div className="flex justify-between pt-3 border-t border-slate-700">
              <button
                type="button"
                onClick={stepIdx === 0 ? onClose : goBack}
                className="px-3 py-1.5 rounded border border-slate-700 text-slate-300 hover:border-slate-500 text-sm"
              >
                {stepIdx === 0 ? 'Cancel' : '← Back'}
              </button>
              {currentStep !== 'confirm' ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!classCode}
                  className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-amber-50 text-sm font-semibold disabled:opacity-50"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={apply.isPending}
                  className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-amber-50 text-sm font-semibold disabled:opacity-50"
                >
                  {apply.isPending ? 'Applying…' : 'Apply level-up ✓'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
