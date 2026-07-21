# Post-library-v2 cleanup

**Status**: planned (separate small PR - keep the library-v2 diff about the feature)
**Source**: dead-code audit of `library-v2` vs `main`, 2026-07-21. Verdict on the branch
itself: the +5,061/-402 diff is honest - no orphans created by the rewrite; every removed
concept (category tabs, Create Object, objects placeholder) died inside rewritten files.
Everything below is pre-existing dead code the audit surfaced, plus two tiny vestiges of
our own and one adjacent bug.

## 1. Delete dead files (all already dead on main - zero references)

- [ ] `rollplay/app/asset_library/hooks/useAudioDownloadUrl.js`
      Exports `fetchDownloadUrl`; no callers on this branch or main.
- [ ] `rollplay/app/shared/components/EmptyState.js`
      Zero users anywhere.
- [ ] `rollplay/app/shared/components/Combobox.js`
      Barrel-exported (`shared/components/index.js:8` - remove that line too), zero
      consumers. NOTE: CLAUDE.md documents it under "Headless UI" as a core shared
      component - update that section when deleting, or the docs point at nothing.

## 2. Backend endpoint with no callers (decide, don't blind-delete)

- [ ] `GET /api/library/{asset_id}/download-url` (`modules/library/api/endpoints.py`)
      No frontend caller anywhere (the app uses `s3_url` from list responses / the
      AssetDownloadManager blob cache instead). Grep found nothing; confirm no external
      tooling or api-game path uses it before removing endpoint + its docstring mention.

## 3. Vestiges from the library-v2 branch itself (trivial)

- [ ] `FAVORITE_COLOR` in `rollplay/app/styles/colorTheme.js` - exported, unused
      (components use the Tailwind `text-favorite` class). Delete, or keep deliberately
      as the JS mirror of `--favorite` next to `ASSET_TYPE_COLORS`; pick one and note it.
- [ ] `buildAssetQueryKey` export in `asset_library/hooks/useAssets.js` - only used
      inside its own file now. Un-export (keep the function).

## 4. Adjacent bug found during the audit (same class as the fixed selection modal)

- [ ] `CharacterManager.js:340` card subtitle renders legacy `char.character_race`,
      which the v2 characters API doesn't return - the race has been rendering blank.
      Reuse the `characterMetaLine` approach from `CharacterSelectionModal.js` (derive
      from `species_code` + `class_entries`, prefer legacy strings if present). Consider
      extracting that helper to the dashboard slice rather than duplicating it.

## 5. Deliberately NOT cleanup (checked and alive - do not remove)

- `useAssets({ assetType })` server param - 9 callers (workshop, game modals,
  audio mixer, CampaignManager).
- `GET /api/library/?campaign_id=` - used by the game's MapSelectionModal.
- Presets endpoints - audio mixer.
- `asset-grid-slider` CSS - the grid-size slider still uses it.

## Related (tracked elsewhere, not this cleanup)

- Repo-wide em-dash sweep: 221 files outside the library diff still contain em-dashes;
  mechanical standalone commit if wanted.
- `--content-accent` token repoint to smoke: needs the deliberate ~10-file sweep with
  explicit Button/icon colors (see session discussion); separate design pass.
