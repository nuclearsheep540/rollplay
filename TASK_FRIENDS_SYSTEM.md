# Friends System Improvements

**Domain:** User Relationships & Friend Management
**Priority:** HIGH
**Estimated Total Time:** 3-4 days
**Status:** Not Started

---

## Overview

Improve the friends system to be more user-friendly by replacing technical UUIDs with friendly friend codes and enhancing the UI for better organization and usability.

---

## MEDIUM-3: Friends Invite UI Improvements

**Priority:** HIGH
**Complexity:** Medium
**Estimated Time:** 1 day
**Status:** Not Started

### Current Issues
- Campaign invite modal tries to cram too much information
- All friends shown in invite modal (can be overwhelming with many friends)
- No way to see recently active friends
- Modal should be quick-and-easy for inviting

### Design Philosophy
Keep the Campaign Invite Modal **lightweight and focused**:
- Show top 3 recently online friends (quick access)
- Add "See All Friends" button for comprehensive searchable modal
- Separate concerns: quick invite vs. full friend management

### Required Changes

#### 1. Update Backend - Add `last_login` to Friend Response

**Update:** `/home/matt/rollplay/api-site/modules/friendship/schemas/friendship_schemas.py`

```python
class FriendshipResponse(BaseModel):
    """Friendship response with last_login for sorting by recent activity"""
    id: UUID
    friend_id: UUID  # The OTHER user in the friendship (computed)
    friend_screen_name: Optional[str] = None
    last_login: Optional[datetime] = None  # NEW: for sorting by recent activity
    created_at: datetime
```

**Update:** `/home/matt/rollplay/api-site/modules/friendship/api/endpoints.py`

In `_to_friendship_response()` function (around line 38):
```python
def _to_friendship_response(
    friendship,
    current_user_id: UUID,
    user_repo: UserRepository
) -> FriendshipResponse:
    friend_user_id = friendship.get_other_user(current_user_id)
    friend_user = user_repo.get_by_id(friend_user_id)

    return FriendshipResponse(
        id=friendship.id,
        friend_id=friend_user_id,
        friend_screen_name=friend_user.screen_name if friend_user else None,
        last_login=friend_user.last_login if friend_user else None,  # NEW
        created_at=friendship.created_at
    )
```

#### 2. Update Campaign Invite Modal - Show Top 3 Recent Friends

**Update:** `/rollplay/app/dashboard/components/CampaignInviteModal.js`

Changes:
- Sort friends by `last_login` (most recent first)
- Show only top 3 friends in modal
- Add "See All Friends" button to open comprehensive modal
- Keep the modal lightweight and focused

**Mockup:**
```
┌──────────────────────────────────────────────┐
│ Invite Players to Campaign                  │
│ Campaign: "Lost Mines of Phandelver"        │
├──────────────────────────────────────────────┤
│ Quick Invite (Recently Online)              │
│ ┌──────────────────────────────────────────┐│
│ │ Alice        Last seen: 2 hours ago [✓] ││
│ │ Bob          Last seen: 1 day ago   [✓] ││
│ │ Charlie      Last seen: 3 days ago  [✓] ││
│ └──────────────────────────────────────────┘│
│ [See All Friends (12)]                       │
├──────────────────────────────────────────────┤
│ Or Invite by Friend Code                    │
│ ┌──────────────────────────────────────────┐│
│ │ Enter friend code (e.g., ABCD-1234)      ││
│ └──────────────────────────────────────────┘│
│ [Send Invite]                                │
└──────────────────────────────────────────────┘
```

Code structure:
```javascript
// Sort friends by last_login (most recent first)
const sortedFriends = [...friends].sort((a, b) => {
  if (!a.last_login) return 1
  if (!b.last_login) return -1
  return new Date(b.last_login) - new Date(a.last_login)
})

// Show top 3 recent friends
const recentFriends = sortedFriends.slice(0, 3)

// Add "See All Friends" button
const handleSeeAllFriends = () => {
  // Open comprehensive friend selection modal
  setShowAllFriendsModal(true)
}
```

**Helper function for "last seen" text:**
```javascript
const getLastSeenText = (lastLogin) => {
  if (!lastLogin) return 'Never'

  const now = new Date()
  const login = new Date(lastLogin)
  const diffMs = now - login
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return `${Math.floor(diffDays / 30)} months ago`
}
```

#### 3. Create Comprehensive Friend Selection Modal

**Create:** `/rollplay/app/dashboard/components/AllFriendsModal.js`

This modal is shown when user clicks "See All Friends":
- Searchable list of ALL friends
- Scrollable (handles 50+ friends)
- Filter by name
- Shows last_login for all friends
- Allows multi-select or single-select for invites

**Features:**
- Search bar at top
- Scrollable list with `max-h-96 overflow-y-auto`
- Checkbox or invite button per friend
- Shows online status / last seen
- "Close" or "Invite Selected" button

