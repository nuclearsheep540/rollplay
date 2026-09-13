/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { NumberField, SelectField, TextField } from '../shared/Fields'

/**
 * The GM's parameters for an Identity: how it is answered, and the parameters of that
 * kind. Required is not here: it is a flag the card itself shows, bottom-right beside
 * Secret, for any type that carries it.
 *
 * Switching kind replaces `input` wholesale with that kind's defaults — a text box and a
 * list of options have nothing to translate between them. Switching between the two
 * select kinds keeps the options, because those are the same list either way.
 */

const TEXT_DEFAULTS = { kind: 'text', max_length: 60 }
const SELECT_DEFAULTS = { options: ['Option 1', 'Option 2'] }
const OPTIONS_CEILING = 50
const OPTION_MAX_LENGTH = 60

export default function ConfigEditor({ configuration, onChange }) {
  const input = configuration.input
  const setInput = (next) => onChange({ ...configuration, input: next })

  // Part of the character's display name — whatever kind answers it. Beside the input
  // because it is about the answer: "this is what we call them".
  const titleToggle = (
    <label className="flex items-center gap-1.5 pb-2.5 text-[12.5px] text-[#37322F] cursor-pointer whitespace-nowrap">
      <input
        type="checkbox"
        checked={!!configuration.is_title}
        onChange={(event) => onChange({ ...configuration, is_title: event.target.checked })}
      />
      Is title
    </label>
  )

  const kindSelect = (
    <SelectField
      label="Input choice"
      value={input.kind}
      options={[
        { value: 'text', label: 'Text' },
        { value: 'single_select', label: 'One choice' },
        { value: 'multi_select', label: 'Several choices' },
      ]}
      onChange={(kind) => {
        if (kind === 'text') return setInput({ ...TEXT_DEFAULTS })
        const options = input.kind === 'text' ? [...SELECT_DEFAULTS.options] : input.options
        setInput({ kind, options })
      }}
    />
  )

  if (input.kind === 'text') {
    return (
      <>
        <div className="grid grid-cols-[200px_140px_auto] gap-4 items-end">
          {kindSelect}
          <NumberField
            label="Maximum length"
            value={input.max_length}
            min={1}
            max={200}
            onChange={(max_length) => setInput({ ...input, max_length })}
          />
          {titleToggle}
        </div>
        <div className="text-[12.5px] text-content-muted leading-snug">
          Free text. Can represent any kind of flavor you want to give player characters. Every identity
          marked as title joins up, in order, to make the character&apos;s name.
        </div>
      </>
    )
  }

  const updateOption = (index, text) =>
    setInput({ ...input, options: input.options.map((option, position) => (position === index ? text : option)) })
  const removeOption = (index) =>
    setInput({ ...input, options: input.options.filter((option, position) => position !== index) })

  return (
    <>
      <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
        <div className="flex flex-col gap-2">
          {kindSelect}
          {titleToggle}
        </div>
        <div>
          <label className="block text-[13px] font-medium mb-2 text-[#37322F]">Options, in the order shown</label>
          <div className="flex flex-col gap-1.5">
            {input.options.map((option, index) => (
              <div key={index} className="grid grid-cols-[1fr_28px] gap-2 items-center">
                <TextField value={option} maxLength={OPTION_MAX_LENGTH} onChange={(text) => updateOption(index, text)} />
                <button
                  type="button"
                  className="text-content-muted hover:text-feedback-error disabled:opacity-40"
                  title="Remove option"
                  disabled={input.options.length <= 1}
                  onClick={() => removeOption(index)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="self-start mt-1 px-3 py-2 text-xs rounded-lg border border-[#37322F] text-[#37322F] disabled:opacity-40"
              disabled={input.options.length >= OPTIONS_CEILING}
              onClick={() => setInput({ ...input, options: [...input.options, `Option ${input.options.length + 1}`] })}
            >
              + Add option
            </button>
          </div>
        </div>
      </div>
      <div className="text-[12.5px] text-content-muted leading-snug">
        {input.kind === 'single_select'
          ? 'The player picks one. Eg: a house or a calling.'
          : 'The player picks multiple. Eg. quirks or traits'}
      </div>
    </>
  )
}
