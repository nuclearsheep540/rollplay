# Map Tokens v4 — PC Token Scale

> **Status:** PLANNED (designed with Matt 2026-08-18, **rewritten 2026-08-19** after the first design was built and reverted). Builds on [01](01-token-system.md) (decisions 1–15), [02](02-dm-tokens-workshop-images.md) (16–29), [03](03-pc-token-avatars.md) (30–39).
> **Scope:** one per-map, GM-set scale applied to player-side token discs. Nothing else.
> **Governing philosophy:** [product-principles.md](../core/product-principles.md), with the scope calibration in decision 40.

---

## 0. What happened to the first version (read this before re-litigating)

The original brief was a PC token scale. The first design turned it into a **map scale** — the DM setting the map's px-per-square via the existing `grid_cell_size`, applied to every token. It was fully built (column, migration, ETL threading, grid on/off toggle, control, tests) and then **reverted on 2026-08-19**.

Why it was reverted, in Matt's words: *"we've plumbed a feature that's supposed to be just PC token scaling into a new idea that the grid always exists now, and is just rendered as hidden — this means there's a conflict between the render and what a user or human developer can see."*

The chain that produced it: making the value map-wide meant it lived on the map's geometry; setting that value forces a grid config into existence; suppressing the resulting lines needs `enabled: false`; persisting that needs a column. Each step followed from the last, and the destination was a permanent tax on two subsystems — grid and tokens — paid for a feature that should touch neither.

**The reasoning that was wrong.** The case against a PC-only multiplier was that a Medium goblin and a Medium fighter must render the same size, because "one square means one thing". That argument requires there to *be* a square. On a gridless map there is no lattice and no shared unit for the two to be coherent against — so the objection was weakest exactly where the feature applies. It also overrode a product decision Matt had already made (decision 45: PCs collectively one size, NPCs individually configured), on simulation-fidelity grounds nobody asked for.

Keep this section. The next person to think "wouldn't it be tidier to derive this from cell size?" needs to find the answer already written down.

## 1. Product decisions

Continues v3 numbering (30–39 in [03](03-pc-token-avatars.md)).

40. **"Facilitate, don't enforce" governs gameplay rules, not UI/graphical decisions** (Matt, 2026-08-18). A token rendered outside its cell reads as broken; that is a UI quality judgement, not a canon-correctness gate, and the product principle does not protect it. Unchanged from the first version, and it is why the scale is bounded rather than free.

41. **The problem is that PC tokens have no size control at all.** NPC tokens have per-token `footprint`; PC tokens are hardcoded `footprint: 1` (`MapTokenChipList.js:50`) with no UI. On maps whose art implies a finer scale than the ~100px fallback, players report their tokens look too big and have no lever. This gives them one.

42. **A per-map multiplier on player-side discs.** ~~Rejected in the first version~~ — **reinstated 2026-08-19**, see §0. It is what was asked for, it touches nothing but token rendering, and the coherence objection does not hold on the maps it serves.

43. **Player-side means `kind === "pc"` OR an assigned `owner_user_id`** (Matt, 2026-08-18: *"if the DM assigns a token to a player, that token is PC and shares the scaling rules"*). Same predicate as `isCompanion` (`MapTokenLayer.js:423`) and the server's `companion_move_allowed` (`websocket_events.py:1749-1753`). Second occurrence ⇒ extract a small shared predicate rather than derive it a third time.

44. **Per-map, GM-set, live-editable** (Matt, 2026-08-18: *"a 'player token size' field would be exposed to the GM for each map — this value can be changed in game runtime freely"*). Different map art implies different scale, so the value belongs to the map, not the session or campaign.

45. **PC size is collective, NPC size is per-token.** Unchanged. PC tokens keep `footprint: 1`; NPC tokens keep their selector. The scale is one number for all player-side discs on a map — it does not become a per-token field.

46. **`footprint` is untouched.** Snapping, occupancy, grid re-snap and cell labels all read `footprint` and the grid; none of them learn about the scale. A scaled PC disc still *owns* one cell — only its rendered diameter changes. This is the line that keeps the feature out of the grid subsystem.

47. **Bounded 0.5–1.5, continuous.** Matt's brief was three steps at ±50%. A bounded float costs the same, keeps the slider, and avoids a contract migration if the useful range turns out to be 0.7 rather than 0.5. Bounds enforce decision 40 — a disc cannot wander far enough from its cell to read as broken.

