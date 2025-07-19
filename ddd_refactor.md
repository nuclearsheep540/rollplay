# DDD Refactor Plan - Domain-Driven Design Implementation

## Current Architecture Issues
- **API > Command > "Service"** (incorrectly named - these are actually repositories)
- Business logic scattered across multiple layers
- Domain rules mixed with data access logic
- No proper aggregate boundaries or invariants

## Target Architecture
**API > Command > Aggregate > Repository**

## Phase 1: User Aggregate Implementation

### Directory Structure
```
api-site/
├── api/                       # FastAPI route handlers
│   ├── users.py
│   └── schemas/               # Pydantic request/response models
│       └── user_schemas.py    # UserResponse, UserRequest, etc.
├── application/               # Orchestrates commands and use cases
│   └── commands/
│       └── user_commands.py
├── domain/                    # Pure business logic, aggregates and policies
│   ├── aggregates/
│   │   └── user_aggregate.py
│   └── services/
│       └── user_policies.py   # Domain policies and rules
├── adapters/                  # External integrations (renamed from "infrastructure")
│   ├── repositories/
│   │   └── user_repository.py # Uses mappers, implements repository interface
│   ├── mappers/
│   │   └── user_mapper.py     # Contains to_domain / from_domain functions
│   └── db/
│       └── session.py         # Database connection + get_db()
├── dependencies/              # FastAPI DI definitions
│   ├── repositories.py        # Dependency Injection
│   └── auth.py                # Authentication Injection (from JWT)
├── orm/                       # Raw SQLAlchemy models
│   └── user_model.py
├── services/                  # EXISTING - Will be removed/renamed
└── models/                    # EXISTING - Will be removed/renamed
```

### Core Principles
1. **Aggregates**: Business rules and invariants only
2. **Commands**: Orchestration without business logic  
3. **Repositories**: Data access abstraction with DTOs
4. **No Domain Services**: Everything orchestrated from commands
5. **Clean Boundaries**: No ORM leakage into domain layer

## Implementation Details

### 1. UserAggregate (domain/aggregates/user_aggregate.py)
```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

@dataclass
class UserAggregate:
    id: Optional[UUID]
    email: str
    created_at: datetime
    last_login: Optional[datetime] = None
    
    @classmethod
    def create(cls, email: str) -> 'UserAggregate':
        """Create new user with business rules validation"""
        if "@" not in email:
            raise ValueError("Invalid email format")
        if len(email) > 254:  # RFC 5322 limit
            raise ValueError("Email too long")
        
        return cls(
            id=None,  # Set by repository after persistence
            email=email.lower().strip(),
            created_at=datetime.utcnow()
        )
    
    @classmethod
    def from_persistence(cls, id: UUID, email: str, created_at: datetime, 
                        last_login: Optional[datetime] = None) -> 'UserAggregate':
        """Reconstruct from persistence layer"""
        return cls(
            id=id,
            email=email,
            created_at=created_at,
            last_login=last_login
        )
    
    def record_login(self) -> None:
        """Business rule: update last login timestamp"""
        self.last_login = datetime.utcnow()
    
    def to_dict(self) -> dict:
        """Serialization helper"""
        return {
            'id': str(self.id) if self.id else None,
            'email': self.email,
            'created_at': self.created_at.isoformat(),
            'last_login': self.last_login.isoformat() if self.last_login else None
        }
```

### 2. UserMapper (adapters/mappers/user_mapper.py)
```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from orm.user_model import User as UserModel
from domain.aggregates.user_aggregate import UserAggregate

def to_domain(model: UserModel) -> UserAggregate:
    """Convert ORM model to domain aggregate"""
    return UserAggregate.from_persistence(
        id=model.id,
        email=model.email,
        created_at=model.created_at,
        last_login=model.last_login
    )

def from_domain(aggregate: UserAggregate) -> UserModel:
    """Convert domain aggregate to ORM model"""
    return UserModel(
        id=aggregate.id,
        email=aggregate.email,
        created_at=aggregate.created_at,
        last_login=aggregate.last_login
    )

def update_model_from_domain(model: UserModel, aggregate: UserAggregate) -> None:
    """Update existing model from aggregate"""
    model.email = aggregate.email
    model.last_login = aggregate.last_login
    # Note: Don't update created_at or id
```

### 3. UserRepository (adapters/repositories/user_repository.py)
```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from orm.user_model import User as UserModel
from domain.aggregates.user_aggregate import UserAggregate
from adapters.mappers.user_mapper import to_domain, from_domain, update_model_from_domain

class UserRepository:
    def __init__(self, db_session: Session):
        self.db = db_session
    
    def get_by_id(self, user_id: UUID) -> Optional[UserAggregate]:
        model = self.db.query(UserModel).filter_by(id=user_id).first()
        if not model:
            return None
        return to_domain(model)
    
    def get_by_email(self, email: str) -> Optional[UserAggregate]:
        model = self.db.query(UserModel).filter_by(email=email.lower().strip()).first()
        if not model:
            return None
        return to_domain(model)
    
    def save(self, aggregate: UserAggregate) -> UUID:
        if aggregate.id:
            # Update existing
            model = self.db.query(UserModel).filter_by(id=aggregate.id).first()
            if not model:
                raise ValueError(f"User {aggregate.id} not found")
            update_model_from_domain(model, aggregate)
        else:
            # Create new
            model = from_domain(aggregate)
            self.db.add(model)
        
        self.db.commit()
        self.db.refresh(model)
        aggregate.id = model.id  # Update aggregate with persisted ID
        return model.id
```

