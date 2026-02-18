/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, Suspense } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { useRouter, useSearchParams } from 'next/navigation'
import CharacterForm from '../components/CharacterForm'
import SiteHeader from '../../shared/components/SiteHeader'
import SubNav from '../../shared/components/SubNav'
import { THEME, COLORS } from '@/app/styles/colorTheme'

function CreateCharacterContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnCampaignId = searchParams.get('return_campaign')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [validationErrors, setValidationErrors] = useState([])
  const [previewData, setPreviewData] = useState({
    name: '',
    character_race: '',
    level: 0
  })

  const handleSubmit = async (formData) => {
    setLoading(true)
    setError(null)
    setValidationErrors([])

    try {
      const response = await authFetch('/api/characters/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        if (returnCampaignId) {
          // Set sessionStorage flag for modal open (ephemeral intent, not URL param)
          try {
            sessionStorage.setItem('openCharacterModalForCampaign', returnCampaignId)
          } catch (e) {
            // sessionStorage blocked - modal won't auto-open but user will still be redirected
          }
          // Return to campaign (modal will open via sessionStorage check)
          router.push(`/dashboard?tab=campaigns&expand_campaign_id=${returnCampaignId}`)
        } else {
          router.push('/dashboard?tab=characters')
        }
      } else {
        const errorData = await response.json()

        if (errorData.errors && Array.isArray(errorData.errors)) {
          setValidationErrors(errorData.errors)
        } else {
          setError(errorData.detail || 'Failed to create character')
        }
      }
    } catch (err) {
      console.error('Error creating character:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    router.push('/dashboard?tab=characters')
  }

  const handleFormChange = (formData) => {
    setPreviewData({
      name: formData.name,
      character_race: formData.character_race,
      level: formData.level
    })
  }

  // Breadcrumb navigation for create page
  const breadcrumbs = [
    { label: 'Characters', href: '/dashboard?tab=characters' },
    { label: 'Create New' }
  ]

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: COLORS.smoke }}
    >
      {/* Shared Site Header */}
      <SiteHeader />

      {/* Breadcrumb Navigation */}
      <SubNav mode="breadcrumbs" breadcrumbs={breadcrumbs} />

      {/* Main Content Area - Scrollable */}
      <main className="flex-1 overflow-y-auto py-8 sm:py-12 px-4 sm:px-8 md:px-10">
        {/* Header - Left aligned */}
        <div className="mb-6">
          <h1
            className="text-3xl font-bold font-[family-name:var(--font-metamorphous)]"
            style={{ color: COLORS.onyx }}
          >
            Create New Character
          </h1>
          <p className="mt-2" style={{ color: THEME.textPrimary }}>
            Fill in the details to create your new D&D character
          </p>
        </div>

        {/* Two-column layout: Avatar + Form (33/66 split) */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Avatar & Preview - Left column (1/3) */}
          <div className="lg:w-1/3 lg:max-w-sm">
            {/* Avatar Placeholder */}
            <div
              className="w-full rounded-sm border-2 border-dashed overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
              style={{
                aspectRatio: '9/16',
                borderColor: THEME.borderDefault,
                backgroundColor: COLORS.carbon
              }}
            >
              <div className="relative w-full h-full">
                <img
                  src="/heroes.png"
                  alt="Character avatar placeholder"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <svg
                    className="w-12 h-12 mb-2"
                    style={{ color: THEME.textSecondary }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm font-medium" style={{ color: THEME.textSecondary }}>
                    Upload Avatar
                  </span>
                  <span className="text-xs mt-1" style={{ color: THEME.textSecondary, opacity: 0.7 }}>
                    (Coming Soon)
                  </span>
                </div>
              </div>
            </div>

            {/* Character Preview */}
            <div
              className="p-4 rounded-sm border border-t-0 rounded-t-none"
              style={{
                backgroundColor: COLORS.carbon,
                borderColor: THEME.borderSubtle
              }}
            >
              <h3
                className="text-lg font-bold font-[family-name:var(--font-metamorphous)] truncate"
                style={{ color: THEME.textSecondary }}
              >
                {previewData.name || 'Character Name'}
              </h3>
              <p className="mt-2 text-sm" style={{ color: THEME.textSecondary }}>
                {previewData.level > 0 ? `Level ${previewData.level}` : 'Level'} {previewData.character_race || 'Race'}
              </p>
            </div>
          </div>

          {/* Form Card - Right column (2/3) */}
          <div className="lg:w-2/3">
            <div
              className="rounded-sm shadow-xl p-8 border"
              style={{
                backgroundColor: COLORS.carbon,
                borderColor: THEME.borderSubtle
              }}
            >
              <CharacterForm
                mode="create"
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                onFormChange={handleFormChange}
                loading={loading}
                error={error}
                validationErrors={validationErrors}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function CreateCharacter() {
  return (
    <Suspense fallback={null}>
      <CreateCharacterContent />
    </Suspense>
  )
}