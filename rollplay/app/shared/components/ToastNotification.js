/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'
import { THEME } from '@/app/styles/colorTheme'

export const ToastNotification = ({ id, type = 'info', message, duration = 7000, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 10)

    const timer = setTimeout(() => {
      setIsLeaving(true)
      setTimeout(() => onDismiss(id), 150)
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, id, onDismiss])

  return (
    <div
      className={`
        relative
        text-sm
        px-4
        py-2
        rounded-sm
        border
        shadow-xl
        backdrop-blur-sm
        mb-2
        whitespace-nowrap
        transition-all
        duration-250
        ease-in-out
        ${isVisible && !isLeaving ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
      `}
      onClick={() => {
        setIsLeaving(true)
        setTimeout(() => onDismiss(id), 150)
      }}
      style={{
        cursor: 'pointer',
        backgroundColor: THEME.bgPanel,
        borderColor: THEME.borderDefault,
        color: THEME.textOnDark
      }}
    >
      {/* Speech bubble arrow pointing right (toward bell) */}
      <div
        className="absolute top-1/2 -right-2 -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-l-8"
        style={{ borderLeftColor: THEME.bgPanel }}
      />
      {message}
    </div>
  )
}

export const ToastContainer = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-5 right-48 z-50 flex flex-col items-end pointer-events-none max-w-xs">
      <div className="pointer-events-auto">
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            id={toast.id}
            type={toast.type}
            message={toast.message}
            duration={toast.duration}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  )
}
