/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Link from 'next/link'

export const metadata = {
  title: 'Sandbox',
  robots: { index: false, follow: false },
}

export default function SandboxIndex() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0d0d0d',
        color: '#e5e5e5',
        padding: '3rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: '1.5rem',
          marginBottom: '1rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: '#888',
        }}
      >
        Sandbox
      </h1>
      <ul style={{ listStyle: 'none', padding: 0, lineHeight: 2 }}>
        <li>
          <Link href="/sandbox/stream" style={{ color: '#e5e5e5', textDecoration: 'underline' }}>
            /sandbox/stream
          </Link>
          <span style={{ color: '#666', marginLeft: '1rem' }}>
            — LiveKit WHIP ingress management
          </span>
        </li>
      </ul>
    </div>
  )
}
