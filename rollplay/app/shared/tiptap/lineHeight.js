/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { Extension } from '@tiptap/core'

import { BLOCK_ATTRIBUTE_TYPES, applyToBlockTypes } from './blockAttribute'

/**
 * Line spacing for block nodes.
 *
 * TipTap ships no first-party line-height extension, so this is our own —
 * built the same way TextAlign is: a global attribute on the block types that
 * can carry it, rendered as an inline style, with commands to set and clear.
 *
 * Block-level rather than a text mark, because line spacing applies to a whole
 * paragraph; a mark would let half a sentence claim a different spacing from
 * the other half.
 *
 * Shared by the notes and news editors — spacing is a general writing control,
 * not something either feature owns.
 */

// The values offered anywhere line spacing is editable. `null` is the default:
// no attribute is written, so the stylesheet's own line-height applies.
export const LINE_HEIGHTS = [
  { label: 'Default', value: null },
  { label: 'Tight', value: '1.2' },
  { label: 'Normal', value: '1.6' },
  { label: 'Relaxed', value: '2' },
  { label: 'Loose', value: '2.5' },
]

export const LineHeight = Extension.create({
  name: 'lineHeight',

  addOptions() {
    return {
      types: BLOCK_ATTRIBUTE_TYPES,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            // Read back from the element's own style, so a document survives a
            // copy-paste or a reload with its spacing intact.
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {}
              return { style: `line-height: ${attributes.lineHeight}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight) =>
        ({ commands }) =>
          applyToBlockTypes(this.options.types, (type) =>
            commands.updateAttributes(type, { lineHeight })
          ),

      unsetLineHeight:
        () =>
        ({ commands }) =>
          applyToBlockTypes(this.options.types, (type) =>
            commands.resetAttributes(type, 'lineHeight')
          ),
    }
  },
})

export default LineHeight
