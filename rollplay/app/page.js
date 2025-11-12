  /*
   * Copyright (C) 2025 Matthew Davey
   * SPDX-License-Identifier: GPL-3.0-or-later
   */

'use client'
 
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter()



  return (
      <div style={{backgroundColor: '#1e293b', minHeight: '100vh'}}>
        <div className="hero-container" style={{
          position: 'relative',
          backgroundImage: 'url(/bg.jpeg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.9
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backdropFilter: 'blur(2px)',
            zIndex: 1
          }}></div>
          <div className="hero-image"></div>
          
          <nav className="nav-bar" style={{zIndex: 2}}>
            <div className="logo" style={{fontSize: '2.1rem'}}>TABLETOP<span>TAVERN</span></div>
          </nav>
          
          <div className="hero-content" style={{transform: 'translateY(-10vh)', zIndex: 2}}>
            <h1 style={{textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}>Your Virtual D&D Table Awaits</h1>
            <p style={{textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}>Create or join virtual D&D game rooms in seconds. Connect with friends, manage campaigns, and embark on epic adventures together — no downloads required.</p>
            
            <div className="cta-buttons" style={{marginTop: '2rem', display: 'flex', justifyContent: 'center'}}>
                  <button
                    className="px-12 py-4 text-xl font-bold text-white rounded-lg shadow-lg"
                    style={{
                      background: 'linear-gradient(to right, #d97706, #ea580c, #c2410c, #dc2626)',
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      zIndex: 10,
                      transition: 'background-position 400ms ease-in-out',
                      backgroundSize: '200% 100%',
                      backgroundPosition: '0% 0%'
                    }}
                    onClick={() => router.push('/auth/magic')}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundPosition = '100% 0%'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundPosition = '0% 0%'
                    }}
                  >
                    Get Started
                  </button>
            </div>

          </div>
        </div>
        
        <section className="how-it-works bg-white py-16 min-h-[600px] flex flex-col justify-center">
          <h2 className="text-slate-800 text-4xl font-bold text-center mb-12" style={{textShadow: '0 2px 4px rgba(0,0,0,0.1)'}}>How It Works</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-6xl mx-auto px-8">
            <div className="p-8 rounded-xl text-center max-w-sm flex-1 min-w-[320px]" style={{
              border: '2px solid transparent', 
              backgroundImage: 'linear-gradient(#0f172a), linear-gradient(to right, #d97706, #ea580c)', 
              backgroundOrigin: 'border-box', 
              backgroundClip: 'padding-box, border-box',
              boxShadow: '0 4px 12px rgba(217, 119, 6, 0.5)'
            }}>
              <div className="text-5xl mb-4">📧</div>
              <h3 className="text-slate-50 text-2xl font-bold mb-4" style={{textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Sign Up</h3>
              <p className="text-slate-300 text-lg leading-relaxed font-medium">All you need is an email to get started</p>
            </div>
            
            <div className="p-12 rounded-xl text-center max-w-sm flex-1 min-w-[320px]" style={{
              border: '2px solid transparent', 
              backgroundImage: 'linear-gradient(#0f172a), linear-gradient(135deg, #ea580c, #c2410c)', 
              backgroundOrigin: 'border-box', 
              backgroundClip: 'padding-box, border-box',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.5)'
            }}>
              <div className="text-5xl mb-4">🏰</div>
              <h3 className="text-slate-50 text-2xl font-bold mb-4" style={{textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Create a Campaign</h3>
              <p className="text-slate-300 text-lg leading-relaxed font-medium">Using our intuitive tools prepare your campaign by preparing maps, sound tracks and combat encounters</p>
            </div>
            
            <div className="p-12 rounded-xl text-center max-w-sm flex-1 min-w-[320px]" style={{
              border: '2px solid transparent', 
              backgroundImage: 'linear-gradient(#0f172a), linear-gradient(to bottom, #c2410c, #dc2626)', 
              backgroundOrigin: 'border-box', 
              backgroundClip: 'padding-box, border-box',
              boxShadow: '0 4px 12px rgba(194, 65, 12, 0.5)'
            }}>
              <div className="text-5xl mb-4">🗡️</div>
              <h3 className="text-slate-50 text-2xl font-bold mb-4" style={{textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Gather Your Party</h3>
              <p className="text-slate-300 text-lg leading-relaxed font-medium">Invite your friends to Table-Top Tavern so they can create a character and join your campaign</p>
            </div>
            
            <div className="p-12 rounded-xl text-center max-w-sm flex-1 min-w-[320px]" style={{
              border: '2px solid transparent', 
              backgroundImage: 'linear-gradient(#0f172a), linear-gradient(45deg, #dc2626, #d97706)', 
              backgroundOrigin: 'border-box', 
              backgroundClip: 'padding-box, border-box',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.5)'
            }}>
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-slate-50 text-2xl font-bold mb-4" style={{textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Play!</h3>
              <p className="text-slate-300 text-lg leading-relaxed font-medium">Together you can experience your D&D adventure tracking in real time, with roll prompts and live map updates and audio sharing across your party</p>
            </div>
          </div>
        </section>
        
        <footer style={{backgroundColor: '#0f172a', borderTop: '1px solid rgba(148, 163, 184, 0.2)'}}>
          <div className="footer-links" style={{textAlign: 'center', padding: '2rem 0'}}>
            <a href="#" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Terms of Service</a>
            <a href="#" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Privacy Policy</a>
            <a href="/patch_notes" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Patch Notes</a>
            <a href="https://github.com/users/nuclearsheep540/projects/2" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Roadmap Kanban</a>

            
            <a href="#" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Help Center</a>
          </div>
          <div className="px-6 py-6 auto space-y-6 overflow-hidden sm:px-6 lg:px-6">
              <div className="copyright" style={{textAlign: 'center', color: '#64748b', fontSize: '0.9rem'}}>
                © 2025 Tabletop Tavern. <br />All rights reserved. made with &#x2764; for me and my friends.
              </div>
          </div>
        </footer>
      </div>
  )
}