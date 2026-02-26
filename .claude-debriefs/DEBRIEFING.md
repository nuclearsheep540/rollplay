# Debriefing — Process Guide

## What Is a Debrief?

A debrief is the counterpart to a plan. Plans capture **intent** (what we're going to build); debriefs capture **reality** (what we actually built, and why it differs). Together they form a complete record of decision-making across a body of work.

Plans become stale as work progresses — bugs get found, scope expands or contracts, architectural decisions get made on the fly. The debrief reconciles a plan with its outcome so future work can build on ground truth rather than outdated assumptions.

## When to Debrief

Create a debrief when:
- A plan's implementation is complete (or a major phase is complete)
- A branch is ready to merge and covers work tracked by a plan
- The user explicitly asks for one
- You notice significant drift between a plan and the actual codebase

## Debrief Structure

Every debrief should follow this structure:

### Header
```markdown
# Debrief: [Plan Name]

**Plan file:** `.claude-plans/[filename].md`
**Branches:** [branch names and PR numbers]
**Period:** [date range]
**Status:** [per-feature status summary]
```

### 1. Goals Set
Restate the original goals from the plan. Keep it brief — bullet points mapping to the plan's feature list. This anchors the reader in what was intended.

### 2. What Was Delivered
Per-feature summary of what actually shipped. Include:
- Key files created or modified
- How the implementation matches or differs from the plan
- What was explicitly not delivered (and whether it was deferred or dropped)

### 3. Challenges
Problems encountered during implementation that weren't anticipated in the plan:
- Bugs discovered and fixed (with commit refs where useful)
- Architectural issues that required mid-flight refactoring
- Integration problems between systems
- Each challenge should note how it was resolved

### 4. Decisions & Diversions
The most important section. Every deliberate departure from the plan gets an entry:

```markdown
### D[n]: [Short title] ([planned X] → [shipped Y])

**Plan said:** [What the plan specified]
**Shipped:** [What was actually built]

**Rationale:** [Why the diversion was made]

**Impact on [future work]:** [How this affects downstream plans]

Documented in plan: `.claude-plans/[filename].md` → [Section reference]
```

Diversions include:
- Scope reductions (planned full feature → shipped simpler version)
- Scope additions (features not in plan that were added)
- Technical pivots (different approach than planned)
- Bug fixes that changed behaviour
- Architecture refactors

### 5. Current Architecture (if applicable)
A snapshot of the system state after the work is complete. Useful when the work changed data flow, state management, or system topology. Include diagrams, state location tables, or API surface summaries as needed.

### 6. Downstream Readiness (if applicable)
When the completed work is a prerequisite for future plans (e.g., V1 before V2), map each downstream dependency against what was delivered. Use a simple table:

```markdown
| Dependency | Status | Ready? |
|------------|--------|--------|
| [thing V2 needs] | [what V1 delivered] | Yes/No/Partial |
```

### 7. Open Items
Anything remaining before the work can be considered fully closed — merge blockers, build verification, follow-up tasks.

## Consolidating Sub-Plans

During implementation, sub-plans may be created for features that emerged or were refined (scope additions, implementation detail plans, bug fix plans). When debriefing:

1. **Fold sub-plan content into the parent plan** as numbered sub-sections (e.g., Feature 3a, Feature 3b)
2. **Mark sub-sections with a blockquote** explaining they were refined during implementation
3. **Update the debrief** to reference plan sections (e.g., "→ Feature 3a") instead of separate files
4. **Delete the standalone sub-plan files** — the parent plan is now the single source of truth

## Relationship to Plans

```
Plan (before work)          Debrief (after work)
─────────────────          ──────────────────────
"We will build X"    →     "We built X, but also Y"
"Using approach A"   →     "Switched to approach B because..."
"Touching 6 files"   →     "Touched 12 files — here's why"
```

The plan file should also be updated during debriefing to reflect what was actually built — so it becomes a living technical reference, not a historical wish-list. The debrief captures the *why* behind changes; the plan captures the *what* as-built.

## File Naming

Debrief files mirror their plan file names:
- Plan: `.claude-plans/media-foundation-v1.md`
- Debrief: `.claude-debriefs/media-foundation-v1.md`

## How to Perform a Debrief

1. **Read the plan** — understand original intent and feature breakdown
2. **Read git history** — `git log --oneline origin/main..HEAD` and `git diff --stat origin/main..HEAD` to see what actually changed
3. **Read the code** — key files from the diff, mapped against the plan's file lists
4. **Identify deltas** — where does implementation differ from plan? New files not in plan? Planned files not created? Changed approaches?
5. **Draft the debrief** — following the structure above
6. **Update the plan** — fold in sub-plans, correct technical details to match reality
7. **Clean up** — delete redundant sub-plan files, update cross-references
