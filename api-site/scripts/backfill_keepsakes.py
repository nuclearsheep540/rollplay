# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Turn every pre-rewrite character row into a keepsake.

Run between migration A (additive) and migration B (destructive). Existing characters are
kept, never discarded: each one loses its table — no campaign, no session, no config
version — and gains a snapshot built from what its row actually held, which is exactly the
state a character reaches when its campaign is deleted.

    docker exec -w /api api-site-dev python -m scripts.backfill_keepsakes --dry-run
    docker exec -w /api api-site-dev python -m scripts.backfill_keepsakes

Run it as a module (``-m``) from the app root, not as a file path: the app's packages are
importable relative to /api, and ``python scripts/foo.py`` puts scripts/ on sys.path instead.

Guarded and idempotent: it no-ops once the old columns are gone, and a second run on
converted rows recomputes identical values. The whole run is one transaction and aborts on
the first row that will not validate, so it is never half-done.
"""

import argparse
import json
import sys

from sqlalchemy import inspect, text

from shared.dependencies.db import engine
from shared_contracts.character_config import CharacterConfig, CharacterSheet
from shared_contracts.components.attribute import AttributeConfiguration, AttributeValue
from shared_contracts.components.hit_points import (
    HitPointsConfiguration,
    HitPointsValue,
    IntHitPointsRules,
    IntHitPointsState,
)
from shared_contracts.components.identity import IdentityConfiguration, IdentityValue, TextIdentityAnswer, TextIdentityInput

LOG_TAG = "BACKFILL"
UNNAMED = "Unnamed character"
NAME_MAX_LENGTH = 60
ATTRIBUTE_MINIMUM = 1
ATTRIBUTE_MAXIMUM = 30


def _clamp(value, lowest, highest):
    return max(lowest, min(highest, value))


def build_keepsake(row, ability_rows):
    """The pure transform: one old row plus its ability scores -> the three new columns.

    ``row`` is any mapping carrying ``character_name``, ``hp_max`` and ``hp_current``.
    ``ability_rows`` is an ordered sequence of ``(ability_name, score)``.

    Returns a dict of JSON-ready ``config_snapshot``, ``values`` and ``display_name``.
    Raises ValidationError if the result would not pair — the caller aborts the run.
    """
    old_name = (row["character_name"] or "").strip()
    # The contract requires maximum >= 1, and some old rows carry 0.
    maximum = max(int(row["hp_max"] or 0), 1)
    current = _clamp(int(row["hp_current"] or 0), 0, maximum)

    components = [
        IdentityConfiguration(id="identity_1", label="Name", input=TextIdentityInput(max_length=NAME_MAX_LENGTH), required=True),
        HitPointsConfiguration(
            id="hit_points_1",
            label="Hit points",
            rules=IntHitPointsRules(minimum=0, maximum=maximum, starting=maximum),
        ),
    ]
    values = {
        "identity_1": IdentityValue(component_id="identity_1", answer=TextIdentityAnswer(text=old_name[:NAME_MAX_LENGTH])),
        "hit_points_1": HitPointsValue(
            component_id="hit_points_1", state=IntHitPointsState(current=current)
        ),
    }

    for index, (ability_name, score) in enumerate(ability_rows, start=1):
        component_id = f"attribute_{index}"
        components.append(
            AttributeConfiguration(
                id=component_id,
                label=ability_name.capitalize(),
                minimum=ATTRIBUTE_MINIMUM,
                maximum=ATTRIBUTE_MAXIMUM,
                default=None,
            )
        )
        values[component_id] = AttributeValue(
            component_id=component_id,
            score=_clamp(int(score), ATTRIBUTE_MINIMUM, ATTRIBUTE_MAXIMUM),
        )

    config = CharacterConfig(version=1, components=components)
    # Raises if the pairing is wrong — nothing is written for a row that would not render.
    CharacterSheet(config=config, values=values)

    return {
        "config_snapshot": config.model_dump(mode="json"),
        "values": {key: value.model_dump(mode="json") for key, value in values.items()},
        "display_name": old_name or UNNAMED,
    }


def _column_names(connection, table):
    return {column["name"] for column in inspect(connection).get_columns(table)}


def main():
    parser = argparse.ArgumentParser(description="Convert pre-rewrite characters into keepsakes.")
    parser.add_argument("--dry-run", action="store_true", help="count and validate, write nothing")
    arguments = parser.parse_args()

    with engine.begin() as connection:
        columns = _column_names(connection, "characters")
        if "character_name" not in columns:
            print(f"{LOG_TAG} nothing to do: old columns absent")
            return 0
        if "config_snapshot" not in columns:
            print(f"{LOG_TAG} run migration A first")
            return 1

        rows = connection.execute(text(
            "SELECT id, character_name, hp_max, hp_current FROM characters ORDER BY created_at"
        )).mappings().all()

        converted = 0
        for row in rows:
            ability_rows = connection.execute(
                text(
                    "SELECT a.name, s.score FROM character_ability_scores s "
                    "JOIN dnd_abilities a ON a.id = s.ability_id "
                    "WHERE s.character_id = :character_id ORDER BY a.id"
                ),
                {"character_id": row["id"]},
            ).all()

            try:
                keepsake = build_keepsake(row, ability_rows)
            except Exception as invalid:
                print(f"{LOG_TAG} ABORT on character {row['id']}: {invalid}")
                raise

            if not arguments.dry_run:
                connection.execute(
                    text(
                        "UPDATE characters SET config_snapshot = CAST(:config AS jsonb), "
                        "values = CAST(:values AS jsonb), display_name = :display_name, "
                        "campaign_id = NULL, session_id = NULL, config_version_id = NULL "
                        "WHERE id = :character_id"
                    ),
                    {
                        "config": json.dumps(keepsake["config_snapshot"]),
                        "values": json.dumps(keepsake["values"]),
                        "display_name": keepsake["display_name"],
                        "character_id": row["id"],
                    },
                )
            converted += 1

        if arguments.dry_run:
            print(f"{LOG_TAG} dry run: {converted} characters would convert")
            # begin() commits on exit; nothing was written, so there is nothing to roll back.
            return 0

        print(f"{LOG_TAG} converted {converted} characters")
    return 0


if __name__ == "__main__":
    sys.exit(main())
