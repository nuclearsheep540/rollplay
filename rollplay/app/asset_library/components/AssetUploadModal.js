/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useState, useRef, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faXmark, faSpinner } from '@fortawesome/free-solid-svg-icons'
import Modal from '@/app/shared/components/Modal'
import { Button } from '@/app/dashboard/components/shared/Button'
import { useBulkUploadAssets } from '../hooks/useBulkUploadAssets'
import { ACCEPTED_TYPES, getCompatibleTypes, validateFileForType } from '../config/assetTypes'

// Union of all accepted MIME types for the file input
const ALL_ACCEPTED_MIMES = [...new Set(
  Object.values(ACCEPTED_TYPES).flatMap(t => t.mimeTypes)
)].join(',')

/**
 * Modal for uploading one or more assets with drag-and-drop support.
 * Each file gets a per-file asset type dropdown before uploading.
 */
export default function AssetUploadModal({ isOpen, onClose }) {
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  const {
    queue,
    isUploading,
    completedCount,
    totalCount,
    hasValidationErrors,
    addFiles,
    removeFile,
    updateAssetType,
    startUpload,
    reset,
  } = useBulkUploadAssets()

  const allDone = totalCount > 0 && completedCount === totalCount

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
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const handleInputChange = useCallback((e) => {
    if (e.target.files?.length) {
      addFiles(e.target.files)
    }
    e.target.value = ''
  }, [addFiles])

  const handleClose = useCallback(() => {
    if (!isUploading) {
      reset()
      onClose()
    }
  }, [isUploading, reset, onClose])

  const handleSubmit = useCallback(async () => {
    await startUpload()
  }, [startUpload])

  return (
    <Modal open={isOpen} onClose={isUploading ? () => {} : handleClose} size="2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-xl font-bold text-content-accent">
          Upload Assets
        </h2>
        <button
          onClick={handleClose}
          disabled={isUploading}
          className="transition-opacity hover:opacity-80 disabled:opacity-50 text-content-secondary"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Drop Zone */}
        {!isUploading && !allDone && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-all ${
              dragActive ? 'border-content-secondary' : 'border-border'
            }`}
            style={{
              backgroundColor: dragActive ? '#B5ADA610' : 'transparent'
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleInputChange}
              accept={ALL_ACCEPTED_MIMES}
              className="hidden"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mb-1 text-content-on-dark">
              {queue.length > 0 ? 'Drop more files or click to add' : 'Drop files here or click to browse'}
            </p>
            <p className="text-sm text-content-secondary">
              Images (.png, .jpg, .webp, .gif) and Audio (.mp3, .wav, .ogg) — 50MB max each
            </p>
          </div>
        )}

        {/* File Queue */}
        {queue.length > 0 && (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {queue.map((item) => (
              <FileQueueRow
                key={item.id}
                item={item}
                onRemove={removeFile}
                onTypeChange={updateAssetType}
                disabled={isUploading}
              />
            ))}
          </div>
        )}

        {/* Upload Progress Summary */}
        {isUploading && (
          <div className="flex items-center gap-3 text-sm text-content-secondary">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
            <span>Uploading {Math.min(completedCount + 1, totalCount)} of {totalCount}...</span>
          </div>
        )}

        {/* Done Summary */}
        {allDone && (
          <div className="p-3 rounded-sm border bg-feedback-success/15 border-feedback-success">
            <p className="text-sm text-feedback-success">
              {totalCount === 1 ? '1 file uploaded' : `All ${totalCount} files uploaded`} successfully.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 p-4 border-t border-border">
        <Button
          variant="ghost"
          onClick={handleClose}
          disabled={isUploading}
        >
          {allDone ? 'Close' : 'Cancel'}
        </Button>
        {!allDone && (
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={queue.length === 0 || isUploading || hasValidationErrors}
          >
            {isUploading
              ? 'Uploading...'
              : queue.length <= 1
                ? 'Upload'
                : `Upload All (${queue.length})`
            }
          </Button>
        )}
      </div>
    </Modal>
  )
}

/**
 * Single row in the file queue showing file info, type dropdown, status, and remove button.
 */
function FileQueueRow({ item, onRemove, onTypeChange, disabled }) {
  const { id, file, assetType, status, progress, error } = item
  const compatibleTypes = getCompatibleTypes(file.type)
  const validationError = validateFileForType(file, assetType)
  const hasError = status === 'error' || validationError

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-sm border ${
      hasError
        ? 'border-feedback-error/50 bg-feedback-error/5'
        : status === 'done'
          ? 'border-feedback-success/50 bg-feedback-success/5'
          : 'border-border bg-surface-panel'
    }`}>
      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-content-on-dark">{file.name}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-secondary">
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </span>
          {validationError && (
            <span className="text-xs text-feedback-error">{validationError}</span>
          )}
          {error && !validationError && (
            <span className="text-xs text-feedback-error">{error}</span>
          )}
        </div>
      </div>

      {/* Asset Type Dropdown */}
      {compatibleTypes.length === 0 ? (
        <select
          value=""
          disabled
          className="px-2 py-1 text-sm rounded-sm border border-feedback-error/50 bg-surface-elevated text-feedback-error disabled:opacity-70 focus:outline-none"
        >
          <option value="">Unsupported</option>
        </select>
      ) : (
        <select
          value={assetType}
          onChange={(e) => onTypeChange(id, e.target.value)}
          disabled={disabled || status === 'done'}
          className="px-2 py-1 text-sm rounded-sm border border-border bg-surface-elevated text-content-on-dark disabled:opacity-50 focus:outline-none focus:border-border-active"
        >
          {compatibleTypes.map(type => (
            <option key={type} value={type}>
              {ACCEPTED_TYPES[type].label}
            </option>
          ))}
        </select>
      )}

      {/* Status Indicator */}
      <div className="w-8 flex items-center justify-center">
        {status === 'uploading' && (
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-content-secondary" />
        )}
        {status === 'done' && (
          <FontAwesomeIcon icon={faCheck} className="text-feedback-success" />
        )}
        {status === 'error' && (
          <FontAwesomeIcon icon={faXmark} className="text-feedback-error" />
        )}
      </div>

      {/* Upload Progress Bar (inline, shown during upload) */}
      {status === 'uploading' && (
        <div className="w-16 h-1.5 rounded-full overflow-hidden bg-border">
          <div
            className="h-full transition-all duration-300 bg-interactive-hover"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Remove Button */}
      {status !== 'done' && (
        <button
          onClick={() => onRemove(id)}
          disabled={disabled}
          className="text-content-secondary hover:text-content-on-dark disabled:opacity-30 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
