# Market/sharing — legal notes

> Source: claude.ai chat conversation, pasted into Claude Code 2026-08-28. **Not legal advice**
> — a map of the terrain; solicitor review is itself one of the action items below. Kept next to
> [04-market.md](04-market.md), which encodes the product consequences.

## The real risk model

The dangerous assumption is "the sharing user has the rights". In practice a meaningful share of
uploads will be infringing **in good faith** — users who bought a commercial map pack (Czepeku,
Forgotten Adventures, DriveThruRPG…) and sincerely believe paying for it means they can share
it. A purchase licence is almost always personal-use, non-redistributable. Design for "some
uploads are infringing and the uploader doesn't realise", not for "good-faith sharing".

## Safe harbour — earned by process, not contract

What protects the platform from liability for user uploads is intermediary safe harbour:

- **UK**: hosting defence, Electronic Commerce Regulations 2002 — no actual knowledge of
  infringement + expeditious removal once known.
- **US**: DMCA §512(c) — same shape plus hard procedure: designated agent registered with the
  Copyright Office, published takedown contact, counter-notice handling, and an enforced
  **repeat infringer policy**. Wanted if there are US users, even for a UK platform.
- **EU**: Digital Services Act; DSM Directive Article 17 flips liability onto content-sharing
  platforms at scale (lighter obligations while young/small — know the thresholds before
  scaling).

Safe harbour is not automatic; it exists only if the process was in place **when the
infringement occurred**. Hence the hard sequencing rule: **the takedown process must be live
before the first shared asset**, not added after the first legal letter.

### Things that break safe harbour

- **Curating / editorially selecting content** — a "staff picks" shelf moves the platform
  toward publisher rather than neutral host. (Directly relevant: our featured-item mechanism.)
- **Direct financial benefit** combined with control over content. "Always free" helps but
  doesn't fully insulate if sharing drives paid platform subscriptions later.
- **Willful blindness** — an upload titled "Czepeku Winter Pack complete" cannot be un-known.
- **Inducement** — marketing copy matters: "share your creations" fine; "get maps without
  paying" is a gift to opposing counsel.

## Why a signed liability agreement is NOT the answer on its own

An uploader contract binds the uploader, not the rightsholder — the rightsholder sues the
platform regardless; the indemnity only gives a claim to chase a (usually judgment-proof) user
afterwards. Also:

- **Consumer Rights Act 2015**: sweeping "you accept all liability" indemnities against
  consumers can be struck out as unfair. Narrow, specific indemnities (breach of warranty only)
  survive. Asking for less gets you more.
- **Formation matters**: clickwrap (affirmative act, terms shown first, versioned, acceptance
  logged **per upload**) is enforceable; browsewrap routinely is not.
- Contracts do nothing against injunctions, blocking orders, regulators, or payment processors.

The agreement is the documentation layer on top of the process layer — roughly a quarter of the
protection, not a substitute.

## The licence chain (three explicit grants)

1. **Uploader → platform**: host, store, transcode, thumbnail, cache, display, sublicense to
   end users — worldwide, royalty-free, non-exclusive. Plus warranty of rights + narrow
   indemnity + platform right to remove anything without cause + survival clause for
   already-distributed copies.
2. **Uploader → downstream users**: must be explicit, never implied. Either CC-BY 4.0 wholesale
   or a bespoke share licence (in-platform use only, no export, no redistribution, no
   commercial use, revocable, no ownership transfer).
3. **Derivative works**: who owns the composite when a user builds an encounter on a shared
   map, and what happens to it on revocation — answer in the terms up front.

## Revocation

Revocation limits ongoing harm and shows good faith, but does not undo infringement already
distributed. Decide deliberately: **retroactive** (cleaner legally, harsher — DM loses a map
mid-campaign and blames the platform) vs **prospective** (already-acquired copies persist, new
adoptions blocked — friendlier; closer to how CC licences work, which are irrevocable once
granted). Terms must say access is a revocable licence, not a permanent entitlement; warn at
the point of adoption.

> **Decision 2026-08-28 (post-dates this conversation): retroactive cascade chosen
> deliberately** — the Spotify revoked-licence model, with metadata tombstones and the
> adoption-time warning as mitigation. See [04-market.md](04-market.md) § Revocation.

## Audio is the sharp edge

A music track can carry composition, recording, publisher, and performer rights simultaneously,
with collecting societies (PRS/PPL) actively enforcing. Users WILL rip ambient tracks from
YouTube. Options: restrict shared audio to curated known-licensed sources, require source
declarations, or keep audio out of sharing v1 entirely — highest risk, lowest reward category.

## Trademark layer (separate from uploads)

"Dungeons & Dragons" / "D&D" is a trademark — using it in **marketing/product copy** is a risk
independent of copyright ("tabletop RPG" / "TTRPG" / "5e-compatible" cost nothing). SRD 5.1 is
CC-BY-4.0 but a subset (no beholders/mind flayers/Forgotten Realms). Wizards' Fan Content
Policy is non-commercial only. Action: sweep user-facing copy for "D&D".

> **Clarified 2026-08-28**: CC-BY-4.0 has no non-commercial restriction — commercial use of
> SRD content is permitted **with attribution**. The binding constraints are scope (SRD-only)
> and the trademarks. Consequence: platform-authored SRD-scoped templates are viable Market
> seed content (see 04 § seed content).

## Terminology

**Use**: Community Library / Shared Vault / Contributor Hub; share, contribute, publish;
contributor; adopt / add to campaign; revocable licence, access.
**Avoid**: marketplace, store, shop, buy, sell, purchase; own, permanent, lifetime; "download"
where "add to campaign" works; "free" as a selling point against paid alternatives; D&D marks.

## Documents needed

1. Platform Terms of Service (governing law England & Wales).
2. Contributor Agreement / upload terms — clickwrap at first upload, re-accepted on change,
   acceptance versioned and logged per upload.
3. End User Licence for shared assets (CC-BY 4.0 or bespoke).
4. Copyright/Takedown Policy — standalone public page: notice format, contact, counter-notice,
   timeframes, repeat infringer policy.
5. Privacy Policy (UK GDPR — takedown notices contain personal data).
6. Acceptable Use Policy.

## Process before launch

- Monitored takedown contact (copyright@/legal@) published in footer + policy.
- Repeat infringer policy with a numeric threshold and appeal route, actually enforced.
- Internal log: notices, action taken, dates, strikes per account.
- Response SLA (24–48h target) + response templates (valid / invalid / counter-notice).
- Decide who handles a notice when it's just Matt on a Saturday.

## Product build items

- Source declaration **hard gate** at upload: "I created this entirely" / "public domain or
  CC-licensed (source required)" / "explicit written permission (source required)" + mandatory
  source field for the latter two. Shifts knowledge and intent onto the uploader, evidentially.
- Report button on every shared asset.
- Admin panel: unpublish, restrict, strike, terminate.
- Adoption-time warning: contributors may remove shared assets at any time.
- Signed, expiring URLs (already the platform's architecture) — no raw public paths, no
  trivial raw-file export.

## Solicitor (fixed-fee review, before public launch)

Questions to take: ECR 2002 hosting-defence fit of the architecture as designed; whether to
register a DMCA agent; indemnity narrow enough to survive CRA 2015; DSA / DSM Art 17 exposure
and thresholds; review of the contributor agreement + end user licence.

## Sequencing (from the conversation)

Terminology pass + source declaration: cheap, immediate. Four core documents next. Takedown
process + policy pages **before any sharing feature is live**. Solicitor review before public
launch. Non-optional: the takedown process exists before the first shared asset, because the
defence depends on it having been in place at the time of infringement.
