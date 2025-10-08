# PostgreSQL User System Architecture Plan

## Overview
Transition from anonymous game sessions to persistent user accounts with PostgreSQL storage. Users authenticate via email (OTP/Magic Link) and are identified by their email address as UUID.

## Database Architecture

### Database Separation
- **PostgreSQL**: User accounts, characters, persistent game data
- **MongoDB**: Active game sessions, real-time state, adventure logs

### Core Models

#### User Model
```python
class User(Base):
    __tablename__ = "users"
    
    email = Column(String, primary_key=True)  # Email as UUID
    screen_name = Column(String, nullable=False, unique=True)  # Unique display name
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime)
    auth_method = Column(String)  # 'magic_link' or 'otp'
    
    # Relationships
    characters = relationship("Character", back_populates="user")
    dm_games = relationship("Game", back_populates="dm")
```

#### Character Model
```python
class Character(Base):
    __tablename__ = "characters"
    
    id = Column(UUID, primary_key=True, default=uuid4)
    user_email = Column(String, ForeignKey("users.email"))
    name = Column(String, nullable=False)
    character_class = Column(String)
    level = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_deleted = Column(Boolean, default=False)  # Soft delete flag
    
    # Character sheet data (JSON for flexibility)
    stats = Column(JSON)  # HP, AC, abilities, etc.
    
    # Relationships
    user = relationship("User", back_populates="characters")
    game_participations = relationship("GamePlayer", back_populates="character")
```

#### Game Model
```python
class Game(Base):
    __tablename__ = "games"
    
    id = Column(UUID, primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    dm_email = Column(String, ForeignKey("users.email"))
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")  # active, paused, completed
    
    # Game settings
    max_players = Column(Integer, default=6)
    description = Column(Text)
    
    # Relationships
    dm = relationship("User", foreign_keys=[dm_email])
    players = relationship("GamePlayer", back_populates="game")
```

#### GamePlayer Model (Junction Table)
```python
class GamePlayer(Base):
    __tablename__ = "game_players"
    
    id = Column(UUID, primary_key=True, default=uuid4)
    game_id = Column(UUID, ForeignKey("games.id"))
    character_id = Column(UUID, ForeignKey("characters.id"))
    joined_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)  # For leaving/rejoining games
    
    # Relationships
    game = relationship("Game", back_populates="players")
    character = relationship("Character", back_populates="game_participations")
```

## Authentication Flow Integration

### Current Flow
1. User visits `/auth/magic` or `/auth/verify`
2. OTP/Magic Link authentication
3. Redirect to dashboard

### New Flow
1. User visits `/auth/magic` or `/auth/verify`
2. OTP/Magic Link authentication
3. **NEW**: Check if user exists in PostgreSQL by email
4. **NEW**: If new user, create User record with email + screen_name prompt
5. **NEW**: Set user session/context
6. Redirect to dashboard (now personalized)

### Implementation Points
- Add user check/creation in `/auth/verify/page.js`
- Create API endpoints: `POST /api/users/check`, `POST /api/users/create`
- Add PostgreSQL connection to FastAPI backend
- Create SQLAlchemy models in new `/api/models/` directory

## Database Connection Setup

### Docker Compose Addition
```yaml
postgres:
  image: postgres:15
  environment:
    POSTGRES_DB: rollplay_users
    POSTGRES_USER: ${POSTGRES_USER}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  volumes:
    - postgres_data:/var/lib/postgresql/data
  ports:
    - "5432:5432"
  networks:
    - rollplay_network
```

### Nginx Configuration
PostgreSQL will be accessible to both api-game and api-site services via Docker networking. No direct external access needed through nginx - only HTTP API endpoints will be exposed.

```nginx
# PostgreSQL accessible internally at: postgres:5432
# Both API services can connect via: 
# DATABASE_URL=postgresql://user:pass@postgres:5432/rollplay_users
```

### Environment Variables
```env
POSTGRES_USER=rollplay_user
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=rollplay_users
DATABASE_URL=postgresql://rollplay_user:secure_password@postgres:5432/rollplay_users
```

## API Endpoints to Create

### User Management
- `GET /api/users/me` - Get current user profile
- `POST /api/users/check` - Check if user exists by email
- `POST /api/users/create` - Create new user account
- `PUT /api/users/me` - Update user profile

### Character Management
- `GET /api/users/me/characters` - Get user's characters
- `POST /api/users/me/characters` - Create new character
- `PUT /api/characters/{id}` - Update character
- `DELETE /api/characters/{id}` - Delete character

### Game Management
- `GET /api/games` - List user's games
- `POST /api/games` - Create new game (DM only)
- `GET /api/games/{id}` - Get game details
- `POST /api/games/{id}/join` - Join game with character

## Data Flow Between Systems

### Session Creation (MongoDB)
When user joins active game:
1. Query PostgreSQL for user's character in this game
2. Create MongoDB `active_session` entry with character data
3. Real-time game state uses MongoDB as usual

### Session Persistence (PostgreSQL)
When game ends or user leaves:
1. Update character stats/progress in PostgreSQL
2. Clean up MongoDB `active_session` data
3. Maintain game membership records

## Alembic Migration Setup

### Initial Setup
```bash
# In api/ directory
pip install alembic
alembic init alembic
```

### Configure alembic.ini
```ini
# alembic.ini
sqlalchemy.url = postgresql://%(POSTGRES_USER)s:%(POSTGRES_PASSWORD)s@postgres:5432/rollplay_users
```

### Initial Migration
```bash
# Generate initial migration
alembic revision --autogenerate -m "initial tables"

# Apply migration
alembic upgrade head
```

### Migration Structure
```
api/
├── alembic/
│   ├── versions/
│   │   └── 001_initial_tables.py
│   └── env.py
├── models/
│   ├── __init__.py
│   ├── user.py
│   ├── character.py
│   ├── game.py
│   └── game_player.py
└── alembic.ini
```

## Migration Strategy

### Phase 1: Core Infrastructure
- Add PostgreSQL to Docker setup
- Create SQLAlchemy models and database connection
- Set up Alembic for database migrations
- Add basic user creation API endpoints

### Phase 2: Authentication Integration
- Modify auth flow to check/create users
- Add user session management
- Create basic dashboard with user profile

### Phase 3: Character & Game Management
- Add character creation/management UI
- Implement game creation and joining
- Connect to existing game session system

## Questions to Resolve

1. **Screen Name**: Should this be unique across platform, or just display name?
2. **Character Deletion**: Soft delete or hard delete? Impact on game history?
3. **Game Archival**: How long to keep completed games? Export features?
4. **Session Management**: JWT tokens, or session cookies for user authentication?
5. **Character Sharing**: Can characters be used across multiple games?