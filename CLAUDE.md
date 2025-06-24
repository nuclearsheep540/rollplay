# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rollplay is a virtual D&D/tabletop gaming platform called "Tabletop Tavern" that enables real-time multiplayer dice rolling and campaign management. The application supports room creation, party management, DM tools, initiative tracking, and comprehensive adventure logging.

## Architecture

### Frontend (Next.js 13) - Functional Slice Architecture
- **Location**: `/rollplay/` directory
- **Framework**: Next.js 13 with App Router, TailwindCSS
- **Architecture**: Organized by business domain (functional slices) rather than technical layers
- **Key Pages**: 
  - `app/page.js` - Landing page for room creation/joining
  - `app/game/page.js` - Main game interface

#### **Functional Slices Structure:**

**🎲 Game Domain** (`app/game/`)
- `components/` - Game UI components (PlayerCard, DMControlCenter, AdventureLog, DiceActionPanel, etc.)
- `hooks/` - Game-specific hooks (webSocketEvent.js, useWebSocket.js)
- `page.js` - Main game interface

**🎵 Audio Management Domain** (`app/audio_management/`)
- `components/` - Audio controls (AudioMixerPanel, AudioTrack)
- `hooks/` - Audio functionality (useUnifiedAudio, useWebAudio, webSocketAudioEvents)
- `types/` - Audio-related type definitions
- `index.js` - Exports all audio functionality

**🎨 Shared Resources** (`app/`)
- `styles/constants.js` - UI styling constants (DM_TITLE, DM_HEADER, etc.)
- `utils/seatColors.js` - Shared utilities

### Backend (FastAPI)
- **Location**: `/api/` directory  
- **Framework**: FastAPI with WebSocket support
- **Key Services**:
  - `gameservice.py` - Room management and seat layouts
  - `adventure_log_service.py` - Chat/roll logging with MongoDB aggregation
  - `app.py` - Main FastAPI application with WebSocket ConnectionManager
- **Configuration**: YAML-based logging config in `config/`

### Database (MongoDB)
- **Collections**:
  - `active_sessions` - Game room data and seat configurations
  - `adventure_logs` - All game events (chat, rolls, system messages)
- **Features**: Automated log cleanup, performance indexing

### Schema Reference Patterns
- **Current structures**: Check GameService class methods and AdventureLogService for field expectations
- **Test data**: Examine mongo-init.js files for example documents (keep in sync with schema changes)
- **Search hints**: Use Task tool to find schema patterns, search for 'insertOne' or 'update_one' operations

## Development Commands

### Local Development Setup
```bash
# Start development environment
docker-compose -f docker-compose.dev.yml build
docker-compose -f docker-compose.dev.yml up

# Individual service development
cd rollplay && npm run dev  # Frontend on port 3000
cd api && python app.py     # API on port 8081
```

### Frontend Commands
```bash
cd rollplay
npm install           # Install dependencies
npm run dev          # Development server
npm run build        # Production build
npm run start        # Start production build
```

### Backend Commands  
```bash
cd api
pip install -r requirements.txt  # Install dependencies
python app.py                    # Start FastAPI server
```

### Production Deployment
```bash
docker-compose build            # Build all services
docker-compose up -d           # Deploy with SSL/Nginx
```

### Development Troubleshooting
```bash
# Verify environment variables
docker-compose config

# Container inspection
docker exec -it db-dev mongosh -u admin
docker logs api-dev

# Rebuild specific services
docker-compose -f docker-compose.dev.yml build api
```

## Environment Configuration

Required `.env` file in project root:
```env
environment=dev
NEXT_PUBLIC_API_URL=https://localhost
MONGO_INITDB_ROOT_USERNAME=mdavey
MONGO_INITDB_ROOT_PASSWORD=pass
MONGO_INITDB_DATABASE=rollplay
```

### Environment Variable Validation
- Use `docker-compose config` to verify .env variable substitution
- Check that mongo-init templates use `${MONGO_INITDB_ROOT_USERNAME}` and `${MONGO_INITDB_ROOT_PASSWORD}`
- Ensure GameService reads from `os.environ` for database credentials

## WebSocket Architecture & Event System

### **Connection Management**
- **Backend**: Centralized ConnectionManager in `api/app.py`
- **Frontend**: `app/game/hooks/useWebSocket.js` manages connection lifecycle
- **URL Pattern**: `/ws/{room_id}?player_name={player_name}`

### **Atomic Event Publishing & Handling**
- **Event Structure**: `{event_type: string, data: object}`
- **Backend Validation**: All events validated before broadcasting in `websocket_events.py`
- **Frontend Routing**: Events routed to domain-specific handlers via event_type switch
- **Error Handling**: Malformed events logged and ignored, never crash the system

