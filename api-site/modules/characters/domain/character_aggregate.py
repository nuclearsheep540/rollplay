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

    def __post_init__(self):
        if not 1 <= self.level <= 20:
            raise ValueError(f"Class level must be 1..20 (got {self.level})")


@dataclass(frozen=True)
class SkillProficiency:
    """A skill proficiency the character has gained.

    ``source`` says where it came from (CLASS / BACKGROUND / FEAT / SPECIES) —
    used by the level-up wizard to undo grants and by the registry-validated
    invariants below.
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


# --------------------------------------------------------------------------- #
# Aggregate
# --------------------------------------------------------------------------- #


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

    # Library MediaAsset (asset_type='image') the character uses as its
    # avatar. ``None`` ⇒ frontend shows the default /heroes.png. We also stash
    # ``avatar_s3_key`` so the response builder can produce a presigned URL
    # without re-querying the asset row; the repository sets it on load.
    avatar_asset_id: Optional[UUID] = None
    avatar_s3_key: Optional[str] = None

    # Provenance of the current ability_scores. Lets the wizard resume in the
    # mode the player last used, and (for ``rolled``) re-display the original
    # 4d6 breakdown instead of forcing a re-roll on refresh.
    ability_score_method: Optional[str] = None
    ability_roll_details: Optional[dict] = None

    # -------------------------------------------------------------- factory

    @classmethod
    def create_draft(
        cls,
        *,
        user_id: UUID,
        edition_id: int,
        edition_code: str,
        character_name: str,
    ) -> "CharacterAggregate":
        """Open a new draft character — only the minimum fields are required.

        All other fields default to safe placeholders; subsequent draft updates
        fill them in step by step until :meth:`finalize` is called.
        """
        if not character_name or not character_name.strip():
            raise ValueError("Character name is required")
        if len(character_name.strip()) > 50:
            raise ValueError("Character name too long (max 50)")
        now = datetime.utcnow()
        return cls(
            id=None,
            user_id=user_id,
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

    def add_status(self, status: str) -> None:
        status = status.strip()
        if not status:
            raise ValueError("Status text cannot be empty")
        if status not in self.status_effects:
            self.status_effects.append(status)
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
            self.class_entries = [
                ClassEntry(e.class_code, e.level, False) for e in self.class_entries
            ]
        self.class_entries.append(ClassEntry(class_code, 1, is_primary))
        self.level += 1
        self._touch()

    def apply_asi(self, increases: dict[str, int]) -> None:
        """Apply an Ability Score Improvement: ``{"strength": 2}`` or ``{"str": 1, "con": 1}``.

        Sum of values must equal 2 (the standard 5e ASI grant). Per-ability
        increments are capped so a single ASI can't push past 20 (Primal
        Champion uses a different path).
        """
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
