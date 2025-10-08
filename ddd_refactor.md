# DDD Refactor Plan - Aggregate-Centric Modules Implementation

## Current Architecture Issues
- **Onion Architecture**: Horizontal layers create scattered features
- **Cross-cutting navigation**: Finding all Campaign code requires multiple directories
- **Weak feature ownership**: No clear module boundaries for teams
- **Mixed patterns**: Some DDD, some legacy service layer

## Target Architecture: Aggregate-Centric Modules
**Vertical slicing by domain/aggregate with DDD principles within each module**

### Core Principles
1. **Aggregate Independence**: No direct imports between aggregate modules
2. **Application Layer Orchestration**: Cross-aggregate coordination via command layer
3. **Repository Injection**: Multiple repositories injected for complex operations
4. **Vertical Cohesion**: All code for an aggregate lives in its module

## Phase 1: User Aggregate Implementation ✅ COMPLETE

### Backend Directory Structure (Aggregate-Centric)
```
api-site/
├── main.py                        # FastAPI app setup and include_router calls
├── routers.py                     # Maps routers from each aggregate
├── user/
│   ├── api/
│   │   └── endpoints.py           # FastAPI route handlers for user actions
│   ├── schemas/
│   │   └── user_schemas.py        # Pydantic models: UserRequest, UserResponse
│   ├── application/
│   │   └── commands.py            # GetOrCreateUser, UpdateUserLogin
│   ├── domain/
│   │   ├── aggregates.py          # UserAggregate
│   │   └── services.py            # Domain-specific auth logic (is_verified_user)
│   ├── adapters/
│   │   ├── repositories.py        # UserRepository (implements interface)
│   │   └── mappers.py             # user_mapper (to_domain / from_domain)
│   ├── orm/
│   │   └── user_model.py          # SQLAlchemy model for User
│   ├── dependencies/
│   │   └── repositories.py        # get_user_repository (module-specific DI)
│   └── tests/
│       └── test_user.py
├── campaign/
│   ├── api/
│   │   └── endpoints.py           # Campaign endpoints (create, list, start game)
│   ├── schemas/
│   │   └── campaign_schemas.py    # CampaignRequest, CampaignResponse
│   ├── application/
│   │   └── commands.py            # CreateCampaign, GetUserCampaigns
│   ├── domain/
│   │   ├── aggregates.py          # CampaignAggregate
│   │   └── services.py            # Campaign rules, visibility policies
│   ├── game/                      # Game ENTITY within Campaign aggregate
│   │   ├── domain/
│   │   │   └── entities.py        # GameEntity (not root), state transitions
│   │   ├── dependencies/
│   │   │   └── access.py          # Game participation checks (can_take_turn)
│   │   └── tests/
│   │       └── test_game_logic.py
│   ├── adapters/
│   │   ├── repositories.py        # CampaignRepository (includes Game persistence)
│   │   └── mappers.py             # campaign_mapper (includes Game mapping)
│   ├── orm/
│   │   ├── campaign_model.py      # Campaign SQLAlchemy model
│   │   └── game_model.py          # Game model (if persisted independently)
│   ├── dependencies/
│   │   ├── repositories.py        # campaign_repository
│   │   └── auth_checks.py         # Campaign role checks (is_dm, can_edit_campaign)
│   └── tests/
│       └── test_campaign_flow.py
├── shared/
│   ├── dependencies/
│   │   └── auth.py                # Token decoding, user resolution, session lifecycle
│   ├── db.py                      # get_db(), engine setup
│   ├── auth.py                    # JWT decoding utilities only (no DI logic)
│   └── config.py                  # App settings and env management
└── legacy/                        # OLD - Being migrated
    ├── services/                  # OLD service layer (being removed)
    ├── commands/                  # OLD commands (being moved to aggregates)
    └── models/                    # OLD models (moving to aggregate/orm/)
```

### Implementation Examples

