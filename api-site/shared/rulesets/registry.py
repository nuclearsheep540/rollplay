# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
In-memory registry that loads ruleset reference data from JSON at startup.

Initialized once via :meth:`RulesetRegistry.initialize` (called from the FastAPI
lifespan handler). After init, lookups are O(1) dict reads on parsed Pydantic
models — no per-request file IO, no per-request DB hits.

The registry refuses to start if any seed file is missing, fails Pydantic
validation, has a stale ``schema_version``, or has dangling cross-refs.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Optional

from shared.rulesets.dnd_2024 import Dnd2024Ruleset
from shared.rulesets.models import (
    BackgroundDefinition,
    BackgroundsFile,
    ClassDefinition,
    ClassesFile,
    CURRENT_SCHEMA_VERSION,
    FeatDefinition,
    FeatsFile,
    SkillDefinition,
    SkillsFile,
    SpeciesDefinition,
    SpeciesFile,
)
from shared.rulesets.strategy import RulesetStrategy


logger = logging.getLogger(__name__)


# Default seed-data root; tests can override via initialize(seed_root=...).
_DEFAULT_SEED_ROOT = (
    Path(__file__).resolve().parents[2]
    / "modules" / "characters" / "seed_data"
)


# Map edition_code → ruleset strategy factory. Adding a new edition is two lines:
# write a new RulesetStrategy subclass and register it here.
_STRATEGY_FACTORIES: dict[str, type] = {
    "srd_5_2_1": Dnd2024Ruleset,
}


class _EditionRulesetData:
    """Holds the parsed reference data + the strategy for one edition."""

    def __init__(
        self,
        edition_code: str,
        skills: dict[str, SkillDefinition],
        feats: dict[str, FeatDefinition],
        species: dict[str, SpeciesDefinition],
        backgrounds: dict[str, BackgroundDefinition],
        classes: dict[str, ClassDefinition],
        strategy: RulesetStrategy,
    ):
        self.edition_code = edition_code
        self.skills = skills
        self.feats = feats
        self.species = species
        self.backgrounds = backgrounds
        self.classes = classes
        self.strategy = strategy