**Mockup:**
```
┌─────────────────────────────────────────────┐
│ Select Friends to Invite                   │
├─────────────────────────────────────────────┤
│ Search: [________________] 🔍              │
├─────────────────────────────────────────────┤
│ ┌───────────────────────────────────────┐ │ ← Scrollable
│ │ Alice (2 hours ago)          [Invite] │ │
│ │ Bob (1 day ago)              [Invite] │ │
│ │ Charlie (3 days ago)         [Invite] │ │
│ │ Dave (1 week ago)            [Invite] │ │
│ │ Eve (2 weeks ago)            [Invite] │ │
│ │ Frank (1 month ago)          [Invite] │ │
│ │ ... (scrollable)                       │ │
│ └───────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ [Close]                                     │
└─────────────────────────────────────────────┘
```

### Files Involved

**Backend:**
- Update: `/rollplay/api-site/modules/friendship/schemas/friendship_schemas.py`
- Update: `/rollplay/api-site/modules/friendship/api/endpoints.py`

**Frontend:**
- Update: `/rollplay/app/dashboard/components/CampaignInviteModal.js`
- Create: `/rollplay/app/dashboard/components/AllFriendsModal.js`
- Optional: Create utility `/rollplay/app/shared/utils/timeUtils.js` (for last seen text)

### Implementation Plan

#### Step 1: Backend Changes (30 minutes)
1. Add `last_login` field to `FriendshipResponse` schema
2. Update `_to_friendship_response()` to include `last_login`
3. Test `/api/friends/` endpoint returns `last_login`

#### Step 2: Update Campaign Invite Modal (2-3 hours)
1. Sort friends by `last_login` descending
2. Slice to top 3 friends
3. Add "See All Friends" button
4. Add `getLastSeenText()` helper
5. Display "Last seen: X ago" for each friend

#### Step 3: Create AllFriendsModal (2-3 hours)
1. Create new modal component
2. Add search functionality
3. Add scrollable friend list
4. Add invite button per friend
5. Wire up state management

### Styling
- Use existing modal styles from `CampaignInviteModal`
- Use `PANEL_HEADER` for section titles
- Use `PANEL_CHILD` for friend list items
- Consistent with `/rollplay/app/styles/constants.js`

### Testing Requirements
- [ ] Backend returns `last_login` in friend list
- [ ] Friends sorted by most recent login
- [ ] Top 3 friends displayed correctly
- [ ] "See All Friends" button opens modal
- [ ] Search filters friends correctly
- [ ] Scrolling works with 50+ friends
- [ ] Last seen text displays correctly
- [ ] Invites work from both modals

---

## MEDIUM-4: Shorten UUID to Friendly Friend Code

**Priority:** HIGH
**Complexity:** Medium
**Estimated Time:** 1-2 days
**Status:** Not Started

### Current Issue
- Full UUID (36 characters) displayed as "friend code"
- Not user-friendly: `550e8400-e29b-41d4-a716-446655440000`
- Hard to type, share, or remember
- Users expect short codes like Discord (`User#1234`)

### Proposed Solution
Generate 8-12 character alphanumeric "friend code" for each user.

**Example Formats:**
- `TB4K-2X9P` (8 chars with dash)
- `MATT-1234` (username + number)
- `ABCD1234` (8 chars no separator)

### Required Changes

#### 1. Create Friend Code Database Table

**New Migration:** `006_add_friend_codes.py`

```python
def upgrade():
    op.create_table('friend_codes',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('friend_code', sa.String(12), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('user_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('friend_code', name='unique_friend_code')
    )
    op.create_index('idx_friend_code', 'friend_codes', ['friend_code'])
```

#### 2. Generate Friend Code on User Creation

**Update:** `/api-site/modules/user/domain/user_aggregate.py`

```python
import random
import string

class UserAggregate:
    def __init__(self, ..., friend_code: Optional[str] = None):
        self.friend_code = friend_code or self._generate_friend_code()

    @staticmethod
    def _generate_friend_code() -> str:
        """Generate 8-character friend code: 4 letters + 4 numbers"""
        letters = ''.join(random.choices(string.ascii_uppercase, k=4))
        numbers = ''.join(random.choices(string.digits, k=4))
        return f"{letters}-{numbers}"  # e.g., "ABCD-1234"
```

**Add collision check in repository:**
```python
def save(self, aggregate: UserAggregate) -> UUID:
    # Check for friend code collision (unlikely but possible)
    max_attempts = 10
    for attempt in range(max_attempts):
        try:
            # Save user with generated friend code
            break
        except IntegrityError:
            # Collision detected, regenerate
            aggregate.friend_code = aggregate._generate_friend_code()
    else:
        raise ValueError("Failed to generate unique friend code")
```

#### 3. Migrate Existing Users