48. **Nothing else may read it.** A hard rule, not a preference: the failure mode in §0 began when one value acquired a second consumer. If a future feature wants this number, that is a design review, not a convenience import.

49. **Inert when the map has a usable grid** (grid enabled AND cell size tuned). Matt's rule from 2026-08-18: *"when there is a [grid], a PC is always 1 cell footprint regardless."* The reverted design got this for free — disc and lines read one number — but a multiplier does not, so it needs one explicit condition. Without it a 0.5× disc floats inside its square and a 1.5× disc overhangs it, which is exactly the rendering Matt rejected under decision 40.

    The knob therefore only does anything where the cell size is an *estimate* rather than a measurement — which is the population that produced the original complaint. The slider stays visible but disabled on a gridded map, with a line saying why; silently doing nothing would be worse than saying nothing.

50. **DM token controls get their own `TOKENS` tab; the players' chips do not move** (Matt, 2026-08-19). Token UI had drifted across three hosts: `MapTokenChipList` in the left PARTY drawer, `MapTokenCreator` in the right COMBAT tab, and the new size slider in MAP. The last two are misplaced — NPC token authoring is not combat-specific (you place minis for exploration and social scenes too), and the slider only landed in MAP because that is where the persist path happened to live.

    **But the left/right split is the permission boundary, not decoration** — every right-drawer tab except MOD is `dmOnly`. So `MapTokenChipList` stays in PARTY: moving it right would take a player's own token away from the player. The new tab holds DM tools only, and COMBAT keeps `CombatControlsPanel` so it is not left empty.

51. **Where scale comes from: with a grid, the grid is the truth; without one, the image is** (Matt, 2026-08-19). The governing rule for this whole area, and the one that resolves the "hidden grid" vagueness. A *usable* grid has measured the map, so its cell size wins. Otherwise nothing has measured anything and the answer is derived from the image's dimensions — an estimate, which is precisely what the player-token scale exists to correct.

    "Usable" is `gridIsUsable` (present, enabled, cell size tuned), not "a cell size is stored". A grid that is off, or on but never tuned, has measured nothing and cannot be the truth. `cellPxForMap` previously read `grid_cell_size` regardless of `enabled` — so with the grid off the grid would still have been sizing tokens while the lines, snapping and cell labels had all stopped. That is the split Matt objected to, and it is now closed: **one predicate gates all four**, so there is no state where the lines are off but the grid is quietly still running underneath.

    Landed 2026-08-19 as a deliberate **no-op**: `enabled` is currently always `true`, so `gridIsUsable(config)` and `grid_cell_size > 0` are the same expression today. Zero behaviour change now, correct behaviour by construction whenever a grid on/off toggle is built.

    Consequence to accept if that toggle ships: turning a grid off resizes tokens, because they fall back to the estimate. That is honest — you switched off the thing defining their size — and it is now *recoverable*, because the player-token scale goes live at exactly that moment. Before this feature existed there would have been no way to correct it.

## 2. Facts the design rests on (verified 2026-08-18/19)

- `tokenDiameterPx(footprint, gridConfig, w, h)` (`map_tokens/config.js:83-85`) is the single sizing function. Three call sites, **all in `MapTokenLayer`** (`:155`, `:158`, `:447`), and all three already hold the token — so taking the token instead of the footprint costs nothing.
- Both disc rendering and stack-membership go through it, so the scale follows into the stack badge for free.
- PC tokens are hardcoded `footprint: 1` (`MapTokenChipList.js:50`).
- `MapConfig` documents the recipe for a new optional field (`shared_contracts/map.py:116-120`): update the MapAsset ↔ contract mapping and `_merge_preserved_map_fields`. `extra="forbid"` makes spelling drift raise rather than silently drop.
- The in-game map save is `PUT /api/game/{roomId}/map` with the **complete map object** (`MapControlsPanel.js` `applyGrid`), not the WebSocket `map_config_update`. A new `map_config` field rides it with no payload surgery.
- api-game stores `map_config` opaquely and rebroadcasts it; it needs **no code change** for a new field.

## 3. Design

### 3.1 Contract + storage

