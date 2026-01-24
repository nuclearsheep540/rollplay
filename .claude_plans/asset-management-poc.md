# POC: Asset Management - Maps Upload & Broadcast

## Summary

Minimal vertical slice to prove the asset management architecture. Upload a map image, store in S3, associate with a campaign/session, transfer to api-game on session start, and broadcast to players.

**Parent Plan**: [asset-management-system.md](./asset-management-system.md)

---

## Current State Analysis

### What Already Exists

**api-site**:
- Session aggregate with lifecycle: INACTIVE → STARTING → ACTIVE → STOPPING → FINISHED
- StartSession command calls `POST /game/session/start` to api-game
- Campaign model has `assets`, `scenes`, `npc_factory` JSON columns (currently unused)
- DDD pattern: modules/{aggregate}/api, schemas, application, domain, orm, model

**api-game**:
- MapService with `active_maps` MongoDB collection
- WebSocket `map_config_update` event for broadcasting map changes
- HTTP ETL endpoints: `/game/session/start`, `/game/session/end`
- Existing map flow: DM updates map config → MongoDB → WebSocket broadcast

### What's Missing

- S3 integration (no boto3, no signed URLs)
- Asset upload endpoints
- Asset metadata storage in PostgreSQL
- ETL extension to pass assets from api-site → api-game
- api-game endpoints to list/load assets from campaign

---

## Architecture Decisions

### Where Assets Live

| Storage | What | Why |
|---------|------|-----|
| **S3** | Actual image files | Scalable file storage, CDN-ready |
| **PostgreSQL** | Asset metadata (url, filename, campaign_ids) | Queryable, relational to campaigns |
| **MongoDB** | Active session's available assets (references) | Fast access during gameplay |

### Upload Pattern: Signed URL (Client-Side Upload)

```
Frontend                  api-site                    S3
   │                         │                         │
   ├─ GET /assets/upload-url ─►                        │
   │     (filename, type)    │                         │
   │                         ├─ Generate signed URL ───►
   │  ◄── {upload_url, key} ─┤                         │
   │                         │                         │
   ├─────────── PUT (file) ───────────────────────────►│
   │                         │                         │
   ├─ POST /assets/confirm ──►                         │
   │     (key, campaign_id)  │                         │
   │                         ├─ Create asset record    │
   │  ◄─── {asset} ──────────┤                         │
```

**Why signed URLs**: Frontend uploads directly to S3, avoiding api-site as a file proxy. Reduces server load, enables large files.

---

## Implementation Plan

### Phase 1: S3 Infrastructure

**1.1 AWS Configuration**

Add to `.env`:
```env
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
AWS_REGION=eu-west-2
S3_BUCKET_NAME=tabletop-tavern-assets
```

Add to `api-site/shared/config.py`:
```python
AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION: str = os.getenv("AWS_REGION", "eu-west-2")
S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME")
```

**1.2 S3 Service**

Create `api-site/shared/services/s3_service.py`:
- `generate_upload_url(key: str, content_type: str) -> str` - Presigned PUT URL
- `generate_download_url(key: str) -> str` - Presigned GET URL (if bucket is private)
- `delete_object(key: str) -> bool` - Delete file from S3

**Dependencies**: `boto3` added to requirements.txt

---

### Phase 2: Assets Module (api-site)

Following existing DDD patterns in `/modules/`.

**2.1 Directory Structure**

```
api-site/modules/assets/
├── __init__.py
├── api/
│   └── endpoints.py           # Upload URL, confirm, list, delete
├── schemas/
│   └── asset_schemas.py       # Request/response models
├── application/
│   ├── commands.py            # ConfirmUpload, DeleteAsset, AssociateWithCampaign
│   └── queries.py             # GetAssetsByUser, GetAssetsByCampaign
├── domain/
│   └── asset_aggregate.py     # AssetAggregate (validation, business rules)
├── orm/
│   └── asset_repository.py    # CRUD operations
├── model/
│   └── asset_model.py         # SQLAlchemy model
└── dependencies/
    └── providers.py           # get_asset_repository
```