**Data Migration Script:**
```python
def upgrade():
    # Generate friend codes for all existing users
    conn = op.get_bind()
    users = conn.execute("SELECT id FROM users").fetchall()

    for user_id in users:
        code = generate_unique_code(conn)
        conn.execute(
            "INSERT INTO friend_codes (user_id, friend_code) VALUES (:user_id, :code)",
            {"user_id": user_id, "code": code}
        )
```

#### 4. Add API Endpoint

**Update:** `/api-site/modules/user/api/endpoints.py`

```python
@router.get("/by-friend-code/{code}")
async def get_user_by_friend_code(
    code: str,
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Lookup user by friend code (case-insensitive)"""
    code_upper = code.upper().strip()
    user = user_repo.get_by_friend_code(code_upper)
    if not user:
        raise HTTPException(status_code=404, detail="Friend code not found")

    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "friend_code": user.friend_code
    }
```

#### 5. Update Repository

**Update:** `/api-site/modules/user/repositories/user_repository.py`

```python
def get_by_friend_code(self, friend_code: str) -> Optional[UserAggregate]:
    """Get user by friend code (case-insensitive)"""
    result = self.db.execute(
        text("SELECT user_id FROM friend_codes WHERE UPPER(friend_code) = UPPER(:code)"),
        {"code": friend_code}
    ).fetchone()

    if not result:
        return None

    return self.get_by_id(result[0])
```

#### 6. Update Frontend

**Update:** `/rollplay/app/dashboard/components/FriendsManager.js`

Changes needed:
1. Display user's own friend code prominently at top
2. Add "Copy" button next to friend code
3. Update invite input to accept friend code
4. Add validation for friend code format (8-12 chars)
5. Show tooltip explaining friend code format

**UI Mockup:**
```
┌─────────────────────────────────────────┐
│ Your Friend Code: MATT-1234  [Copy]     │
├─────────────────────────────────────────┤
│ Add Friend                              │
│ ┌─────────────────────────────────────┐ │
│ │ Enter friend code (e.g., ABCD-1234) │ │
│ └─────────────────────────────────────┘ │
│ [Send Friend Request]                   │
└─────────────────────────────────────────┘
```

### Files Involved

**Backend:**
- Create: `/api-site/modules/user/model/friend_code_model.py`
- Update: `/api-site/modules/user/domain/user_aggregate.py`
- Update: `/api-site/modules/user/repositories/user_repository.py`
- Update: `/api-site/modules/user/api/endpoints.py`
- Create: `/api-site/alembic/versions/006_add_friend_codes.py`

**Frontend:**
- Update: `/rollplay/app/dashboard/components/FriendsManager.js`
- Update: `/rollplay/app/dashboard/components/CampaignInviteModal.js` (uses friend lookup)

### Testing Requirements
- Test friend code generation (no collisions in 1000 users)
- Test case-insensitive lookup (ABCD-1234 = abcd-1234)
- Test invalid friend code format
- Test friend code uniqueness constraint
- Test migration of existing users
- Test copy-to-clipboard functionality

---

## Dependencies

**MEDIUM-3 depends on MEDIUM-4:**
- Friend codes make the UI simpler (shorter strings to display)
- Implement MEDIUM-4 first, then MEDIUM-3

**Sequential Implementation:**
1. MEDIUM-4: Friend codes (backend + basic frontend)
2. MEDIUM-3: UI improvements (use new friend codes)

---

## Success Metrics

### User Experience
- [ ] Friend codes are 8-12 characters (not 36)
- [ ] Friend codes are easy to share (copy button works)
- [ ] Friends list is organized into clear sections
- [ ] Users can quickly find friends via search
- [ ] Pending invites are clearly distinguished

### Technical
- [ ] Friend code generation is collision-resistant
- [ ] Existing users migrated successfully
- [ ] Friend code lookup is fast (indexed)
- [ ] UI handles 50+ friends gracefully

---

## Notes

### Friend Code Format Considerations

**Option A: Letters + Numbers (Recommended)**
- Format: `ABCD-1234` (4 letters + dash + 4 numbers)
- Pros: Easy to type, clear structure, ~456 million combinations
- Cons: Dash might be annoying to type

**Option B: Mixed Alphanumeric**
- Format: `AB12CD34` (8 chars, mixed)
- Pros: Shorter to type, no special chars
- Cons: Harder to read/remember

**Option C: Username + Number**
- Format: `MATT-1234` (username + 4 numbers)
- Pros: Personalized, easier to remember
- Cons: Reveals username, privacy concern, username conflicts

**Recommendation:** Use Option A (ABCD-1234) for balance of usability and privacy.

### Migration Strategy

1. Deploy database migration
2. Generate codes for existing users
3. Update backend endpoints
4. Deploy frontend changes
5. Announce new friend code system to users

---

**End of Friends System Task File**
