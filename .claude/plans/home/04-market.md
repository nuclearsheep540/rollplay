# Stage 4 — Market

> Part of the [Home landing page epic](00-epic.md). **Shape only** — recorded at epic time so
> Home's Market slots are designed against something real, not a guess. Market is the largest
> stage here and will likely split into several extraction plans of its own when its turn comes;
> what must exist *now* is the definition of the feature and of the "featured item" contract the
> Home page consumes.
>
> Legal terrain: [market-legal-notes.md](market-legal-notes.md) (from the claude.ai legal
> conversation, 2026-08-28). Its product consequences are encoded below — the launch gates are
> non-negotiable because safe harbour only exists if the process was in place when the
> infringement occurred.

## What Market is

Users publish and share **fully built campaigns** — the packaged whole: campaign setup,
GM instructions/notes, and the associated media assets (maps, music, SFX, images) — for other
users to grab and run. The system-agnostic direction is what makes this viable: a package is
"a campaign for whatever system you play", not D&D-licensed content.

**Always free — decided 2026-08-28.** No money transactions: sharing, not selling. If
monetization ever comes up it is a new epic-level decision (payment provider, tax/VAT, payout
reality), not an extraction detail of this one. This also supports the safe-harbour posture
(no direct financial benefit from shared content) — but per the legal notes, don't market
"free" as a selling point against paid alternatives (inducement risk).

The nav entry already exists (a launcher tile since the 2026-08-29 tab-bar retirement —
labelled MARKET); nothing behind it does.

**Seed content**: initial listings can be platform-authored, SRD-scoped campaign templates —
viable (commercially too) under the SRD's CC-BY-4.0 licence with attribution, provided non-SRD
iconic content and the D&D marks stay out. This is also the natural successor to the retired
demo campaign's onboarding job, via the empty-state Market CTA. **Naming is now an open
decision**: the legal notes advise against commerce-implying names ("marketplace", "store",
"buy") — "Community Library" / "Shared Vault" with share/contribute/adopt verbs reads very
differently in a legal letter. "Market" stays the internal working name; the user-facing name
and verb set are Matt's call before any UI copy ships.

## The unit: a listing

A published, packaged campaign. Two halves:

- **The package** — what the buyer/taker receives: campaign structure (title, description, hero
  art), GM notes/instructions, associated library assets. Exact contents (token boards?
  workshop presets?) defined at extraction.
- **The storefront metadata** — what browse/featured surfaces render: cover art, title, author,
  one-line blurb, tags (library v2 tags are precedent), acquisition count.

## Core flows (extraction-time detail)

1. **Publish** — package an owned campaign into a listing.
2. **Browse/search** — the Market tab experience.
3. **Acquire** — "add to my campaigns": an import that copies the *structure* (campaign setup,
   GM notes, per-instance config) into the user's account, while the *files* are never
   duplicated — acquired assets are new `MediaAsset` instances pointing at the contributor's
   existing `MediaSource` (see storage foundation below). One stored file, any number of
   acquisitions; the marginal cost is CloudFront bandwidth, not S3 storage.
4. **Feature** — the mechanism that picks what Home shows (below).

## Storage foundation — the media source/asset split (PREREQUISITE)

[media-source-asset-split.md](media-source-asset-split.md) splits today's
`MediaAsset` into **`MediaSource`** (the physical file: one S3 object, immutable, uploader-owned)
and **`MediaAsset`** (an alias/instance carrying `asset_type`, per-campaign `config`, tags).
It stands on its own merits (per-instance config, simpler in-session lock), but **Market is its
main driver**: the items that plan parks as out of scope — shared/public visibility, cross-user
instances over one source — are precisely what the acquire flow is. The split must land before
stage 4's acquire work; extract it as its own PR series per its own implementation steps.

Two consequences to carry into extraction:

- **Source deletion vs sharing — resolved by the revocation decision below.** Revocation is an
  access-kill via a flag, independent of deletion, so it cascades through cross-user
  references without fighting the split's refcount gate; the gate keeps governing hard-deletes
  of already-tombstoned rows.
- **Tags**: the split stores tags as JSONB "fine until marketplace search" — Market's browse
  is the trigger for that revisit.

## Revocation — DECIDED: retroactive cascade (2026-08-28)

