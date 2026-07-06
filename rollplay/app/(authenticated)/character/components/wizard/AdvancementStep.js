/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useMemo, useState } from 'react'

import { THEME } from '@/app/styles/colorTheme'
import { useEditionFeats } from '../../hooks/useReferenceData'

import FeatureChoicePicker from './FeatureChoicePicker'
import StepFooter from './StepFooter'

/**
 * Advancement step (E.2) — only shown for characters created above level 1. Walks each class's
 * levels and collects the choices they unlock: subclass (at its subclass level), a feat in place
 * of an ASI (at ASI levels), and any L2+ feature choices. L1 feature choices stay on the class
 * step; ability boosts are entered on the Ability Scores step. Guidance is shown, never enforced.
 */
export default function AdvancementStep({ draft, classDefs = [], onSave, onBack, onNext }) {
  const classByCode = useMemo(() => {
    const m = new Map()
    classDefs.forEach((c) => m.set(c.code, c))
    return m
  }, [classDefs])
  const entries = draft.class_entries ?? []
  const editionCode = draft.edition_code

  const [subclasses, setSubclasses] = useState(() => {
    const m = {}
    ;(draft.subclasses ?? []).forEach((s) => { m[s.class_code] = s.subclass_code })
    return m
  })
  const [feats, setFeats] = useState(() => {
    const m = {}
    ;(draft.feats ?? []).forEach((f) => { if (f.source === 'ASI') m[String(f.level)] = f.feat_code })
    return m
  })
  const [featureChoices, setFeatureChoices] = useState(() => {
    // {class_code: {choice_code: [picks]}} — hydrate L2+ picks from the entry's sub_choices, the
    // authoritative record for every feature choice (skill or otherwise). Skill choices are
    // projected into character.skills by the backend; sub_choices is where the pick itself lives.
    const out = {}
    for (const e of entries) {
      const cls = classByCode.get(e.class_code)
      if (!cls) continue
      const choiceCodes = new Set()
      for (let lvl = 2; lvl <= e.level; lvl++) {
        for (const f of cls.features_by_level?.[String(lvl)]?.features ?? []) {
          for (const c of f.choices ?? []) choiceCodes.add(c.code)
        }
      }
      const stored = e.sub_choices ?? {}
      const forClass = {}
      for (const code of choiceCodes) if (stored[code]) forClass[code] = stored[code]
      if (Object.keys(forClass).length) out[e.class_code] = forClass
    }
    return out
  })
  // Full set of skills the character currently has (draft.skills is the union projection). A given
  // skill_proficiency feature picker greys everything selected EXCEPT its own saved pick — computed
  // per-choice in ClassAdvancement. Source-agnostic: we only care what's already selected.
  const allSelectedSkillCodes = useMemo(
    () => (draft.skills ?? []).map((s) => s.skill_code),
    [draft.skills],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleNext = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({
        subclasses: Object.entries(subclasses)
          .filter(([, v]) => v)
          .map(([class_code, subclass_code]) => ({ class_code, subclass_code })),
        feats: Object.entries(feats)
          .filter(([, v]) => v)
          .map(([level, feat_code]) => ({ level: Number(level), feat_code })),
        feature_choices: featureChoices,
      })
      onNext()
    } catch (err) {
      setError(err?.message || 'Failed to save advancement choices')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: THEME.textBold }}>
          Advancement
        </h2>
        <p className="text-sm" style={{ color: THEME.textSecondary }}>
          Make the choices your levels unlock — subclass, feats, and higher-level features. Ability
          boosts go on the Ability Scores step.
        </p>
      </div>

      {entries.map((entry) => (
        <ClassAdvancement
          key={entry.class_code}
          editionCode={editionCode}
          classDef={classByCode.get(entry.class_code)}
          entry={entry}
          subclass={subclasses[entry.class_code] ?? ''}
          onSubclass={(code) => setSubclasses((s) => ({ ...s, [entry.class_code]: code }))}
          feats={feats}
          onFeat={(level, code) => setFeats((f) => ({ ...f, [String(level)]: code }))}
          featureChoices={featureChoices[entry.class_code] ?? {}}
          onFeatureChoice={(choiceCode, picks) =>
            setFeatureChoices((fc) => ({
              ...fc,
              [entry.class_code]: { ...(fc[entry.class_code] ?? {}), [choiceCode]: picks },
            }))
          }
          allSelectedSkillCodes={allSelectedSkillCodes}
        />
      ))}

      {error ? (
        <div className="text-sm" style={{ color: THEME.feedbackError ?? '#f87171' }}>{error}</div>
      ) : null}

      <StepFooter onBack={onBack} onNext={handleNext} nextDisabled={saving} />
    </div>
  )
}

