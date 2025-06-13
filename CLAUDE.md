# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rollplay is a virtual D&D/tabletop gaming platform called "Tabletop Tavern" that enables real-time multiplayer dice rolling and campaign management. The application supports room creation, party management, DM tools, initiative tracking, and comprehensive adventure logging.

## Architecture

### Frontend (Next.js 13)
- **Location**: `/rollplay/` directory
- **Framework**: Next.js 13 with App Router, TailwindCSS
- **Key Pages**: 
  - `app/page.js` - Landing page for room creation/joining
  - `app/game/page.js` - Main game interface
- **WebSocket Integration**: `app/hooks/useWebSocket.js` handles real-time communication
- **Components**: Modular design in `app/components/` (dice panels, chat, DM controls, initiative tracker)

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

## WebSocket Architecture

- **Connection Management**: Centralized ConnectionManager in `api/app.py`
- **Event Types**: seat_change, dice_roll, combat_state, player_connection, system_message
- **Broadcasting**: All connected clients receive real-time updates
- **Frontend Hook**: `useWebSocket.js` manages connection lifecycle and event handling

## Key Development Patterns
### Styling
- Always use tailwind css styles where possible

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