- `MapConfig.pc_token_scale: Optional[float] = Field(default=None, ge=0.5, le=1.5)`. `None` means "never set" and reads as `1.0`, so every existing map is byte-identical.
- `map_assets.pc_token_scale` — `Float, nullable=True`. Autogenerated migration, never hand-written.
- `MapAsset`: field, `from_base`, a keep-current-on-None assignment, and both ETL builders — mirroring exactly how `grid_cell_size` is already threaded.
- Repository's three `MapAsset` mapping sites.
- `_merge_preserved_map_fields` gains the field so a `map_load` that omits it preserves the in-room value.
- Contracts package version bump; extend `tests/test_contracts.py` (CI gate). Both service images take the bumped package together.

**Honest cost note:** the storage footprint is about the same as the reverted `grid_enabled`. The saving is entirely conceptual — one additive field with exactly one consumer, no new mode, no invisible state, no existing reader that has to learn about it.

### 3.2 Rendering

- `tokenDiameterPx(token, gridConfig, naturalWidth, naturalHeight, pcTokenScale)` — takes the token; applies the multiplier only when the map has **no** usable grid (decision 49) **and** the shared player-side predicate says so (decision 43). Otherwise returns exactly today's value.
- `gridIsUsable(gridConfig)` extracted as the client twin of `shared_contracts.grid_math.grid_usable`; `snapTokenCenter` adopts it too (it was inlining the same check).
- `isPlayerSideToken(token)` extracted — third derivation of a predicate that already existed as `isCompanion` and the server's `companion_move_allowed`.
- `MapTokenLayer` takes a `pcTokenScale` prop, fed by `MapDisplay` from `activeMap.map_config.pc_token_scale`, and passes it to all three call sites (disc render + both stack-membership measurements, so the stack badge follows what you see).
- No change to `cellPxForMap`, `grid_math`, or any grid reader.

### 3.3 Control

- `PlayerTokenSizeControl` in `map_tokens/components/`, labelled **"Player token size"** and shown as a percentage — accurate here, unlike in the reverted design, because it only moves player tokens. It lives in the token slice, not `map_management`, because it is token UI.
- **Hosted in a new DM-only `TOKENS` right-drawer tab** (decision 50), first in the tab so the map-wide value sits above the per-token list it governs.
- Its own `applyPcTokenScale`, deliberately **not** folded into `applyGrid`: it writes one `map_config` field and never touches `grid_config`. Keeping the two persist paths apart is the point of the redesign.
- **Live preview costs nothing here.** The board reads `pc_token_scale` straight off `activeMap`, so an optimistic local `setActiveMap` on every slider change resizes the discs as it moves, with a single PUT on release. No new plumbing, unlike the reverted design where preview would have dragged `enabled: true` along and switched snapping on mid-drag.
- Disabled with an explanatory line when the grid sets token size (decision 49).

## 4. PR sequence

| PR | Contents | Ships on |
|---|---|---|
| **14 — PC token scale** | §3.1 contract + column + migration + ETL threading; §3.2 predicates + `tokenDiameterPx`; §3.3 slider. api-site + frontend + one autogenerated migration + contracts bump, plus one line in api-game's `_merge_preserved_map_fields`. **Release note: this touches `MapConfig`, which api-game `model_validate`s — so `api_site` AND `api_game` must both move in `releases.json`.** Shipping api-site alone means api-game rejects every map payload on `extra="forbid"`. (Contrast 0.61.0, which bumped contracts but correctly shipped api-site alone because the changed model, `PlayerCharacter`, is never parsed by api-game.) | feature branch |
| **15 — Re-snap reachability** ✅ **DONE 2026-08-19** | Unrelated pre-existing bug: `update_map` never called the re-snap, and the WS handler that does is only reached by `sendMapConfigUpdate`, which has **zero call sites** — so the exact-cell re-snap (decision 20, shipped 0.60.0) had never fired in the app. `update_map` now does the pre/post grid capture and calls `grid_resnap_fragment` + `send_map_token_fragment` itself. Both helpers lost their leading underscore: they are genuinely shared across modules now, and a private-looking name crossing a module boundary reads as a mistake. Guarded on `filename`, so a map *switch* through the endpoint never re-snaps (old and new are different boards). api-game only; 66 tests pass. | feature branch |

## 5. What we will NOT build

