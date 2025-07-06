/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function MagicLinkVerify() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('verifying') // 'verifying', 'success', 'error'
  const [message, setMessage] = useState('Verifying your magic link...')

  useEffect(() => {
    const token = searchParams.get('token')
    
    if (!token) {
      setStatus('error')
      setMessage('Invalid magic link - no token provided')
      return
    }

    verifyMagicLink(token)
  }, [searchParams])

  const verifyMagicLink = async (token) => {
    try {
      const response = await fetch(`/auth/verify/${token}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Magic link verification failed')
      }

      const data = await response.json()

      if (data.success && data.access_token && data.user) {
        // Store authentication data
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('user_data', JSON.stringify(data.user))
        
        setStatus('success')
        setMessage('Successfully authenticated! Redirecting to your dashboard...')
        
        // Redirect to dashboard after short delay
        setTimeout(() => {
          router.push('/dashboard')
        }, 2000)
      } else {
        throw new Error(data.message || 'Authentication failed')
      }
    } catch (error) {
      console.error('Magic link verification error:', error)
      setStatus('error')
      setMessage('Invalid or expired magic link. Please request a new one.')
    }
  }

  const handleBackToLogin = () => {
    router.push('/magic')
  }

  return (
    <div style={{backgroundColor: '#1e293b', minHeight: '100vh'}}>
      <div className="auth-container" style={{
        position: 'relative',
        backgroundImage: 'url(/bg.jpeg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: 0.9,
        minHeight: '100vh'
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
        
        <nav className="nav-bar" style={{zIndex: 2}}>
          <div className="logo" style={{fontSize: '2.1rem'}}>TABLETOP<span>TAVERN</span></div>
          <button 
            onClick={() => router.push('/')}
            className="text-white hover:text-amber-300 transition-colors duration-200"
            style={{fontSize: '1rem', background: 'none', border: 'none', cursor: 'pointer'}}
          >
            ← Back to Home
          </button>
        </nav>
        
        <div className="auth-content" style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 80px)',
          padding: '2rem'
        }}>
          <div className="auth-card" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            borderRadius: '1rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '3rem',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
            textAlign: 'center'
          }}>
            {status === 'verifying' && (
              <>
                <div style={{
                  width: '60px',
                  height: '60px',
                  border: '4px solid rgba(255, 255, 255, 0.1)',
                  borderTop: '4px solid #d97706',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 2rem'
                }}>
                </div>
                <h1 style={{
                  color: 'white',
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                  textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                }}>
                  Verifying Magic Link
                </h1>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '1rem',
                  lineHeight: '1.5'
                }}>
                  {message}
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <div style={{
                  width: '60px',
                  height: '60px',
                  backgroundColor: '#10b981',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 2rem',
                  fontSize: '2rem'
                }}>
                  ✓
                </div>
                <h1 style={{
                  color: 'white',
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                  textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                }}>
                  Welcome to Tabletop Tavern!
                </h1>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '1rem',
                  lineHeight: '1.5'
                }}>
                  {message}
                </p>
              </>
            )}

            {status === 'error' && (
              <>
                <div style={{
                  width: '60px',
                  height: '60px',
                  backgroundColor: '#ef4444',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 2rem',
                  fontSize: '2rem',
                  color: 'white'
                }}>
                  ✕
                </div>
                <h1 style={{
                  color: 'white',
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                  textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                }}>
                  Authentication Failed
                </h1>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '1rem',
                  lineHeight: '1.5',
                  marginBottom: '2rem'
                }}>
                  {message}
                </p>
                <button
                  onClick={handleBackToLogin}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: 'linear-gradient(to right, #d97706, #ea580c)',
                    color: 'white',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'linear-gradient(to right, #c2410c, #dc2626)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(to right, #d97706, #ea580c)'
                  }}
                >
                  🪄 Try Again
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}