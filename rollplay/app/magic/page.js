/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from "next/navigation"

export default function Magic() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  
  // Form state
  const [email, setEmail] = useState("")
  const [otpToken, setOtpToken] = useState("")
  
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
        const token = localStorage.getItem('access_token')
        if (!token) {
          setIsCheckingAuth(false)
          return
        }

        // Validate token with FastAPI auth service
        const response = await fetch('/auth/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: token
          }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.valid) {
            // User is authenticated, redirect to dashboard
            router.push('/dashboard')
            return
          }
        }

        // Token is invalid, remove it
        localStorage.removeItem('access_token')
        localStorage.removeItem('user_data')
        
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

  const validateOtpForm = () => {
    clearErrors()
    let isValid = true

    // OTP validation - handle both short codes and full JWT tokens
    const cleanToken = otpToken.trim().replace(/\s+/g, '')
    if (!cleanToken) {
      setOtpError("Please enter a code or token")
      isValid = false
    } else if (cleanToken.length === 6 && /^[A-Z0-9]+$/.test(cleanToken)) {
      // Valid short code format
    } else if (cleanToken.length > 50) {
      // Likely a JWT token
    } else {
      setOtpError("Please enter a 6-character code (e.g., ABC123) or full token")
      isValid = false
    }

    return isValid
  }

  const handleOtpVerification = async (e) => {
    e.preventDefault()
    
    if (!validateOtpForm()) return

    setIsLoading(true)
    clearErrors()

    try {
      const response = await fetch('/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: otpToken.trim().replace(/\s+/g, '')
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'OTP verification failed')
      }

      const data = await response.json()
      
      // Store authentication data
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('user_data', JSON.stringify(data.user))
      
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
      <div style={{backgroundColor: '#1e293b', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{color: 'white', fontSize: '1.2rem'}}>Checking authentication...</div>
      </div>
    )
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
          backdropFilter: 'blur(8px)',
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
            maxWidth: '400px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
          }}>
            <h1 style={{
              color: 'white',
              fontSize: '2.5rem',
              fontWeight: 'bold',
              textAlign: 'center',
              marginBottom: '0.5rem',
              textShadow: '0 2px 4px rgba(0,0,0,0.8)'
            }}>
              Welcome to Tabletop Tavern
            </h1>
            
            <p style={{
              color: 'rgba(255, 255, 255, 0.7)',
              textAlign: 'center',
              marginBottom: '2rem',
              fontSize: '1rem',
              lineHeight: '1.5'
            }}>
              Enter your email to receive a magic link, or if you already have a code from an email, enter it below.
            </p>

            {successMessage && (
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
                fontSize: '0.9rem',
                lineHeight: '1.4',
                textAlign: 'center',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                {successMessage}
              </div>
            )}

            {generalError && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                fontSize: '0.9rem',
                textAlign: 'center'
              }}>
                {generalError}
              </div>
            )}

            {!emailSent ? (
              <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                {/* Email Form */}
                <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                  <div>
                    <label style={{color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block'}}>
                      📧 Get a Magic Link
                    </label>
                    <input
                      type="email"
                      placeholder="Your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.875rem',
                        borderRadius: '0.5rem',
                        border: emailError ? '2px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.2)',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        fontSize: '1rem',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => {
                        if (!emailError) e.target.style.borderColor = 'rgba(217, 119, 6, 0.5)'
                      }}
                      onBlur={(e) => {
                        if (!emailError) e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                      }}
                    />
                    {emailError && (
                      <p style={{color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem'}}>{emailError}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '0.875rem',
                      borderRadius: '0.5rem',
                      border: 'none',
                      background: isLoading 
                        ? '#6b7280' 
                        : 'linear-gradient(to right, #d97706, #ea580c)',
                      color: 'white',
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      marginTop: '0.5rem'
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading) {
                        e.target.style.background = 'linear-gradient(to right, #c2410c, #dc2626)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLoading) {
                        e.target.style.background = 'linear-gradient(to right, #d97706, #ea580c)'
                      }
                    }}
                  >
                    {isLoading ? 'Sending Magic Link...' : '🪄 Send Magic Link'}
                  </button>
                </form>

                {/* Divider */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '0.5rem 0'
                }}>
                  <div style={{flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.2)'}}></div>
                  <span style={{padding: '0 1rem', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.875rem'}}>OR</span>
                  <div style={{flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.2)'}}></div>
                </div>

                {/* OTP Form */}
                <form onSubmit={handleOtpVerification} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                  <div>
                    <label style={{color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block'}}>
                      🔑 Already Have a Code?
                    </label>
                    <input
                      type="text"
                      placeholder="Enter 6-digit code (e.g., ABC 123)"
                      value={otpToken}
                      onChange={(e) => {
                        let value = e.target.value.toUpperCase()
                        // Auto-format short codes with space after 3 characters
                        if (value.length === 3 && !value.includes(' ') && /^[A-Z0-9]+$/.test(value)) {
                          value = value + ' '
                        }
                        // Remove extra spaces for short codes
                        if (value.length <= 7 && /^[A-Z0-9\s]+$/.test(value)) {
                          value = value.replace(/\s+/g, ' ')
                        }
                        setOtpToken(value)
                      }}
                      style={{
                        width: '100%',
                        padding: '0.875rem',
                        borderRadius: '0.5rem',
                        border: otpError ? '2px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.2)',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        fontSize: '1.1rem',
                        fontFamily: 'monospace',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        textAlign: 'center',
                        letterSpacing: '2px'
                      }}
                      onFocus={(e) => {
                        if (!otpError) e.target.style.borderColor = 'rgba(217, 119, 6, 0.5)'
                      }}
                      onBlur={(e) => {
                        if (!otpError) e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                      }}
                    />
                    {otpError && (
                      <p style={{color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem'}}>{otpError}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !otpToken.trim()}
                    style={{
                      width: '100%',
                      padding: '0.875rem',
                      borderRadius: '0.5rem',
                      border: 'none',
                      background: (isLoading || !otpToken.trim())
                        ? '#6b7280' 
                        : 'linear-gradient(to right, #059669, #047857)',
                      color: 'white',
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      cursor: (isLoading || !otpToken.trim()) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      marginTop: '0.5rem'
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading && otpToken.trim()) {
                        e.target.style.background = 'linear-gradient(to right, #047857, #065f46)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLoading && otpToken.trim()) {
                        e.target.style.background = 'linear-gradient(to right, #059669, #047857)'
                      }
                    }}
                  >
                    {isLoading ? 'Verifying Code...' : '🔑 Sign In with Code'}
                  </button>
                </form>
              </div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                {/* Retry Button */}
                <button
                  onClick={handleRetry}
                  disabled={!canRetry || isLoading}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: !canRetry || isLoading
                      ? '#6b7280' 
                      : 'linear-gradient(to right, #d97706, #ea580c)',
                    color: 'white',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    cursor: !canRetry || isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: !canRetry ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (canRetry && !isLoading) {
                      e.target.style.background = 'linear-gradient(to right, #c2410c, #dc2626)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (canRetry && !isLoading) {
                      e.target.style.background = 'linear-gradient(to right, #d97706, #ea580c)'
                    }
                  }}
                >
                  {isLoading 
                    ? 'Sending Magic Link...' 
                    : !canRetry 
                      ? `🔄 Retry in ${retryCountdown}s`
                      : '🔄 Send Another Magic Link'
                  }
                </button>
                
                {retryCountdown > 0 && (
                  <div style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      backgroundColor: '#d97706',
                      borderRadius: '2px',
                      width: `${((30 - retryCountdown) / 30) * 100}%`,
                      transition: 'width 1s linear'
                    }}></div>
                  </div>
                )}

                {/* Divider */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '0.5rem 0'
                }}>
                  <div style={{flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.2)'}}></div>
                  <span style={{padding: '0 1rem', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.875rem'}}>OR</span>
                  <div style={{flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.2)'}}></div>
                </div>

                {/* OTP Form for the success modal */}
                <form onSubmit={handleOtpVerification} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                  <div>
                    <label style={{color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block'}}>
                      🔑 Got Your Code?
                    </label>
                    <input
                      type="text"
                      placeholder="Enter 6-digit code (e.g., ABC 123)"
                      value={otpToken}
                      onChange={(e) => {
                        let value = e.target.value.toUpperCase()
                        // Auto-format short codes with space after 3 characters
                        if (value.length === 3 && !value.includes(' ') && /^[A-Z0-9]+$/.test(value)) {
                          value = value + ' '
                        }
                        // Remove extra spaces for short codes
                        if (value.length <= 7 && /^[A-Z0-9\s]+$/.test(value)) {
                          value = value.replace(/\s+/g, ' ')
                        }
                        setOtpToken(value)
                      }}
                      style={{
                        width: '100%',
                        padding: '0.875rem',
                        borderRadius: '0.5rem',
                        border: otpError ? '2px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.2)',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        fontSize: '1.1rem',
                        fontFamily: 'monospace',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        textAlign: 'center',
                        letterSpacing: '2px'
                      }}
                      onFocus={(e) => {
                        if (!otpError) e.target.style.borderColor = 'rgba(217, 119, 6, 0.5)'
                      }}
                      onBlur={(e) => {
                        if (!otpError) e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                      }}
                    />
                    {otpError && (
                      <p style={{color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem'}}>{otpError}</p>
                    )}
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      color: 'rgba(255, 255, 255, 0.6)',
                      textAlign: 'center'
                    }}>
                      💡 Check your email for a 6-character code to sign in instantly
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !otpToken.trim()}
                    style={{
                      width: '100%',
                      padding: '0.875rem',
                      borderRadius: '0.5rem',
                      border: 'none',
                      background: (isLoading || !otpToken.trim())
                        ? '#6b7280' 
                        : 'linear-gradient(to right, #059669, #047857)',
                      color: 'white',
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      cursor: (isLoading || !otpToken.trim()) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      marginTop: '0.5rem'
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading && otpToken.trim()) {
                        e.target.style.background = 'linear-gradient(to right, #047857, #065f46)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLoading && otpToken.trim()) {
                        e.target.style.background = 'linear-gradient(to right, #059669, #047857)'
                      }
                    }}
                  >
                    {isLoading ? 'Verifying Code...' : '🔑 Sign In with Code'}
                  </button>
                </form>
              </div>
            )}

            <div style={{
              textAlign: 'center',
              marginTop: '2rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <p style={{color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.85rem', lineHeight: '1.4'}}>
                New users will automatically get an account. Returning users will be signed in. No passwords required! The email will include both a clickable magic link and a short 6-character code for manual entry.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}