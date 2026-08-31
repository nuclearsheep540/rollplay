/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { Extension } from '@tiptap/core'

/**
 * Space BETWEEN blocks — the gap after a paragraph or heading.
 *
 * The sibling of line height, and routinely confused with it: line height is
 * the leading *within* a paragraph (how far apart its wrapped lines sit),
 * while this is the air *after* it, before the next block begins. Changing one
 * never changes the other, which is why both exist.
 *
 * Built like LineHeight and TextAlign: a global attribute on the block types
 * that can carry it, rendered as an inline style, with commands to set and
 * clear. Shared by the notes and news editors — spacing is a general writing
 * control rather than something either feature owns.
 */

// `null` writes no attribute, so the stylesheet's own margins apply. That is
// the default on purpose: the design decides an article's rhythm, and an
// author only overrides it deliberately.
export const BLOCK_SPACINGS = [
  { label: 'Default', value: null },
  { label: 'None', value: '0' },
  { label: 'Snug', value: '0.4em' },
  { label: 'Roomy', value: '1.4em' },
  { label: 'Airy', value: '2.2em' },
]

export const BlockSpacing = Extension.create({
  name: 'blockSpacing',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          blockSpacing: {
            default: null,
            // Read back from the element's own style so spacing survives a
            // reload or a copy-paste between documents.
            parseHTML: (element) => element.style.marginBottom || null,
            renderHTML: (attributes) => {
              if (!attributes.blockSpacing) return {}
              return { style: `margin-bottom: ${attributes.blockSpacing}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setBlockSpacing:
        (blockSpacing) =>
        ({ commands }) =>
          this.options.types.every((type) =>
            commands.updateAttributes(type, { blockSpacing })
          ),

      unsetBlockSpacing:
        () =>
        ({ commands }) =>
          this.options.types.every((type) => commands.resetAttributes(type, 'blockSpacing')),
    }
  },
})

export default BlockSpacing
