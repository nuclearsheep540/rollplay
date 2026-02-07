/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useState, useRef, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMap, faMusic, faBolt, faImage } from '@fortawesome/free-solid-svg-icons'
import Modal from '@/app/shared/components/Modal'
import { Button } from '@/app/dashboard/components/shared/Button'

const ACCEPTED_TYPES = {
  map: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    extensions: '.png, .jpg, .jpeg, .webp',
    label: 'Map',
    icon: faMap
  },
  music: {
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    extensions: '.mp3, .wav, .ogg',
    label: 'Music',
    icon: faMusic
  },
  sfx: {
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    extensions: '.mp3, .wav, .ogg',
    label: 'SFX',
    icon: faBolt
  },
  image: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    extensions: '.png, .jpg, .jpeg, .webp, .gif',
    label: 'Image',
    icon: faImage
  }
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

/**
 * Modal for uploading new assets with drag-and-drop support.
 * Backed by Headless UI Dialog for focus trap, escape-to-close, and ARIA.
 */
export default function AssetUploadModal({
  isOpen,
  onClose,
  onUpload,
  uploading,
  uploadProgress
}) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [assetType, setAssetType] = useState('map')
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const validateFile = useCallback((file) => {
    if (!file) return 'No file selected'

    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
    }

    const typeConfig = ACCEPTED_TYPES[assetType]
    if (!typeConfig.mimeTypes.includes(file.type)) {
      return `Invalid file type for ${typeConfig.label}. Accepted: ${typeConfig.extensions}`
    }

    return null
  }, [assetType])

  const handleFileSelect = useCallback((file) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      setSelectedFile(null)
    } else {
      setError(null)
      setSelectedFile(file)
    }
  }, [validateFile])

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }, [handleFileSelect])

  const handleInputChange = useCallback((e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
    e.target.value = ''
  }, [handleFileSelect])

  const handleSubmit = async () => {
    if (!selectedFile) return

    try {
      await onUpload(selectedFile, assetType)
      // Reset and close on success
      setSelectedFile(null)
      setAssetType('map')
      setError(null)
      onClose()
    } catch (err) {
      setError(err.message || 'Upload failed')
    }
  }

  const handleClose = () => {
    if (!uploading) {
      setSelectedFile(null)
      setAssetType('map')
      setError(null)
      onClose()
    }
  }

  // Re-validate when asset type changes
  const handleTypeChange = (newType) => {
    setAssetType(newType)
    if (selectedFile) {
      const typeConfig = ACCEPTED_TYPES[newType]
      if (!typeConfig.mimeTypes.includes(selectedFile.type)) {
        setError(`Selected file is not valid for ${typeConfig.label}. Please select a different file.`)
      } else {
        setError(null)
      }
    } else {
      setError(null)
    }
  }

  const currentTypeConfig = ACCEPTED_TYPES[assetType]

  return (
    <Modal open={isOpen} onClose={uploading ? () => {} : handleClose} size="lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-xl font-bold text-content-accent">
          Upload Asset
        </h2>
        <button
          onClick={handleClose}
          disabled={uploading}
          className="transition-opacity hover:opacity-80 disabled:opacity-50 text-content-secondary"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Asset Type Selection */}
        <div>
          <label className="block text-sm font-medium mb-2 text-content-on-dark">
            Asset Type
          </label>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(ACCEPTED_TYPES).map(([type, config]) => (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                disabled={uploading}
                className={`p-3 rounded-sm border text-center transition-all disabled:opacity-50 ${
                  assetType === type
                    ? 'bg-surface-panel border-border-active text-content-on-dark'
                    : 'bg-transparent border-border text-content-secondary'
                }`}
              >
                <FontAwesomeIcon icon={config.icon} className="text-3xl block mx-auto mb-1" />
                <span className="text-xs font-medium">{config.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-all ${uploading ? 'pointer-events-none opacity-60' : ''} ${
            dragActive
              ? 'border-content-secondary'
              : selectedFile
                ? 'border-feedback-success'
                : 'border-border'
          }`}
          style={{
            backgroundColor: dragActive ? '#B5ADA610' : selectedFile ? '#16a34a10' : 'transparent'
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleInputChange}
            accept={currentTypeConfig.mimeTypes.join(',')}
            className="hidden"
            disabled={uploading}
          />

          {selectedFile ? (
            <div>
              <FontAwesomeIcon icon={currentTypeConfig.icon} className="text-4xl block mx-auto mb-2" />
              <p className="font-medium truncate text-content-on-dark">
                {selectedFile.name}
              </p>
              <p className="text-sm mt-1 text-content-secondary">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
              {!uploading && (
                <p className="text-xs mt-2 text-content-secondary">
                  Click to change file
                </p>
              )}
            </div>
          ) : (
            <div>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mb-1 text-content-on-dark">
                Drop file here or click to browse
              </p>
              <p className="text-sm text-content-secondary">
                Accepted: {currentTypeConfig.extensions}
              </p>
            </div>
          )}
        </div>

        {/* Upload Progress */}
        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-content-secondary">Uploading...</span>
              <span className="text-content-on-dark">{uploadProgress}%</span>
            </div>
            <div className="h-2 rounded-sm overflow-hidden bg-border">
              <div
                className="h-full transition-all duration-300 bg-interactive-hover"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-sm border bg-feedback-error/15 border-feedback-error">
            <p className="text-sm text-feedback-error">{error}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 p-4 border-t border-border">
        <Button
          variant="ghost"
          onClick={handleClose}
          disabled={uploading}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!selectedFile || uploading || error}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </div>
    </Modal>
  )
}
