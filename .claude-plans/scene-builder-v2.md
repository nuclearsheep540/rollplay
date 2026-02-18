# V2: Scene Builder & Workshop — Plan

## Context

V1 (Media Foundation) delivers individual media capabilities: image loading in game, SFX soundboard, per-channel audio effects, and loop points. V2 builds the **composition and creative workspace layer**.

The core insight: DMs need more than a file library. They need a **creative workspace** ("Workshop") where they craft domain objects, edit asset properties, and compose deployable scenes. The Library remains the clean content management view; the Workshop is where the creative editing happens.

### Product Vision
The Scene Builder is the centrepiece of the storytelling USP. A DM prepares rich, atmospheric encounters in advance — background, positioned character images, layered audio with effects — then deploys the entire scene with a single click during a live session. It bridges the missing theatrics of face-to-face play.

---

## Information Architecture

### Dashboard Navigation
```
Current:  Campaigns | Characters | Library | Account
Proposed: Campaigns | Characters | Library | Workshop | Account
```

### Library (unchanged role, enhanced with links to Workshop)
Browse, upload, organize, and associate media assets with campaigns. Clean, focused content management.

**Enhancement:** Right-click context menu on assets offers deep-edit actions that redirect to Workshop:
- Right-click MAP asset → "Edit Grid" → redirects to Workshop Map Editor
- Right-click MUSIC asset → "Edit Audio" → redirects to Workshop Audio Editor

Library stays clutter-free. All rich editing UX lives in Workshop.

### Workshop (new tab — creative building tools)

| Section | Purpose | Also accessible from |
|---------|---------|---------------------|
| **Scene Builder** | Compose deployable scenes (background + positioned images + audio + domain objects) | Game session (preview/program) |
| **Map Editor** | Grid config, fog of war, traps, points of interest | Library → right-click map → "Edit Grid" |
| **Audio Editor** | Loop points, waveform, BPM, effects preview (HPF/LPF/reverb with wet/dry), save config as asset defaults | Library → right-click music → "Edit Audio" |
| **NPC Builder** | Create NPCs — portrait, stats, personality, dialogue | Standalone or from Scene Builder |
| **Item Builder** | Create Items — icon, properties, description | Standalone or from Scene Builder |

**Pattern:** Library = content manager. Workshop = content editor. Library links into Workshop for deep editing. Workshop sections are also directly accessible.

---

## Audio Effects — Three-Tier System

Effects config exists at three levels, with cascading precedence:

| Tier | Where configured | Where stored | Purpose |
|------|-----------------|-------------|---------|
| **1. Asset defaults** | Workshop Audio Editor | PostgreSQL `music_assets` table | "This track always sounds good with hall reverb at 0.3 mix" |
| **2. Scene overrides** | Scene Builder | PostgreSQL `scene_audio_channels` table | "In this tavern scene, use more reverb" |
| **3. Live tweaks** | In-game audio mixer | MongoDB (transient session state) | DM adjusts during play |

**Precedence:** Live tweak > Scene override > Asset default

**ETL flow:**
- Game start: Asset defaults loaded from PostgreSQL → applied to MongoDB session state
- Scene deploy: Scene overrides applied on top of asset defaults
- Live play: DM tweaks modify MongoDB state directly
- Game end: Final audio state persisted back to session for resume

---

## Domain Model — Proper Relational (No JSONB)

### Scene Aggregate