The Spotify model: when a shared asset's licence/permission is revoked, it is pulled from
everyone, the way revoked-licence music disappears from playlists.

- **Mechanism**: a `permitted` flag on `MediaSource`. When revoked: no new instances can be
  created from it, and the raw media becomes unreadable everywhere (signed-URL issuance
  refuses) — for the contributor and every acquirer alike.
- **Tombstones, not silent breakage**: instance metadata (`display_name`, `asset_type`, place
  in the campaign) persists, so an acquirer's campaign shows "this map was removed" where the
  asset sat, rather than mysteriously losing content.
- **Applies to both removal paths**: legal takedown and a contributor withdrawing their own
  shared asset cascade the same way.
- **Deliberately overrides** the legal notes' "prospective is friendlier" lean — the harshness
  (mid-campaign loss) is accepted and mitigated by the tombstone UX plus the adoption-time
  warning ("contributors may remove shared assets at any time"), which stays mandatory.
- Physical deletion is a separate, later concern: revocation kills access instantly; the
  split's refcount gate governs when tombstoned rows/objects may be hard-deleted.

## The featured item (what Home consumes)

- **Contract for the Home card**: cover art, title, author, blurb, link → listing in the Market
  surface. Visual language settled in the mock (2026-08-29): a cover-forward shelf card —
  portrait cover left, meta beside it — on a narrow stepped rect (not an art-background/
  title-overlay card).
- **Selection mechanism — leaning: admin-curated.** An admin action "feature this listing",
  gated behind the stage-2 `require_admin` infra (which conveniently already exists by this
  stage). Automatic selection (most-acquired, newest) only makes sense with volume; revisit
  then.
- **Legal caveat on featuring**: editorial selection of user content cuts against the
  neutral-host posture safe harbour depends on — featuring a listing means taking on knowledge
  of it. Mitigation: feature only listings whose provenance has been vetted (the featured shelf
  is curated *and* checked, never blind). Confirm the approach in the solicitor review.
- **Home activation**: the "Featured from the Market" card ships as a VISIBLE placeholder from
  stage 1 (revised 2026-08-29 — see 02's Market slots section); the empty-state CTA ("Don't
  have a game? Grab a ready-made one") stays designed-but-hidden. This stage makes both real.

## Legal launch gates (non-negotiable — before the first shared asset exists)

Moderation posture is largely settled by the legal notes: **reactive notice-and-takedown with
red-flag vigilance** is the safe-harbour shape (blanket pre-moderation isn't required; willful
blindness to obvious red flags voids the defence). What must be live at launch:

- Takedown flow + monitored, published contact (copyright@/legal@); response SLA and templates;
  internal log of notices, actions, and strikes.
- Repeat infringer policy with a numeric threshold and appeal route, actually enforced.
- **Source declaration hard gate** at publish ("I created this" / "public domain or CC, source
  required" / "written permission, source required") + report button on every listing + admin
  panel (unpublish, restrict, strike, terminate).
- Contributor terms as **clickwrap**, acceptance versioned and logged per upload; the
  three-grant licence chain (uploader→platform, uploader→downstream users, derivatives)
  defined in the documents (see the documents list in the legal notes).
- Solicitor fixed-fee review before public launch (questions listed in the legal notes).

## Open at extraction

- **User-facing naming** — "Market" vs library-style naming and the share/adopt verb set (see
  above; Matt's call).
- **Audio in sharing v1 — lean: exclude.** Highest-risk, lowest-reward category (stacked
  rights, active collecting societies, users ripping YouTube ambience). If included at all:
  curated known-licensed sources only.
- **Listing updates/versioning** — can an author update a listing after others acquired it, and
  what do acquirers get? (Acquired instances snapshot config at acquisition, and a
  `MediaSource` is immutable under the split — so an "update" means new sources / new config;
  define what, if anything, propagates.)
- **Derivative works** — who owns the composite built on a shared asset, and its fate on
  revocation. Answered in the terms, not in a support ticket.

## Rough phasing (revisit at extraction)

1. Legal foundation + listing model + publish flow — the launch gates above land with or
   before anything becoming shareable.
2. Browse + acquire/import.
3. Featured mechanism (vetted) + Home slot activation.
