/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function MagicLinkVerifyContent() {
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
  }, [searchParams, verifyMagicLink])

  const verifyMagicLink = useCallback(async (token) => {
    try {
      const response = await fetch(`/auth/verify/${token}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies
      })

      if (!response.ok) {
        throw new Error('Magic link verification failed')
      }

      const data = await response.json()

      if (data.success && data.user) {
        // No need to store in localStorage - httpOnly cookie is set by backend
        setStatus('success')
        setMessage('Successfully authenticated! Redirecting to your dashboard...')
        
        // Redirect to dashboard after short delay
        setTimeout(() => {
          router.push('/dashboard')
        }, 2000)
      } else {
        console.log(data.message || 'Authentication failed')
      }
    } catch (error) {
      console.error('Magic link verification error:', error)
      setStatus('error')
      setMessage('Invalid or expired magic link. Please request a new one.')
    }
  }, [router])

  const handleBackToLogin = () => {
    router.push('/auth/magic')
  }

  return (
    <div className="bg-slate-800 min-h-screen">
      <div className="relative bg-cover bg-center bg-no-repeat opacity-90 min-h-screen" 
           style={{backgroundImage: 'url(/bg.jpeg)'}}>
        <div className="absolute inset-0 backdrop-blur-lg z-[1]"></div>
        

        
        <div className="relative z-[2] flex items-center justify-center p-8" 
             style={{minHeight: 'calc(100vh - 80px)'}}>
          <div className="bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 p-12 w-full max-w-lg shadow-2xl text-center"
               style={{boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'}}>
            
            {status === 'verifying' && (
              <>
                <div className="w-15 h-15 border-4 border-white/10 border-t-amber-600 rounded-full mx-auto mb-8">
                </div>
                <h1 className="text-white text-3xl font-bold mb-4 text-shadow-lg">
                  Verifying Magic Link
                </h1>
                <p className="text-white/70 text-base leading-relaxed">
                  {message}
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="w-15 h-15 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 text-2xl text-white">
                  ✓
                </div>
                <h1 className="text-white text-3xl font-bold mb-4 text-shadow-lg">
                  Welcome to Tabletop Tavern!
                </h1>
                <p className="text-white/70 text-base leading-relaxed">
                  {message}
                </p>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="w-15 h-15 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-8 text-2xl text-white">
                  ✕
                </div>
                <h1 className="text-white text-3xl font-bold mb-4 text-shadow-lg">
                  Authentication Failed
                </h1>
                <p className="text-white/70 text-base leading-relaxed mb-8">
                  {message}
                </p>
                <button
                  onClick={handleBackToLogin}
                  className="w-full p-3.5 rounded-lg border-none bg-gradient-to-r from-amber-600 to-orange-600 hover:from-orange-700 hover:to-red-600 text-white text-lg font-bold cursor-pointer transition-all duration-200"
                >
                  🪄 Try Again
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MagicLinkVerify() {
  return (
    <Suspense fallback={<div className="bg-slate-800 min-h-screen flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>}>
      <MagicLinkVerifyContent />
    </Suspense>
  )
}