# Plan: Asset Management System

## Summary

A comprehensive asset management system for Tabletop Tavern that enables DMs to organize, prepare, and deploy rich media (maps, images, audio) and domain objects (NPCs, items) across their D&D campaigns. The system emphasizes flexibility over hand-railing, allowing natural improvisation while providing organizational power.

---

## Core Philosophy

### Library First, Not Campaign-Bound

**The Insight**: Real DMs don't think in terms of "Campaign A's assets" vs "Campaign B's assets". They have binders, folders, and mental libraries of content collected over *years*. A goblin stat block used in one campaign gets pulled out again for another. That tavern map from three years ago? Still perfect for tonight's session.

**The Principle**: Assets belong to the DM's personal library, not to specific campaigns. The mental model should be "My DM Library" not "My Campaign Assets".

**Why This Matters**: This is a key differentiator from Roll20, where assets are often bound to specific games, creating friction when reusing content.

### Enable, Don't Enforce (No Hand-Railing)

**The Problem**: Many VTT tools force workflows. "You must create an encounter before adding monsters." "Assets must be in a folder." This fights against the improvisational nature of D&D.

**The Principle**: Provide organizational tools without forcing their use. DMs can use presets for preparation or pull assets ad-hoc. Theatre of the mind remains valid for truly improvised moments.

**What "Hand-Railing" Means**: Forcing users down a specific path. Example: requiring assets to be assigned to campaigns before use. We avoid this - assets can be used from anywhere in the library at any time.

### Preparation vs Execution

**The Principle**: Presets and organization prepare the DM's workspace. The DM always manually triggers what players see. No automatic broadcasts.

**Why This Matters**: A preset loading doesn't mean players suddenly see a new map. The DM selects the preset to stage their tools, then consciously decides when to reveal the map, start the encounter, etc.

---

## Design Considerations & Trade-offs

### The "Flat List" Problem (Roll20's Weakness)

Roll20 presents assets as a flat, unsearchable list. As a DM's library grows, finding anything becomes painful. We solve this with:
- **Tagging**: Multi-dimensional organization (a tavern map can be: urban, interior, combat-ready, low-level, fantasy)
- **Smart Collections**: Auto-populated groups based on tags
- **Campaign/Session Views**: Scoped filters to reduce noise during focused work

### The Spotify Analogy

We discussed how Spotify handles music organization - songs aren't "in" a playlist, they're *referenced by* playlists. The same song can appear in multiple playlists. This is our model for assets:
- An NPC isn't "in" a campaign - it's referenced by campaigns
- The same goblin can appear in multiple campaigns, collections, and presets
- The library is the source of truth; everything else is a filtered view or curated reference

### The Variant Problem (Goblin Example)

**Discussion**: Should NPCs support "variants"? E.g., Goblin → Variants [Pawn, Elite, Shaman]

**Decision**: No explicit variant system. Instead, let tagging and collections do the work naturally:
- Create Goblin Scout, Goblin Shaman, Goblin Warchief as first-class NPCs
- Tag all with `creature_type: goblin`
- Smart Collection "All Goblins" auto-populates
- Each NPC has its own identity, stats, portrait
- Relationships are emergent through shared tags, not enforced hierarchy

**Why**: Explicit variants add complexity without adding value. The collection system provides the same grouping capability with more flexibility.

### Location as Metadata, Not Domain Object

**Discussion**: Should "Location" (e.g., "The Rusty Tavern") be a domain object?

**Decision**: No. Location is a tag/collection concept, not a persisted object.
- A DM tags maps, audio, NPCs with location: "rusty_tavern"
- They can create a "Rusty Tavern" collection containing related assets
- But there's no "Location" entity with its own fields

**Why**: Making Location a domain object adds complexity. The tag + collection pattern achieves the same organizational goal with less overhead.

### Map Types - A Useful Distinction

Maps serve different purposes, so we capture this as metadata:

| Type | Purpose | Expected Features |
|------|---------|-------------------|
| **World/Region** | Big picture, travel planning | No grid, points of interest |
| **Location/Scene** | Theater of mind, "you are here" | Atmospheric, no grid needed |
| **Battle/Tactical** | Combat encounters | Grid-ready, strategic positioning |
| **Handout** | Player-facing artifact | Maps they'd find in-world, notes, letters |

