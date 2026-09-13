/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation'

import PlateButton from '@/app/dashboard/components/home/PlateButton'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * The band above the content: what this campaign is, what state it is in, and the one
 * Save button for the whole page.
 *
 * One button because a GM edits across sections in a single sitting and should not have to
 * remember which panels they touched. It saves the dirty sections in order.
 */
function SaveState({ needsTitle, autoSaveStatus }) {
  // Ordered by what the GM most needs to know. "Name it to save" comes first because it is
  // the one state they have to act on — everything else resolves itself.
  if (needsTitle) {
    return <span className="text-[12.5px] text-[#9A7526]">name it to save</span>
  }
  if (autoSaveStatus === 'saving') {
    return <span className="text-[12.5px] text-content-muted">saving…</span>
  }
  if (autoSaveStatus === 'error') {
    return <span className="text-[12.5px] text-feedback-error">couldn&apos;t save — try Save campaign</span>
  }
  if (autoSaveStatus === 'dirty') {
    return <span className="text-[12.5px] text-content-muted">unsaved changes</span>
  }
  if (autoSaveStatus === 'saved') {
    return <span className="text-[12.5px] text-content-muted">saved</span>
  }
  return null
}

export default function CampaignBand({
  title,
  isNew,
  latestVersion,
  needsTitle,
  autoSaveStatus,
  onSave,
  saving,
  saveBlockedReason,
}) {
  const router = useRouter()

  return (
    <div className="h-24 box-border px-10 flex items-center justify-between gap-6 border-b border-[#E5DECF] bg-surface-primary">
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526]">Campaign</div>
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="font-[family-name:var(--font-metamorphous)] text-[26px] leading-[1.1] text-content-bold truncate">
            {title || 'Untitled campaign'}
          </div>
          {isNew && (
            <span
              className="inline-flex px-2.5 py-[3px] rounded-sm border border-[#37322F] text-[#37322F] text-[11px] font-semibold tracking-[0.1em] uppercase"
              style={{ transform: SKEW_BOX }}
            >
              <span className="inline-block" style={{ transform: SKEW_LABEL }}>Draft</span>
            </span>
          )}
          <span
            className="inline-flex px-2 py-[2.5px] rounded bg-[#D9A441] text-[#241C08] text-[9.5px] font-bold tracking-[0.1em]"
            style={{ transform: SKEW_BOX }}
          >
            <span className="inline-block" style={{ transform: SKEW_LABEL }}>
              {latestVersion ? `v${latestVersion}` : 'unpublished'}
            </span>
          </span>
          <SaveState needsTitle={needsTitle} autoSaveStatus={autoSaveStatus} />
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <PlateButton variant="outline" size="sm" onClick={() => router.push('/dashboard?tab=campaigns')}>
          Back to campaigns
        </PlateButton>
        <PlateButton
          variant="gold"
          onClick={onSave}
          disabled={saving || !!saveBlockedReason}
          title={saveBlockedReason || undefined}
        >
          {saving ? 'Saving…' : 'Save campaign'}
        </PlateButton>
      </div>
    </div>
  )
}
