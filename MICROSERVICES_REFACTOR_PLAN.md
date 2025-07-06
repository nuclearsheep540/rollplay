# Microservices Refactoring Plan

## Overview
This document outlines the comprehensive refactoring plan to transform Rollplay from a monolithic architecture to a microservices-based architecture with clear separation of concerns.

## Current Architecture vs Target Architecture

### Current State
- **Backend**: Single `api/` directory (deleted, moved to `api-game/` and `api-site/`)
- **Frontend**: Single NextJS app in `rollplay/` serving all functionality
- **Database**: Single MongoDB instance for all data

### Target Architecture
- **Backend**: Three separate FastAPI services
- **Frontend**: Two separate NextJS applications
- **Database**: MongoDB for game data, PostgreSQL for user/auth data

## 🏗️ Service Architecture

### Backend Services

#### 1. api-auth (Port 8083)
**Purpose**: Centralized authentication and user management
**Database**: PostgreSQL (db-core)
**Responsibilities**:
- Passwordless authentication (magic links)
- JWT issuance and validation
- User profile management
- Email sending for auth
- Session management

**Key Endpoints**:
```
POST /auth/login-request    # Initiate passwordless login
GET  /auth/verify/{token}   # Verify magic link
POST /auth/logout           # Invalidate session
GET  /auth/validate         # Validate JWT (for other services)
GET  /auth/profile          # User profile data
PUT  /auth/profile          # Update user profile
```

#### 2. api-game (Port 8081) - EXISTS
**Purpose**: Real-time game sessions and WebSocket management
**Database**: MongoDB (db-game)
**Responsibilities**:
- Room creation and management
- WebSocket connections
- Adventure logging
- Map management
- Dice rolling and game state

**Key Endpoints**: (Already implemented)
```
POST /game/                 # Create room
GET  /game/{room_id}        # Get room info
PUT  /game/{room_id}/seats  # Update seats
WebSocket /ws/{room_id}     # Game WebSocket
```

#### 3. api-site (Port 8082) - EXISTS
**Purpose**: Site-wide functionality and landing page
**Database**: PostgreSQL (db-core) via api-auth
**Responsibilities**:
- Landing page API support
- Health checks
- Non-game related functionality

**Key Endpoints**: (Simplified - removed mock room creation)
```
GET /health                 # Health check
GET /                       # Root endpoint
```

### Frontend Applications

#### 1. app-site (Port 3000)
**Purpose**: Landing page, authentication, and pre-game functionality
**Routes**: 
- `/` - Landing page (room creation/joining)
- `/auth/*` - Authentication pages
- `/profile` - User profile
- `/lobby` - Pre-game lobby

**Components**:
- Landing page with room creation form
- Authentication UI (passwordless login)
- User profile management
- Room browser/selector

#### 2. app-game (Port 3001)
**Purpose**: Real-time game interface
**Routes**:
- `/game` - Main game interface
- `/game/*` - Game-related pages

**Components**: (Move from existing rollplay/app/)
- `audio_management/` - Audio controls and WebSocket events
- `game/` - Game components (DMControlCenter, PlayerCard, etc.)
- `map_management/` - Map display and editing
- All game-specific hooks and utilities

### Database Architecture

#### 1. db-game (MongoDB)
**Purpose**: Transient game session data
**Collections**:
- `active_sessions` - Game rooms and seat layouts
- `adventure_logs` - Game events and chat logs
- `maps` - Active map configurations

#### 2. db-core (PostgreSQL)
**Purpose**: Persistent user and application data
**Tables**:
- `users` - User profiles and authentication
- `game_history` - Completed game sessions
- `user_preferences` - Settings and configurations

## 🔄 Routing Strategy

### Nginx Configuration
```nginx
# Auth service
location /auth/ {
    proxy_pass http://api-auth:8083/;
}

# Game service  
location /api/game/ {
    proxy_pass http://api-game:8081/game/;
}

# Site service
location /api/ {
    proxy_pass http://api-site:8082/;
}

# Frontend routing
location /game/ {
    proxy_pass http://app-game:3001/;
}

location / {
    proxy_pass http://app-site:3000/;
}
```

## 🚀 Implementation Plan

### Phase 1: Authentication Service (HIGH PRIORITY)
- [ ] Create `api-auth/` directory structure
- [ ] Implement passwordless authentication flow
- [ ] Set up PostgreSQL connection
- [ ] Create JWT utilities
- [ ] Add email sending capability
- [ ] Update docker-compose for auth service

### Phase 2: Frontend Separation (MEDIUM PRIORITY)
- [ ] Create `app-site/` directory structure
- [ ] Create `app-game/` directory structure
- [ ] Move game-specific components to app-game
- [ ] Move site-specific components to app-site
- [ ] Update build configurations
- [ ] Configure Docker multi-stage builds

### Phase 3: Infrastructure Updates (MEDIUM PRIORITY)
- [ ] Update nginx routing configuration
- [ ] Configure health checks for all services
- [ ] Update docker-compose files
- [ ] Set up environment variables
- [ ] Configure service discovery

