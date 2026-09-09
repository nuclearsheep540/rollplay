# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Character aggregate (v2) — code-based, edition-aware, draft-capable.

The aggregate holds no ruleset math. It calls into a RulesetStrategy injected
by the caller for anything that depends on edition rules (XP→level,
proficiency bonus, modifier calculations). This keeps the aggregate clean and
the strategy testable in isolation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable, Optional
from uuid import UUID


ABILITY_CODES: tuple[str, ...] = (
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
)

SKILL_SOURCES: frozenset[str] = frozenset({"CLASS", "BACKGROUND", "FEAT", "SPECIES"})
FEAT_SOURCES: frozenset[str] = frozenset({"BACKGROUND_ORIGIN", "ASI", "OTHER"})
SPELL_SOURCES: frozenset[str] = frozenset({
    "class_known", "class_prepared", "spellbook", "always_prepared",
    "mystic_arcanum", "magic_initiate", "species", "magical_secrets",
})


# --------------------------------------------------------------------------- #
# Value objects
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class AbilityScores:
    """Immutable set of the six core ability scores.

    Validation: each score 1..30 (allows for late-level Primal Champion bumps).
    """

    strength: int
    dexterity: int
    constitution: int
    intelligence: int
    wisdom: int
    charisma: int

    def __post_init__(self):
        for name in ABILITY_CODES:
            v = getattr(self, name)
            if not 1 <= v <= 30:
                raise ValueError(f"{name} must be 1..30 (got {v})")

    def get(self, ability_code: str) -> int:
        if ability_code not in ABILITY_CODES:
            raise KeyError(f"Unknown ability code: {ability_code!r}")
        return getattr(self, ability_code)

    def to_dict(self) -> dict[str, int]:
        return {name: getattr(self, name) for name in ABILITY_CODES}

    @classmethod
    def from_dict(cls, data: dict[str, int]) -> "AbilityScores":
        return cls(**{name: int(data.get(name, 10)) for name in ABILITY_CODES})

    @classmethod
    def default(cls) -> "AbilityScores":
        return cls(10, 10, 10, 10, 10, 10)


@dataclass(frozen=True)
class ClassEntry:
    """One row of a character's multi-class progression."""
    class_code: str
    level: int
    is_primary: bool = False
    sub_choices: dict = field(default_factory=dict)  # L1 feature-choice picks: {choice_code: [picked_codes]}
    chosen_skills: list = field(default_factory=list)  # the class's level-1 skill proficiency picks

    def __post_init__(self):
        if not 1 <= self.level <= 20:
            raise ValueError(f"Class level must be 1..20 (got {self.level})")


@dataclass(frozen=True)
class SubclassEntry:
    """The subclass a character has chosen for one of their classes (B.1).

    One per class. ``chosen_at_level`` is the character level at which it was picked (audit).
    """
    class_code: str
    subclass_code: str
    chosen_at_level: int

    def __post_init__(self):
        if not 1 <= self.chosen_at_level <= 20:
            raise ValueError(
                f"SubclassEntry.chosen_at_level must be 1..20 (got {self.chosen_at_level})"
            )


@dataclass(frozen=True)
class SkillProficiency:
    """A skill proficiency the character has gained.

    ``source`` says what *category* of thing granted it (CLASS / BACKGROUND / FEAT / SPECIES).
    ``character.skills`` is a materialised projection — ``rebuild_character_skills`` recomputes it
    as the deduped union of the character's choice records (L1 class picks, feature/species skill
    sub-choices, background grants), so a proficiency here is never authored directly, only derived.
    """
    skill_code: str
    source: str
    expertise: bool = False

    def __post_init__(self):
        if self.source not in SKILL_SOURCES:
            raise ValueError(
                f"SkillProficiency.source must be one of {sorted(SKILL_SOURCES)} "
                f"(got {self.source!r})"
            )


@dataclass(frozen=True)
class FeatAcquisition:
    """A feat the character has taken at a specific level."""
    feat_code: str
    level: int
    source: str

    def __post_init__(self):
        if self.source not in FEAT_SOURCES:
            raise ValueError(
                f"FeatAcquisition.source must be one of {sorted(FEAT_SOURCES)} "
                f"(got {self.source!r})"
            )
        if not 1 <= self.level <= 20:
            raise ValueError(f"FeatAcquisition.level must be 1..20 (got {self.level})")


