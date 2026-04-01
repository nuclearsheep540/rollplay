# Structured CineConfig Schema + Visual Overlays

## Context

`cine_config` is currently stored as `Dict[str, Any]` everywhere — JSONB in PostgreSQL, untyped dict in the domain, shared contracts, and API schemas. The existing cine-mode plan (`.claude-plans/cine-mode.md`) describes the full cinematic feature but never gave `cine_config` a proper schema.

We need to:
1. Define a structured `CineConfig` Pydantic model with placeholders for all planned sections
2. Implement the `visual_overlays` section as the first real feature
3. Wire it through all layers (contracts, domain, API, workshop UI, game rendering)

Visual overlays use a **typed + stacked** model: each overlay is a single effect type (`film_grain`, `color_filter`), and you combine by stacking multiple entries in the list. Array order = render order.

---

## Phase 1: Shared Contract — CineConfig + VisualOverlay

**New file: `rollplay-shared-contracts/shared_contracts/cine.py`**

```python
class VisualOverlay(ContractModel):
    """A single visual overlay in the cine overlay stack.
    
    Type-specific params live in `params` dict:
      - film_grain: {} (no extra params — just enabled + opacity)
      - color_filter: { color: "#hex", blend_mode: "multiply"|"overlay"|"screen"|"color" }
    """
    type: str                          # "film_grain" | "color_filter"
    enabled: bool = True
    opacity: float = Field(default=0.5, ge=0.0, le=1.0)
    params: Dict[str, Any] = {}        # Type-specific, interpreted by frontend

class CineConfig(ContractModel):
    """Structured cinematic configuration for image assets.
    Workshop-authored, read-only at runtime.
    """
    transition: Optional[Any] = None        # Placeholder — entrance effect
    ken_burns: Optional[Any] = None         # Placeholder — pan+zoom motion
    text_overlays: Optional[Any] = None     # Placeholder — animated text
    visual_overlays: List[VisualOverlay] = []
    hide_player_ui: bool = True
```

**Modify: `rollplay-shared-contracts/shared_contracts/image.py`**
- Change `cine_config: Optional[Dict[str, Any]]` → `cine_config: Optional[CineConfig]`
- Add import from `.cine`

**Modify: `rollplay-shared-contracts/shared_contracts/__init__.py`**
- Export `CineConfig`, `VisualOverlay`

---

## Phase 2: Domain + Commands (api-site)

**Modify: `api-site/modules/library/domain/image_asset_aggregate.py`**
- Change `cine_config` type from `Optional[Dict[str, Any]]` to `Optional[CineConfig]`
- Import `CineConfig` from `shared_contracts.cine`

**Modify: `api-site/modules/library/application/commands.py`**
- In `UpdateImageConfig.execute()`: change `cine_config` param type to `Optional[CineConfig]`

---

## Phase 3: API Schemas (api-site)

**Modify: `api-site/modules/library/api/schemas.py`**
- In `MediaAssetResponse`: change `cine_config: Optional[Dict[str, Any]]` → `Optional[CineConfig]`
- In `UpdateImageConfigRequest`: change `cine_config: Optional[Dict[str, Any]]` → `Optional[CineConfig]`
- Import `CineConfig` from `shared_contracts.cine`

---

## Phase 4: Repository Serialization (api-site)

**Modify: `api-site/modules/library/repositories/asset_repository.py`**

JSONB stores plain dicts, not Pydantic models. Need explicit serialization:

- **On write** (`save()`): `aggregate.cine_config.model_dump() if aggregate.cine_config else None`
- **On read** (`_model_to_aggregate()`): `CineConfig.model_validate(model.cine_config) if model.cine_config else None` wrapped in try/except for backwards compat with any existing unstructured data

Both the update and create branches need this.

---

## Phase 5: api-game — No changes needed

`api-game/imageservice.py` keeps `cine_config: Optional[Dict[str, Any]]`. The api-game service treats cine_config as an opaque blob — it stores/returns it, never interprets it. MongoDB handles nested dicts natively. The structured CineConfig is validated at the shared contract boundary during ETL, not inside api-game.

---

## Phase 6: Workshop UI — Visual Overlay Editor

**Modify: `rollplay/app/workshop/components/ImageConfigTool.js`**
- Add local state for `cineConfig` (init from `selectedAsset.cine_config`)
- Pass to `ImageDisplayControls` as props
- Include in `handleSave` payload and `hasChanges` logic
- Include in `previewImage` so overlays render in preview

**Modify: `rollplay/app/workshop/components/ImageDisplayControls.js`**
- Replace "Cinematic effects coming soon" placeholder with Visual Overlays section
- New props: `cineConfig`, `onCineConfigChange`
- UI:
  - "Add Overlay" button with type picker (Film Grain, Color Filter)
  - Per-overlay card: type label, enabled toggle, opacity slider, type-specific controls, remove button
  - Film grain: just enabled + opacity (no extra controls)
  - Color filter: color picker + blend mode dropdown (multiply, overlay, screen, color)
  - Up/down arrows for reorder (simpler than drag-and-drop for v1)

---

## Phase 7: Game-time Overlay Rendering

**Modify: `rollplay/app/map_management/components/ImageDisplay.js`**

Render visual overlays at the reserved z-index slots (line 122 comment: "z-5 through z-15: Reserved for future overlay layers").

For each enabled overlay in `activeImage.cine_config.visual_overlays`:
- Absolutely positioned div covering the image frame, `pointer-events: none`
- `film_grain`: `background-image: url(/cine/overlay/film-grain.gif)`, `background-size: cover`, `mix-blend-mode: overlay`
- `color_filter`: `background-color` from params, `mix-blend-mode` from params
- Each overlay's `opacity` applied via CSS
- z-index: `10 + index` (stacked in array order)

Overlays render inside the letterbox container div (for letterbox/cine modes) and as siblings after the `<img>` element (for wrap mode). The same `ImageDisplay` is reused in the workshop preview, so overlays appear in both contexts automatically.

---

## Files Modified

| File | Change |
|------|--------|
| `rollplay-shared-contracts/shared_contracts/cine.py` | **NEW** — CineConfig + VisualOverlay models |
| `rollplay-shared-contracts/shared_contracts/image.py` | Typed cine_config |
| `rollplay-shared-contracts/shared_contracts/__init__.py` | Export new models |
| `api-site/modules/library/domain/image_asset_aggregate.py` | Typed cine_config |
| `api-site/modules/library/application/commands.py` | Typed cine_config param |
| `api-site/modules/library/api/schemas.py` | Typed cine_config on request/response |
| `api-site/modules/library/repositories/asset_repository.py` | Serialize/deserialize CineConfig for JSONB |
| `rollplay/app/workshop/components/ImageConfigTool.js` | cineConfig state + save + preview |
| `rollplay/app/workshop/components/ImageDisplayControls.js` | Visual overlay editor UI |
| `rollplay/app/map_management/components/ImageDisplay.js` | Render overlay divs |

---

## Verification

1. **Contract tests**: Add round-trip + constraint tests for CineConfig/VisualOverlay in shared contracts test suite
2. **API test**: PATCH `/api/library/{id}/image-config` with `cine_config` containing visual_overlays — verify 200 and response includes structured config
3. **API validation**: Send invalid overlay (opacity > 1.0, unknown fields) — verify 422 rejection
4. **Workshop**: Select image → add film grain overlay → adjust opacity → save → reload page → config persists
5. **Workshop preview**: Overlays visible in the preview panel in real-time as configured
6. **Game rendering**: Start session with cine-configured image → overlays render correctly over the image
7. **Backwards compat**: Existing images with null cine_config continue to work — no overlays rendered