### **Event Types by Domain**
**Game Events**: `seat_change`, `dice_roll`, `combat_state`, `player_connection`, `system_message`, `role_change`
**Audio Events**: `remote_audio_play`, `remote_audio_resume`, `remote_audio_batch`

### **Audio Batch Processing System**
- **Atomic Operations**: Multiple track operations executed as single batch
- **Synchronized Playback**: Audio context timing ensures perfect sync across clients
- **Batch Structure**: 
  ```javascript
  {
    event_type: "remote_audio_batch",
    data: {
      operations: [
        {trackId: "audio_channel_A", operation: "play", filename: "boss.mp3", fade: true},
        {trackId: "audio_channel_B", operation: "stop", fade: true}
      ],
      fade_duration: 2000,
      triggered_by: "player_name"
    }
  }
  ```
- **Fade Transitions**: 60Hz requestAnimationFrame interpolation for smooth volume changes
- **Conflict Resolution**: New batch operations automatically cancel active fades
- **Validation**: Server validates all operations before broadcasting to prevent client desync

## Key Development Patterns

### UI Styling & Constants System
- **Always use tailwind css styles where possible**
- **CRITICAL**: Use `/rollplay/app/styles/constants.js` for all UI component styling
- **Single Source of Truth**: All colors, spacing, fonts controlled via constants.js

#### 4 Core Style Elements (MUST use these):
1. **PANEL_TITLE** / **DM_TITLE** / **MODERATOR_TITLE**
   - Main collapsible panel titles (e.g., "DM Command Center", "Moderator Controls")
   - Use: `className={DM_TITLE}` or `className={MODERATOR_TITLE}`

2. **PANEL_HEADER** / **DM_HEADER** / **MODERATOR_HEADER** 
   - Section headers within panels (e.g., "Map Controls", "Combat Management")
   - Use: `className={DM_HEADER}` or `className={MODERATOR_HEADER}`

3. **PANEL_SUB_HEADER** / **DM_SUB_HEADER** / **MODERATOR_SUB_HEADER**
   - Sub-section headers (e.g., "Attack Rolls", "Ability Checks")
   - Use: `className={DM_SUB_HEADER}` or `className={MODERATOR_SUB_HEADER}`

4. **PANEL_CHILD** / **DM_CHILD** / **MODERATOR_CHILD**
   - Interactive child elements (buttons, inputs, etc.)
   - Use: `className={DM_CHILD}` or `className={MODERATOR_CHILD}`
   - Variant: `PANEL_CHILD_LAST` for elements without bottom margin

#### When NOT to use core elements:
- Special UI elements with unique design purposes (e.g., combat toggles, dice modals)
- These can have hardcoded styles for their specific function
- But still prefer constants over inline hardcoded values when possible

#### Primary Color System:
- Theme controlled by `PRIMARY_COLOR` variable in constants.js
- Currently set to "sky" (blue theme)
- All core elements automatically inherit this color scheme
- Change `PRIMARY_COLOR` to instantly retheme entire application

#### Adding New Styles:
- Add new constants to constants.js rather than hardcoding in components
- Follow existing naming patterns (e.g., `MODAL_CONTAINER`, `COMBAT_TOGGLE_ACTIVE`)
- Import and use constants in components: `import { DM_TITLE } from '../styles/constants'`

### License Headers
- All new source files must include GPL-3.0 license headers
- JavaScript files: `/* Copyright (C) 2025 Matthew Davey */` and `/* SPDX-License-Identifier: GPL-3.0-or-later */`
- Python files: `# Copyright (C) 2025 Matthew Davey` and `# SPDX-License-Identifier: GPL-3.0-or-later`

### Adding New Game Features
1. Define WebSocket event type in `api/app.py` ConnectionManager
2. Add event handler in `gameservice.py` 
3. Update frontend WebSocket hook to handle new events
4. Create/update React components for UI
5. Test real-time synchronization across multiple clients

### Database Operations
- Adventure logs use MongoDB aggregation for efficient querying
- Session data includes party configuration and seat layouts
- All game events are persisted with timestamps and metadata

## Docker Services
- **rollplay**: Next.js frontend application
- **api**: FastAPI backend with WebSocket support  
- **mongodb**: Database with initialization scripts
- **nginx**: Reverse proxy with SSL termination
- **certbot-renewer**: Automated SSL certificate renewal (production)

## Current Branch Context
- **Main branch**: `main` (use for PRs)
- **Feature branch**: `dice_rolls` (current active development)
- **Recent focus**: Dice rolling UI improvements and DM control center enhancements