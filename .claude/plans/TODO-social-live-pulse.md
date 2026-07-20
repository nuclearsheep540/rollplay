# TODO — Social panel "Live Pulse" (v2 social feed)

> Parked 2026-07-19 during the Social panel v1 design conversation (the feature was working-titled "Fellowship" back then — renamed post-build). Matt: "a fun social trinket if users were to use this properly — definitely keep this idea for a V2 one day."

## The idea

A lightweight activity feed at the bottom of the Social panel showing small snippets of friends' happenings — not notifications *to you*, but ambient awareness *about your circle*:

- "DragonSlayer99 rolled a **Nat 20** on Intimidation" (just now)
- "ForgottenOne started drafting a new campaign" (1h ago)
- Session milestones, level-ups, new characters, campaign creations

Origin: the Gemini/Stitch wireframe accidentally aggregated this with friends+notifications; the v1 panel ships the three plumbed sections (friends / requests / notifications) and reserves a ghosted "Live pulse" slot.

## Why it's v2, not v1

Notifications are point-to-point (recipient-addressed, persisted per user). Pulse is **fan-out**: an event about user X delivered to everyone on X's friend list. That needs:

1. **Activity event type** in the events module — `ActivityEvents.friend_activity(...)` returning `List[EventConfig]` (one per friend), following the existing multi-recipient pattern (e.g. `SessionEvents.session_started`).
2. **Emission points** — api-game moments (nat-20s, session joins) would need to reach api-site's event manager; api-site moments (campaign/character creation) are local. The api-game→api-site hop is the real design question (internal HTTP like `site_client`, or batch).
3. **Storage/retention** — pulse lines are ephemeral flavor, not records: probably a small capped per-user feed (or derive-on-read from recent friend notifications), NOT the notifications table.
4. **Consent/noise** — sharing "what I'm doing" with all friends should be a visible, opt-out-able behavior; default-on but discoverable. Volume control (only milestones, not every roll).

## Pointers

- Panel v1 mock (ghosted Pulse section included): claude.ai/code/artifact/1883353d-1078-4604-9eb1-e7b737b1593b
- Events module patterns: `api-site/modules/events/` (EventConfig, multi-recipient loops)
- Related principle: inform maximally — pulse is pure inform, zero mechanics
