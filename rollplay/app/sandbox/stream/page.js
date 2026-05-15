/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0d0d0d',
    color: '#e5e5e5',
    padding: '3rem',
    fontFamily: 'system-ui, sans-serif',
  },
  h1: {
    fontSize: '1.5rem',
    marginBottom: '1rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: '#888',
  },
  h2: {
    fontSize: '0.85rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: '#888',
    marginTop: '3rem',
    marginBottom: '0.75rem',
  },
  link: { color: '#e5e5e5', textDecoration: 'underline' },
  muted: { color: '#666' },
  button: {
    backgroundColor: '#2a2a2a',
    color: '#e5e5e5',
    border: '1px solid #3a3a3a',
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  buttonDanger: {
    backgroundColor: '#2a1a1a',
    color: '#f5a5a5',
    border: '1px solid #5a2a2a',
    padding: '0.35rem 0.75rem',
    fontSize: '0.75rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  card: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '4px',
    padding: '1rem',
    marginBottom: '0.75rem',
  },
  field: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' },
  label: { color: '#888', fontSize: '0.75rem', minWidth: '90px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  value: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.85rem',
    color: '#e5e5e5',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  copyBtn: {
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px solid #3a3a3a',
    padding: '0.25rem 0.5rem',
    fontSize: '0.7rem',
    borderRadius: '3px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  error: { color: '#f5a5a5', marginTop: '0.75rem', fontSize: '0.85rem' },
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div style={styles.field}>
      <span style={styles.label}>{label}</span>
      <span style={styles.value} title={value}>{value}</span>
      <button style={styles.copyBtn} onClick={onCopy} type="button">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function IngressCard({ ingress, onDelete }) {
  const [busy, setBusy] = useState(false)
  const handleDelete = async () => {
    if (!confirm(`Delete ingress "${ingress.name || ingress.ingress_id}"?`)) return
    setBusy(true)
    try {
      await onDelete(ingress.ingress_id)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <div>
          <strong style={{ color: '#e5e5e5' }}>{ingress.name || '(unnamed)'}</strong>
          <span style={{ ...styles.muted, marginLeft: '0.75rem', fontSize: '0.75rem' }}>
            room: {ingress.room_name} · type: {ingress.input_type}
          </span>
        </div>
        <button style={styles.buttonDanger} onClick={handleDelete} disabled={busy} type="button">
          {busy ? 'Deleting...' : 'Delete'}
        </button>
      </div>
      <CopyField label="URL" value={ingress.url} />
      <CopyField label="Stream key" value={ingress.stream_key} />
      <CopyField label="Ingress ID" value={ingress.ingress_id} />
    </div>
  )
}

export default function SandboxIndex() {
  const [ingresses, setIngresses] = useState(null)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/stream/ingresses')
      if (!res.ok) throw new Error(`list failed: ${res.status}`)
      const data = await res.json()
      setIngresses(data.items)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/stream/ingress', { method: 'POST' })
      if (!res.ok) throw new Error(`create failed: ${res.status}`)
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (ingressId) => {
    setError(null)
    try {
      const res = await fetch(`/api/stream/ingress/${ingressId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`delete failed: ${res.status}`)
      await refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div style={styles.page}>
      <div style={{ marginBottom: '0.5rem' }}>
        <Link href="/sandbox" style={{ ...styles.muted, fontSize: '0.75rem', textDecoration: 'none' }}>
          ← sandbox
        </Link>
      </div>
      <h1 style={styles.h1}>Stream</h1>

      <ul style={{ listStyle: 'none', padding: 0, lineHeight: 2 }}>
        <li>
          <Link href="/sandbox/stream/watch" style={styles.link}>/sandbox/stream/watch</Link>
          <span style={{ ...styles.muted, marginLeft: '1rem' }}>— viewer page (share with watchers)</span>
        </li>
      </ul>

      <h2 style={styles.h2}>WHIP Ingresses</h2>
      <p style={{ ...styles.muted, fontSize: '0.85rem', marginBottom: '1rem' }}>
        Create an ingress, then paste <code>URL</code> + <code>Stream key</code> into
        OBS Settings → Stream → Service: WHIP. One ingress is enough; reuse it.
      </p>

      <button style={styles.button} onClick={handleCreate} disabled={creating} type="button">
        {creating ? 'Creating...' : '+ New ingress'}
      </button>

      {error && <div style={styles.error}>{error}</div>}

      <div style={{ marginTop: '1.5rem' }}>
        {ingresses === null && <div style={styles.muted}>Loading...</div>}
        {ingresses && ingresses.length === 0 && (
          <div style={styles.muted}>No ingresses provisioned yet.</div>
        )}
        {ingresses && ingresses.map((ing) => (
          <IngressCard key={ing.ingress_id} ingress={ing} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  )
}
