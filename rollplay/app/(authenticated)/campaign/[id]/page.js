/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'

import CampaignBuilder from '@/app/campaign_builder/components/CampaignBuilder'

export default function CampaignBuilderPage() {
  const params = useParams()
  return (
    <Suspense fallback={null}>
      <CampaignBuilder campaignId={params.id} />
    </Suspense>
  )
}