#### 1. User Domain Aggregate
```python
# user/domain/aggregates.py
from datetime import datetime
from typing import Optional
import re

class UserAggregate:
    def __init__(self, id=None, email=None, created_at=None, last_login=None):
        self.id = id
        self.email = email
        self.created_at = created_at
        self.last_login = last_login
    
    @classmethod
    def create(cls, email: str):
        """Create new user with business rules validation"""
        normalized_email = email.lower().strip()
        
        if not cls._is_valid_email(normalized_email):
            raise ValueError("Invalid email format")
        if len(normalized_email) > 254:
            raise ValueError("Email too long")
            
        return cls(
            id=None,
            email=normalized_email,
            created_at=datetime.utcnow()
        )
    
    def record_login(self):
        """Business rule: update last login timestamp"""
        self.last_login = datetime.utcnow()
    
    @classmethod
    def _is_valid_email(cls, email):
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
```

#### 2. User Repository
```python
# user/adapters/repositories.py
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from user.model.user_model import User as UserModel
from user.domain.aggregates import UserAggregate
from user.adapters.mappers import to_domain, from_domain, update_model_from_domain

class UserRepository:
    def __init__(self, db_session: Session):
        self.db = db_session
    
    def get_by_id(self, user_id) -> Optional[UserAggregate]:
        model = self.db.query(UserModel).filter_by(id=user_id).first()
        return to_domain(model) if model else None
    
    def get_by_email(self, email: str) -> Optional[UserAggregate]:
        normalized_email = email.lower().strip()
        model = self.db.query(UserModel).filter_by(email=normalized_email).first()
        return to_domain(model) if model else None
    
    def save(self, aggregate: UserAggregate):
        if aggregate.id:
            # Update existing
            model = self.db.query(UserModel).filter_by(id=aggregate.id).first()
            update_model_from_domain(model, aggregate)
        else:
            # Create new
            model = from_domain(aggregate)
            self.db.add(model)
        
        self.db.commit()
        self.db.refresh(model)
        aggregate.id = model.id
        return model.id
```

#### 3. User Commands
```python
# user/application/commands.py
from typing import Tuple
from user.adapters.repositories import UserRepository
from user.domain.aggregates import UserAggregate

class GetOrCreateUser:
    def __init__(self, repository: UserRepository):
        self.repository = repository
    
    def execute(self, email: str) -> Tuple[UserAggregate, bool]:
        """Get existing user or create new one"""
        user = self.repository.get_by_email(email)
        if user:
            return user, False
        
        # Create new user through aggregate
        new_user = UserAggregate.create(email)
        self.repository.save(new_user)
        return new_user, True

class UpdateUserLogin:
    def __init__(self, repository: UserRepository):
        self.repository = repository
    
    def execute(self, user_id: str) -> UserAggregate:
        """Record user login timestamp"""
        user = self.repository.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        
        user.record_login()
        self.repository.save(user)
        return user
```

#### 4. User API Endpoints
```python
# user/api/endpoints.py
from fastapi import APIRouter, Depends, HTTPException, status
from user.schemas.user_schemas import UserLoginRequest, UserLoginResponse
from user.dependencies.repositories import get_user_repository
from user.adapters.repositories import UserRepository
from user.application.commands import GetOrCreateUser

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/login", response_model=UserLoginResponse)
async def login_user(
    request: UserLoginRequest,
    user_repo: UserRepository = Depends(get_user_repository)
):
    try:
        command = GetOrCreateUser(user_repo)
        user, created = command.execute(request.email)
        
        return UserLoginResponse(
            user=UserResponse.from_aggregate(user),
            created=created
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

#### 5. User Repository DI
```python
# user/dependencies/repositories.py
from fastapi import Depends
from sqlalchemy.orm import Session
from shared.db import get_db
from user.adapters.repositories import UserRepository

def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)
```

## Phase 2: Campaign Aggregate Implementation (Next)

### Cross-Aggregate Coordination Example
```python
# user/application/commands.py - User module orchestrates multiple aggregates
from user.adapters.repositories import UserRepository
from campaign.adapters.repositories import CampaignRepository

class GetUserDashboard:
    def __init__(self, user_repo: UserRepository, campaign_repo: CampaignRepository):
        self.user_repo = user_repo
        self.campaign_repo = campaign_repo
    
    def execute(self, user_id):
        # Orchestrate multiple aggregates without direct dependencies
        user = self.user_repo.get_by_id(user_id)
        campaigns = self.campaign_repo.get_by_dm_id(user_id)
        
        return {
            'user': user,
            'campaigns': campaigns,
            'total_campaigns': len(campaigns),
            'is_dm': len(campaigns) > 0
        }