This is a simple dropdown when uploading, enabling filtering: "Show me all battle-ready maps tagged 'forest'".

### The "One-Off Object" Decision

**Discussion**: Should DMs be able to create temporary objects during gameplay that don't persist to the library?

**Scenario**: Players go somewhere unexpected. DM improvises an NPC. Players attack. DM needs HP tracking. But this NPC will die and never be used again.

**Decision**: Out of scope for MVP. Reasoning:
1. **80% case**: DM has *some* asset that works. Use from library.
2. **15% case**: Truly improvised - theatre of the mind handles it.
3. **5% case**: Improvised AND needs mechanics. This is rare enough that "Quick NPC" (minimal library entry) or just voice/roleplay suffices.

**Alternative Considered**: "Use without adding to library" toggle. Rejected as over-engineering.

**What We DO Support**: Quick upload of media (maps, images) during gameplay that auto-associates with the session. This covers the common "I need a map NOW" scenario.

### Session Staging Area - Rejected Concept

**Idea Considered**: A temporary "staging area" for tonight's session - assets dragged in before play, cleared after.

**Decision**: Not needed. The natural filter system handles this:
- Campaign View = broad scope
- Session View = narrow scope for tonight
- Collections = user-curated groupings

The Session View already serves as "what I've prepped for tonight" without adding another concept.

---

## Organizational Model

### Views vs Collections - Critical Distinction

**Views** are domain-defined hierarchy (we define the structure):
```
Library (all assets - source of truth)
    └── Campaign View (user-selected subset)
          └── Session View (user-selected subset of Campaign)
```

**Collections** are user-curated groupings (orthogonal to views):
- "Goblins" (smart: all assets tagged creature_type=goblin)
- "Forest Encounters" (manual: user-picked items)
- "Boss Fights" (manual or smart)

**Key Distinction**: Views are *where you work*, Collections are *how you organize*.

A DM might work in the "Curse of Strahd" Campaign View but pull assets from their "Undead" Collection.

### The Campaign/Session Inheritance Model

**Behavior**: Adding an asset to a Session automatically associates it with the parent Campaign.

**Why**: This prevents orphaned session assets. If you prepped something for Session 14, it logically belongs to that campaign.

**Implementation**: Metadata tags on assets (`campaigns: [id1, id2]`, `sessions: [id3]`)

**UX**:
- Click "Curse of Strahd" → see only what's associated with that campaign
- Need something new? Browse full Library, right-click → "Add to Campaign"
- Within campaign, add to specific Session for finer organization

### Collections - Smart vs Manual

| Type | Behavior | Use Case |
|------|----------|----------|
| **Smart** | Auto-populates based on tag filters | "All Goblins", "Forest Maps", "Boss Encounters" |
| **Manual** | User explicitly adds items | "Tonight's Maybes", "Favorite NPCs", "Campaign BBEGs" |

Smart collections require consistent tagging to work well, hence the semi-structured tag system.

---

## Domain Objects

### NPC/Creature (Template)

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `name` | ✅ Yes | - | Display name |
| `max_hp` | ✅ Yes | 1 | Default 1 for non-combat NPCs (shopkeepers, etc.) |
| `current_hp` | ✅ Yes | = max_hp | Starting health |
| `portrait` | ❌ Optional | - | Reference to Image asset |
| `token` | ❌ Optional | - | Reference to Image asset (for battle maps) |
| `stats` | ❌ Optional | - | AC, abilities, etc. |
| `description` | ❌ Optional | - | Rich text notes |
| `tags` | ❌ Optional | - | For organization/filtering |

**Design Note**: HP defaults to 1/1 because not every NPC is for combat. A tavern keeper doesn't need 45 HP. But we can't enforce "non-combat" status because that's hand-railing - maybe the players *do* attack the tavern keeper.

