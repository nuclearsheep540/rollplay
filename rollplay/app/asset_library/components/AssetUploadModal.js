/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useRef, useCallback } from 'react'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button } from '@/app/dashboard/components/shared/Button'

const ACCEPTED_TYPES = {
  map: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    extensions: '.png, .jpg, .jpeg, .webp',
    label: 'Map',
    icon: '🗺️'
  },
  audio: {
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    extensions: '.mp3, .wav, .ogg',
    label: 'Audio',
    icon: '🎵'
  },
  image: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    extensions: '.png, .jpg, .jpeg, .webp, .gif',
    label: 'Image',
    icon: '🖼️'
  }
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

/**
 * Modal for uploading new assets with drag-and-drop support
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
    }
  }

  if (!isOpen) return null

  const currentTypeConfig = ACCEPTED_TYPES[assetType]

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: THEME.overlayDark }}
    >
      <div
        className="rounded-sm shadow-2xl max-w-lg w-full border"
        style={{ backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: THEME.borderDefault }}
        >
          <h2 className="text-xl font-bold" style={{ color: THEME.textAccent }}>
            Upload Asset
          </h2>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ color: THEME.textSecondary }}
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
            <label className="block text-sm font-medium mb-2" style={{ color: THEME.textOnDark }}>
              Asset Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ACCEPTED_TYPES).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => handleTypeChange(type)}
                  disabled={uploading}
                  className="p-3 rounded-sm border text-center transition-all disabled:opacity-50"
                  style={{
                    backgroundColor: assetType === type ? THEME.bgPanel : 'transparent',
                    borderColor: assetType === type ? THEME.borderActive : THEME.borderDefault,
                    color: assetType === type ? THEME.textOnDark : THEME.textSecondary
                  }}
                >
                  <span className="text-2xl block mb-1">{config.icon}</span>
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
            className={`relative border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-all ${uploading ? 'pointer-events-none opacity-60' : ''}`}
            style={{
              borderColor: dragActive ? COLORS.silver : selectedFile ? '#16a34a' : THEME.borderDefault,
              backgroundColor: dragActive ? `${COLORS.silver}10` : selectedFile ? '#16a34a10' : 'transparent'
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
                <span className="text-3xl block mb-2">{currentTypeConfig.icon}</span>
                <p className="font-medium truncate" style={{ color: THEME.textOnDark }}>
                  {selectedFile.name}
                </p>
                <p className="text-sm mt-1" style={{ color: THEME.textSecondary }}>
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                {!uploading && (
                  <p className="text-xs mt-2" style={{ color: THEME.textSecondary }}>
                    Click to change file
                  </p>
                )}
              </div>
            ) : (
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3" style={{ color: THEME.textSecondary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mb-1" style={{ color: THEME.textOnDark }}>
                  Drop file here or click to browse
                </p>
                <p className="text-sm" style={{ color: THEME.textSecondary }}>
                  Accepted: {currentTypeConfig.extensions}
                </p>
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: THEME.textSecondary }}>Uploading...</span>
                <span style={{ color: THEME.textOnDark }}>{uploadProgress}%</span>
              </div>
              <div
                className="h-2 rounded-sm overflow-hidden"
                style={{ backgroundColor: THEME.borderDefault }}
              >
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%`, backgroundColor: COLORS.silver }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div
              className="p-3 rounded-sm border"
              style={{ backgroundColor: '#991b1b', borderColor: '#dc2626' }}
            >
              <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t" style={{ borderColor: THEME.borderDefault }}>
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
      </div>
    </div>
  )
}