/** One class's advancement choices: subclass, ASI-level feats, and L2+ feature pickers. */
function ClassAdvancement({
  editionCode, classDef, entry, subclass, onSubclass, feats, onFeat, featureChoices, onFeatureChoice,
  allSelectedSkillCodes = [],
}) {
  const subclassLevel = classDef?.subclass_level ?? null
  const showSubclass = subclassLevel != null && entry.level >= subclassLevel
  const asiLevels = (classDef?.asi_levels ?? []).filter((l) => l <= entry.level)
  const featureChoiceList = useMemo(() => {
    const list = []
    for (let lvl = 2; lvl <= entry.level; lvl++) {
      for (const f of classDef?.features_by_level?.[String(lvl)]?.features ?? []) {
        for (const c of f.choices ?? []) list.push(c)
      }
    }
    return list
  }, [classDef, entry.level])
  // Feats are only needed if this class has ASI levels reached.
  const { data: generalFeats } = useEditionFeats(asiLevels.length ? editionCode : null, 'general')

  if (!classDef) return null

  return (
    <div className="border rounded-sm p-3 space-y-4" style={{ borderColor: THEME.borderDefault }}>
      <div className="text-sm font-semibold" style={{ color: THEME.textBold }}>
        {classDef.name}
        <span className="ml-2 font-normal" style={{ color: THEME.textSecondary }}>Level {entry.level}</span>
      </div>

      {showSubclass && (
        <div className="space-y-1">
          <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>
            Subclass
            <span className="ml-2 normal-case">— normally chosen at level {subclassLevel}</span>
          </div>
          {(classDef.subclasses ?? []).map((sub) => (
            <label key={sub.code} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={`subclass-${classDef.code}`}
                checked={subclass === sub.code}
                onChange={() => onSubclass(sub.code)}
                className="mt-1"
              />
              <span className="font-medium" style={{ color: THEME.textOnDark }}>{sub.name}</span>
            </label>
          ))}
        </div>
      )}

      {asiLevels.map((lvl) => (
        <div key={lvl} className="space-y-1">
          <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>
            Level {lvl} — Ability Score Improvement or feat
          </div>
          <select
            value={feats[String(lvl)] ?? ''}
            onChange={(e) => onFeat(lvl, e.target.value)}
            className="w-full px-3 py-2 border rounded-sm text-sm"
            style={{ backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault, color: THEME.textOnDark }}
          >
            <option value="">Select one…</option>
            {(generalFeats ?? []).map((f) => (
              <option key={f.code} value={f.code}>{f.name}</option>
            ))}
          </select>
          <p className="text-xs" style={{ color: THEME.textSecondary }}>
            Ability Score Improvement is a feat here — pick it to take the ASI, then set the boosts
            on the Ability Scores step.
          </p>
        </div>
      ))}

      {featureChoiceList.map((choice) => {
        // Grey skills already selected elsewhere: everything selected minus THIS choice's own
        // saved pick (from the entry's sub_choices), so the picker never greys its own selection.
        const ownSaved = new Set((entry.sub_choices ?? {})[choice.code] ?? [])
        const ownedElsewhere = allSelectedSkillCodes.filter((c) => !ownSaved.has(c))
        return (
          <FeatureChoicePicker
            key={`${classDef.code}-${choice.code}`}
            choice={choice}
            editionCode={editionCode}
            value={featureChoices[choice.code] ?? []}
            onChange={(picks) => onFeatureChoice(choice.code, picks)}
            alreadyOwnedSkills={ownedElsewhere}
            contextLabel={`${classDef.name} feature`}
          />
        )
      })}
    </div>
  )
}
