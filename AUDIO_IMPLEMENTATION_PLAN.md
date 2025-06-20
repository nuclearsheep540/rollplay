# Tabletop Tavern Audio System Implementation Plan

## Overview
Implement a dual-stream audio system for the Tabletop Tavern D&D platform:
- **Stream 1**: Local app audio (dice rolls, combat, UI feedback)
- **Stream 2**: DM-controlled audio (music, ambient, custom SFX) via WebSocket

## Architecture Summary

### Audio Streams
1. **Local Audio**: Built-in app sounds, played automatically on game events
2. **DM Audio**: Streamed from AWS S3, controlled via WebSocket
3. **Mix System**: DM sets main mix levels, players control master volume
4. **Unlock Strategy**: Audio unlocked when player clicks "Sit" on party seat

### File Storage
- **Local Audio**: Static files in `/rollplay/public/audio/local/`
- **DM Audio**: AWS S3 bucket with pre-signed URLs for security
- **Formats**: MP3 and AAC (HTML5 compatible)
- **Upload System**: DMs can upload custom tracks via secure upload flow

---

## 3-PART IMPLEMENTATION ROADMAP

### PART 1: Local HTML5 Audio + Master Volume
**Goal**: Test basic audio playback with local files
- HTML5 audio player for local files
- Master volume control (50% default, localStorage)
- Combat toggle trigger (local audio response to WebSocket event)
- Audio unlock on first user interaction

**Maps to Original Plan**: Phase 1.1 (Local Audio System) + Phase 1.2 (Master Volume Control)

### PART 2: WebSocket-Controlled Audio
**Goal**: DM can control remote audio playback
- DM selects between song_a/song_b in interface
- WebSocket events trigger audio playback on all clients
- Basic play/stop control via WebSocket
- Static audio files (no uploads yet)

**Maps to Original Plan**: Phase 3.1 (WebSocket Events) + Phase 3.2 (Frontend Audio Manager) + Phase 4.1 (Basic DM Controls)

### PART 3: Upload System + Mix Levels
**Goal**: Custom uploads and dual-mix system
- DM can upload custom audio files
- Mix level control (DM sets main mix, players have master volume)
- File management system
- Full dual-stream architecture

**Maps to Original Plan**: Phase 2 (S3 Infrastructure) + Phase 5 (Upload System) + Advanced mix controls

---

## DETAILED PHASES (Full Implementation)

## Phase 1: Foundation & Local Audio

### 1.1 Local Audio System
**Goal**: Implement client-side audio for app events

**Components to Create:**
```
/rollplay/app/hooks/useLocalAudio.js
/rollplay/public/audio/local/
  ├── dice-roll.mp3
  ├── combat-start.mp3
  ├── seat-click.mp3
  ├── turn-notification.mp3
  └── ui-feedback.mp3
```

**Implementation:**
- Audio manager hook for local sounds
- Integration with existing game events
- Volume control (respects master volume)
- Preload audio files for instant playback

**Audio Unlock:**
- Trigger on seat selection ("Sit" button click)
- One-time unlock enables all future audio
- Visual feedback when audio is enabled

### 1.2 Master Volume Control
**Goal**: Player-controlled master volume

**Implementation:**
- Volume slider in game UI
- localStorage persistence per session
- Default: 50% volume
- Affects both local and DM audio streams

**UI Location**: Small audio control panel in game interface

---

## Phase 2: DM Audio Infrastructure

### 2.1 AWS S3 Setup
**Goal**: Secure file storage and delivery

**S3 Bucket Structure:**
```
tabletop-tavern-audio/
├── default/
│   ├── music/
│   │   ├── battle-theme.mp3
│   │   ├── exploration.mp3
│   │   └── tavern-music.mp3
│   ├── ambient/
│   │   ├── dungeon-drips.mp3
│   │   ├── forest-sounds.mp3
│   │   └── tavern-chatter.mp3
│   └── sfx/
│       ├── dragon-roar.mp3
│       └── spell-cast.mp3
└── user-uploads/
    ├── {room_id}/
    │   ├── {dm_user_id}/
    │   │   ├── {timestamp}-{filename}.mp3
    │   │   └── ...
    │   └── ...
    └── ...
```

**S3 Configuration:**
- Private bucket (no public access)
- Pre-signed URLs for downloads (1 hour expiry)
- Pre-signed URLs for uploads (15 minute expiry)
- CORS configuration for browser access
- Lifecycle policies for cleanup