### Phase 4: Integration & Testing (LOW PRIORITY)
- [ ] Implement auth service integration
- [ ] Update frontend apps to use auth service
- [ ] Test passwordless login flow
- [ ] Verify game authentication
- [ ] End-to-end testing

## 📁 Directory Structure

### Target File Structure
```
/rollplay/
├── api-auth/                    # Authentication service
│   ├── __init__.py
│   ├── app.py                   # FastAPI app
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── passwordless.py      # Magic link logic
│   │   ├── jwt_handler.py       # JWT utilities
│   │   └── email_service.py     # Email sending
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py              # User models
│   │   └── session.py           # Session models
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings.py          # Auth settings
│   │   └── database.py          # PostgreSQL config
│   ├── requirements.txt
│   └── Dockerfile
│
├── api-game/                    # Game service (EXISTS)
│   ├── [existing structure]
│
├── api-site/                    # Site service (EXISTS)
│   ├── [existing structure]
│
├── app-site/                    # Site frontend
│   ├── app/
│   │   ├── page.js              # Landing page
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   └── verify/
│   │   ├── profile/
│   │   └── layout.js
│   ├── components/
│   │   ├── LandingPage.js
│   │   ├── AuthForm.js
│   │   └── RoomSelector.js
│   ├── public/
│   │   └── assets/
│   ├── package.json
│   └── Dockerfile
│
├── app-game/                    # Game frontend  
│   ├── app/
│   │   ├── page.js              # Game interface
│   │   ├── audio_management/    # (moved from rollplay/app/)
│   │   ├── game/                # (moved from rollplay/app/)
│   │   ├── map_management/      # (moved from rollplay/app/)
│   │   └── layout.js
│   ├── public/
│   │   ├── audio/               # Game audio files
│   │   └── maps/                # Map images
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yml           # Production compose
├── docker-compose.dev.yml       # Development compose
└── rollplay-dataflow.png        # Architecture diagram
```

## 🔐 Authentication Flow

### Passwordless Login Process
1. User enters email on app-site landing page
2. app-site → POST /auth/login-request
3. api-auth generates magic link & sends email
4. User clicks magic link → GET /auth/verify/{token}
5. api-auth validates token → returns JWT
6. Redirect to app-site or app-game with JWT

### Inter-Service Authentication
- api-game validates JWTs via api-auth
- Shared JWT secret or public key validation
- Middleware for protected endpoints

## 🐳 Docker Configuration

### Multi-Stage Build Strategy
```dockerfile
# Base stage for all Node.js apps
FROM node:18-alpine AS base
WORKDIR /app

# Site app build
FROM base AS site-build
COPY app-site/package*.json ./
RUN npm ci
COPY app-site/ ./
RUN npm run build

# Game app build
FROM base AS game-build
COPY app-game/package*.json ./
RUN npm ci
COPY app-game/ ./
RUN npm run build

# Production images
FROM node:18-alpine AS app-site
COPY --from=site-build /app/.next ./
EXPOSE 3000
CMD ["npm", "start"]

FROM node:18-alpine AS app-game
COPY --from=game-build /app/.next ./
EXPOSE 3001
CMD ["npm", "start"]
```

## 🎯 Benefits of This Architecture

### Performance
- Faster landing page loads (no game assets)
- Dedicated resources per service
- Better caching strategies

### Scalability
- Scale game and site services independently
- Dedicated databases for different data types
- Microservice deployment flexibility

### Maintainability
- Clear separation of concerns
- Independent development and deployment
- Easier debugging and monitoring

### Security
- Centralized authentication logic
- JWT-based stateless authentication
- Service-specific security policies

## 🔧 Development Workflow

### Local Development
```bash
# Start all services
docker-compose -f docker-compose.dev.yml up

# Individual service development
cd api-auth && python app.py      # Auth service
cd app-site && npm run dev         # Site frontend
cd app-game && npm run dev         # Game frontend
```

### Service Communication
- app-site ↔ api-auth (authentication)
- app-site ↔ api-site (site functionality)
- app-game ↔ api-game (game functionality)
- app-game ↔ api-auth (JWT validation)

## 📋 Migration Checklist

### Before Starting
- [ ] Backup current working code
- [ ] Document current functionality
- [ ] Set up feature branch for refactoring

### During Implementation
- [ ] Test each service independently
- [ ] Verify inter-service communication
- [ ] Check routing configurations
- [ ] Validate authentication flow

### After Implementation
- [ ] End-to-end testing
- [ ] Performance benchmarking
- [ ] Security audit
- [ ] Update documentation

## 🚨 Risks & Mitigation

### Potential Issues
- **Increased complexity**: More services to manage
- **Network latency**: Inter-service communication
- **Development overhead**: Multiple codebases

### Mitigation Strategies
- Start with minimal viable services
- Use health checks and monitoring
- Maintain clear service boundaries
- Document inter-service contracts

## 🎖️ Success Criteria

### Technical Goals
- [ ] All services running independently
- [ ] Passwordless authentication working
- [ ] Game functionality preserved
- [ ] Performance maintained or improved

### Business Goals
- [ ] Faster user onboarding
- [ ] Better scalability
- [ ] Easier feature development
- [ ] Improved security posture

---

*This refactoring plan is a living document and will be updated as implementation progresses.*