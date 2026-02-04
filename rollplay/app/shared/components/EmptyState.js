/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Empty state placeholder for collections with no items.
 *
 * @param {React.ReactNode} icon - Emoji string or icon component
 * @param {string} title - Heading text
 * @param {string} description - Explanatory text
 * @param {React.ReactNode} action - Optional CTA button
 */
export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="text-6xl mb-4 opacity-30">{icon}</div>
      )}
      {title && (
        <h3 className="text-lg font-medium mb-2 text-content-on-dark">{title}</h3>
      )}
      {description && (
        <p className="max-w-sm text-content-secondary">{description}</p>
      )}
      {action && (
        <div className="mt-6">{action}</div>
      )}
    </div>
  )
}