- **No grid involvement of any kind** — no `grid_cell_size` reuse, no `grid_enabled`, no grid on/off toggle, no "configured but hidden" state (§0).
- **No per-token PC scale** — one value per map (decision 45).
- **No NPC scaling** — NPCs have `footprint`. Its floor of 1 cell is a known limitation, deliberately not addressed here.
- **No change to snapping, occupancy, cell labels, or re-snap** (decision 46).
- **No PC footprint UI** — wildshape / Enlarge-Reduce / Large-species PCs stay unrepresentable (open item 1).
- **No second consumer of the value** (decision 48).

## 6. Verification (desktop, two-browser where relevant)

- Slider moves PC discs and assigned companions; plain NPC discs do not move.
- A footprint-2 NPC keeps its size while PCs scale — the two axes are independent.
- Snapping is unchanged at every scale: a 0.5× PC disc still occupies and snaps to one whole cell.
- Stack badge follows the rendered size (shared `tokenDiameterPx`).
- Value persists across a session end/start (ETL) and across a map switch; per-map, so switching maps changes it.
- Existing maps (NULL) render byte-identical to today.
- Second browser sees the change; api-game unchanged.
- Bounds hold at 0.5 and 1.5.

## 7. Open items

1. **PC footprint is hardcoded to 1** (`MapTokenChipList.js:50`). Wildshape into a Large beast, Enlarge/Reduce, and Large-species characters are unrepresentable. Out of scope; decision 45 is a product constraint here rather than a game-system fact, and this is where that shows.
2. **Live-drag preview on the slider** — see §3.3. Decide on QA evidence.
3. **The dead `map_config_update` path is still there** (2026-08-19). `sendMapConfigUpdate` is defined twice (`webSocketEvent.js`, `useMapWebSocket.js`), exported, destructured once in `GameContent`, and called nowhere — so api-game's handler for it is unreachable. Removing it is ~10 lines of dispatcher plus the handler and the two senders.

    The case for removal is **not** data corruption — checked, and it wouldn't: `MapService.update_map_config` does a nested `$set` on `map_config.grid_config`, so siblings like `pc_token_scale` survive untouched. The case is that `grid_resnap_fragment` now has **two** call sites and only one is reachable, so wiring the dead one up later would give a double re-snap. It also does a partial update where CLAUDE.md mandates complete-object writes.

    The frontend *handler* for incoming `map_config_update` must stay either way — that is how clients receive the broadcast the REST PUT emits.

4. ~~A grid cannot be turned off~~ **RESOLVED 2026-08-19 — grid on/off shipped** (decision 52). Matt chose the toggle over a destructive clear: losing a carefully aligned grid because you wanted the lines off for one scene is a bad trade.

    `grid_enabled` persisted on `map_assets` (nullable; NULL reads as on, so existing maps are unchanged), threaded through the aggregate and both ETL directions, with a `▦ Grid On / ▢ Grid Off` button in `MapControlsPanel`. **No contract change** — `GridConfig.enabled` already existed; this only made it writable and durable. So no version bump and no api-game rebuild, unlike PR 14.

    Two things make this the easy version of the proposition that was reverted this morning: it is a **DM-chosen mode** rather than invisible plumbing for token scale, and decision 51 had already settled what "off" means, so there is no state where the lines are off but the grid is quietly still sizing things. The toggle only appears once a grid exists — before that, "off" is just the map's default and Edit Grid is how you make one. Tuned dimensions, offsets and cell size are all kept while off, so switching back on restores the same lattice.

    **Still open: clearing a grid entirely** (destructive, back to unconfigured). Needs `MapAsset.clear_grid_config()` finished — it is called by nothing today and nulls only width/height/opacity, leaving offsets, line colour and cell size — plus fixing `update_from_contract`, which treats a null `grid_config` as "no signal, keep stored" rather than "the DM cleared it". No new column: null width/height already means "no grid" to `build_grid_config_for_game`. Not built, and probably not needed now the toggle exists.

5. **`grid_cell_size` remains grid-named** for what is really the map's scale.

6. **An enabled-but-untuned grid draws lines that do not match token size.** `GridOverlay` falls back to `min(mapWidth/cols, mapHeight/rows)` in *rendered* px while `cellPxForMap` uses the image estimate in *native* px. Pre-existing and unchanged by decision 51 (both expressions were already false in that state). Only reachable on legacy configs, since the tuning UI always writes a cell size. Cosmetic only, and renaming costs a contract bump plus a column rename. Left alone deliberately; noted so the naming friction of 2026-08-18/19 isn't rediscovered from scratch.