class RulesetRegistry:
    """Singleton registry. Use :meth:`get_instance` after :meth:`initialize`."""

    _instance: Optional["RulesetRegistry"] = None
    _lock = threading.Lock()

    def __init__(self, editions: dict[str, _EditionRulesetData]):
        self._editions = editions

    # ------------------------------------------------------------------ init

    @classmethod
    def initialize(cls, seed_root: Optional[Path] = None) -> "RulesetRegistry":
        """Load every edition under ``seed_root`` and replace the global singleton.

        Raises immediately on any validation failure — the app should not boot
        with a partially-loaded registry.
        """
        root = seed_root or _DEFAULT_SEED_ROOT
        if not root.exists():
            raise RuntimeError(f"Ruleset seed root does not exist: {root}")

        editions: dict[str, _EditionRulesetData] = {}
        # Each subdirectory under seed_root is one edition_code.
        edition_dirs = sorted([d for d in root.iterdir() if d.is_dir()])
        if not edition_dirs:
            raise RuntimeError(f"No edition directories found under {root}")

        for edition_dir in edition_dirs:
            edition_code = edition_dir.name
            logger.info("Loading ruleset edition '%s' from %s", edition_code, edition_dir)
            data = cls._load_edition(edition_code, edition_dir)
            editions[edition_code] = data

        with cls._lock:
            cls._instance = cls(editions)
        logger.info("Ruleset registry loaded %d edition(s): %s", len(editions), sorted(editions))
        return cls._instance

    @classmethod
    def _load_edition(cls, edition_code: str, edition_dir: Path) -> _EditionRulesetData:
        def _load(filename: str, model_cls):
            path = edition_dir / filename
            if not path.exists():
                raise RuntimeError(f"Missing seed file: {path}")
            with path.open() as f:
                payload = json.load(f)
            file_model = model_cls.model_validate(payload)
            if file_model.schema_version != CURRENT_SCHEMA_VERSION:
                raise RuntimeError(
                    f"{path}: schema_version={file_model.schema_version} but the "
                    f"current model expects {CURRENT_SCHEMA_VERSION}. Re-run "
                    f"scripts/parse_srd.py and re-commit the JSON."
                )
            return file_model

        skills_file = _load("skills.json", SkillsFile)
        feats_file = _load("feats.json", FeatsFile)
        species_file = _load("species.json", SpeciesFile)
        backgrounds_file = _load("backgrounds.json", BackgroundsFile)
        classes_file = _load("classes.json", ClassesFile)

        skills = {s.code: s for s in skills_file.skills}
        feats = {f.code: f for f in feats_file.feats}
        species = {s.code: s for s in species_file.species}
        backgrounds = {b.code: b for b in backgrounds_file.backgrounds}
        classes = {c.code: c for c in classes_file.classes}

        # Cross-ref integrity. These also run in the parser, but a hand-edited
        # JSON could slip through, so re-check at boot.
        for bg in backgrounds.values():
            if bg.origin_feat_code not in feats:
                raise RuntimeError(
                    f"[{edition_code}] background '{bg.code}' references "
                    f"unknown origin_feat_code='{bg.origin_feat_code}'"
                )
            for sc in bg.skill_proficiencies:
                if sc not in skills:
                    raise RuntimeError(
                        f"[{edition_code}] background '{bg.code}' references "
                        f"unknown skill '{sc}'"
                    )
        for cls_def in classes.values():
            for sc in cls_def.skill_choices.source:
                if sc not in skills:
                    raise RuntimeError(
                        f"[{edition_code}] class '{cls_def.code}' references "
                        f"unknown skill '{sc}' in skill_choices.from"
                    )

        if edition_code not in _STRATEGY_FACTORIES:
            raise RuntimeError(
                f"No RulesetStrategy registered for edition '{edition_code}'. "
                f"Add an entry to _STRATEGY_FACTORIES in shared/rulesets/registry.py."
            )
        registry_data = _EditionRulesetData(
            edition_code=edition_code,
            skills=skills,
            feats=feats,
            species=species,
            backgrounds=backgrounds,
            classes=classes,
            strategy=None,  # filled below once we have the registry instance
        )
        return registry_data

    # ------------------------------------------------------------------ singleton access

    @classmethod
    def get_instance(cls) -> "RulesetRegistry":
        if cls._instance is None:
            raise RuntimeError(
                "RulesetRegistry not initialized. Call RulesetRegistry.initialize() "
                "from the FastAPI lifespan handler."
            )
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Test-only: drop the singleton so the next initialize() rebuilds from scratch."""
        with cls._lock:
            cls._instance = None

    # ------------------------------------------------------------------ lookups

    def _ed(self, edition_code: str) -> _EditionRulesetData:
        if edition_code not in self._editions:
            raise KeyError(f"Unknown edition '{edition_code}'")
        return self._editions[edition_code]

    def list_editions(self) -> list[str]:
        return sorted(self._editions.keys())

    def get_class(self, edition_code: str, class_code: str) -> ClassDefinition:
        ed = self._ed(edition_code)
        if class_code not in ed.classes:
            raise KeyError(f"Unknown class '{class_code}' in edition '{edition_code}'")
        return ed.classes[class_code]

    def get_species(self, edition_code: str, species_code: str) -> SpeciesDefinition:
        ed = self._ed(edition_code)
        if species_code not in ed.species:
            raise KeyError(f"Unknown species '{species_code}' in edition '{edition_code}'")
        return ed.species[species_code]

    def get_background(self, edition_code: str, background_code: str) -> BackgroundDefinition:
        ed = self._ed(edition_code)
        if background_code not in ed.backgrounds:
            raise KeyError(
                f"Unknown background '{background_code}' in edition '{edition_code}'"
            )
        return ed.backgrounds[background_code]

    def get_feat(self, edition_code: str, feat_code: str) -> FeatDefinition:
        ed = self._ed(edition_code)
        if feat_code not in ed.feats:
            raise KeyError(f"Unknown feat '{feat_code}' in edition '{edition_code}'")
        return ed.feats[feat_code]

    def get_skill(self, edition_code: str, skill_code: str) -> SkillDefinition:
        ed = self._ed(edition_code)
        if skill_code not in ed.skills:
            raise KeyError(f"Unknown skill '{skill_code}' in edition '{edition_code}'")
        return ed.skills[skill_code]

    def list_classes(self, edition_code: str) -> list[ClassDefinition]:
        return sorted(self._ed(edition_code).classes.values(), key=lambda c: c.code)

    def list_species(self, edition_code: str) -> list[SpeciesDefinition]:
        return sorted(self._ed(edition_code).species.values(), key=lambda s: s.code)

    def list_backgrounds(self, edition_code: str) -> list[BackgroundDefinition]:
        return sorted(self._ed(edition_code).backgrounds.values(), key=lambda b: b.code)

    def list_feats(
        self, edition_code: str, category: Optional[str] = None
    ) -> list[FeatDefinition]:
        feats = sorted(self._ed(edition_code).feats.values(), key=lambda f: f.code)
        if category is not None:
            feats = [f for f in feats if f.category == category]
        return feats

    def list_skills(self, edition_code: str) -> list[SkillDefinition]:
        return sorted(self._ed(edition_code).skills.values(), key=lambda s: s.code)

    def get_ruleset(self, edition_code: str) -> RulesetStrategy:
        ed = self._ed(edition_code)
        if ed.strategy is None:
            # Lazy: instantiate strategy on first access so it can reference back to us.
            factory = _STRATEGY_FACTORIES[edition_code]
            ed.strategy = factory(self)
        return ed.strategy