# user/api/endpoints.py - Multiple repository injection
from user.dependencies.repositories import get_user_repository
from campaign.dependencies.repositories import campaign_repository

@router.get("/dashboard")
async def get_user_dashboard(
    user_repo: UserRepository = Depends(get_user_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    command = GetUserDashboard(user_repo, campaign_repo)
    return command.execute(current_user_id)
```

## Shared Infrastructure

### Authentication System
```python
# shared/dependencies/auth.py - Token decoding, user resolution, session lifecycle
from fastapi import Depends, HTTPException, Request, status
from shared.auth import JWTHelper
from user.adapters.repositories import UserRepository
from user.dependencies.repositories import get_user_repository

jwt_helper = JWTHelper()

async def get_current_user_from_token(
    request: Request,
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Extract JWT token, verify, and return UserAggregate"""
    token = jwt_helper.get_token_from_cookie(request)
    if not token:
        raise HTTPException(status_code=401, detail="No auth token")
    
    email = jwt_helper.verify_auth_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Get or create user through repository
    user = user_repo.get_by_email(email)
    if not user:
        # Could auto-create or raise error based on business rules
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

# shared/auth.py - JWT utilities only (no DI logic)
class JWTHelper:
    def verify_auth_token(self, token: str) -> Optional[str]:
        # JWT verification logic
        pass
    
    def get_token_from_cookie(self, request: Request) -> Optional[str]:
        # Cookie extraction logic
        pass
```

### Database Setup
```python
# shared/db.py - Database engine and session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine("postgresql://...")
SessionLocal = sessionmaker(bind=engine)

def get_db():
    """FastAPI dependency for database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Main App Setup
```python
# main.py
from fastapi import FastAPI
from user.api.endpoints import router as user_router
from campaign.api.endpoints import router as campaign_router

app = FastAPI()

app.include_router(user_router, prefix="/api")
app.include_router(campaign_router, prefix="/api")

# routers.py - Aggregate router mapping
def include_aggregate_routers(app: FastAPI):
    """Include all aggregate routers"""
    app.include_router(user_router, prefix="/api")
    app.include_router(campaign_router, prefix="/api")
```

## Migration Strategy

### Phase 1: ✅ User (Complete)
- [x] User aggregate with business rules
- [x] User repository with proper DI
- [x] User commands with repository injection
- [x] User API endpoints following pattern

### Phase 2: Campaign/Game (Next)
1. **Create Campaign Module**: `/campaign/` directory structure
2. **Campaign Aggregate**: Business rules for campaigns and games
3. **Game Entity**: Under Campaign aggregate (not root)
4. **Campaign Repository**: Handles both Campaign and Game persistence
5. **Cross-Aggregate Commands**: User dashboard, campaign ownership checks

### Phase 3: Legacy Cleanup
1. **Remove Legacy Commands**: Move logic to aggregate modules
2. **Remove Legacy Services**: Replace with repositories
3. **Update Main App**: Use aggregate routers only

## Key Design Decisions

### Aggregate Independence
- **No Direct Imports**: User module never imports Campaign module
- **Application Orchestration**: Cross-aggregate logic in command layer
- **Repository Injection**: Multiple repositories for complex operations

### Entity Relationships
- **Campaign**: Root aggregate (own module)
- **Game**: Entity within Campaign (under `/campaign/game/`)
- **User References**: By ID only, never direct object references

### Naming Conventions
- **Commands**: No "Command" suffix (GetOrCreateUser)
- **Modules**: Aggregate name (user/, campaign/)
- **Files**: Plural for containers (endpoints.py, commands.py)

### Vertical Cohesion Benefits
1. **Feature Teams**: Own entire aggregate module
2. **Easier Navigation**: All campaign code in `/campaign/`
3. **Testing**: Domain tests stay with domain
4. **Modular Growth**: Add aggregates without affecting others
5. **Clear Ownership**: Module boundaries define team responsibilities

This architecture gives us the best of both worlds: **DDD principles within modules** and **feature-focused organization** for team productivity.