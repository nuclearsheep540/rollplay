/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * The component registry: one entry per platform component, five pieces each.
 *
 * Every surface that renders a character dispatches through here on the component's
 * `type` — the campaign builder's parameter editor, the player's create form, the seat
 * card, the in-game sheet, and the log sentence. Only the renderer for a type knows what
 * it means; nothing else does.
 *
 * A type with no entry falls back to a generic renderer rather than breaking the page, so
 * a deploy where the backend knows a component the frontend does not degrades instead of
 * blanking someone's character.
 */

import IdentityConfigEditor from './identity/ConfigEditor'
import IdentityCreateInput from './identity/CreateInput'
import IdentitySeatCompact from './identity/SeatCompact'
import IdentitySheetFull from './identity/SheetFull'
import identityDescribeChange from './identity/describeChange'

import HitPointsConfigEditor from './hit_points/ConfigEditor'
import HitPointsCreateInput from './hit_points/CreateInput'
import HitPointsSeatCompact from './hit_points/SeatCompact'
import HitPointsSheetFull from './hit_points/SheetFull'
import hitPointsDescribeChange from './hit_points/describeChange'

import AttributeConfigEditor from './attribute/ConfigEditor'
import AttributeCreateInput from './attribute/CreateInput'
import AttributeSeatCompact from './attribute/SeatCompact'
import AttributeSheetFull from './attribute/SheetFull'
import attributeDescribeChange from './attribute/describeChange'

import GenericConfigEditor from './fallback/GenericConfigEditor'
import GenericCreateInput from './fallback/GenericCreateInput'
import GenericSeatCompact from './fallback/GenericSeatCompact'
import GenericSheetFull from './fallback/GenericSheetFull'
import genericDescribeChange from './fallback/describeChange'

export const COMPONENT_REGISTRY = {
  identity: {
    label: 'Identity',
    ConfigEditor: IdentityConfigEditor,
    CreateInput: IdentityCreateInput,
    SeatCompact: IdentitySeatCompact,
    SheetFull: IdentitySheetFull,
    describeChange: identityDescribeChange,
  },
  hit_points: {
    label: 'Hit points',
    ConfigEditor: HitPointsConfigEditor,
    CreateInput: HitPointsCreateInput,
    SeatCompact: HitPointsSeatCompact,
    SheetFull: HitPointsSheetFull,
    describeChange: hitPointsDescribeChange,
  },
  attribute: {
    label: 'Attribute',
    ConfigEditor: AttributeConfigEditor,
    CreateInput: AttributeCreateInput,
    SeatCompact: AttributeSeatCompact,
    SheetFull: AttributeSheetFull,
    describeChange: attributeDescribeChange,
  },
}

const FALLBACK = {
  label: 'Component',
  ConfigEditor: GenericConfigEditor,
  CreateInput: GenericCreateInput,
  SeatCompact: GenericSeatCompact,
  SheetFull: GenericSheetFull,
  describeChange: genericDescribeChange,
}

/** The named piece for a component type, or the generic one. Never throws. */
export function pieceFor(type, piece) {
  return (COMPONENT_REGISTRY[type] || FALLBACK)[piece] || FALLBACK[piece]
}

/** The catalogue label for a type, for eyebrows and chips. */
export function labelForType(type) {
  return (COMPONENT_REGISTRY[type] || FALLBACK).label
}

/**
 * Every component of a config's entries in form order, the group boundaries forgotten —
 * the mirror of CharacterConfig.flat_components(). What anything that is not the form
 * wants: seeding values, the submit, the runtime sheet.
 */
export function flatComponents(entries) {
  return (entries ?? []).flatMap((entry) => (entry.type === 'group' ? entry.components : [entry]))
}

/** An unanswered identity in the shape its input asks for. */
function emptyAnswerFor(input) {
  if (input.kind === 'single_select') return { kind: 'single_select', choice: '' }
  if (input.kind === 'multi_select') return { kind: 'multi_select', choices: [] }
  return { kind: 'text', text: '' }
}

/**
 * Whether a player has answered an identity: non-blank text, a choice, or at least one.
 * Mirrors IdentityValue.is_populated in the contracts — what "required" checks.
 */
export function isIdentityPopulated(value) {
  const answer = value?.answer
  if (!answer) return false
  if (answer.kind === 'text') return !!answer.text?.trim()
  if (answer.kind === 'single_select') return !!answer.choice
  return (answer.choices?.length ?? 0) > 0
}

/**
 * What a player's input starts at for one configuration.
 *
 * The GM's default where they declared one, because that is what they meant by it;
 * otherwise the least surprising floor. Hit points start at the top of the GM's entry
 * range — a full character — since the entry is the character's own maximum and there
 * is nothing else to start from.
 */
export function initialValueFor(configuration) {
  switch (configuration.type) {
    case 'identity':
      return { type: 'identity', component_id: configuration.id, answer: emptyAnswerFor(configuration.input) }
    case 'hit_points':
      return configuration.rules.representation === 'int'
        ? {
            type: 'hit_points',
            component_id: configuration.id,
            state: { representation: 'int', maximum: configuration.rules.maximum, current: configuration.rules.maximum },
          }
        : {
            type: 'hit_points',
            component_id: configuration.id,
            state: { representation: 'weighted', current_weight: configuration.rules.starting_weight },
          }
    case 'attribute':
      return {
        type: 'attribute',
        component_id: configuration.id,
        score: configuration.default ?? configuration.minimum,
      }
    default:
      return { type: configuration.type, component_id: configuration.id }
  }
}

/**
 * Mirror of shared_contracts.components.RUNTIME_TYPE_ORDER — the platform's fixed order on
 * every runtime surface. GM config order applies within a type; the create form does NOT
 * use this, it keeps the GM's order. Keep in sync with the contract.
 */
export const RUNTIME_TYPE_ORDER = ['identity', 'hit_points', 'attribute']