**2.2 Database Model**

`asset_model.py`:
```python
class AssetModel(Base):
    __tablename__ = "assets"

    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID, ForeignKey("users.id"), nullable=False)

    filename = Column(String, nullable=False)
    s3_key = Column(String, nullable=False, unique=True)
    s3_url = Column(String, nullable=False)
    content_type = Column(String, nullable=False)  # image/png, image/jpeg
    file_size = Column(Integer, nullable=True)

    asset_type = Column(String, nullable=False)  # "map", "image", "audio"

    # Campaign/Session associations (many-to-many via JSON array for simplicity in POC)
    campaign_ids = Column(ARRAY(UUID), default=[])
    session_ids = Column(ARRAY(UUID), default=[])

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

**Note**: For POC, using ARRAY columns for campaign/session associations. Full implementation may use junction tables.

**2.3 Alembic Migration**

Create migration for `assets` table. Remember to import model in `alembic/env.py`.

**2.4 API Endpoints**

`endpoints.py`:
```python
@router.get("/upload-url")
async def get_upload_url(
    filename: str,
    content_type: str,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    s3: S3Service = Depends(get_s3_service)
) -> UploadUrlResponse:
    """Generate presigned S3 URL for client-side upload."""

@router.post("/confirm")
async def confirm_upload(
    request: ConfirmUploadRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: AssetRepository = Depends(get_asset_repository)
) -> AssetResponse:
    """Confirm upload completed, create asset record."""

@router.get("/")
async def list_assets(
    campaign_id: Optional[UUID] = None,
    asset_type: Optional[str] = None,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: AssetRepository = Depends(get_asset_repository)
) -> List[AssetResponse]:
    """List user's assets, optionally filtered by campaign."""

@router.post("/{asset_id}/associate")
async def associate_with_campaign(
    asset_id: UUID,
    request: AssociateRequest,  # {campaign_id, session_id?}
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: AssetRepository = Depends(get_asset_repository)
) -> AssetResponse:
    """Associate asset with a campaign (and optionally session)."""

@router.delete("/{asset_id}")
async def delete_asset(
    asset_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: AssetRepository = Depends(get_asset_repository),
    s3: S3Service = Depends(get_s3_service)
) -> None:
    """Delete asset from S3 and database."""
```

**2.5 Register Router**

Add to `main.py`:
```python
from modules.assets.api.endpoints import router as assets_router
app.include_router(assets_router, prefix="/api/assets", tags=["assets"])
```

**2.6 NGINX Route**

Add to `docker/dev/nginx/nginx.conf`:
```nginx
location /api/assets {
    proxy_pass http://api-site:8082;
    # ... standard proxy headers
}
```

---

### Phase 3: ETL Extension (Session Start)

**3.1 Modify StartSession Command**

In `api-site/modules/session/application/commands.py`:

Current flow:
```python
# StartSession.execute()
response = requests.post(f"{GAME_SERVICE_URL}/game/session/start", json={
    "session_id": str(session.id),
    "dm_username": dm_username,
    "max_players": session.max_players,
    ...
})
```

Extended flow:
```python
# Fetch assets associated with this session's campaign
assets = asset_repository.get_by_campaign_id(session.campaign_id)
asset_refs = [
    {"id": str(a.id), "filename": a.filename, "s3_url": a.s3_url, "asset_type": a.asset_type}
    for a in assets
]

response = requests.post(f"{GAME_SERVICE_URL}/game/session/start", json={
    "session_id": str(session.id),
    "dm_username": dm_username,
    "max_players": session.max_players,
    "assets": asset_refs,  # NEW
    ...
})
```

---

### Phase 4: api-game Asset Handling

**4.1 Update Session Start Endpoint**

In `api-game/app.py`, modify `/game/session/start`:

```python
@app.post("/game/session/start")
async def start_session(request: StartSessionRequest):
    # Existing: Create active_session document
    session_doc = {
        "_id": request.session_id,
        "max_players": request.max_players,
        "dungeon_master": request.dm_username,
        "seat_layout": ["empty"] * request.max_players,
        # ... existing fields
        "available_assets": request.assets or [],  # NEW: Store asset refs
    }
    await game_service.create_session(session_doc)
