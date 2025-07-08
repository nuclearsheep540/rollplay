/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useRef, useCallback } from 'react'

export default function OTPInput({ 
  label, 
  helpText, 
  onSubmit, 
  isLoading, 
  error,
  buttonText = 'Sign In with Code',
  buttonLoadingText = 'Verifying Code...'
}) {
  // OTP state management
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [otpToken, setOtpToken] = useState('')
  const otpInputRefs = useRef([])

  // OTP Digit Input Handlers
  const handleOtpDigitChange = useCallback((index, value) => {
    // Only allow single alphanumeric characters
    const sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (sanitized.length > 1) return

    const newDigits = [...otpDigits]
    newDigits[index] = sanitized

    setOtpDigits(newDigits)
    
    // Update the combined token for validation
    setOtpToken(newDigits.join(''))

    // Auto-advance to next input
    if (sanitized && index < 5) {
      setTimeout(() => {
        otpInputRefs.current[index + 1]?.focus()
      }, 0)
    }
  }, [otpDigits])

  const handleOtpKeyDown = useCallback((index, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault() // Always prevent default to have full control
      
      const newDigits = [...otpDigits]
      
      if (otpDigits[index]) {
        // Current input has content, clear it and stay focused
        newDigits[index] = ''
        setOtpDigits(newDigits)
        setOtpToken(newDigits.join(''))
        // Force focus back to current input after React re-render
        requestAnimationFrame(() => {
          otpInputRefs.current[index]?.focus()
        })
      } else if (index > 0) {
        // Current input is empty, move to previous box and clear it
        newDigits[index - 1] = ''
        setOtpDigits(newDigits)
        setOtpToken(newDigits.join(''))
        // Move focus to previous input
        requestAnimationFrame(() => {
          otpInputRefs.current[index - 1]?.focus()
        })
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      requestAnimationFrame(() => {
        otpInputRefs.current[index - 1]?.focus()
      })
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault()
      requestAnimationFrame(() => {
        otpInputRefs.current[index + 1]?.focus()
      })
    }
  }, [otpDigits])

  const handleOtpPaste = useCallback((e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '')
    
    if (pastedData.length >= 6) {
      const newDigits = pastedData.slice(0, 6).split('')
      // Pad with empty strings if needed
      while (newDigits.length < 6) newDigits.push('')
      
      setOtpDigits(newDigits)
      setOtpToken(newDigits.join(''))
      
      // Focus the last filled input or the first empty one
      const focusIndex = Math.min(pastedData.length - 1, 5)
      setTimeout(() => {
        otpInputRefs.current[focusIndex]?.focus()
      }, 0)
    }
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Basic validation
    const cleanToken = otpToken.trim().replace(/\s+/g, '')
    if (!cleanToken) {
      return
    }
    
    if (cleanToken.length === 6 && /^[A-Z0-9]+$/.test(cleanToken)) {
      // Valid short code format
      onSubmit(cleanToken)
    } else if (cleanToken.length > 50) {
      // Likely a JWT token
      onSubmit(cleanToken)
    } else {
      // Invalid format - but let the parent handle the error
      onSubmit(cleanToken)
    }
  }

  const clearOtpInputs = () => {
    setOtpDigits(['', '', '', '', '', ''])
    setOtpToken('')
  }

  // Expose clear function to parent if needed
  OTPInput.clearInputs = clearOtpInputs

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="text-white/80 text-sm mb-2 block">
          {label}
        </label>
        <div className="flex gap-2 justify-center mb-2">
          {otpDigits.map((digit, index) => (
            <input
              key={index}
              ref={el => otpInputRefs.current[index] = el}
              type="text"
              inputMode="text"
              pattern="[A-Z0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleOtpKeyDown(index, e)}
              onPaste={(e) => handleOtpPaste(e)}
              className={`w-12 h-12 text-center text-2xl font-bold font-mono rounded-lg ${
                error 
                  ? 'border-2 border-red-400' 
                  : 'border border-white/20 focus:border-amber-600/80 focus:bg-white/15'
              } bg-white/10 text-white outline-none transition-all duration-200`}
            />
          ))}
        </div>
        {error && (
          <p className="text-red-400 text-xs mt-1 text-center">{error}</p>
        )}
        {helpText && (
          <div className="mt-2 p-2 bg-white/5 rounded-md text-xs text-white/60 text-center">
            {helpText}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading || !otpToken.trim()}
        className={`w-full p-3.5 rounded-lg border-none text-white text-lg font-bold transition-all duration-200 mt-2 ${
          (isLoading || !otpToken.trim())
            ? 'bg-gray-500 cursor-not-allowed' 
            : 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 cursor-pointer'
        }`}
      >
        {isLoading ? buttonLoadingText : buttonText}
      </button>
    </form>
  )
}