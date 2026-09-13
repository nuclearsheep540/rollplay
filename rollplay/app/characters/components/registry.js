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

import NameConfigEditor from './name/ConfigEditor'
import NameCreateInput from './name/CreateInput'
import NameSeatCompact from './name/SeatCompact'
import NameSheetFull from './name/SheetFull'
import nameDescribeChange from './name/describeChange'

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
  name: {
    label: 'Name',
    ConfigEditor: NameConfigEditor,
    CreateInput: NameCreateInput,
    SeatCompact: NameSeatCompact,
    SheetFull: NameSheetFull,
    describeChange: nameDescribeChange,
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
 * What a player's input starts at for one configuration.
 *
 * The GM's starting value where they declared one, because that is what they meant by it;
 * otherwise the least surprising floor.
 */
export function initialValueFor(configuration) {
  switch (configuration.type) {
    case 'name':
      return { type: 'name', component_id: configuration.id, text: '' }
    case 'hit_points':
      return configuration.rules.representation === 'int'
        ? {
            type: 'hit_points',
            component_id: configuration.id,
            state: { representation: 'int', current: configuration.rules.starting },
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
export const RUNTIME_TYPE_ORDER = ['name', 'hit_points', 'attribute']
