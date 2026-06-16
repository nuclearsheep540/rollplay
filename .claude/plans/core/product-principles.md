# Product Principle — Facilitate Play, Don't Enforce Rules (Freedom From Guardrails)

> **Status:** foundational, product-wide. This is the governing philosophy for *every* feature — character creation, level-up, the live game session, DM tools, dice, audio, everything. It **refines** the character-v2 plan's [§3.0 / Phase D](../character_v2/character-v2-completeness.md) framing, which was written character-creation-first and leaned on a "warnings on save" rail this doc reframes (see *Proactive guidance* below).

## The principle in one line

Rollplay is a virtual tabletop, not an automated DM. **Inform maximally; constrain minimally.** The app stores data, displays data, and surfaces what a player or DM needs to make an informed decision. It never enforces the *consequences* of the rules — those belong to the table.

The model is D&D Beyond at its best: a structured notebook that knows the rules and shows them to you in context, but lets you write whatever you want. The rules are *scaffolding*, never a *gate*.

## The dissolution of "canon vs homebrew"

This is what makes the principle more than a slogan: **there is no "homebrew mode."**

Most tools force a binary — play by the book, or flip a "homebrew" switch and lose all the helpful scaffolding. That switch is itself a guardrail. We don't have one.

Every configuration is just *a configuration*. A player can build an Orc Warrior with 0 STR "because it'd be hilarious," and the app neither blocks it nor brands the whole character "homebrew." The player stays fully informed of what's *systematically correct* (the UI proposed STR 13+, showed what they'd qualify for) while remaining free to paint outside the line on exactly the points they choose — without ever leaving the supported, scaffolded experience.

This is **freedom from guardrails**: inform on every point, gate on none (except data integrity).

## The three axes — never conflate them

"Facilitate, don't enforce" governs exactly ONE of these. Keeping them separate *is* the discipline.

1. **Completeness** — *is this a valid entity at all?* A character needs a name, a class, a species. These are required to *exist*. Requiring them (e.g. to finalize a draft) is correct and is **not** what "facilitate, don't enforce" relaxes. Letting someone skip a required field isn't facilitation — it's just incomplete data.
   - Mechanism: an "incomplete" affordance (badge, disabled finalize) is fine. Drafts may sit incomplete; finalization requires completeness. Never gate *per-keystroke / per-draft-save* on it.

2. **Canon-correctness** — *is this complete configuration "by the book"?* Sub-optimal ability spreads, off-meta species/class pairings, multiclassing without meeting the ability prerequisite, an unusual subclass timing. **This is the only axis "facilitate, don't enforce" governs.** Never gate, never hide, never disallow, never caution at submit. Guide proactively toward canon *during* the choice; otherwise stay silent and let it through.

3. **Data invariants** — *would this corrupt the database?* UUID uniqueness, FK integrity, ability score in 1–30, HP gain ≥ 1, quantity ≥ 0. Always hard-blocked. These are not "rules," they're integrity.

## Proactive guidance, not reactive caution

When we help with canon-correctness (axis 2), the *mechanism* matters as much as the intent:

- ✅ **Proactive + positive** — sensible defaults, recommended ordering, "recommended" labels, surfacing what you *qualify for*, an unobtrusive inline hint at the point of choice ("D&D suggests STR 13+ to multiclass into Fighter"). Guidance lives in the *journey*.
- ❌ **Reactive + negative** — a warning banner or caution at the gate that says "you did this wrong," or a violations list attached to the response on save. That is soft enforcement in disguise.

Both "involve the rules." Only the first is facilitation.

> **Refinement to the character-v2 plan:** the plan introduced a `warnings: list[str]` "violation on save" rail ([§D.1](../character_v2/character-v2-completeness.md)). Reframe it: deliver eligibility/guidance data *at the point of choice* (proactive), not post-hoc cautions on the response. Feat-eligibility computation survives — but as *discoverability* ("here's what you qualify for"), not as a "you picked wrong" warning. Update §3.0 / Phase D to match this doc.

## The litmus tests

- **Compute & display?** Yes, if doing it by hand is tedious enough to harm the experience, OR the player needs the answer to make their next decision. (Feat eligibility across 17 feats, multiclass spell slots, HP recompute on CON change, spell save DC.)
- **Enforce / block the save?** Never — unless it's a data invariant (axis 3).
- **Require for the entity to exist?** Only the genuine completeness fields (axis 1), and only at the point of bringing the entity into existence (finalize) — never on every keystroke or draft save.

When in doubt on any feature: *can this be reframed from "enforce X" to "display the data the table needs to decide X"?* If yes, do that.

## It's product-wide, not just character creation

The same rule holds everywhere we add rules-awareness:

- **Dice:** the system can know "the rules say roll 2d6 here." It shows that. It never stops a DM who says "roll 5d6, it'll be more fun." Inform the canonical roll; constrain nothing.
- **Live session / DM tools:** surface what's by-the-book; let the table override anything verbally or by direct edit.
- **Inventory, conditions, resources:** store and display; the table declares consequences — no auto-decrementing ammo, no enforced attunement cap, no encumbrance block, no auto-applied condition effects.

---

*This doc is the source of truth for the philosophy. Where a plan or implementation contradicts it, the plan is wrong, not this doc.*