### 2.2 Backend Services
**Goal**: File management and URL generation

**New Files to Create:**
```
/api/services/s3_audio_service.py
/api/services/audio_metadata_service.py
/api/models/audio_track.py
```

**Database Schema:**
```sql
-- New table: audio_tracks
CREATE TABLE audio_tracks (
    id UUID PRIMARY KEY,
    room_id VARCHAR(255),
    uploaded_by VARCHAR(255),
    track_type ENUM('music', 'ambient', 'sfx'),
    file_name VARCHAR(255),
    display_name VARCHAR(255),
    s3_key VARCHAR(500),
    file_size INTEGER,
    duration_seconds INTEGER,
    upload_timestamp TIMESTAMP,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 API Endpoints
**Goal**: File management and audio control

**New Endpoints:**
```python
# Audio track management
GET  /api/game/{room_id}/audio/tracks          # List available tracks
POST /api/game/{room_id}/audio/upload          # Get upload pre-signed URL
POST /api/game/{room_id}/audio/tracks          # Save track metadata
DELETE /api/game/{room_id}/audio/tracks/{id}   # Delete track

# Audio playback URLs
GET  /api/game/{room_id}/audio/tracks/{id}/url # Get download pre-signed URL
```

---

## Phase 3: WebSocket Audio Control

### 3.1 WebSocket Events
**Goal**: Real-time audio control via WebSocket

**New WebSocket Events:**
```javascript
// Play audio track
{
  "event_type": "audio_play",
  "data": {
    "track_type": "music|ambient|sfx",
    "track_id": "uuid-of-track",
    "main_mix": 0.8,         // DM-controlled volume (0.0-1.0)
    "loop": true,
    "fade_in_ms": 2000,
    "triggered_by": "dm_name"
  }
}

// Stop audio track
{
  "event_type": "audio_stop",
  "data": {
    "track_type": "music",
    "fade_out_ms": 1500,
    "triggered_by": "dm_name"
  }
}