### 4. API Schemas (api/schemas/user_schemas.py)
```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    created_at: datetime
    last_login: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class UserCreateRequest(BaseModel):
    email: EmailStr
```

### 5. Dependency Injection (dependencies/repositories.py)
```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session
from adapters.db.session import get_db
from adapters.repositories.user_repository import UserRepository

def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)
```

### 6. Authentication DTO (dependencies/auth.py)
```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass
from typing import List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
import jwt

@dataclass
class AuthenticatedUser:
    user_id: str
    email: str
    roles: List[str] = None
    
    def __post_init__(self):
        if self.roles is None:
            self.roles = []

security = HTTPBearer()

async def verify_jwt_token(token: str = Depends(security)) -> AuthenticatedUser:
    """Extract user identity from JWT at API boundary"""
    try:
        # Decode JWT and extract claims
        payload = jwt.decode(token.credentials, "your-secret", algorithms=["HS256"])
        return AuthenticatedUser(
            user_id=payload.get("user_id"),
            email=payload.get("email"),
            roles=payload.get("roles", [])
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
```

### 7. Updated Command (application/commands/user_commands.py)
```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Tuple
from adapters.repositories.user_repository import UserRepository
from domain.aggregates.user_aggregate import UserAggregate

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
        user_id = self.repository.save(new_user)
        return new_user, True

class UpdateUserLogin:
    def __init__(self, repository: UserRepository):
        self.repository = repository
    
    def execute(self, user_id: str) -> UserAggregate:
        """Record user login timestamp"""
        user = self.repository.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        
        user.record_login()  # Business logic in aggregate
        self.repository.save(user)
        return user
```

### 8. API Routes (api/users.py)
```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends
from dependencies.repositories import get_user_repository
from dependencies.auth import verify_jwt_token, AuthenticatedUser
from adapters.repositories.user_repository import UserRepository
from application.commands.user_commands import GetOrCreateUser, UpdateUserLogin
from api.schemas.user_schemas import UserResponse

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/me", response_model=UserResponse)
async def get_current_user(
    auth_user: AuthenticatedUser = Depends(verify_jwt_token),
    user_repo: UserRepository = Depends(get_user_repository)
):
    command = GetOrCreateUser(user_repo)
    user, created = command.execute(auth_user.email)
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        created_at=user.created_at,
        last_login=user.last_login
    )

@router.post("/login", response_model=UserResponse)
async def record_login(
    auth_user: AuthenticatedUser = Depends(verify_jwt_token),
    user_repo: UserRepository = Depends(get_user_repository)
):
    command = UpdateUserLogin(user_repo)
    user = command.execute(auth_user.user_id)
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        created_at=user.created_at,
        last_login=user.last_login
    )
```

### 9. ORM Model (orm/user_model.py)
```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from uuid import uuid4
from orm.base import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
```

## Migration Strategy

### Phase 1: Foundation (This Step)
1. ✅ Create UserAggregate with business rules
2. ✅ Create UserRepository with DTOs  
3. ✅ Setup dependency injection
4. ✅ Update user commands to use aggregates
5. ✅ Replace user endpoints with new pattern
6. ❌ **Break existing user_service** - will be removed

### Phase 2: Campaign/Game (Future)
- You will implement Campaign and Game aggregates
- Game as entity within Campaign aggregate
- Reference users by ID only
- Domain services for cross-aggregate coordination

### Phase 3: ETL & Events (Future)
- Event-driven hot/cold migration with RabbitMQ
- Separate microservice for ETL operations
- Extract, Transform, Load pattern implementation

## Key Design Decisions

### Domain Invariants
- **User**: Email validation, format constraints
- **Campaign**: (Future) DM count = 1, max players ≤ 8  
- **Game**: (Future) Cannot exist without campaign

### Authentication
- JWT processed only at API boundary
- AuthenticatedUser DTO for clean domain input
- No auth logic in domain or command layers

### Data Flow
```
HTTP Request → JWT Verification → AuthenticatedUser DTO → 
Command → UserAggregate → UserRepository → Database
```

### No Domain Services
- All orchestration happens in commands
- Cross-aggregate coordination via repository calls
- Keep aggregates focused and independent

## Benefits of This Refactor
1. **Clear boundaries** between domain and infrastructure
2. **Testable business logic** in aggregates  
3. **Consistent patterns** across all features
4. **Future-ready** for event sourcing and microservices
5. **Proper DDD implementation** with correct terminology

## Breaking Changes
- `user_service.py` will be removed
- All user-related imports need updating  
- API responses may change structure
- JWT handling moved to API boundary only