```
Scene
├── id: UUID (PK)
├── campaign_id: UUID (FK → campaigns)
├── created_by: UUID (FK → users)
├── name: String
├── description: String (nullable)
├── sort_order: Integer
├── created_at: DateTime
├── updated_at: DateTime
│
├── SceneBackground (1:0..1)
│   ├── id: UUID (PK)
│   ├── scene_id: UUID (FK → scenes)
│   ├── asset_id: UUID (FK → media_assets)
│   ├── asset_type: Enum (MAP | IMAGE)
│   │   ── if MAP: grid config comes from the MapAsset itself
│   │   ── if IMAGE: no grid, non-interactive
│   └── created_at: DateTime
│
├── SceneImage (1:many) — positioned overlay images
│   ├── id: UUID (PK)
│   ├── scene_id: UUID (FK → scenes)
│   ├── asset_id: UUID (FK → media_assets)
│   ├── x: Float (0.0–1.0, normalized)
│   ├── y: Float (0.0–1.0, normalized)
│   ├── width: Float (0.0–1.0, normalized)
│   ├── z_index: Integer
│   ├── label: String (nullable, DM reference)
│   └── sort_order: Integer
│
├── SceneAudioChannel (1:many, max 4) — BGM channel configs
│   ├── id: UUID (PK)
│   ├── scene_id: UUID (FK → scenes)
│   ├── channel: String ('A'|'B'|'C'|'D')
│   ├── asset_id: UUID (FK → media_assets)
│   ├── volume: Float (0.0–1.0)
│   ├── loop_start_override: Float (nullable — overrides asset default)
│   ├── loop_end_override: Float (nullable — overrides asset default)
│   ├── effect_hpf_enabled: Boolean (nullable — null = use asset default)
│   ├── effect_hpf_frequency: Float (nullable)
│   ├── effect_hpf_mix: Float (nullable)
│   ├── effect_lpf_enabled: Boolean (nullable — null = use asset default)
│   ├── effect_lpf_frequency: Float (nullable)
│   ├── effect_lpf_mix: Float (nullable)
│   ├── effect_reverb_enabled: Boolean (nullable — null = use asset default)
│   ├── effect_reverb_preset: String (nullable)
│   └── effect_reverb_mix: Float (nullable)
│
└── SceneSfxSlot (1:many) — soundboard slots
    ├── id: UUID (PK)
    ├── scene_id: UUID (FK → scenes)
    ├── slot_index: Integer
    ├── asset_id: UUID (FK → media_assets)
    └── volume: Float (0.0–1.0)
```

### MusicAssetModel (extends V1 joined-table)

V1 adds loop points. V2 adds effect defaults:

```
music_assets table:
  id               (FK → media_assets, PK)
  loop_start       (Float, nullable)          — V1
  loop_end         (Float, nullable)          — V1
  bpm              (Float, nullable)          — V1
  effect_hpf_enabled    (Boolean, default false)   — V2
  effect_hpf_frequency  (Float, nullable)          — V2
  effect_hpf_mix        (Float, nullable)          — V2
  effect_lpf_enabled    (Boolean, default false)   — V2
  effect_lpf_frequency  (Float, nullable)          — V2
  effect_lpf_mix        (Float, nullable)          — V2
  effect_reverb_enabled (Boolean, default false)   — V2
  effect_reverb_preset  (String, nullable)         — V2
  effect_reverb_mix     (Float, nullable)          — V2
```

### Why SceneBackground and SceneImage are separate entities

| Aspect | SceneBackground | SceneImage |
|--------|----------------|------------|
| Cardinality | 0 or 1 per scene | Many per scene |
| Asset types allowed | MAP or IMAGE | IMAGE only |
| Grid support | Yes (if MAP) | No |
| Position | Always fills view | x, y, width, z_index |
| Interactivity | Map unlock/pan/zoom possible | Non-interactive |

The same IMAGE asset could be a background in one scene and an overlay in another — the role is a scene-level concept, not an asset-level concept.

### NPC Aggregate

```
NPC
├── id: UUID (PK)
├── campaign_id: UUID (FK → campaigns)
├── created_by: UUID (FK → users)
├── name: String
├── description: String (nullable)
├── portrait_asset_id: UUID (nullable, FK → media_assets)
├── stats: (TBD — ability scores, HP, AC, etc.)
├── created_at: DateTime
└── updated_at: DateTime
```

### Item Aggregate

```
Item
├── id: UUID (PK)
├── campaign_id: UUID (FK → campaigns)
├── created_by: UUID (FK → users)
├── name: String
├── description: String (nullable)
├── icon_asset_id: UUID (nullable, FK → media_assets)
├── properties: (TBD — weight, value, type, etc.)
├── created_at: DateTime
└── updated_at: DateTime
```

NPCs and Items are standalone domain objects. Scenes reference them (see open question on how).

---

## Scene Access Control

**Scenes are DM-secret until deployed.** Players in a campaign should not see scene details.

### Rules
- Only campaign host (DM) can create, view, edit, delete scenes
- API endpoints enforce `campaign.host_id == current_user`
- Players see scene effects (images, audio) only when deployed during a game
- Players never see the scene list, scene names, or composition details

---

## In-Game Scene Experience

