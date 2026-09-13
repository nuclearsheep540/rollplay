/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { Suspense } from 'react'

import CampaignBuilder from '@/app/campaign_builder/components/CampaignBuilder'

export default function NewCampaignPage() {
  return (
    <Suspense fallback={null}>
      <CampaignBuilder campaignId={null} />
    </Suspense>
  )
}