```

**4.2 Get Available Assets Endpoint**

Add to `api-game/app.py`:

```python
@app.get("/game/{room_id}/assets")
async def get_available_assets(room_id: str):
    """Return assets available for this game session."""
    session = await game_service.get_session(room_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return {"assets": session.get("available_assets", [])}
```

**4.3 Load Map Endpoint (HTTP → MongoDB → WebSocket)**

The existing map flow uses `PUT /game/{room_id}/map`. We need to support loading a map from the available assets:

```python
@app.put("/game/{room_id}/map")
async def update_map(room_id: str, request: MapUpdateRequest):
    """
    DM loads a map. Updates MongoDB and broadcasts to all players.
    """
    # Validate asset is in available_assets
    session = await game_service.get_session(room_id)
    asset = next((a for a in session.get("available_assets", []) if a["id"] == request.asset_id), None)
    if not asset:
        raise HTTPException(400, "Asset not available for this session")

    # Update active_maps collection
    await map_service.set_active_map(room_id, {
        "asset_id": request.asset_id,
        "filename": asset["filename"],
        "s3_url": asset["s3_url"],
        "grid_config": request.grid_config or {}
    })

    # Broadcast to all connected players
    await connection_manager.broadcast(room_id, {
        "event_type": "map_loaded",
        "data": {
            "asset_id": request.asset_id,
            "s3_url": asset["s3_url"],
            "grid_config": request.grid_config or {}
        }
    })
```

---

### Phase 5: Frontend Integration

**5.1 Upload Component (Dashboard/Library)**

Simple upload form for POC:
```jsx
// app/dashboard/components/MapUploader.js
const uploadMap = async (file) => {
  // 1. Get presigned URL
  const { upload_url, key } = await fetch('/api/assets/upload-url?' +
    new URLSearchParams({ filename: file.name, content_type: file.type })
  ).then(r => r.json())

  // 2. Upload to S3
  await fetch(upload_url, { method: 'PUT', body: file })

  // 3. Confirm upload
  const asset = await fetch('/api/assets/confirm', {
    method: 'POST',
    body: JSON.stringify({ key, campaign_id: selectedCampaignId })
  }).then(r => r.json())

  return asset
}
```

**5.2 Asset List (Dashboard)**

Simple list view showing uploaded maps:
```jsx
// app/dashboard/components/AssetList.js
const AssetList = ({ campaignId }) => {
  const [assets, setAssets] = useState([])

  useEffect(() => {
    fetch(`/api/assets?campaign_id=${campaignId}`)
      .then(r => r.json())
      .then(setAssets)
  }, [campaignId])

  return (
    <div>
      {assets.map(asset => (
        <div key={asset.id}>
          <img src={asset.s3_url} alt={asset.filename} />
          <span>{asset.filename}</span>
        </div>
      ))}
    </div>
  )
}
```

**5.3 In-Game Map Selector (DM Panel)**

```jsx
// app/game/components/MapSelector.js
const MapSelector = ({ roomId }) => {
  const [assets, setAssets] = useState([])

  useEffect(() => {
    fetch(`/game/${roomId}/assets`).then(r => r.json()).then(d => setAssets(d.assets))
  }, [roomId])

  const loadMap = async (assetId) => {
    await fetch(`/game/${roomId}/map`, {
      method: 'PUT',
      body: JSON.stringify({ asset_id: assetId })
    })
  }

  return (
    <div>
      {assets.filter(a => a.asset_type === 'map').map(asset => (
        <button key={asset.id} onClick={() => loadMap(asset.id)}>
          Load {asset.filename}
        </button>
      ))}
    </div>
  )
}
```

**5.4 Player Map Display**

Handle `map_loaded` WebSocket event:
```jsx
// In useWebSocket hook
case 'map_loaded':
  setCurrentMap({
    url: data.s3_url,
    gridConfig: data.grid_config
  })
  break
```

---

## File Checklist

### api-site (New Files)
- [ ] `shared/services/s3_service.py`
- [ ] `shared/services/__init__.py`
- [ ] `modules/assets/__init__.py`
- [ ] `modules/assets/api/__init__.py`
- [ ] `modules/assets/api/endpoints.py`
- [ ] `modules/assets/schemas/__init__.py`
- [ ] `modules/assets/schemas/asset_schemas.py`
- [ ] `modules/assets/application/__init__.py`
- [ ] `modules/assets/application/commands.py`
- [ ] `modules/assets/application/queries.py`
- [ ] `modules/assets/domain/__init__.py`
- [ ] `modules/assets/domain/asset_aggregate.py`
- [ ] `modules/assets/orm/__init__.py`
- [ ] `modules/assets/orm/asset_repository.py`
- [ ] `modules/assets/model/__init__.py`
- [ ] `modules/assets/model/asset_model.py`
- [ ] `modules/assets/dependencies/__init__.py`
- [ ] `modules/assets/dependencies/providers.py`
- [ ] `alembic/versions/xxx_create_assets_table.py`

### api-site (Modified Files)
- [ ] `shared/config.py` - Add AWS config
- [ ] `main.py` - Register assets router
- [ ] `modules/session/application/commands.py` - Extend StartSession
- [ ] `alembic/env.py` - Import AssetModel
- [ ] `requirements.txt` - Add boto3

### api-game (Modified Files)
- [ ] `app.py` - Update /game/session/start, add /game/{room_id}/assets
- [ ] `gameservice.py` - Store/retrieve available_assets

### Frontend (New Files)
- [ ] `app/dashboard/components/MapUploader.js`
- [ ] `app/dashboard/components/AssetList.js`
- [ ] `app/game/components/MapSelector.js`

### Frontend (Modified Files)
- [ ] `app/game/hooks/useWebSocket.js` - Handle map_loaded event

### Config (Modified Files)
- [ ] `.env` - AWS credentials
- [ ] `docker/dev/nginx/nginx.conf` - /api/assets route
- [ ] `docker/prod/nginx/nginx.conf` - /api/assets route

---

## Success Criteria

1. ✅ DM uploads a map image via dashboard
2. ✅ File stored in S3, metadata in PostgreSQL
3. ✅ Asset associated with a Campaign
4. ✅ DM starts a game session
5. ✅ Session start sends asset refs to api-game
6. ✅ api-game stores available assets in MongoDB
7. ✅ DM sees available maps in game interface
8. ✅ DM clicks "Load Map"
9. ✅ Map URL broadcast via WebSocket
10. ✅ All connected players see the map

---

## Testing Plan

### Manual Testing
1. Upload map via Postman/curl to verify S3 flow
2. Start session, check MongoDB for available_assets
3. Call /game/{room_id}/assets to verify asset retrieval
4. Load map, verify WebSocket broadcast in browser console

### Integration Test
```python
def test_asset_upload_and_game_flow():
    # 1. Get upload URL
    # 2. Upload file to S3
    # 3. Confirm upload
    # 4. Associate with campaign
    # 5. Start session
    # 6. Verify assets in api-game
    # 7. Load map
    # 8. Verify broadcast
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| S3 CORS issues | Configure bucket CORS policy for frontend uploads |
| Large file uploads timeout | Chunked upload or increase timeout |
| Signed URL expiry | Set reasonable expiry (15 min), refresh if needed |
| MongoDB asset bloat | Store refs only, not full asset data |

---

## Future Expansion (Post-POC)

After POC success, expand to:
- Audio assets (ambience, sfx) - same pattern
- Image assets (portraits, tokens) - same pattern
- NPC/Item domain objects - different pattern (PostgreSQL only)
- Tags and collections - metadata extension
- Full Library UI - Steam/Spotify inspired design