### Item (Template)

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ Yes | Display name |
| `type` | ✅ Yes | Weapon, Armor, Consumable, Treasure, Misc |
| `image` | ❌ Optional | Reference to Image asset |
| `description` | ❌ Optional | What it looks like, lore |
| `properties` | ❌ Optional | Type-specific (damage dice, AC bonus, uses, gold value) |
| `tags` | ❌ Optional | For organization/filtering |

**Type Field**: Single field with dropdown avoids over-engineering separate Weapon/Armor/etc. entities. Properties can be type-aware (weapons have damage dice, armor has AC bonus).

### Preset (Deployment Bundle)

**What It Is**: A curated bundle that loads the DM's working set. Think of it as "one-click scene preparation".

**What It Is NOT**: An auto-broadcast trigger. Selecting a preset does NOT change what players see.

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ Yes | Display name |
| `maps` | ❌ Optional | References to Map assets (can be multiple) |
| `npcs` | ❌ Optional | References to NPC templates (with spawn counts) |
| `ambience` | ❌ Optional | Reference to Audio asset |
| `sfx` | ❌ Optional | References to Audio assets |
| `tags` | ❌ Optional | For organization/filtering |

**Behavior In Detail**:
1. DM has "Starting Tavern" preset active
2. DM selects "Tavern Fight" preset
3. DM control panel updates: new map ready, combat music queued, enemy NPCs in spawn list
4. Players see nothing yet
5. DM clicks "Load Map" → players see map
6. DM clicks "Start Encounter" → NPCs appear in initiative
7. Mid-fight, DM can still pull additional NPC from library without editing preset

**Not Included in Presets**:
- **Items**: Too infrequent, DMs manage loot via their own collections
- **Notes**: Bound to Campaign level only (not Session, not Library-global)

**Appendability**: During gameplay, DM can pull from library to add to current working set without editing the preset. Preset sets the baseline; DM retains full control.

### Collection

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ Yes | Display name |
| `type` | ✅ Yes | "smart" or "manual" |
| `filter_rules` | If smart | Tag-based filter criteria |
| `items` | If manual | Explicit list of asset references |

### Media Assets

All stored in S3, referenced by signed URL.

| Asset Type | Storage | Metadata |
|------------|---------|----------|
| **Map** | S3 | type (battle/location/world/handout), grid_config, tags |
| **Audio** | S3 | type (ambience/sfx/music), duration, tags |
| **Image** | S3 | Generic images (portraits, handouts, art), tags |

**Note**: Audio types use existing FE terminology (ambience, sfx) rather than introducing new terms.

---

## Tag System

### Semi-Structured Approach

**Why Semi-Structured**: Fully free-form tags lead to inconsistency ("goblin" vs "Goblin" vs "goblins"). Fully rigid tags limit user expression. We use predefined keys with user-defined values.

### Predefined Keys (we define, users pick values)

| Key | Purpose | Example Values |
|-----|---------|----------------|
| `creature_type` | What kind of being | goblin, undead, dragon, humanoid, beast |
| `environment` | Where it belongs | forest, dungeon, urban, coastal, mountain |
| `encounter_type` | Combat context | combat, social, exploration, boss |
| `difficulty` | Relative challenge | minion, standard, elite, boss |
| `mood` | Atmospheric tone | tense, peaceful, mysterious, triumphant |
| `asset_type` | For media | battle_map, location_map, portrait, token, ambience, music, sfx |

### User-Created Keys

- Users can add custom keys (e.g., `faction`, `story_arc`, `player_character`)
- Once created, the key is available for all their assets
- Values are free-form but we suggest existing values via autocomplete

**Example Smart Collection**:
```
Collection: "Forest Goblins"
Filter: creature_type = "goblin" AND environment = "forest"
→ Auto-populates with all matching assets
```

### Extensibility

We start with sensible defaults but allow users to add keys we didn't think of. This avoids the "we missed something" problem while maintaining structure.

---

## Runtime Model (Template → Instance)

### The Problem

A DM creates one "Orc Pawn" in their library but wants FOUR of them in combat, each with independent HP.

### The Solution: Template → Instance