@dataclass(frozen=True)
class SpellSelection:
    """A spell the character knows / has prepared, with its provenance.

    ``spell_level`` is 0 for cantrips, 1..9 for leveled spells. ``source`` (one of
    SPELL_SOURCES) says *how* the character has it — class_known / class_prepared /
    always_prepared / species / …; ``granted_by`` records the originating class / feat /
    species code so a multi-class caster can attribute each spell. ``casting_ability`` is
    the ability code used for this spell's save DC / attack (the granting class's
    spellcasting ability); ``None`` when not yet resolved.
    """
    spell_code: str
    spell_level: int
    source: str
    granted_by: str = ""
    casting_ability: Optional[str] = None

    def __post_init__(self):
        if self.source not in SPELL_SOURCES:
            raise ValueError(
                f"SpellSelection.source must be one of {sorted(SPELL_SOURCES)} "
                f"(got {self.source!r})"
            )
        if not 0 <= self.spell_level <= 9:
            raise ValueError(f"SpellSelection.spell_level must be 0..9 (got {self.spell_level})")


@dataclass(frozen=True)
class ResourceUsage:
    """A class resource pool's *spent* count (rage, sorcery points, channel divinity, …).

    ``current_value`` is uses **consumed** (0 = full); the pool's MAX comes from the ruleset
    and is joined in at read time. Storing spent (not remaining) keeps a fresh character's
    pools implicitly full with no rows, and needs no ruleset to initialise. The aggregate is
    edition-agnostic, so ``pool_code`` is a free code — the strategy owns the set of real pools.
    """
    pool_code: str
    current_value: int  # uses consumed

    def __post_init__(self):
        if self.current_value < 0:
            raise ValueError(
                f"ResourceUsage.current_value must be >= 0 (got {self.current_value})"
            )


@dataclass(frozen=True)
class InventoryItem:
    """One line of a character's inventory (J.3). ``item_code`` references the item catalogue
    (J.1); ``notes`` is a free-text escape hatch (attuned, equipped, custom effect — anything).
    No enforcement: quantity 0 is allowed (depleted-but-kept)."""
    item_code: str
    quantity: int = 1
    notes: str = ""

    def __post_init__(self):
        if self.quantity < 0:
            raise ValueError(f"InventoryItem.quantity must be >= 0 (got {self.quantity})")


# --------------------------------------------------------------------------- #
# Aggregate
# --------------------------------------------------------------------------- #


# Absolute slot ceiling, mirrored by ck_characters_slot_range in the DB.
# users.max_slots (<= this) governs how many a given account may occupy.
HARD_SLOT_CEILING = 8


