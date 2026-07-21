/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import Modal from '@/app/shared/components/Modal'
import FormField from '@/app/shared/components/FormField'
import { Button } from '@/app/dashboard/components/shared/Button'
import { useUpdateAssetTags } from '../hooks/useUpdateAssetTags'

// Mirrors the backend aggregate rules (asset_aggregate.py) so most
// input problems surface before the request; the server remains the
// authority.
const MAX_TAG_LENGTH = 32
const MAX_TAGS_PER_ASSET = 20

function normalizeTag(raw) {
  return raw.trim().toLowerCase().split(/\s+/).join(' ')
}

/**
 * Tag editor. Two modes, decided by how many assets are passed:
 *
 * - one asset: edit its tags in place (atomic full-replace on save)
 * - several assets (multi-select): collect tags to ADD - each asset
 *   keeps its existing tags and gains the new ones (client-side merge,
 *   since the endpoint is full-replace per asset)
 */
export default function EditTagsModal({ assets, allTags = [], onClose }) {
  const bulk = assets.length > 1
  const [tags, setTags] = useState(() => (bulk ? [] : (assets[0].tags || [])))
  const [draft, setDraft] = useState('')
  const [localError, setLocalError] = useState(null)
  const inputRef = useRef(null)
  const updateMutation = useUpdateAssetTags()

  const suggestions = useMemo(() => {
    const normalized = draft.trim().toLowerCase()
    return allTags
      .filter(({ tag }) => !tags.includes(tag))
      .filter(({ tag }) => !normalized || tag.includes(normalized))
      .slice(0, 8)
  }, [allTags, tags, draft])

  const addTag = (raw) => {
    const tag = normalizeTag(raw)
    if (!tag) return
    if (tag.length > MAX_TAG_LENGTH) {
      setLocalError(`Tags can be at most ${MAX_TAG_LENGTH} characters`)
      return
    }
    if (!bulk && tags.length >= MAX_TAGS_PER_ASSET) {
      setLocalError(`Assets can have at most ${MAX_TAGS_PER_ASSET} tags`)
      return
    }
    setLocalError(null)
    if (!tags.includes(tag)) {
      setTags([...tags, tag])
    }
    setDraft('')
  }

  const removeTag = (tag) => {
    setTags(tags.filter((existing) => existing !== tag))
    setLocalError(null)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTag(draft)
    }
    if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  const handleSave = async () => {
    // Commit any half-typed tag the user forgot to Enter
    const pending = normalizeTag(draft)
    const finalTags = pending && !tags.includes(pending) ? [...tags, pending] : tags

    try {
      if (bulk) {
        if (finalTags.length === 0) return
        const results = await Promise.allSettled(
          assets.map((asset) => {
            const merged = [...new Set([...(asset.tags || []), ...finalTags])]
            return updateMutation.mutateAsync({ assetId: asset.id, tags: merged })
          })
        )
        const failed = results.filter((result) => result.status === 'rejected').length
        if (failed > 0) {
          setLocalError(`Failed to update ${failed} of ${assets.length} assets`)
          return
        }
      } else {
        await updateMutation.mutateAsync({ assetId: assets[0].id, tags: finalTags })
      }
      onClose()
    } catch {
      // Error surfaces via updateMutation.error
    }
  }

  const error = localError || updateMutation.error?.message
  const saveDisabled = updateMutation.isPending || (bulk && tags.length === 0 && !draft.trim())

  return (
    <Modal open={true} onClose={onClose} size="sm" initialFocus={inputRef}>
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-1">
          {bulk ? `Add Tags to ${assets.length} Assets` : 'Edit Tags'}
        </h2>
        <p className="mb-4 truncate text-sm text-content-secondary" title={bulk ? undefined : assets[0].filename}>
          {bulk
            ? "Added on top of each asset's existing tags"
            : assets[0].filename}
        </p>

        <FormField
          label={bulk ? 'Tags to add' : `Tags (${tags.length}/${MAX_TAGS_PER_ASSET})`}
          id="edit-tags-input"
          error={error}
        >
          <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border bg-surface-elevated px-3 py-2 focus-within:border-border-active">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover py-0.5 pl-2.5 pr-1 text-xs text-content-on-dark"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="rounded-full p-0.5 leading-none text-content-secondary hover:text-content-on-dark"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              id="edit-tags-input"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={tags.length === 0 ? 'e.g. forest, night, boss' : ''}
              className="min-w-[120px] flex-1 bg-transparent py-0.5 text-sm text-content-on-dark outline-none placeholder:text-content-secondary"
            />
          </div>
        </FormField>

        {suggestions.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-content-on-dark">
              Your tags
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  className="rounded-full bg-surface-hover px-2.5 py-1 text-xs text-content-secondary transition-colors hover:text-content-on-dark"
                >
                  {tag} <span className="tabular-nums opacity-60">{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saveDisabled}>
            {updateMutation.isPending ? 'Saving...' : bulk ? 'Add Tags' : 'Save Tags'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