```
LIBRARY (PostgreSQL)              ACTIVE GAME (MongoDB)
┌─────────────────────┐           ┌─────────────────────┐
│  Orc Pawn (Template)│           │  Orc Instance #1    │
│  - max_hp: 15       │  ──────►  │  - template_ref: orc│
│  - AC: 13           │  spawn    │  - current_hp: 8    │
│  - portrait: url    │           │  - conditions: []   │
└─────────────────────┘           │  - position: {x,y}  │
                                  ├─────────────────────┤
                                  │  Orc Instance #2    │
                                  │  - template_ref: orc│
                                  │  - current_hp: 15   │
                                  │  - conditions: []   │
                                  │  - position: {x,y}  │
                                  └─────────────────────┘
```

| Concept | Storage | Mutability |
|---------|---------|------------|
| **Template** | PostgreSQL (Library) | Persists forever, edited in prep |
| **Instance** | MongoDB (Active Game) | Owns mutable state (HP, position, conditions) |

**Reference Pattern**: Instances reference templates for base data (portrait, stats) but own their combat state. Changes to instance HP don't affect the template.

**ETL on Game End**: Captures instance state (who died, final HP, etc.) for session history. Template remains unchanged.

---

## Access Patterns

### Prep Mode (api-site)

**Context**: DM sitting down before a session, maybe with coffee, no time pressure.

**Capabilities**:
- Full CRUD on all assets and domain objects
- Create/edit Presets and Collections
- Organize via tags and Campaign/Session associations
- Upload and categorize media
- Write session notes

**Optimize For**: Thoroughness, organization, rich metadata entry

### Live Mode (api-game)

**Context**: Mid-session, players did something unexpected, time pressure HIGH.

**Capabilities**:
- Read access to Library (search, browse Campaign/Session view)
- Upload new media (auto-associates with Session)
- Load Presets (sets DM working set)
- Spawn instances from templates
- Manual control over player broadcasts
- Pull additional assets from library ad-hoc

**Optimize For**: Speed, 3 clicks or less to deploy anything

**Key Constraint**: No domain object creation (NPCs, Items) during live play. Use theatre of the mind for truly improvised moments. Quick media upload IS supported.

---

## Upload Flows

### During Prep (api-site)

1. User uploads file(s)
2. S3 upload, signed URL generated
3. Asset created with minimal required fields: file_url, filename, upload_date
4. User can optionally add tags, associate with Campaign
5. Organize later if desired - no friction at upload time

### During Gameplay (api-game)

1. DM clicks "Quick Upload"
2. File uploads to S3
3. Asset auto-tagged: session_id, campaign_id (inherits to campaign)
4. Appears in DM's asset panel immediately
5. DM can use it right away
6. Post-session: visible in Session view for proper tagging/organization

**Design Decision**: Gameplay uploads default to Session association. This keeps them findable post-session without requiring metadata entry during play.

---

## MVP Scope

### In Scope

- [ ] Media asset management (Maps, Audio, Images) with S3 storage
- [ ] Domain objects (NPCs, Items) in PostgreSQL
- [ ] Library with Campaign/Session view filters
- [ ] Collections (smart and manual)
- [ ] Presets as DM working set loader
- [ ] Tag system with predefined keys + user extensibility
- [ ] Template → Instance spawning for gameplay
- [ ] Media upload during live gameplay (auto-associates with Session)
- [ ] Append to preset working set during gameplay (pull from library ad-hoc)

### Out of Scope (MVP)

- Shareable/marketplace collections (future consideration)
- Creating domain objects (NPCs, Items) during live gameplay (use roleplay)
- Ephemeral one-off objects (over-engineering)
- Edit presets during live gameplay (can always edit in prep mode later)

### Key Design Decisions

| Decision | Reasoning |
|----------|-----------|
| Notes bound to Campaign level only | Notes are campaign-specific context, not reusable assets |
| Items not in Presets | Too infrequent, DMs manage loot manually via collections |
| No object creation in live play | Theatre of the mind handles improvisation; reduces complexity |
| Session inherits to Campaign | Prevents orphaned assets, logical hierarchy |
| Location as tag, not object | Simpler, achieves same organizational goal |

