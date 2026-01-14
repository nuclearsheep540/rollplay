  /*
   * Copyright (C) 2025 Matthew Davey
   * SPDX-License-Identifier: GPL-3.0-or-later
   */

'use client'

import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faDungeon, faPeopleGroup, faDiceD20 } from '@fortawesome/free-solid-svg-icons';
import { COLORS, THEME } from './styles/colorTheme';

export default function Home() {
  const router = useRouter()



  return (
      <div style={{backgroundColor: COLORS.onyx, minHeight: '100vh'}}>
        <div className="hero-container" style={{
          position: 'relative',
          zIndex: 1
        }}>
          {/* Background image */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'url(/bg2.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            zIndex: 0
          }}>
            {/* Blur overlay */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backdropFilter: 'blur(4px)'
            }}></div>
          </div>

          {/* Dark gradient overlay (knockout) to soften the hero image */}
          <div className="hero-image" style={{ zIndex: 0 }}></div>

          {/* Gradient fade to onyx at bottom of hero */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '350px',
              background: `linear-gradient(to bottom, transparent 0%, ${COLORS.onyx} 100%)`,
              pointerEvents: 'none',
              zIndex: 1
            }}
          />

          {/* Paper texture fade overlay at bottom of hero */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '350px',
              backgroundImage: 'url(/paper-tile.png)',
              backgroundRepeat: 'repeat',
              opacity: 0.9,
              mixBlendMode: 'multiply',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 60%)',
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 60%)',
              pointerEvents: 'none',
              zIndex: 2
            }}
          />

          <nav className="nav-bar" style={{zIndex: 2}}>
            <div className="logo" style={{fontSize: '2.1rem'}}>TABLETOP<span>TAVERN</span></div>
          </nav>

          <div className="hero-content" style={{transform: 'translateY(-10vh)', zIndex: 2}}>
            <h1 className="font-[family-name:var(--font-metamorphous)]" style={{textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}>Your Virtual D&D Table Awaits</h1>
            <p style={{textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}>Create or join virtual D&D game rooms in seconds. Connect with friends, manage campaigns, and embark on epic adventures together — no downloads required.</p>

            <div className="cta-buttons" style={{marginTop: '2rem', display: 'flex', justifyContent: 'center'}}>
                  <button
                    className="px-12 py-4 text-xl font-bold rounded-sm shadow-lg transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: COLORS.smoke,
                      color: COLORS.carbon,
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      zIndex: 10
                    }}
                    onClick={() => router.push('/auth/magic')}
                  >
                    Get Started
                  </button>
            </div>

          </div>
        </div>
        
        <section className="how-it-works py-16 flex flex-col justify-center relative" style={{ backgroundColor: COLORS.onyx, position: 'relative', zIndex: 0 }}>
          {/* Paper texture overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'url(/paper-tile.png)',
              backgroundRepeat: 'repeat',
              opacity: 0.9,
              mixBlendMode: 'multiply'
            }}
          />
          <h2 className="text-4xl font-bold text-center mb-12 font-[family-name:var(--font-metamorphous)] relative z-10" style={{ color: THEME.textOnDark }}>How It Works</h2>

          <div className="flex flex-col gap-6 max-w-sm mx-auto px-4 sm:px-8 w-full relative z-10">
            <div className="p-6 sm:p-8 rounded-sm text-center aspect-square flex flex-col items-center justify-center" style={{
              backgroundColor: COLORS.carbon,
              border: `1px solid ${THEME.borderDefault}`
            }}>
              <div className="mb-4">
                <FontAwesomeIcon icon={faEnvelope} className="w-10 h-10 sm:w-12 sm:h-12" style={{ color: THEME.textSecondary }} />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3 font-[family-name:var(--font-metamorphous)]" style={{ color: THEME.textOnDark }}>Sign Up</h3>
              <p className="text-base sm:text-lg leading-relaxed" style={{ color: THEME.textSecondary }}>All you need is an email to get started</p>
            </div>

            <div className="p-6 sm:p-8 rounded-sm text-center aspect-square flex flex-col items-center justify-center" style={{
              backgroundColor: COLORS.carbon,
              border: `1px solid ${THEME.borderDefault}`
            }}>
              <div className="mb-4">
                <FontAwesomeIcon icon={faDungeon} className="w-10 h-10 sm:w-12 sm:h-12" style={{ color: THEME.textSecondary }} />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3 font-[family-name:var(--font-metamorphous)]" style={{ color: THEME.textOnDark }}>Create a Campaign</h3>
              <p className="text-base sm:text-lg leading-relaxed" style={{ color: THEME.textSecondary }}>Using our intuitive tools prepare your campaign by interactive preparing maps, rich media, and encounters</p>
            </div>

            <div className="p-6 sm:p-8 rounded-sm text-center aspect-square flex flex-col items-center justify-center" style={{
              backgroundColor: COLORS.carbon,
              border: `1px solid ${THEME.borderDefault}`
            }}>
              <div className="mb-4">
                <FontAwesomeIcon icon={faPeopleGroup} className="w-10 h-10 sm:w-12 sm:h-12" style={{ color: THEME.textSecondary }} />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3 font-[family-name:var(--font-metamorphous)]" style={{ color: THEME.textOnDark }}>Gather Your Party</h3>
              <p className="text-base sm:text-lg leading-relaxed" style={{ color: THEME.textSecondary }}>Invite your friends to join your campaign</p>
            </div>

            <div className="p-6 sm:p-8 rounded-sm text-center aspect-square flex flex-col items-center justify-center" style={{
              backgroundColor: COLORS.carbon,
              border: `1px solid ${THEME.borderDefault}`
            }}>
              <div className="mb-4">
                <FontAwesomeIcon icon={faDiceD20} className="w-10 h-10 sm:w-12 sm:h-12" style={{ color: THEME.textSecondary }} />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3 font-[family-name:var(--font-metamorphous)]" style={{ color: THEME.textOnDark }}>Play!</h3>
              <p className="text-base sm:text-lg leading-relaxed" style={{ color: THEME.textSecondary }}>Together you can experience your D&D adventure tracking in real time, with roll prompts and live map updates and audio sharing across your party</p>
            </div>
          </div>
        </section>
        
        <footer className="relative" style={{ backgroundColor: COLORS.onyx, borderTop: `1px solid ${THEME.borderSubtle}` }}>
          {/* Paper texture overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'url(/paper-tile.png)',
              backgroundRepeat: 'repeat',
              opacity: 0.9,
              mixBlendMode: 'multiply'
            }}
          />
          <div className="footer-links relative z-10" style={{textAlign: 'center', padding: '2rem 0'}}>
            <a href="#" style={{color: THEME.textSecondary, margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Terms of Service</a>
            <a href="#" style={{color: THEME.textSecondary, margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Privacy Policy</a>
            <a href="/patch_notes" style={{color: THEME.textSecondary, margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Patch Notes</a>
            <a href="https://github.com/users/nuclearsheep540/projects/2" style={{color: THEME.textSecondary, margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Roadmap Kanban</a>
            <a href="#" style={{color: THEME.textSecondary, margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Help Center</a>
          </div>
          <div className="px-6 py-6 auto space-y-6 overflow-hidden sm:px-6 lg:px-6 relative z-10">
              <div className="copyright" style={{textAlign: 'center', color: COLORS.graphite, fontSize: '0.9rem'}}>
                © 2025 Tabletop Tavern. <br />All rights reserved. made with &#x2764; for me and my friends.
              </div>
          </div>
        </footer>
      </div>
  )
}