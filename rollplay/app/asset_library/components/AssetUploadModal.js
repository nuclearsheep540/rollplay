/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useRef, useCallback } from 'react'

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-200">Upload Asset</h2>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
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
            <label className="block text-sm font-medium text-slate-300 mb-2">Asset Type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ACCEPTED_TYPES).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => handleTypeChange(type)}
                  disabled={uploading}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    assetType === type
                      ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  } disabled:opacity-50`}
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
            className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-sky-500 bg-sky-500/10'
                : selectedFile
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-slate-600 hover:border-slate-500'
            } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
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
                <p className="text-slate-200 font-medium truncate">{selectedFile.name}</p>
                <p className="text-slate-500 text-sm mt-1">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                {!uploading && (
                  <p className="text-slate-500 text-xs mt-2">Click to change file</p>
                )}
              </div>
            ) : (
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-slate-300 mb-1">Drop file here or click to browse</p>
                <p className="text-slate-500 text-sm">
                  Accepted: {currentTypeConfig.extensions}
                </p>
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Uploading...</span>
                <span className="text-slate-300">{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-slate-700">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedFile || uploading || error}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
