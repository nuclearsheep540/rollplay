# Map Tokens v3 — PC Token Avatars + Reusable Focal-Area Select

> **Status:** PLANNED (designed with Matt, 2026-08-17). Builds on [02-dm-tokens-workshop-images.md](02-dm-tokens-workshop-images.md) (v2, decisions 16–29; PRs 6–10 shipped in release 0.60.0).
> **Scope:** two tracks. (1) The character avatar flow gains the workshop's focal-area select, writing the same purpose-keyed crop onto the image asset — the picker→crop→save chain becomes shared, not coded twice. (2) PC tokens render the character's avatar through the exact read path NPC token images already use (`token_images` lookup + `TokenAvatarDisc` CSS crop).
> **Governing philosophy:** [product-principles.md](../core/product-principles.md) — inform maximally, constrain minimally. One guard is *removed* under this principle (decision 34).

---

## 1. Product decisions (settled with Matt, 2026-08-17)

Continues v2 numbering (16–29 in [02-dm-tokens-workshop-images.md](02-dm-tokens-workshop-images.md)).

30. **PC tokens render the character's avatar** (narrows decision 27's "players still cannot set or change token images anywhere"). The player never picks token art directly — the token *derives* its face from the character's avatar. Setting/clearing the avatar is the only lever. NPC/workshop flow is unchanged.
31. **One focal area per image, purpose key `"token"`, no matter who sets it.** The avatar flow writes `focal_areas["token"]` — the same key the workshop writes — so the read path (`TokenImageRef.token_area`, `tokenImages[id].token_area`) is byte-identical for pc and npc tokens, with zero branching. An image's crop is its "token face"; the avatar picker and the workshop are just two doors to the same attribute. The `"character"` purpose stays reserved and unused (only needed if avatar *display* surfaces ever want a crop that differs from the token face).
32. **Avatar selection always prompts the area select**, pre-filled when the image already has a `token` area — mirroring the workshop interaction (decision 27). The avatar pane additionally gets an "adjust crop" affordance so re-cropping doesn't require re-picking the image. Shared-crop consequence carries over: adjusting the crop moves every token (and every character avatar token) using that image.
33. **Avatar images are fixed at session start.** They ride the existing `token_images` delivery; a mid-session avatar or crop change lands next session. Accepted — consistent with the workshop image story (decision 27's "fixed at start" premise), and the graceful degradations (no avatar → color disc; no crop → centered cover) hold everywhere.
34. **`SetImageFocalArea` drops the active-session guard.** Crops are snapshotted into `token_images` at session start, so a mid-session crop edit *cannot* desync live play — it simply applies next session, exactly like `SetCharacterAvatar` (which has never had a session guard). Keeping the 409 would block players re-cropping an avatar during a live game for no protective reason. Ownership + image-type guards stay. (Settled with Matt 2026-08-17; supersedes v2 §3.5's "apply the same two-guard set for consistency".)
35. **Image tokens keep their identity ring** (raised by Matt 2026-08-17). Today `TokenAvatarDisc` covers the color disc entirely and wears a plain black border — an image token has no color identity. Change: the avatar circle's ring renders in the token's `discColor` (character color for pc/companion, DM-rose for plain npc), so "yellow player" stays yellow with art. Applies to the runtime layer and the workshop preview (same component).
36. **Session start re-stamps placed PC tokens' `image_asset_id` from the current roster.** Decision 24 keeps PC tokens alive across sessions via the paused board, which would otherwise freeze the avatar they were placed with. Invariant by construction: *a PC token's image always derives from the character's current avatar as of session start.* Avatar cleared between sessions → `None` → color disc.

## 2. Current-system facts the design rests on (verified 2026-08-17)

### The read path is already kind-agnostic
- `MapToken.image_asset_id` exists for all kinds (`shared_contracts/map_token.py:41`); nothing in rendering, filtering, or ETL extraction is npc-specific.
- `StartSession._build_token_images` (`session/application/commands.py:389-430`) resolves image ids → `TokenImageRef` and already handles every edge this feature needs: out-of-campaign assets (falls back to `asset_repo.get_by_id`, `:407-411`), non-image assets (isinstance guard → color disc), signing failures, and missing focal area (`token_area=None` → centered-cover render).
- Frontend lookup is one line: `MapTokenLayer.js:500-503` renders `TokenAvatarDisc` from `tokenImages[token.image_asset_id]`; `TokenAvatarDisc` centered-cover fallback for `area=null` already exists.
- `initial_state` filters `token_images` for players to visible-board images only (`app_websocket.py:44-57`, the hidden-monster artwork guard); the enters-view piggyback (`websocket_events.py:1861-1877`) attaches the ref to a `place`/reveal fragment. PC tokens are never hidden, so placing one always delivers its ref.

### The metadata pipe is already field-transparent
- api-game flattens the **whole** `PlayerCharacter` dict into `player_metadata[user_id]` (`api-game/app.py:508-520`) — a new contract field propagates with zero api-game changes.
- `player_metadata` ships in `initial_state` (`app_websocket.py:66`) and merges into `seat.characterData` (`game/hooks/webSocketEvent.js:80,128,147,193-197`) — exactly where `MapTokenChipList.js:45-51` builds the PC chip token (it already carries `character_id` from there).

### Character avatar today
- `characters.avatar_asset_id` FKs MediaAsset with eager-loaded `avatar_s3_key` (`character_model.py:82-89`); `SetCharacterAvatar` enforces owned + image-type; `CharacterResponse` exposes `avatar_url` but **not** `avatar_asset_id` (`characters/api/schemas.py:207-209`) — the crop flow needs the id added.
- `PlayerCharacter` ETL contract (`shared_contracts/character.py:19-35`) carries no avatar field — avatars never reach api-game today.
- Two avatar-set call sites: `useSetCharacterAvatar` (character sheet pane) and CharacterWizard's direct PATCH (`CharacterWizard.js:280`). Both open `CharacterAvatarPickerModal` — a thin wrapper over `AssetPicker(assetType="image", allowUpload)`.

### The reusable pieces and the duplicated glue
- `FocalAreaModal` is already in `shared/components/`, purpose-agnostic by design (its docstring reserved the character use).
- `useSetFocalArea` lives in `workshop/hooks/` — needs hoisting to shared. Its 409 special-case message ("end the session first") becomes dead once decision 34 lands.
- The picker→crop→save chain is workshop-local state machine glue (`MapConfigTool.js:517-574`): fetch asset → open modal pre-filled from `focal_areas.token` → confirm saves crop then applies the image id.
- `fetchAssetById` is copy-pasted **three times** (`MapConfigTool.js:36`, `ImageConfigTool.js:15`, `AudioWorkstationTool.js:96`) — hoisting it is consolidation, not invention.

## 3. Design

### 3.1 Shared focal-area flow (frontend extraction)

- **Hoist** `useSetFocalArea` → `app/shared/hooks/useSetFocalArea.js` (drop the 409 special-case copy once decision 34 lands) and `fetchAssetById` → `app/shared/utils/` (replace all three workshop copies).
- **Extract the chain** as `app/shared/hooks/useFocalAreaFlow.js`: owns `cropState {imageAssetId, imageUrl, initialArea}` and exposes `begin(assetId)` (fetches the asset, opens pre-filled from `focal_areas.token`), `confirm(area)` (PATCHes purpose `"token"`, then invokes the caller's `onCropSaved(imageAssetId, area)`), `cancel()`. The caller renders `<FocalAreaModal>` bound to the hook. Workshop keeps only its token-specific bit (which baseline token receives the id); `MapConfigTool.js:517-574` shrinks to a `useFocalAreaFlow` consumer.

### 3.2 Character avatar crop flow

- `CharacterResponse.avatar_asset_id: Optional[UUID]` (aggregate already has it; `from_attributes` serialises it).
- Both avatar-set call sites chain: picker select/upload → `useFocalAreaFlow.begin(assetId)` → on crop saved → existing avatar PATCH (`useSetCharacterAvatar` on the pane; the wizard's direct PATCH). Cancel at the crop step = avatar unchanged (the crop is part of choosing, per decision 32).
- `CharacterAvatarPane` gains "adjust crop": `begin(avatar_asset_id)` re-opens the modal pre-filled; confirm saves the crop only (no avatar PATCH needed).

### 3.3 Backend: guard removal (api-site)

- `SetImageFocalArea` (`library/application/commands.py`): remove the `check_asset_in_active_session` call (decision 34). Ownership + asset-type guards stay. Update the command's tests; remove the frontend hook's 409 branch.

### 3.4 Contract + ETL (api-site → api-game)

- **Contract:** `PlayerCharacter.avatar_asset_id: Optional[str] = None` (`shared_contracts/character.py`). Version bump; extend `tests/test_contracts.py` (contracts CI gate). `extra="forbid"` ⇒ both services take the bumped package together (dev bind-mounts hot-reload; prod rebuilds).
- **Roster:** `_build_session_users` (`commands.py:276-289`) adds `avatar_asset_id=str(character.avatar_asset_id) if character.avatar_asset_id else None`.
- **Re-stamp** (decision 36): after the three-way merge in `_restore_map_token_state`, overwrite each `kind == "pc"` token's `image_asset_id` with its owner's current `avatar_asset_id` (roster lookup by `owner_user_id`; owner absent from roster → leave untouched). Runs before `_build_token_images` so the board scan sees fresh ids.
- **Union:** `_build_token_images` collects rostered avatar ids alongside board-referenced ids — the avatar must be resolvable in `token_images` *before* any PC token is placed mid-session. The existing resolution loop needs no changes (facts §2). Note the call-site ordering in `execute` (`:684`): session_users must be built before token_images.
- **api-game: zero code changes.** Flatten, doc storage, per-recipient filtering, and the enters-view piggyback are all field- and kind-transparent.

### 3.5 Chip wiring (frontend)

- `MapTokenChipList.js` chip token gains `image_asset_id: seat.characterData.avatar_asset_id || null`. Placement carries it into the board; drag lane and pause/finish extraction untouched.
- **Identity ring** (decision 35): `TokenAvatarDisc` gains a `ringColor` prop replacing the hardcoded `border-black/55`; the call sites (`MapTokenLayer.js:500-505` and the workshop preview) pass the already-computed `discColor`. Character color for pc/companion, DM-rose for plain npc — including existing workshop NPC images, which currently render black-ringed.

## 4. PR sequence

Continues v2 numbering (PRs 6–10 shipped).

| PR | Contents | Ships on |
|---|---|---|
| **11 — Avatar crop flow + shared extraction** | §3.1 hoists + `useFocalAreaFlow`; §3.2 avatar chain + adjust-crop + `CharacterResponse.avatar_asset_id`; §3.3 guard removal. Workshop refactored onto the shared hook (behaviour-identical). No contract package changes. | feature branch |
| **12 — PC token avatars** | §3.4 contract field + roster + re-stamp + union + contracts test; §3.5 chip wiring. Verification checkpoint: pc `place` always sets `player_view_changed` (open item 1). | feature branch |

PR 11 first so avatars have crops by the time tokens render them (12 works without 11 — centered cover — but ships uglier). Every PR: GPL headers on new files, `authFetch` in new hooks, no migrations, no new endpoints, no NGINX changes. PR 12 is contract-touching: verify against both services.

## 5. What we will NOT build

- No player-facing token-image picker — the avatar is the only lever (decision 30).
- No per-character or per-token crop; the area is the image's attribute (v2 decision 27 stands).
- No `"character"` focal-area purpose — reserved, unused (decision 31).
- No mid-session avatar propagation or `token_images` refresh (decision 33).
- No avatar display changes in pane/initiative tracker from the crop (the crop drives token faces only, for now).
- No backfill for existing avatars — centered-cover until the owner re-crops (self-heals via decision 32's always-prompt).

## 6. Verification (desktop, two-browser where relevant)

- **PR 11:** picking an avatar always prompts the crop (pre-filled on re-pick); cancel leaves the avatar unchanged; adjust-crop saves without re-picking; workshop token avatar flow byte-identical after the refactor; re-cropping while a session is ACTIVE succeeds (guard gone); wizard path saves avatar + crop on a draft. Unit: `SetImageFocalArea` guard tests updated; `useFocalAreaFlow` chain (begin/confirm/cancel).
- **PR 12:** player with an avatar places their token → avatar face renders for both browsers (including a player who connected before placement — the piggyback test); player with no avatar → color disc; avatar changed between sessions → paused board resumes with the *new* face (re-stamp); avatar cleared between sessions → color disc; avatar image not associated with the campaign still resolves; avatar without a crop → centered cover; image tokens wear the owner's color ring (yellow player → yellow ring + art), npc image tokens wear rose. Unit: re-stamp (owner present/absent/cleared), union collection, `PlayerCharacter` contract round-trip in `test_contracts.py`.

## 7. Open items

1. **Verify at PR 12 implementation:** `player_view_changed` is true for every pc `place` in the fragment dispatch (`websocket_events.py:1865-1877`) — if any path skips the piggyback, players who lack the ref render a color disc until reconnect.
2. CharacterWizard's direct avatar PATCH (`CharacterWizard.js:280`) bypasses `useSetCharacterAvatar` — consolidate onto the hook while wiring the crop chain if the bypass reason turns out to be historical, otherwise leave and wire both.
3. MediaSource/MediaAsset split (v2 §8): `focal_areas` folds into per-instance config at split time; decision 31's single-key choice survives (the alias would carry its own crop). Nothing here resists the fold.