---

## Competitive Analysis

### Roll20

| Weakness | Our Advantage |
|----------|---------------|
| Flat list, poor search | Powerful tagging, smart collections |
| Assets bound to games | Library-first, reuse across campaigns |
| Clunky asset organization | Campaign/Session views, collections |
| Limited real-time access | Preset system for quick deployment |

### Foundry VTT

| Weakness | Our Advantage |
|----------|---------------|
| Complex setup | Simpler UX, lower barrier to entry |
| Module system intimidating | Intuitive collections and presets |
| Steep learning curve | Accessible for newer DMs |

### D&D Beyond

| Weakness | Our Advantage |
|----------|---------------|
| No media management | Full maps, audio, images |
| Not for live play | Real-time gameplay integration |
| Homebrew-focused | Both homebrew and live session support |

---

## UI Vision

### Design Inspiration

Taking cues from **Steam** and **Spotify** - platforms that handle large content libraries well:

**Spotify Patterns**:
- Top navigation for main views (Home / Search / Your Library)
- Left sidebar for playlists (user-curated collections)
- Main content area with visual tiles
- Clear hierarchy without overwhelming

**Steam Patterns**:
- Top navigation for context switching (Store / Library / Community)
- Left sidebar for collections and filters
- Tiled game cards with imagery + title
- Visual-first browsing

### Proposed Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  TOP NAV: Library | Campaign View | Session View | Search   │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  LEFT        │  MAIN CONTENT AREA                           │
│  SIDEBAR     │                                              │
│              │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            │
│  Collections │  │ Map │ │ Map │ │ Map │ │ Map │            │
│  - Goblins   │  │ Tile│ │ Tile│ │ Tile│ │ Tile│            │
│  - Forest    │  └─────┘ └─────┘ └─────┘ └─────┘            │
│  - Boss      │                                              │
│              │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            │
│  Quick       │  │ NPC │ │ NPC │ │ NPC │ │ NPC │            │
│  Filters     │  │ Tile│ │ Tile│ │ Tile│ │ Tile│            │
│  - Maps      │  └─────┘ └─────┘ └─────┘ └─────┘            │
│  - NPCs      │                                              │
│  - Audio     │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

**Top Navigation**: Main view filters (our domain hierarchy)
- Library = everything
- Campaign View = scoped to selected campaign
- Session View = scoped to selected session
- Search = global search with filters

**Left Sidebar**: Fine-grained navigation
- User collections (smart and manual)
- Quick type filters (Maps, NPCs, Audio, Items)
- Recent items

**Main Content**: Visual tiles
- Image-forward design (map thumbnails, NPC portraits)
- Name + key metadata as subheading
- Gamified but clear aesthetic

### Design Principles

- **Visual-first**: Show images, not just text lists
- **Tiled layout**: Like Steam game library, scannable at a glance
- **Progressive disclosure**: Top nav for big context, sidebar for refinement
- **Balance**: Gamified enough to feel fun, clear enough to be functional

---

## Proof of Concept (POC) - Maps Only

### Purpose

Before building the full system, prove the end-to-end architecture with ONE asset type: **Maps**.

This validates:
- S3 integration (upload, storage, retrieval)
- PostgreSQL asset metadata
- Campaign/Session association
- api-site ↔ api-game communication
- WebSocket broadcast to players

