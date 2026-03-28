# Bulk Upload — Asset Library

## Context

The dashboard asset library currently supports single-file uploads only. Users need to upload multiple files at once (via multi-select file picker or drag-and-drop). Each file needs an asset type dropdown since a batch may contain a mix of maps, music, SFX, and images. The game upload components (MapSelectionModal, ImageSelectionSection, AudioSelectionModal, SfxSoundboard) must remain untouched — they use `useUploadAsset` for single-file uploads with fixed asset types.

## Plan

### 1. Extract `ACCEPTED_TYPES` config to shared location

**New file:** `app/asset_library/config/assetTypes.js`

Extract from `AssetUploadModal.js`:
- `ACCEPTED_TYPES` constant (map/music/sfx/image with mimeTypes, extensions, label, icon)
- `MAX_FILE_SIZE` constant (50MB)
- `detectAssetType(mimeType)` — returns `'image'` for `image/*`, `'music'` for `audio/*`
- `getCompatibleTypes(mimeType)` — returns `['map', 'image']` for image MIME, `['music', 'sfx']` for audio MIME
- `validateFileForType(file, assetType)` — size + MIME validation, returns error string or null

Update `AssetUploadModal.js` to import from this config instead of defining inline.

### 2. Create `useBulkUploadAssets` hook

**New file:** `app/asset_library/hooks/useBulkUploadAssets.js`

Queue item model:
```
{ id, file, assetType, status: 'pending'|'uploading'|'done'|'error', progress: 0-100, error: string|null }
```

Interface:
- `queue` — array of queue items
- `isUploading` — boolean
- `addFiles(files: File[])` — adds files with auto-detected asset types
- `removeFile(id)` — remove from queue (disabled during upload)
- `updateAssetType(id, type)` — change asset type, re-validates
- `startUpload()` — sequential 3-step upload for each file (GET presigned URL → PUT S3 → POST confirm)
- `reset()` — clear queue

Upload logic:
- Inlines the same 3-step fetch pattern from `useUploadAsset` (not calling the hook — avoids shared mutable progress state)
- Uses `authFetch` for backend calls, plain `fetch` for S3 PUT
- Skips files with validation errors (marks them `error`, continues to next)
- Invalidates `['assets']` query key once after all uploads complete

### 3. Rewrite `AssetUploadModal` for bulk support

**Modify:** `app/asset_library/components/AssetUploadModal.js`

Props simplified to: `{ isOpen, onClose }` — modal owns its own upload state via `useBulkUploadAssets()` internally.

Layout:
```
Header: "Upload Assets"
Body:
  ├── Drop Zone
  │   - <input type="file" multiple> accepting union of all MIME types
  │   - Drag-and-drop processes ALL files (not just files[0])
  │   - Visible when queue is empty or adding more files
  ├── File Queue List (when queue.length > 0)
  │   └── Per file row:
  │       ├── Icon (based on content type)
  │       ├── Filename (truncated) + size
  │       ├── Asset Type <select> dropdown
  │       │   - Options filtered to compatible types (image→map/image, audio→music/sfx)
  │       │   - Default: auto-detected via detectAssetType()
  │       │   - Disabled during upload
  │       ├── Status: pending (—) | uploading (progress bar) | done (checkmark) | error (X + message)
  │       └── Remove button (disabled during upload)
  ├── Upload Summary (during/after upload)
  │   - "Uploading 3 of 7..." with overall progress bar
  └── Validation errors (pre-upload)
Footer:
  ├── Cancel (disabled during upload)
  └── Upload / Upload All (N) — disabled when queue empty, uploading, or validation errors
```

### 4. Update `AssetLibraryManager` integration

**Modify:** `app/asset_library/components/AssetLibraryManager.js`

- Remove `useUploadAsset` import and `uploadMutation` state (modal owns upload now)
- Remove `handleUpload` callback
- Simplify modal rendering to just `<AssetUploadModal isOpen={...} onClose={...} />`
- Change button text to "Upload Assets"

### 5. Update barrel export

**Modify:** `app/asset_library/index.js`

Add: `export { useBulkUploadAssets } from './hooks/useBulkUploadAssets'`

## Files Modified

| File | Action |
|------|--------|
| `app/asset_library/config/assetTypes.js` | Create — shared ACCEPTED_TYPES, validation helpers |
| `app/asset_library/hooks/useBulkUploadAssets.js` | Create — bulk upload hook with queue management |
| `app/asset_library/components/AssetUploadModal.js` | Rewrite — bulk-capable modal with per-file dropdowns |
| `app/asset_library/components/AssetLibraryManager.js` | Modify — simplify modal props, remove upload hook |
| `app/asset_library/index.js` | Modify — add export |

## Files NOT Modified

- `app/asset_library/hooks/useUploadAsset.js` — unchanged, used by game components
- `app/game/components/MapSelectionModal.js` — unchanged
- `app/game/components/ImageSelectionSection.js` — unchanged
- `app/audio_management/components/AudioSelectionModal.js` — unchanged
- `app/audio_management/components/SfxSoundboard.js` — unchanged
- No backend changes — each file uses the existing upload-url → S3 → confirm flow

## Verification

1. **Single file upload (dashboard):** Open modal → drop/select one file → verify type dropdown appears → upload → asset appears in grid
2. **Bulk upload (dashboard):** Select 3+ mixed files (images + audio) → verify each gets correct auto-detected type → change one type via dropdown → upload all → all appear in grid
3. **Drag-and-drop multiple:** Drag 3 files onto drop zone → all appear in queue
4. **Validation:** Select audio file → set type to "Map" via dropdown → verify error shown and upload blocked (shouldn't be possible since dropdown is filtered, but verify)
5. **Error handling:** Simulate upload failure (e.g., network off) → verify failed file shows error, other files continue
6. **Game uploads unchanged:** Open a game session → verify map/image/audio upload still works with single file flow
7. **Build:** `npm run build` passes
