/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'

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

  const typeStyles = {
    info: 'bg-slate-700/95 border-slate-500/50',
    success: 'bg-emerald-800/95 border-emerald-500/50',
    warning: 'bg-amber-800/95 border-amber-500/50',
    error: 'bg-rose-800/95 border-rose-500/50'
  }

  const colors = typeStyles[type] || typeStyles.info

  return (
    <div
      className={`
        relative
        ${colors}
        text-slate-200
        text-sm
        px-4
        py-2
        rounded-md
        border
        shadow-xl
        backdrop-blur-sm
        mb-2
        mr-12
        transition-all
        duration-250
        ease-in-out
        ${isVisible && !isLeaving ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
      `}
      onClick={() => {
        setIsLeaving(true)
        setTimeout(() => onDismiss(id), 150)
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* Speech bubble arrow pointing right (toward bell) */}
      <div
        className={`
          absolute
          top-1/2
          -right-2
          -translate-y-1/2
          w-0
          h-0
          border-t-8
          border-t-transparent
          border-b-8
          border-b-transparent
          border-l-8
          ${type === 'info' ? 'border-l-slate-700/95' :
            type === 'success' ? 'border-l-emerald-800/95' :
            type === 'warning' ? 'border-l-amber-800/95' :
            'border-l-rose-800/95'}
        `}
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
