/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * The block types that can carry our own block-level attributes.
 *
 * One list, shared by the extensions that write these attributes and the
 * toolbars that read them back. Kept together because the two must agree: a
 * type the extension writes to but the toolbar never inspects shows Default
 * while the block is plainly styled.
 */
export const BLOCK_ATTRIBUTE_TYPES = ['paragraph', 'heading']

/**
 * Read a block attribute from whichever block the cursor is actually in.
 *
 * Asking `paragraph` alone is wrong: these attributes apply to every type in
 * the list, so a cursor inside a styled heading would report nothing. Types
 * are checked in declaration order and the first one holding a value wins.
 */
export function activeBlockAttribute(editor, name) {
  for (const type of BLOCK_ATTRIBUTE_TYPES) {
    const value = editor.getAttributes(type)[name]
    if (value) return value
  }
  return null
}

/**
 * Apply a command to every configured block type and report whether any took.
 *
 * The aggregation matters more than it looks. `every()` short-circuits on the
 * first type that returns false — and updateAttributes returns false when the
 * selection contains no node of that type — so with the cursor in a heading,
 * paragraph fails and the heading update never runs at all.
 *
 * Running them ALL first and then aggregating is what @tiptap/extension-text-align
 * does (`.map(...).some(...)`), for exactly this reason.
 */
export function applyToBlockTypes(types, run) {
  const outcomes = []
  for (const type of types) {
    outcomes.push(run(type))
  }
  return outcomes.some((applied) => applied)
}