### POC Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. UPLOAD (Frontend → api-site)                                     │
│    User uploads map image                                           │
│    → Frontend requests signed S3 URL from api-site                  │
│    → Frontend uploads directly to S3                                │
│    → Frontend confirms upload, api-site creates asset record        │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. STORE (S3 + PostgreSQL)                                          │
│    S3: Stores the actual image file                                 │
│    PostgreSQL: Stores asset metadata                                │
│    - id, filename, s3_url, user_id                                  │
│    - campaigns: [campaign_id], sessions: [session_id]               │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. ASSOCIATE (api-site)                                             │
│    User associates map with Campaign and/or Session                 │
│    → Update asset record with campaign_ids, session_ids             │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 4. GAME START - ETL (api-site → api-game)                           │
│    When game session starts:                                        │
│    → api-site gathers assets associated with session                │
│    → HTTP POST to api-game with asset references                    │
│    → api-game stores in MongoDB active_session                      │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 5. LIVE GAME (api-game)                                             │
│    DM selects map from available assets                             │
│    → DM clicks "Load Map"                                           │
│    → api-game broadcasts via WebSocket                              │
│    → All connected players see the map                              │
└─────────────────────────────────────────────────────────────────────┘
```

### POC Scope - What We Build

**Backend (api-site)**:
- [ ] S3 integration: Generate signed upload URLs
- [ ] Map asset model in PostgreSQL (id, filename, s3_url, user_id, campaigns[], sessions[])
- [ ] Endpoints: Upload, List (with campaign/session filter), Associate
- [ ] ETL endpoint: Send session assets to api-game on game start

**Backend (api-game)**:
- [ ] Receive asset references from api-site
- [ ] Store available maps in MongoDB active_session
- [ ] Endpoint: Get available maps for current session
- [ ] WebSocket: Broadcast "load_map" event to all players

**Frontend**:
- [ ] Simple upload form (file picker → S3)
- [ ] Basic list view of uploaded maps
- [ ] Associate map with campaign/session
- [ ] In-game: DM sees available maps, clicks to load
- [ ] In-game: Players receive map via WebSocket

### POC Does NOT Include

- Tags, collections, presets, NPCs, items, audio
- Smart collections or filtering
- Full Library UI (tiles, sidebar, etc.)
- Template → Instance spawning

### POC Success Criteria

1. ✅ DM uploads a map image via frontend
2. ✅ Map stored in S3, metadata in PostgreSQL
3. ✅ DM associates map with a Campaign
4. ✅ DM starts a game session
5. ✅ api-site sends asset references to api-game
6. ✅ DM sees map in game interface
7. ✅ DM clicks "Load Map"
8. ✅ All connected players see the map

### Why Start Here

Maps are the simplest media asset:
- Single file upload (no complex metadata)
- Visual confirmation (you can see it worked)
- Already have map display logic in frontend
- Proves the entire S3 → PostgreSQL → api-game → WebSocket pipeline

Once this works, adding audio, NPCs, collections, etc. is incremental.

---

## Open Design Questions

### Library UI Details (Post-POC)

To be refined after POC:
- Exact tile design (aspect ratio, metadata shown)
- Search UX - instant filter or explicit search
- Mobile/responsive behavior
- Collection management UI
- Drag-and-drop for organization

---

## Technical Notes (High-Level)

### Storage Architecture

- **PostgreSQL**: Domain objects (NPCs, Items, Presets, Collections), metadata, tags
- **S3**: Rich media files (maps, audio, images)
- **MongoDB**: Active game session state (spawned instances)

### Service Boundaries

- **api-site**: Library management, CRUD operations, prep-time functionality
- **api-game**: Live session access, read from library, media upload, instance spawning

### S3 Integration

- Signed URLs for secure access
- URL stored as the asset reference in PostgreSQL
- Upload flow generates signed upload URL, client uploads directly to S3

---

## Verification Plan

Once implemented:

1. **Library Setup**
   - Create an NPC with tags (creature_type: goblin, environment: forest)
   - Verify it appears in smart collection "All Goblins"

2. **Campaign Association**
   - Associate NPC with a Campaign
   - Verify Campaign view shows only associated assets

3. **Preset Creation**
   - Create a Preset with: map, 2 NPCs, ambience audio
   - Save and verify contents

4. **Gameplay Flow**
   - Start a game session
   - Load the Preset
   - Verify DM panel populates (map ready, NPCs in spawn list, audio queued)
   - Verify players see nothing yet

5. **Instance Spawning**
   - Spawn 3x copies of one NPC
   - Verify each has independent HP tracking
   - Damage one, verify others unaffected

6. **Live Upload**
   - Upload a new map during gameplay
   - Verify auto-associates with current Session
   - Verify appears in DM panel for immediate use

7. **Post-Session**
   - End session
   - Verify uploaded map visible in Session view
   - Verify instance state captured (if ETL implemented)
