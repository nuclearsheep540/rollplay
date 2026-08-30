/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { Fragment } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBookOpen, faUsers, faFolderOpen, faStore } from '@fortawesome/free-solid-svg-icons'

import { TOOLS, TOOL_ROUTES } from '@/app/workshop'
import { THEME } from '@/app/styles/colorTheme'

// The high-level surfaces, each still its own `?tab=` index view — the
// launcher replaces the tab bar as the way in, not the destinations.
const SURFACES = [
  { label: 'Campaigns', icon: faBookOpen, tab: 'campaigns' },
  { label: 'Characters', icon: faUsers, tab: 'characters' },
  { label: 'Library', icon: faFolderOpen, tab: 'library' },
  { label: 'Market', icon: faStore, tab: 'market' },
]

const DASHBOARD_PATH = '/dashboard'
const WORKSHOP_HREF = '/dashboard?tab=workshop'

const DOT_POSITIONS = [5, 12, 19]
// Side length; rotated 45° the diagonal (~5.1) is what reads as the dot's
// width, leaving a hair under 2 units of gap at the 7-unit centre spacing.
const DOT_SIZE = 3.6

/**
 * The 9-dot app-select glyph. Drawn rather than imported: the 3x3 grid is the
 * convention for this control, and Font Awesome Free has no equivalent —
 * faGrip is 2x3 and reads as a drag handle. The documented exception to the
 * icons-are-Font-Awesome rule.
 *
 * The dots are diamonds, carrying the retired tab bar's pip motif into the
 * control that replaced it.
 */
function AppGridIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {DOT_POSITIONS.map((y) =>
        DOT_POSITIONS.map((x) => (
          <rect
            key={`${x}-${y}`}
            x={x - DOT_SIZE / 2}
            y={y - DOT_SIZE / 2}
            width={DOT_SIZE}
            height={DOT_SIZE}
            transform={`rotate(45 ${x} ${y})`}
          />
        ))
      )}
    </svg>
  )
}

/**
 * App-select launcher — the 9-dot menu that replaced the tab bar.
 *
 * Tool entries read from the workshop's own definitions so labels, icons and
 * enabled flags can never drift from the workshop index, which remains a
 * destination in its own right (the section header opens it).
 */
export default function AppLauncher() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Which surface the user is already looking at. Only meaningful on the
  // dashboard — every other route leaves the launcher unmarked.
  const currentTab = pathname === DASHBOARD_PATH ? searchParams.get('tab') : null

  const go = (href, close) => {
    close()
    router.push(href)
  }

  return (
    <Popover className="relative">
      <PopoverButton
        aria-label="Apps"
        title="Apps"
        className="flex h-9 items-center hover:opacity-80 transition-opacity focus:outline-none"
        style={{ color: THEME.textSecondary }}
      >
        <AppGridIcon className="h-8 w-8" />
      </PopoverButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <PopoverPanel className="absolute right-0 z-50 mt-4 w-[324px] origin-top-right rounded-xl border border-border bg-surface-secondary shadow-2xl p-3.5 focus:outline-none">
          {({ close }) => (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {SURFACES.map((surface) => {
                  const isCurrent = surface.tab === currentTab

                  return (
                  <button
                    key={surface.tab}
                    type="button"
                    onClick={() => go(`${DASHBOARD_PATH}?tab=${surface.tab}`, close)}
                    className={`flex flex-col items-center gap-2 rounded-lg px-2.5 pb-3 pt-4 transition-colors hover:bg-interactive-hover/10 hover:text-content-on-dark ${isCurrent ? 'text-content-on-dark' : 'text-content-secondary'}`}
                  >
                    <FontAwesomeIcon icon={surface.icon} className="h-6 w-6" />
                    <span className="text-[13px] uppercase tracking-wide font-[family-name:var(--font-metamorphous)]">
                      {surface.label}
                    </span>
                    {/* Always rendered so marking a surface can't resize the
                        grid — it just gains colour when you're already there. */}
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rotate-45 ${isCurrent ? 'bg-gold' : 'bg-transparent'}`}
                    />
                  </button>
                  )
                })}
              </div>

              <div className="mt-3 border-t border-border-subtle pt-3">
                <button
                  type="button"
                  onClick={() => go(WORKSHOP_HREF, close)}
                  className="w-full px-2.5 pb-2 pt-0.5 text-left text-[11px] font-semibold uppercase tracking-widest text-gold transition-opacity hover:opacity-80"
                >
                  Workshop
                </button>

                {TOOLS.map((tool) => {
                  const route = TOOL_ROUTES[tool.id]
                  const available = tool.enabled && Boolean(route)

                  return (
                    <button
                      key={tool.id}
                      type="button"
                      disabled={!available}
                      onClick={() => go(route, close)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] text-content-on-dark transition-colors hover:bg-interactive-hover/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <FontAwesomeIcon icon={tool.icon} className="w-4 text-center" />
                      <span className="flex-1">{tool.label}</span>
                      {!available && (
                        <span className="text-[10px] uppercase tracking-widest text-content-secondary">
                          Soon
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </PopoverPanel>
      </Transition>
    </Popover>
  )
}
