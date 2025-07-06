/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { useRouter } from "next/navigation"

export default function Magic() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  
  // Form state
  const [email, setEmail] = useState("")
  
  // Error states
  const [emailError, setEmailError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [generalError, setGeneralError] = useState("")

  const clearErrors = () => {
    setEmailError("")
    setGeneralError("")
    setSuccessMessage("")
  }

  const validateForm = () => {
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) return

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
      
      // Clear form
      setEmail("")
      
    } catch (error) {
      console.error("Authentication error:", error)
      setGeneralError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
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
              Enter your email and we'll send you a secure magic link to sign in or create your account instantly
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

            <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
              <div>
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
                disabled={isLoading || !!successMessage}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: isLoading || successMessage 
                    ? '#6b7280' 
                    : 'linear-gradient(to right, #d97706, #ea580c)',
                  color: 'white',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: isLoading || successMessage ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  marginTop: '0.5rem'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && !successMessage) {
                    e.target.style.background = 'linear-gradient(to right, #c2410c, #dc2626)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && !successMessage) {
                    e.target.style.background = 'linear-gradient(to right, #d97706, #ea580c)'
                  }
                }}
              >
                {isLoading 
                  ? 'Sending Magic Link...' 
                  : successMessage 
                    ? 'Check Your Email!'
                    : '🪄 Continue with Email'
                }
              </button>
            </form>

            <div style={{
              textAlign: 'center',
              marginTop: '2rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <p style={{color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.85rem', lineHeight: '1.4'}}>
                New users will automatically get an account. Returning users will be signed in. No passwords required!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}