/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { useRouter } from "next/navigation"
import OTPInput from './components/OTPInput'

export default function Magic() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  
  // Form state
  const [email, setEmail] = useState("")
  
  // Error states
  const [emailError, setEmailError] = useState("")
  const [otpError, setOtpError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [generalError, setGeneralError] = useState("")
  
  // Retry functionality
  const [emailSent, setEmailSent] = useState(false)
  const [retryCountdown, setRetryCountdown] = useState(0)
  const [canRetry, setCanRetry] = useState(false)

  // Check if user is already authenticated
  useEffect(() => {
    const checkAuthentication = async () => {
      try {
        // Validate token with FastAPI auth service (reads from httpOnly cookie)
        const response = await fetch('/auth/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include' // Include cookies in the request
        })

        if (response.ok) {
          const data = await response.json()
          if (data.valid) {
            // User is authenticated, redirect to dashboard
            router.push('/dashboard')
            return
          }
        }

        // Token is invalid or not present
        // No need to clear localStorage as we're using httpOnly cookies
        
      } catch (error) {
        console.error('Auth check error:', error)
        // Continue to magic page on error
      } finally {
        setIsCheckingAuth(false)
      }
    }

    checkAuthentication()
  }, [router])

  // Countdown timer effect
  useEffect(() => {
    let interval = null
    if (retryCountdown > 0) {
      interval = setInterval(() => {
        setRetryCountdown(retryCountdown - 1)
      }, 1000)
    } else if (retryCountdown === 0 && emailSent) {
      setCanRetry(true)
    }
    return () => clearInterval(interval)
  }, [retryCountdown, emailSent])

  const startRetryCountdown = () => {
    setRetryCountdown(30)
    setCanRetry(false)
    setEmailSent(true)
  }

  const handleRetry = async () => {
    setIsLoading(true)
    clearErrors()
    
    try {
      const response = await fetch('/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies
        body: JSON.stringify({
          email: email.trim()
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Authentication failed')
      }

      // Success - magic link sent again
      setSuccessMessage(
        `We've sent another secure magic link to ${email}. Click the link in your email to access Tabletop Tavern.`
      )
      
      // Start retry countdown again
      startRetryCountdown()
      
    } catch (error) {
      console.error("Authentication error:", error)
      setGeneralError("Something went wrong. Please try again.")
      setEmailSent(false) // Allow user to go back to form
    } finally {
      setIsLoading(false)
    }
  }

  const clearErrors = () => {
    setEmailError("")
    setOtpError("")
    setGeneralError("")
    setSuccessMessage("")
  }


  const validateEmailForm = () => {
    clearErrors()
    let isValid = true

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || !emailRegex.test(email)) {
      setEmailError("Please enter a valid email address")
      isValid = false
    }

    return isValid
  }



  // Countdown Timer Component (isolated to prevent OTP re-renders)
  const CountdownTimer = memo(({ retryCountdown, isLoading, canRetry, onRetry }) => (
    <>
      <button
        onClick={onRetry}
        disabled={!canRetry || isLoading}
        className={`w-full p-3.5 rounded-lg border-none text-white text-lg font-bold transition-all duration-200 ${
          !canRetry || isLoading
            ? 'bg-gray-500 cursor-not-allowed opacity-60' 
            : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-orange-700 hover:to-red-600 cursor-pointer opacity-100'
        }`}
      >
        {isLoading 
          ? 'Sending Magic Link...' 
          : !canRetry 
            ? `Retry in ${retryCountdown}s`
            : 'Send Another Magic Link'
        }
      </button>
      
      {retryCountdown > 0 && (
        <div className="w-full h-1 bg-white/20 rounded-sm overflow-hidden">
          <div 
            className="h-full bg-amber-600 rounded-sm transition-all duration-1000 ease-linear"
            style={{width: `${((30 - retryCountdown) / 30) * 100}%`}}
          ></div>
        </div>
      )}
    </>
  ))


  const handleOtpVerification = async (token) => {
    setIsLoading(true)
    clearErrors()

    try {
      const response = await fetch('/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies
        body: JSON.stringify({
          token: token.trim().replace(/\s+/g, '')
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'OTP verification failed')
      }

      const data = await response.json()
      
      // No need to store in localStorage - httpOnly cookie is set by backend
      // Redirect to dashboard
      router.push('/dashboard')
      
    } catch (error) {
      console.error("OTP verification error:", error)
      setOtpError("Invalid or expired OTP token. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateEmailForm()) return

    setIsLoading(true)
    clearErrors()

    try {
      // TODO: Replace with actual API call to api-auth service
      const response = await fetch('/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies
        body: JSON.stringify({
          email: email.trim()
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Authentication failed')
      }

      // Success - magic link sent
      setSuccessMessage(
        `We've sent a secure magic link to ${email}. Click the link in your email to access Tabletop Tavern.`
      )
      
      // Start retry countdown
      startRetryCountdown()
      
    } catch (error) {
      console.error("Authentication error:", error)
      setGeneralError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="bg-slate-800 min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Checking authentication...</div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 min-h-screen">
      <div className="relative bg-cover bg-center bg-no-repeat opacity-90 min-h-screen" 
           style={{backgroundImage: 'url(/bg.jpeg)'}}>
        <div className="absolute inset-0 backdrop-blur-lg z-[1]"></div>
        
        <nav className="nav-bar relative z-[2]">
          <div className="logo text-4xl">TABLETOP<span>TAVERN</span></div>
          <button 
            onClick={() => router.push('/')}
            className="text-white hover:text-amber-300 transition-colors duration-200 text-base bg-none border-none cursor-pointer"
          >
            ← Back to Home
          </button>
        </nav>
        
        <div className="relative z-[2] flex items-center justify-center p-8" 
             style={{minHeight: 'calc(100vh - 80px)'}}>
          <div className="bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 p-12 w-full max-w-md shadow-2xl"
               style={{boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'}}>

            
            <p className="text-white/70 text-center mb-8 text-base leading-relaxed">
              Enter your email to receive a magic link <b>and</b> one-time-password.
            </p>

            {successMessage && (
              <div className="bg-emerald-500/10 text-emerald-400 p-4 rounded-lg mb-6 text-sm leading-relaxed text-center border border-emerald-500/30">
                {successMessage}
              </div>
            )}

            {generalError && (
              <div className="bg-red-500/10 text-red-400 p-3 rounded-lg mb-4 text-sm text-center">
                {generalError}
              </div>
            )}

            {!emailSent ? (
              <div className="flex flex-col gap-6">
                {/* Email Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div>
                    <input
                      type="email"
                      placeholder="Your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={`w-full p-3.5 rounded-lg ${
                        emailError 
                          ? 'border-2 border-red-400' 
                          : 'border border-white/20 focus:border-amber-500/50'
                      } bg-white/10 text-white text-base outline-none transition-colors duration-200 placeholder:text-white/40`}
                    />
                    {emailError && (
                      <p className="text-red-400 text-xs mt-1">{emailError}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full p-3.5 rounded-lg border-none text-white text-lg font-bold transition-all duration-200 mt-2 ${
                      isLoading 
                        ? 'bg-gray-500 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-orange-700 hover:to-red-600 cursor-pointer'
                    }`}
                  >
                    {isLoading ? 'Sending Magic Link...' : 'Send Magic Link'}
                  </button>
                </form>

                {/* Divider */}
                <div className="flex items-center my-2">
                  <div className="flex-1 h-px bg-white/20"></div>
                  <span className="px-4 text-white/50 text-sm">OR</span>
                  <div className="flex-1 h-px bg-white/20"></div>
                </div>

              <p className="text-white/70 text-center text-base leading-relaxed">
              If you already have a one-time passcode from an email, enter it below.
              </p>

                {/* OTP Form */}
                <OTPInput
                  helpText="💡 Enter the 6-character code from your email"
                  onSubmit={handleOtpVerification}
                  isLoading={isLoading}
                  error={otpError}
                  buttonText="Sign In with Code"
                  buttonLoadingText="Verifying Code..."
                />
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Retry Button with Countdown Timer */}
                <CountdownTimer 
                  retryCountdown={retryCountdown}
                  isLoading={isLoading}
                  canRetry={canRetry}
                  onRetry={handleRetry}
                />

                {/* Divider */}
                <div className="flex items-center my-2">
                  <div className="flex-1 h-px bg-white/20"></div>
                  <span className="px-4 text-white/50 text-sm">OR</span>
                  <div className="flex-1 h-px bg-white/20"></div>
                </div>

                <p className="text-white/70 text-center text-base leading-relaxed">
                If you already have a one-time passcode from an email, enter it below.
                </p>

                {/* OTP Form for the success modal */}
                <OTPInput
                  helpText="💡 Check your email for a 6-character code to sign in instantly"
                  onSubmit={handleOtpVerification}
                  isLoading={isLoading}
                  error={otpError}
                  buttonText="Sign In with Code"
                  buttonLoadingText="Verifying Code..."
                />
              </div>
            )}

            <div className="text-center mt-8 pt-6 border-t border-white/10">
              <p className="text-white/60 text-sm leading-relaxed">
                New users will automatically get an account. Returning users will be signed in. No passwords required! The email will include both a clickable magic link and a short 6-character code for manual entry.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}