### Preview / Program Pattern
- **Preview** (DM-only): see the scene composition before deploying, make adjustments
- **Program** (all players): the currently deployed/live scene

### Deployment Flow
1. DM clicks Deploy on a scene in the game UI
2. Frontend fetches full scene data (with fresh S3 URLs)
3. Sends coordinated WebSocket events for all media simultaneously
4. Backend processes atomically, broadcasts to all clients
5. All players see/hear the complete scene simultaneously

---

## Backend Module Structure

### New: `api-site/modules/scene/`
```
api-site/modules/scene/
├── api/
│   ├── endpoints.py
│   └── schemas.py
├── application/
│   ├── commands.py           # CreateScene, UpdateScene, DeleteScene, DuplicateScene
│   └── queries.py            # GetScenesByCampaign, GetSceneById
├── domain/
│   └── scene_aggregate.py
├── model/
│   ├── scene_model.py
│   ├── scene_background_model.py
│   ├── scene_image_model.py
│   ├── scene_audio_channel_model.py
│   └── scene_sfx_slot_model.py
├── repositories/
│   └── scene_repository.py
└── dependencies/
    └── providers.py
```

### New: `api-site/modules/npc/` and `api-site/modules/item/`
- Same aggregate-centric pattern
- Standalone CRUD with campaign association

### Frontend: `rollplay/app/workshop/`
```
rollplay/app/workshop/
├── components/
│   ├── WorkshopLayout.js          # Sub-navigation between sections
│   ├── scene_builder/
│   │   ├── SceneEditorPage.js
│   │   ├── SceneCanvas.js
│   │   ├── SceneLayerPanel.js
│   │   └── SceneListPanel.js
│   ├── map_editor/
│   │   ├── MapEditorPage.js
│   │   └── GridConfigEditor.js    # Reusable (shared with game view)
│   ├── audio_editor/
│   │   ├── AudioEditorPage.js     # Loop points + effects preview
│   │   └── WaveformEditor.js      # Canvas waveform with markers
│   ├── npc_builder/
│   │   ├── NpcEditorPage.js
│   │   └── NpcListPanel.js
│   └── item_builder/
│       ├── ItemEditorPage.js
│       └── ItemListPanel.js
├── hooks/
│   ├── useScenes.js
│   ├── useSceneMutations.js
│   ├── useNpcs.js
│   ├── useNpcMutations.js
│   ├── useItems.js
│   └── useItemMutations.js
└── index.js
```

---

## Implementation Phases (within V2)

### Phase 1: Workshop Tab + Navigation
- Add Workshop as 5th dashboard tab
- Sub-navigation between sections
- Placeholder views

### Phase 2: Map Editor (refactor from game)
- Extract grid config editor into reusable component
- Build Workshop Map Editor page
- Library right-click integration

### Phase 3: Audio Editor
- Workshop Audio Editor with waveform + loop points (from V1)
- Add effects preview (HPF/LPF/reverb with wet/dry)
- Save effects config as asset defaults on `music_assets`
- Library right-click integration

### Phase 4: Scene Data Model + API
- PostgreSQL models (proper relational, all child entities)
- Alembic migrations
- DDD module with CRUD + access control

### Phase 5: Positional Images in Game
- Drag-and-drop with normalized coordinates
- Move/resize/reorder WebSocket events

### Phase 6: Scene Builder (Core Site)
- Scene editor in Workshop
- Canvas preview, image positioning, audio/SFX config

### Phase 7: Scene Deployment (Game)
- Deploy panel, preview/program pattern
- Coordinated multi-media WebSocket deployment

### Phase 8: NPC + Item Builders
- Domain models + API + migrations
- Workshop editor pages
- Scene integration

---

## Open Questions

1. **Scene ↔ NPC relationship**: Image-only reference (SceneImage with NPC portrait) vs NPC-aware entity (SceneNpc with position + stats reference)? Affects combat encounters.
2. **Core site scene editor UX**: Exact layout TBD. In-game editor may come first.
3. **Scene transitions**: Instant cut (V2) vs crossfade (future)?
4. **Encounter vs Scene**: Is an encounter a scene type with combat rules, or a separate concept?
5. **Workshop URL structure**: Dashboard tab param vs dedicated routes?
6. **Map Editor V2 scope**: Grid config only, or also fog of war / traps?
7. **Library → Workshop linking**: URL redirect with asset ID, or inline modal?
