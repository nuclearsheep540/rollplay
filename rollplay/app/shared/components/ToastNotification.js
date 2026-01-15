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
        mr-2
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
      {message}
    </div>
  )
}

export const ToastContainer = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-5 right-48 z-50 flex flex-row-reverse items-center pointer-events-none">
      <div className="pointer-events-auto flex flex-row-reverse items-center">
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
