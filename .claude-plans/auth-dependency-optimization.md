# Plan: Auth Dependency Optimization

## Problem Summary

Two glaring issues in `get_current_user_from_token`:

1. **Campaign repo injected on every auth check** - Only used for demo campaign creation on new users (<0.1% of requests)
2. **Full UserAggregate loaded on every request** - Many endpoints only need `user.id` for authorization

## Current State

**[auth.py:20-24](api-site/shared/dependencies/auth.py#L20-L24):**
```python
async def get_current_user_from_token(
    request: Request,
    user_repo: UserRepository = Depends(user_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)  # ← PROBLEM
) -> UserAggregate:
```

**[auth.py:73](api-site/shared/dependencies/auth.py#L73):**
```python
command = GetOrCreateUser(user_repo, campaign_repo)  # Always get-or-create
```

**Key finding:** The `/login` and `/create` endpoints in [endpoints.py:75, 316](api-site/modules/user/api/endpoints.py) call `GetOrCreateUser(user_repo)` **without** campaign_repo - so demo campaigns aren't being created on those paths either!

The **only place** demo campaigns get created is in `get_current_user_from_token` - meaning new users get a demo campaign on their first authenticated request, not at registration.

---

## Phase 1: Remove campaign_repo from auth (Quick Win)

### Changes

**1. Update `get_current_user_from_token` in [auth.py](api-site/shared/dependencies/auth.py):**

```python
from modules.user.application.queries import GetUserByEmail

async def get_current_user_from_token(
    request: Request,
    user_repo: UserRepository = Depends(user_repository)
) -> UserAggregate:
    # ... token extraction and validation unchanged ...

    query = GetUserByEmail(user_repo)
    user = query.execute(email)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found - please complete registration"
        )

    return user
```

**2. Move demo campaign creation to `/login` endpoint:**

Update [endpoints.py:75](api-site/modules/user/api/endpoints.py#L75) to include campaign_repo:

```python
@router.post("/login", response_model=UserLoginResponse)
async def login_user(
    request: UserEmailRequest,
    user_repo: UserRepository = Depends(user_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)  # ADD
):
    command = GetOrCreateUser(user_repo, campaign_repo)  # Pass campaign_repo
    user, created = command.execute(request.email)
    # ...
```

This keeps the demo campaign behavior but moves it to the explicit login flow.

**3. Remove unused imports from auth.py:**
- `from modules.campaign.dependencies.providers import campaign_repository`
- `from modules.campaign.orm.campaign_repository import CampaignRepository`
- `from modules.user.application.commands import GetOrCreateUser`

**4. Add new import to auth.py:**
- `from modules.user.application.queries import GetUserByEmail`

---

## Files to Modify

| File | Change |
|------|--------|
| [auth.py](api-site/shared/dependencies/auth.py) | Remove campaign_repo, use GetUserByEmail query |
| [user/endpoints.py](api-site/modules/user/api/endpoints.py) | Add campaign_repo to `/login` endpoint |

---

## Phase 2: Lightweight auth for ID-only checks (Future - Not This PR)

For endpoints that only need `current_user.id`, add a lightweight dependency that doesn't hit the database.

**Deferred because:** Requires storing `user_id` in JWT claims, which means coordinating with api-auth.

---

## Verification

1. Run existing tests: `pytest api-site/`
2. Manual test login flow:
   - New user login → user created with demo campaign
   - Existing user login → returns existing user
3. Manual test authenticated endpoints:
   - With valid token → returns user data
   - With invalid/expired token → 401
   - With token for deleted user → 401 (new behavior, was auto-creating)

---

## Impact

**Removes:**
- Cross-aggregate coupling in auth layer
- Campaign repo instantiation on every authenticated request
- Implicit user creation during auth (now explicit at login)

**Preserves:**
- Demo campaign creation for new users (moved to login endpoint)
- All existing endpoint behavior for normal flows

**Behavioral change:**
- If a user is deleted but still has a valid JWT, they'll get 401 instead of being re-created
- This is actually **correct behavior** - a deleted user shouldn't auto-resurrect