@dataclass
class CharacterAggregate:
    """Aggregate root for one character.

    Stays edition-agnostic: stores codes (class/species/background/skill/feat)
    and lets the registry / ruleset strategy resolve them when math is needed.
    """

    # Identity
    id: Optional[UUID]
    user_id: UUID
    edition_id: int
    edition_code: str
    active_campaign: Optional[UUID]

    # Identity / origin
    character_name: str
    species_code: str
    background_code: str

    # Class progression
    class_entries: list[ClassEntry]

    # Stats. ``ability_scores`` holds the *base* values the player rolled or
    # picked; ``origin_ability_bonuses`` is the per-ability bonus granted by
    # the background (and only the background, for now). Final score for any
    # ability = ``ability_scores.get(code) + origin_ability_bonuses.get(code, 0)``
    # — use :meth:`final_ability_score` everywhere math is involved.
    ability_scores: AbilityScores
    origin_ability_bonuses: dict[str, int]
    save_proficiencies: frozenset[str]
    skills: list[SkillProficiency]
    feats: list[FeatAcquisition]

    # Vitals
    level: int
    xp: int
    hp_max: int
    hp_current: int
    hp_temp: int
    ac: int

    # Runtime state
    death_save_successes: int
    death_save_failures: int
    inspiration: bool
    status_effects: list[str]
    is_alive: bool

    # Species-derived
    speed: int
    size: str
    languages: list[str]

    # Lifecycle
    is_draft: bool
    creation_step: Optional[str]
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    # Capacity slot (0-based). Held for life; never reshuffled. None while
    # soft-deleted. The absolute ceiling is HARD_SLOT_CEILING; how many of
    # those slots a user may occupy is users.max_slots.
    slot: Optional[int] = None

    # Library MediaAsset (asset_type='image') the character uses as its
    # avatar. ``None`` ⇒ frontend shows the default /heroes.png. We also stash
    # ``avatar_s3_key`` so the response builder can produce a presigned URL
    # without re-querying the asset row; the repository sets it on load.
    # ``avatar_focal_area`` is the image's "token" focal square (tokens v3,
    # decision 36) — same stash mechanism, consumed by the frontend to bias
    # avatar cover-positioning. None ⇒ centered, exactly the pre-crop look.
    avatar_asset_id: Optional[UUID] = None
    avatar_s3_key: Optional[str] = None
    avatar_focal_area: Optional[dict] = None

    # Character-owned display color ('#rrggbb'). Seats and map tokens *display*
    # this; nothing stores color per-seat. None ⇒ seat-index palette fallback.
    color: Optional[str] = None

    # Provenance of the current ability_scores. Lets the wizard resume in the
    # mode the player last used, and (for ``rolled``) re-display the original
    # 4d6 breakdown instead of forcing a re-roll on refresh.
    ability_score_method: Optional[str] = None
    ability_roll_details: Optional[dict] = None

    # Species sub-choice picks (lineage/ancestry/legacy/size): {choice_code: [picked_codes]}
    species_sub_choices: dict = field(default_factory=dict)

    # Spells known / prepared (cantrips are spell_level 0). Replace-written per save.
    spells: list[SpellSelection] = field(default_factory=list)

    # Class resource pools — spent counts only (absent pool ⇒ full). Max comes from the ruleset.
    resource_usage: list[ResourceUsage] = field(default_factory=list)

    # Chosen subclasses (one per class; B.1). Picked at/after each class's subclass level.
    subclasses: list[SubclassEntry] = field(default_factory=list)

    # Exhaustion level 0–6 (G.3). Conditions themselves live in ``status_effects``.
    exhaustion_level: int = 0

    # Currency (coin_code -> quantity) + inventory (J.2/J.3). No enforcement — negative coin
    # balances and quantity-0 rows are allowed; the player narrates the rest.
    currency: dict[str, int] = field(default_factory=dict)
    inventory: list[InventoryItem] = field(default_factory=list)

    # -------------------------------------------------------------- factory

    @classmethod
    def create_draft(
        cls,
        *,
        user_id: UUID,
        edition_id: int,
        edition_code: str,
        character_name: str,
        slot: int,
    ) -> "CharacterAggregate":
        """Open a new draft character — only the minimum fields are required.

        All other fields default to safe placeholders; subsequent draft updates
        fill them in step by step until :meth:`finalize` is called.
        """
        if not character_name or not character_name.strip():
            raise ValueError("Character name is required")
        if len(character_name.strip()) > 50:
            raise ValueError("Character name too long (max 50)")
        if slot < 0 or slot >= HARD_SLOT_CEILING:
            raise ValueError(f"Character slot must be 0-{HARD_SLOT_CEILING - 1}")
        now = datetime.utcnow()
        return cls(
            id=None,
            user_id=user_id,
            slot=slot,
            edition_id=edition_id,
            edition_code=edition_code,
            active_campaign=None,
            character_name=character_name.strip(),
            species_code="",
            background_code="",
            class_entries=[],
            ability_scores=AbilityScores.default(),
            origin_ability_bonuses={},
            save_proficiencies=frozenset(),
            skills=[],
            feats=[],
            level=1,
            xp=0,
            hp_max=1,
            hp_current=1,
            hp_temp=0,
            ac=10,
            death_save_successes=0,
            death_save_failures=0,
            inspiration=False,
            status_effects=[],
            is_alive=True,
            speed=0,
            size="Medium",
            languages=[],
            is_draft=True,
            creation_step="edition",
            created_at=now,
            updated_at=now,
        )

    # -------------------------------------------------------------- finalize / draft

    def finalize(self) -> None:
        """Flip is_draft → False after confirming required fields are populated."""
        if not self.is_draft:
            return
        missing: list[str] = []
        if not self.species_code:
            missing.append("species_code")
        if not self.background_code:
            missing.append("background_code")
        if not self.class_entries:
            missing.append("class_entries")
        if self.hp_max < 1:
            missing.append("hp_max")
        if missing:
            raise ValueError(f"Cannot finalize draft — missing: {', '.join(missing)}")
        self.is_draft = False
        self.creation_step = None
        self._touch()

    def set_creation_step(self, step: Optional[str]) -> None:
        self.creation_step = step
        self._touch()

    def set_ability_scores(
        self,
        scores: "AbilityScores",
        *,
        method: Optional[str] = None,
        roll_details: Optional[dict] = None,
    ) -> None:
        """Replace base ability scores + track which method produced them.

        ``method`` and ``roll_details`` are pure provenance — they don't change
        any math, they just let the wizard resume on the right tab with the
        original dice still visible. Pass ``method=None`` to leave existing
        provenance alone (used by ASI / level-up paths that mutate scores
        without re-running the creation-step picker).
        """
        self.ability_scores = scores
        if method is not None:
            self.ability_score_method = method
            self.ability_roll_details = roll_details if method == "rolled" else None
        self._touch()

    def set_avatar_asset(self, asset_id: Optional[UUID]) -> None:
        """Attach (or clear) the library asset used as this character's avatar.

        ``avatar_s3_key`` is reset here — the repository repopulates it on the
        next read via the eager-loaded ``MediaAsset`` row, and the response
        builder uses whichever one it has.
        """
        self.avatar_asset_id = asset_id
        if asset_id is None:
            self.avatar_s3_key = None
        self._touch()

    # -------------------------------------------------------------- ownership / locking

    def is_owned_by(self, user_id: UUID) -> bool:
        return self.user_id == user_id

    def is_locked(self) -> bool:
        return self.active_campaign is not None

    def can_be_deleted(self) -> bool:
        return self.active_campaign is None

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.slot = None  # frees the capacity slot
        self._touch()

    def lock_to_campaign(self, campaign_id: UUID) -> None:
        if self.active_campaign is not None:
            raise ValueError(f"Character already locked to campaign {self.active_campaign}")
        self.active_campaign = campaign_id
        self._touch()

    def unlock_from_campaign(self) -> None:
        self.active_campaign = None
        self._touch()

    # -------------------------------------------------------------- vitals

    def take_damage(self, amount: int) -> None:
        if amount < 0:
            raise ValueError("Damage amount must be ≥ 0")
        remaining = amount
        if self.hp_temp > 0:
            absorbed = min(self.hp_temp, remaining)
            self.hp_temp -= absorbed
            remaining -= absorbed
        if remaining > 0:
            self.hp_current = max(0, self.hp_current - remaining)
        if self.hp_current <= 0 and self.is_alive:
            # Damage at 0 HP increments failures; massive damage = instant death
            self.hp_current = 0
        self._touch()

    def heal(self, amount: int) -> None:
        if amount < 0:
            raise ValueError("Heal amount must be ≥ 0")
        if self.hp_current <= 0:
            # Restoring any HP wakes the character; death saves reset.
            self.reset_death_saves()
        self.hp_current = min(self.hp_max, self.hp_current + amount)
        if self.hp_current > 0:
            self.is_alive = True
        self._touch()

    def set_temp_hp(self, amount: int) -> None:
        if amount < 0:
            raise ValueError("Temp HP must be ≥ 0")
        # 5e rule: temp HP doesn't stack — taking new temp HP replaces the existing.
        self.hp_temp = amount
        self._touch()

    # -------------------------------------------------------------- death saves

    def roll_death_save_success(self) -> None:
        self.death_save_successes = min(3, self.death_save_successes + 1)
        if self.death_save_successes >= 3:
            self.hp_current = max(self.hp_current, 0)  # stabilised at 0 HP
            self.reset_death_saves()
        self._touch()

    def roll_death_save_failure(self) -> None:
        self.death_save_failures = min(3, self.death_save_failures + 1)
        if self.death_save_failures >= 3:
            self.mark_dead()
        self._touch()

    def reset_death_saves(self) -> None:
        self.death_save_successes = 0
        self.death_save_failures = 0
        self._touch()

    def mark_dead(self) -> None:
        self.is_alive = False
        self.hp_current = 0
        self.reset_death_saves()
        self._touch()

    def resurrect(self) -> None:
        self.is_alive = True
        self.hp_current = max(1, self.hp_current)
        self.reset_death_saves()
        self._touch()

    # -------------------------------------------------------------- status / inspiration

    def set_inspiration(self, value: bool) -> None:
        self.inspiration = bool(value)
        self._touch()

    def set_color(self, color: Optional[str]) -> None:
        """Set the character's display color, or None to clear it.

        Shape-only validation (data invariant): any '#rrggbb' hue is allowed —
        there is no palette restriction and duplicates across a party are fine."""
        if color is not None and not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise ValueError("Color must be '#rrggbb' hex")
        self.color = color
        self._touch()

    def add_status(self, status: str) -> None:
        status = status.strip()
        if not status:
            raise ValueError("Status text cannot be empty")
        if status not in self.status_effects:
            self.status_effects.append(status)
            self._touch()

    def set_exhaustion(self, level: int) -> None:
        """Set exhaustion level, clamped 0–6 (data invariant; the −2/−5-per-level effects are
        the table's to apply)."""
        self.exhaustion_level = max(0, min(6, int(level)))
        self._touch()

    # -------------------------------------------------------------- currency / inventory

    def set_currency(self, coin_code: str, amount: int) -> None:
        self.currency = {**self.currency, coin_code: int(amount)}
        self._touch()

    def replace_currency(self, coins: dict) -> None:
        """Whole-map replace (runtime PATCH). Coins absent from the new map are dropped."""
        self.currency = {str(k): int(v) for k, v in coins.items()}
        self._touch()

    def add_currency(self, coin_code: str, amount: int) -> None:
        self.set_currency(coin_code, self.currency.get(coin_code, 0) + int(amount))

    def set_inventory_item(self, item_code: str, quantity: int, notes: str = "") -> None:
        """Upsert one inventory line (replaces any existing row for that item_code)."""
        self.inventory = [i for i in self.inventory if i.item_code != item_code]
        self.inventory.append(InventoryItem(item_code, int(quantity), notes))
        self._touch()

    def replace_inventory(self, items: list) -> None:
        """Whole-list replace (runtime PATCH). Items absent from the new list are dropped."""
        self.inventory = [
            InventoryItem(str(i["item_code"]), int(i.get("quantity", 1)), i.get("notes", "") or "")
            for i in items
        ]
        self._touch()

    def remove_inventory_item(self, item_code: str) -> None:
        before = len(self.inventory)
        self.inventory = [i for i in self.inventory if i.item_code != item_code]
        if len(self.inventory) != before:
            self._touch()

    def remove_status(self, status: str) -> None:
        try:
            self.status_effects.remove(status)
            self._touch()
        except ValueError:
            pass  # noop if absent

    # -------------------------------------------------------------- XP / leveling

    def award_xp(self, amount: int) -> None:
        if amount < 0:
            raise ValueError("XP awarded must be ≥ 0")
        self.xp += amount
        self._touch()

    def can_level_up(self, ruleset) -> bool:
        return ruleset.level_for_xp(self.xp) > self.level

    def apply_level_gain(
        self,
        *,
        class_code: str,
        hp_gained: int,
    ) -> None:
        """Apply the mechanical outcome of one level-up.

        Updates the matching class entry (or rejects if the class isn't in the
        character's progression — multiclass adds go through a separate path).
        Updates HP max and bumps total level. Feat/ASI choices are recorded
        separately via :meth:`take_feat` and :meth:`apply_asi`.
        """
        if hp_gained < 1:
            raise ValueError("HP gained must be ≥ 1")
        if self.level >= 20:
            raise ValueError("Already at max level")
        entry = next((e for e in self.class_entries if e.class_code == class_code), None)
        if entry is None:
            raise ValueError(
                f"Class '{class_code}' is not in this character's progression — "
                "use add_class() for multi-classing"
            )
        idx = self.class_entries.index(entry)
        self.class_entries[idx] = ClassEntry(
            class_code=entry.class_code,
            level=entry.level + 1,
            is_primary=entry.is_primary,
            sub_choices=entry.sub_choices,      # preserve feature-choice picks across the level bump
            chosen_skills=entry.chosen_skills,  # …and the L1 skill picks (source of the skills projection)
        )
        self.level += 1
        self.hp_max += hp_gained
        self.hp_current = min(self.hp_max, self.hp_current + hp_gained)
        self._touch()

    def add_class(self, class_code: str, *, is_primary: bool = False) -> None:
        """Multi-class into a new class at level 1."""
        if any(e.class_code == class_code for e in self.class_entries):
            raise ValueError(f"Character already has class '{class_code}'")
        if len(self.class_entries) >= 3:
            raise ValueError("Character cannot have more than 3 classes")
        if self.level >= 20:
            raise ValueError("Already at max level")
        if is_primary:
            # Demote existing primaries — preserve each entry's choice records (sub_choices +
            # chosen_skills), or the demotion would silently wipe their picks.
            self.class_entries = [
                ClassEntry(e.class_code, e.level, False, e.sub_choices, e.chosen_skills)
                for e in self.class_entries
            ]
        self.class_entries.append(ClassEntry(class_code, 1, is_primary))
        self.level += 1
        self._touch()

    def pick_subclass(
        self, class_code: str, subclass_code: str, *, at_level: Optional[int] = None
    ) -> None:
        """Record the subclass choice for a class (one per class; replaces on re-pick).

        Canon-correctness (is the class at its subclass level yet?) is guidance surfaced
        elsewhere — this method records the pick, it does not gate it (§3.0).
        """
        if not any(e.class_code == class_code for e in self.class_entries):
            raise ValueError(f"Character has no class '{class_code}' to subclass")
        self.subclasses = [s for s in self.subclasses if s.class_code != class_code]
        self.subclasses.append(
            SubclassEntry(class_code, subclass_code, at_level if at_level is not None else self.level)
        )
        self._touch()

    def apply_asi(self, increases: dict[str, int], *, ruleset=None) -> None:
        """Apply an Ability Score Improvement: ``{"strength": 2}`` or ``{"str": 1, "con": 1}``.

        Sum of values must equal 2 (the standard 5e ASI grant). Per-ability
        increments are capped so a single ASI can't push past 20 (Primal
        Champion uses a different path).

        When ``ruleset`` is passed and CON's modifier changes (B.6), max HP is adjusted
        retroactively by the modifier delta × level. We apply the *delta* rather than a full
        ``compute_hp_max`` so a player's rolled/entered HP baseline is preserved, not clobbered.
        """
        old_con_score = self.final_ability_score("constitution")
        total = sum(increases.values())
        if total != 2:
            raise ValueError(f"ASI must distribute exactly 2 points (got {total})")
        new = self.ability_scores.to_dict()
        for ability, delta in increases.items():
            if ability not in ABILITY_CODES:
                raise KeyError(f"Unknown ability {ability!r}")
            if delta < 0:
                raise ValueError("ASI deltas must be ≥ 0")
            # Cap is on the *final* score (post background bonus), per 5.5e ASI rules.
            current_final = new[ability] + self.origin_ability_bonuses.get(ability, 0)
            if current_final + delta > 20:
                raise ValueError(
                    f"ASI would push {ability} above 20 "
                    f"(current {current_final} + {delta})"
                )
            new[ability] += delta
        self.ability_scores = AbilityScores.from_dict(new)
        if ruleset is not None:
            mod_delta = ruleset.ability_modifier(
                self.final_ability_score("constitution")
            ) - ruleset.ability_modifier(old_con_score)
            hp_delta = mod_delta * self.level
            if hp_delta:
                self.hp_max = max(1, self.hp_max + hp_delta)
                self.hp_current = max(1, min(self.hp_max, self.hp_current + hp_delta))
        self._touch()

    def take_feat(self, feat_code: str, *, source: str, at_level: Optional[int] = None) -> None:
        """Record a feat acquisition. Used at creation (BACKGROUND_ORIGIN) and at ASI."""
        level = at_level if at_level is not None else self.level
        self.feats.append(FeatAcquisition(feat_code=feat_code, level=level, source=source))
        self._touch()

    # -------------------------------------------------------------- skill management

    def add_skill_proficiency(self, skill_code: str, source: str, *, expertise: bool = False) -> None:
        existing = next((s for s in self.skills if s.skill_code == skill_code), None)
        if existing is not None:
            if existing.source != source or existing.expertise != expertise:
                self.skills = [s for s in self.skills if s.skill_code != skill_code]
                self.skills.append(SkillProficiency(skill_code, source, expertise))
                self._touch()
            return
        self.skills.append(SkillProficiency(skill_code, source, expertise))
        self._touch()

    def remove_skill_proficiency(self, skill_code: str) -> None:
        before = len(self.skills)
        self.skills = [s for s in self.skills if s.skill_code != skill_code]
        if len(self.skills) != before:
            self._touch()

    # -------------------------------------------------------------- spells

    def learn_spell(
        self,
        spell_code: str,
        spell_level: int,
        source: str,
        *,
        granted_by: str = "",
        casting_ability: Optional[str] = None,
    ) -> None:
        """Add a spell selection, de-duplicating on (spell_code, source, granted_by)."""
        if any(
            s.spell_code == spell_code and s.source == source and s.granted_by == granted_by
            for s in self.spells
        ):
            return
        self.spells.append(
            SpellSelection(spell_code, spell_level, source, granted_by, casting_ability)
        )
        self._touch()

    def forget_spell(self, spell_code: str, *, source: Optional[str] = None) -> None:
        """Remove spell selections matching ``spell_code`` (optionally scoped to one source)."""
        before = len(self.spells)
        self.spells = [
            s for s in self.spells
            if not (s.spell_code == spell_code and (source is None or s.source == source))
        ]
        if len(self.spells) != before:
            self._touch()

    def clear_spells(self, *, sources: Optional[set[str]] = None) -> None:
        """Drop all spells, or only those whose source is in ``sources`` (replace-on-save)."""
        before = len(self.spells)
        if sources is None:
            self.spells = []
        else:
            self.spells = [s for s in self.spells if s.source not in sources]
        if len(self.spells) != before:
            self._touch()

    # -------------------------------------------------------------- resource pools

    def set_resource_usage(self, pool_code: str, current_value: int) -> None:
        """Set a pool's spent count. 0 drops the row (full pools are stored implicitly)."""
        self.resource_usage = [r for r in self.resource_usage if r.pool_code != pool_code]
        if current_value > 0:
            self.resource_usage.append(ResourceUsage(pool_code, current_value))
        self._touch()

    def consume_resource(self, pool_code: str, amount: int = 1) -> None:
        existing = next((r for r in self.resource_usage if r.pool_code == pool_code), None)
        self.set_resource_usage(pool_code, (existing.current_value if existing else 0) + amount)

    def restore_resource(self, pool_code: str, amount: Optional[int] = None) -> None:
        """Restore a pool: ``amount=None`` refills fully, else returns ``amount`` uses."""
        existing = next((r for r in self.resource_usage if r.pool_code == pool_code), None)
        if existing is None:
            return
        new_spent = 0 if amount is None else max(0, existing.current_value - amount)
        self.set_resource_usage(pool_code, new_spent)

    def set_save_proficiencies(self, ability_codes: Iterable[str]) -> None:
        codes = frozenset(ability_codes)
        for code in codes:
            if code not in ABILITY_CODES:
                raise KeyError(f"Unknown ability {code!r}")
        self.save_proficiencies = codes
        self._touch()

    # -------------------------------------------------------------- species traits

    def apply_species_traits(
        self, *, speed: int, size: str, languages: list[str]
    ) -> None:
        if size not in {"Small", "Medium", "Large"}:
            raise ValueError(f"Unknown size {size!r}")
        if speed < 0:
            raise ValueError("Speed cannot be negative")
        self.speed = speed
        self.size = size
        self.languages = list(languages)
        self._touch()

    # -------------------------------------------------------------- queries

    def ability_score(self, ability_code: str) -> int:
        """Base ability score — what the player rolled / picked.

        For modifier math (skills, saves, HP gain, initiative) use
        :meth:`final_ability_score` instead — that's where origin bonuses fold in.
        """
        return self.ability_scores.get(ability_code)

    def final_ability_score(self, ability_code: str) -> int:
        """Base + origin bonus. Use this everywhere math is involved."""
        return self.ability_scores.get(ability_code) + self.origin_ability_bonuses.get(ability_code, 0)

    def final_ability_scores_dict(self) -> dict[str, int]:
        return {code: self.final_ability_score(code) for code in ABILITY_CODES}

    def get_primary_class(self) -> Optional[ClassEntry]:
        if not self.class_entries:
            return None
        primary = next((e for e in self.class_entries if e.is_primary), None)
        if primary is not None:
            return primary
        return max(self.class_entries, key=lambda e: e.level)

    def get_display_name(self) -> str:
        if not self.class_entries:
            return self.character_name
        if len(self.class_entries) == 1:
            entry = self.class_entries[0]
            return f"{self.character_name} (Level {self.level} {entry.class_code.title()})"
        parts = [f"{e.class_code.title()} {e.level}" for e in self.class_entries]
        return f"{self.character_name} (Level {self.level} {' / '.join(parts)})"

    # -------------------------------------------------------------- internals

    def _touch(self) -> None:
        self.updated_at = datetime.utcnow()
