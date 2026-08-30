/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCampaigns } from '@/app/dashboard/hooks/useCampaigns'
import { useCharacters } from '@/app/dashboard/hooks/useCharacters'
import { selectHeroCampaign, selectWorkingOnCampaign } from '@/app/dashboard/utils/homeRanking'
import Spinner from '@/app/shared/components/Spinner'
import CharacterHand from './CharacterHand'
import HomeGreeting from './HomeGreeting'
import HomeHeroCard from './HomeHeroCard'
import HomeOnboardingHero from './HomeOnboardingHero'
import InviteDeck from './InviteDeck'
import WorkingOnCard from './WorkingOnCard'
import { FeaturedFromMarket, NewsNoticeboard, PulseDivider } from './HomePlaceholders'
import { PLATE_HEIGHT_PX } from './plateGeometry'

// Gold reads darker on the light page ground than it does on the plates.
const SECTION_LABEL_GOLD = '#9A7526'

function SectionHead({ children, className = 'mb-2.5' }) {
  return (
    <div className={`flex items-baseline justify-between px-0.5 ${className}`}>
      <h3
        className="text-[11.5px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: SECTION_LABEL_GOLD }}
      >
        {children}
      </h3>
    </div>
  )
}

/**
 * Home — what's next, what's changed, what needs me.
 *
 * Left column knows, right column does. Everything here reads from the same
 * cached queries the tabs use, so landing on Home warms them rather than
 * duplicating work.
 */
export default function HomeManager({ user }) {
  const { data: campaignData, isLoading } = useCampaigns(user?.id)
  const { data: characters } = useCharacters()

  const campaigns = campaignData?.campaigns || []
  const invitedCampaigns = campaignData?.invitedCampaigns || []

  const heroCampaign = selectHeroCampaign(campaigns)
  const workingOnCampaign = selectWorkingOnCampaign(campaigns, user?.id)

  let playerCharacter = null
  if (heroCampaign) {
    for (const character of characters || []) {
      if (character.active_campaign === heroCampaign.id) {
        playerCharacter = character
        break
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1410px] pb-16">
      <HomeGreeting user={user} />

      <section className="mt-[26px]">
        {isLoading ? (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: PLATE_HEIGHT_PX }}
          >
            <Spinner size="lg" />
          </div>
        ) : (
          <InviteDeck invites={invitedCampaigns}>
            {heroCampaign ? (
              <HomeHeroCard
                campaign={heroCampaign}
                user={user}
                playerCharacter={playerCharacter}
              />
            ) : (
              <HomeOnboardingHero hasCampaigns={campaigns.length > 0} />
            )}
          </InviteDeck>
        )}
      </section>

      {/* Clears the invite's tucked slot, which stays reserved whether or not
          an invite exists — toggling one never shifts the page. */}
      <div className="mt-[54px]">
        <PulseDivider />
      </div>

      <div className="mt-[26px] grid grid-cols-1 gap-[26px] lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-[26px]">
          <div className="flex flex-1 flex-col">
            <SectionHead>Updates</SectionHead>
            <NewsNoticeboard />
          </div>
        </div>

        <div className="flex flex-col gap-[26px]">
          <div className="flex flex-col">
            <SectionHead>Continue building</SectionHead>
            <WorkingOnCard campaign={workingOnCampaign} />
          </div>

          {/* Pinned to the column foot, so the slack opens above it. */}
          <div className="mt-auto flex flex-col">
            <SectionHead>Featured from the Market</SectionHead>
            <FeaturedFromMarket />
          </div>
        </div>
      </div>

      {/* The extra head gap absorbs the hand's card shadows, which reach
          above the card tops and would otherwise eat the optical spacing. */}
      <div className="mt-[52px]">
        <SectionHead className="mb-[22px]">Your characters</SectionHead>
        <CharacterHand characters={characters || []} />
      </div>
    </div>
  )
}
