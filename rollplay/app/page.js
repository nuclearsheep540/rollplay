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
                    className="px-12 py-4 text-xl font-bold text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                    style={{
                      background: 'linear-gradient(to right, #d97706, #ea580c)',
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      zIndex: 10
                    }}
                    onClick={() => router.push('/magic')}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'linear-gradient(to right, #c2410c, #dc2626)'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'linear-gradient(to right, #d97706, #ea580c)'
                    }}
                  >
                    🎲 Get Started
                  </button>
            </div>

          </div>
        </div>
        
        <section className="how-it-works">
          <h2 style={{color: '#1e293b', fontSize: '2.5rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '3rem', textShadow: '0 2px 4px rgba(0,0,0,0.1)'}}>How It Works</h2>
          
          <div className="steps" style={{display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '2rem', maxWidth: '1200px', margin: '0 auto', padding: '0 2rem'}}>
            <div className="step" style={{backgroundColor: '#1e293b', padding: '2rem', borderRadius: '1rem', border: '2px solid #3b82f6', textAlign: 'center', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)', maxWidth: '300px', flex: '1', minWidth: '280px'}}>
              <div className="step-icon" style={{fontSize: '3rem', marginBottom: '1rem'}}>🏰</div>
              <h3 style={{color: '#f8fafc', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Create a Campaign</h3>
              <p style={{color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6', fontWeight: '500'}}>Set up your game room with customizable settings for your adventure style and party size.</p>
            </div>
            
            <div className="step" style={{backgroundColor: '#1e293b', padding: '2rem', borderRadius: '1rem', border: '2px solid #8b5cf6', textAlign: 'center', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.2)', maxWidth: '300px', flex: '1', minWidth: '280px'}}>
              <div className="step-icon" style={{fontSize: '3rem', marginBottom: '1rem'}}>🗡️</div>
              <h3 style={{color: '#f8fafc', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Gather Your Party</h3>
              <p style={{color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6', fontWeight: '500'}}>Share a simple campaign code with friends so they can join your virtual table instantly.</p>
            </div>
            
            <div className="step" style={{backgroundColor: '#1e293b', padding: '2rem', borderRadius: '1rem', border: '2px solid #10b981', textAlign: 'center', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)', maxWidth: '300px', flex: '1', minWidth: '280px'}}>
              <div className="step-icon" style={{fontSize: '3rem', marginBottom: '1rem'}}>🎲</div>
              <h3 style={{color: '#f8fafc', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>Begin Your Quest</h3>
              <p style={{color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6', fontWeight: '500'}}>Use our tools to manage characters, roll dice, and track your epic journey together.</p>
            </div>
          </div>
        </section>
        
        <footer style={{backgroundColor: '#0f172a', borderTop: '1px solid rgba(148, 163, 184, 0.2)'}}>
          <div className="footer-links" style={{textAlign: 'center', padding: '2rem 0'}}>
            <a href="#" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Terms of Service</a>
            <a href="#" style={{color: '#94a3b8', margin: '0 1rem', textDecoration: 'none', fontSize: '1rem', fontWeight: '500'}}>Privacy Policy</a>
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