// Change volume
{
  "event_type": "audio_volume",
  "data": {
    "track_type": "ambient",
    "main_mix": 0.6,
    "triggered_by": "dm_name"
  }
}
```

### 3.2 Frontend Audio Manager
**Goal**: WebSocket-controlled audio playback

**New Components:**
```
/rollplay/app/hooks/useDMAudio.js
/rollplay/app/hooks/useAudioMixer.js
/rollplay/app/components/AudioController.js
```

**Features:**
- Web Audio API for precise control
- Three-track system (music, ambient, sfx)
- Gain nodes for volume mixing
- Crossfading between tracks
- Audio buffer management

---

## Phase 4: DM Audio Controls

### 4.1 DM Interface Enhancement
**Goal**: Add audio controls to DM Command Center

**Updates to:**
```
/rollplay/app/components/DMControlCenter.js
```

**New Audio Control Panel:**
- Track selection dropdowns (music, ambient, sfx)
- Volume sliders for each track type
- Play/Pause/Stop buttons
- Current playing track display
- Upload button for custom tracks

### 4.2 Track Library Management
**Goal**: DM can manage their audio library

**New Components:**
```
/rollplay/app/components/DMAudioLibrary.js
/rollplay/app/components/AudioUploader.js
```

**Features:**
- View all available tracks
- Upload new tracks with progress
- Delete custom tracks
- Preview tracks before using
- Search/filter track library

---

## Phase 5: File Upload System

### 5.1 Upload Flow
**Goal**: Secure file upload for DMs

**Upload Process:**
1. DM selects file in upload component
2. Frontend validates file (type, size)
3. Backend generates upload pre-signed URL
4. Frontend uploads directly to S3
5. Backend saves track metadata to database
6. Frontend refreshes track library

**File Validation:**
- File types: `.mp3`, `.m4a`, `.aac`
- Max file size: 50MB per track
- Max duration: 30 minutes
- Basic format validation

### 5.2 Upload UI
**Goal**: User-friendly upload interface

**Features:**
- Drag & drop file upload
- Upload progress bar
- File validation feedback
- Batch upload support
- Track metadata entry (name, description)

---

## Phase 6: Advanced Features

### 6.1 Audio Synchronization
**Goal**: Keep all players in sync

**Features:**
- Timestamp-based synchronization
- Network latency compensation
- Graceful degradation for slow connections

### 6.2 Audio Presets
**Goal**: Quick audio scene changes

**Features:**
- Save audio "scenes" (music + ambient + volume levels)
- Quick preset buttons for DM
- Scene transitions with crossfading

### 6.3 Player Audio Preferences
**Goal**: Individual player customization

**Features:**
- Individual track type volume (music vs ambient vs sfx)
- Audio quality preferences
- Accessibility options (visual indicators for audio cues)

---

## Technical Specifications

### Frontend Dependencies
```json
{
  "dependencies": {
    // Existing dependencies remain
    // No new dependencies required - using Web Audio API
  }
}
```

### Backend Dependencies
```python
# New requirements.txt additions
boto3==1.26.137
botocore==1.29.137
python-multipart==0.0.6  # For file uploads
```

### Audio File Specifications
- **Formats**: MP3 (preferred), AAC/M4A (Safari optimized)
- **Quality**: 128-320 kbps (configurable)
- **Sample Rate**: 44.1kHz or 48kHz
- **Channels**: Stereo or Mono
- **Max Duration**: 30 minutes per track
- **Max File Size**: 50MB per track

### Browser Compatibility
- **Chrome**: Full support (Web Audio API + MP3/AAC)
- **Firefox**: Full support
- **Safari**: Full support (prefers AAC)
- **Edge**: Full support
- **Mobile**: iOS Safari, Chrome Mobile supported

---

## Security Considerations

### 1. File Upload Security
- Pre-signed URLs with short expiry (15 minutes)
- File type validation on both client and server
- File size limits enforced
- Malware scanning (optional, via S3 + Lambda)

### 2. Access Control
- Only DMs can upload files
- Room-based file isolation
- Pre-signed download URLs expire after 1 hour
- No direct S3 bucket access

### 3. Storage Management
- Automatic cleanup of unused files
- File storage quotas per room/DM
- S3 lifecycle policies for cost optimization

---

## Performance Considerations

### 1. Audio Loading
- Lazy loading of audio files
- Audio buffer pooling
- Progressive download for large files

### 2. Memory Management
- Release audio buffers when not needed
- Limit concurrent audio streams
- Garbage collection of audio contexts

### 3. Bandwidth Optimization
- Compressed audio formats
- Progressive loading
- Quality adaptation based on connection

---

## Testing Strategy

### 1. Unit Tests
- Audio manager functionality
- File upload validation
- Pre-signed URL generation
- WebSocket event handling

### 2. Integration Tests
- End-to-end audio playbook
- Cross-browser compatibility
- Network failure scenarios
- File upload edge cases

### 3. Performance Tests
- Memory usage during extended play
- Multiple concurrent audio streams
- Large file upload handling
- WebSocket message throughput

---

## Deployment Checklist

### AWS Setup
- [ ] Create S3 bucket with proper permissions
- [ ] Configure CORS policy
- [ ] Set up IAM roles for pre-signed URLs
- [ ] Configure lifecycle policies

### Backend Deployment
- [ ] Add boto3 dependencies
- [ ] Create database migration for audio_tracks table
- [ ] Deploy new API endpoints
- [ ] Update WebSocket handlers

### Frontend Deployment
- [ ] Add local audio files to build
- [ ] Test audio unlock on all browsers
- [ ] Verify WebSocket event handling
- [ ] Test upload flow end-to-end

### Production Verification
- [ ] Test with real DM upload workflow
- [ ] Verify audio synchronization across clients
- [ ] Monitor S3 costs and usage
- [ ] Test performance with multiple rooms

---

## Timeline Estimate

- **Phase 1** (Foundation): 1-2 weeks
- **Phase 2** (Infrastructure): 2-3 weeks  
- **Phase 3** (WebSocket Control): 1-2 weeks
- **Phase 4** (DM Interface): 1-2 weeks
- **Phase 5** (Upload System): 2-3 weeks
- **Phase 6** (Advanced Features): 2-4 weeks

**Total Estimated Timeline**: 9-16 weeks

---

## Future Enhancements

### Audio Effects
- Real-time audio filters (echo, reverb for dungeons)
- Dynamic volume based on in-game distance
- Spatial audio positioning

### AI Integration
- Auto-generated ambient tracks based on scene descriptions
- Voice synthesis for NPC dialogue
- Dynamic music composition based on combat intensity

### Mobile Optimization
- Reduced quality modes for mobile data
- Touch-optimized audio controls
- Background audio continuation

---

*This document serves as the master plan for audio system implementation. Update as requirements evolve.*