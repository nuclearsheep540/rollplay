# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""SRD 5.2.1 conditions — a small constant table for the runtime sheet's typed condition
badges + tooltips (G.3). Exhaustion is tracked as a level on the character, not a badge.

Not enforced: the character's ``status_effects`` list may hold any string (homebrew is fine);
these are just the ones the UI renders with a name + description. Descriptions are concise
paraphrases of the SRD condition entries in ``vendor/srd_5_2_1/rules-glossary.md``.
"""

CONDITIONS: dict[str, dict[str, str]] = {
    "blinded": {
        "name": "Blinded",
        "description": "Can't see and auto-fail checks needing sight. Attacks against you have "
        "Advantage; your attacks have Disadvantage.",
    },
    "charmed": {
        "name": "Charmed",
        "description": "Can't attack or target the charmer with harmful effects; the charmer has "
        "Advantage on ability checks to interact socially with you.",
    },
    "deafened": {
        "name": "Deafened",
        "description": "Can't hear and auto-fail checks needing hearing.",
    },
    "exhaustion": {
        "name": "Exhaustion",
        "description": "Measured in levels 1–6. Each level gives −2 to D20 Tests and −5 ft Speed "
        "(cumulative); level 6 is death. A Long Rest removes 1 level.",
    },
    "frightened": {
        "name": "Frightened",
        "description": "Disadvantage on ability checks and attacks while the source of fear is in "
        "sight; can't willingly move closer to it.",
    },
    "grappled": {
        "name": "Grappled",
        "description": "Speed 0. Disadvantage on attacks against anyone but the grappler. Ends if "
        "the grappler is Incapacitated or you're moved out of reach.",
    },
    "incapacitated": {
        "name": "Incapacitated",
        "description": "No actions, Bonus Actions, or Reactions; concentration breaks; can't speak; "
        "Disadvantage on Initiative if rolling.",
    },
    "invisible": {
        "name": "Invisible",
        "description": "Unseen without special senses. Attacks against you have Disadvantage; your "
        "attacks have Advantage.",
    },
    "paralyzed": {
        "name": "Paralyzed",
        "description": "Incapacitated; can't move or speak. Auto-fail STR/DEX saves. Attacks against "
        "you have Advantage and hits from within 5 ft are Critical.",
    },
    "petrified": {
        "name": "Petrified",
        "description": "Turned to solid substance; Incapacitated and unaware. Resistance to all "
        "damage; immune to Poison/disease. Attacks have Advantage; auto-fail STR/DEX saves.",
    },
    "poisoned": {
        "name": "Poisoned",
        "description": "Disadvantage on attack rolls and ability checks.",
    },
    "prone": {
        "name": "Prone",
        "description": "Can only crawl unless you stand (costs half your Speed). Disadvantage on "
        "attacks. Attacks within 5 ft have Advantage; other attacks against you have Disadvantage.",
    },
    "restrained": {
        "name": "Restrained",
        "description": "Speed 0. Disadvantage on attacks and DEX saves. Attacks against you have "
        "Advantage.",
    },
    "stunned": {
        "name": "Stunned",
        "description": "Incapacitated; can't move and speak only falteringly. Auto-fail STR/DEX "
        "saves. Attacks against you have Advantage.",
    },
    "unconscious": {
        "name": "Unconscious",
        "description": "Incapacitated, prone, and unaware; drop what you hold. Auto-fail STR/DEX "
        "saves. Attacks against you have Advantage and hits from within 5 ft are Critical.",
    },
}

MAX_EXHAUSTION = 6
