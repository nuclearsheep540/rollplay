# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Parse the vendored SRD 5.2.1 markdown into deterministic JSON files.

Usage (run from api-site/):
    python -m scripts.parse_srd                # parse all five files
    python -m scripts.parse_srd --spike        # parse only Barbarian (Phase 0.4 spike)

Outputs to modules/characters/seed_data/srd_5_2_1/.

Parser stack:
- mistune for markdown AST
- BeautifulSoup for HTML tables embedded in the markdown
- Pydantic models in shared/rulesets/models.py validate every entry before write

Determinism: sorted keys at every level of the emitted JSON, lists ordered by
code. Re-running with no source change produces byte-identical output so
JSON diffs stay clean.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

import mistune
from bs4 import BeautifulSoup
from pydantic import ValidationError

# Allow running as a script (python scripts/parse_srd.py) by adding api-site/ to path.
_SCRIPT_DIR = Path(__file__).resolve().parent
_API_SITE_DIR = _SCRIPT_DIR.parent
if str(_API_SITE_DIR) not in sys.path:
    sys.path.insert(0, str(_API_SITE_DIR))

from shared.rulesets.models import (  # noqa: E402
    BackgroundDefinition,
    BackgroundsFile,
    ClassDefinition,
    ClassFeature,
    ClassLevel,
    ClassesFile,
    CURRENT_SCHEMA_VERSION,
    FeatDefinition,
    FeatPrerequisite,
    FeatsFile,
    LanguageChoices,
    SkillChoices,
    SkillDefinition,
    SkillsFile,
    SpeciesDefinition,
    SpeciesFile,
    SpeciesTrait,
)


EDITION_CODE = "srd_5_2_1"
EDITION_LABEL = "D&D 2024 (5.2.1 SRD)"

VENDOR_DIR = _API_SITE_DIR / "vendor" / EDITION_CODE
OUTPUT_DIR = _API_SITE_DIR / "modules" / "characters" / "seed_data" / EDITION_CODE


# --------------------------------------------------------------------------- #
# Code normalization
# --------------------------------------------------------------------------- #

_CODE_RE = re.compile(r"[^a-z0-9]+")


def to_code(name: str) -> str:
    """Normalize a display name to a stable code identifier.

    >>> to_code("Magic Initiate (Cleric)")
    'magic_initiate_cleric'
    >>> to_code("Sleight of Hand")
    'sleight_of_hand'
    """
    s = (name or "").strip().lower()
    s = _CODE_RE.sub("_", s)
    return s.strip("_")


def _strip(text: str) -> str:
    """Aggressive whitespace strip: NBSP, zero-width, surrounding whitespace."""
    if text is None:
        return ""
    return text.replace(" ", " ").replace("​", "").strip()


# --------------------------------------------------------------------------- #
# Markdown helpers
# --------------------------------------------------------------------------- #


def _md_parser() -> mistune.Markdown:
    return mistune.create_markdown(renderer=None)  # AST mode


def _read(filename: str) -> str:
    path = VENDOR_DIR / filename
    if not path.exists():
        raise FileNotFoundError(
            f"SRD source file missing: {path}. Run 'curl … master tarball' to re-vendor."
        )
    return path.read_text(encoding="utf-8")


def _tokens(filename: str) -> list[dict]:
    return _md_parser()(_read(filename))


def _text(token: dict) -> str:
    """Recursively flatten an AST token to plain text."""
    if token is None:
        return ""
    if "raw" in token and token.get("type") in {"text", "codespan"}:
        return token["raw"]
    if "raw" in token and token.get("type") == "softbreak":
        return " "
    if "children" in token and token["children"]:
        return "".join(_text(c) for c in token["children"])
    return token.get("raw", "")


def _heading_level(token: dict) -> Optional[int]:
    if token.get("type") == "heading":
        return token.get("attrs", {}).get("level")
    return None


def _heading_text(token: dict) -> str:
    return _strip(_text(token))


# --------------------------------------------------------------------------- #
# HTML table helpers (used wherever the SRD embeds raw <table> blocks)
# --------------------------------------------------------------------------- #


def _find_html_table_after(tokens: list[dict], start_idx: int) -> Optional[BeautifulSoup]:
    """Find the next ``block_html`` token containing a <table> after start_idx."""
    for i in range(start_idx, len(tokens)):
        tok = tokens[i]
        if tok.get("type") in {"block_html", "html_block"}:
            html = tok.get("raw", "")
            if "<table" in html.lower():
                return BeautifulSoup(html, "html.parser")
        # Also handle paragraph tokens that landed entire <table> blocks as raw HTML.
        if tok.get("type") == "paragraph":
            html = _text(tok)
            if "<table" in html.lower():
                return BeautifulSoup(html, "html.parser")
    return None


def _parse_kv_table(soup: BeautifulSoup) -> dict[str, str]:
    """Parse a 2-column key/value table (no <thead>) into a dict."""
    out: dict[str, str] = {}
    table = soup.find("table")
    if not table:
        return out
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) != 2:
            continue
        key = _strip(cells[0].get_text(" ", strip=True))
        val = _strip(cells[1].get_text(" ", strip=True))
        if key:
            out[key] = val
    return out


def _expand_header_row(tr) -> list[str]:
    """Expand a <thead> <tr> into a flat list of per-column labels, honouring colspan."""
    out: list[str] = []
    for cell in tr.find_all(["th", "td"]):
        text = _strip(cell.get_text(" ", strip=True))
        try:
            colspan = int(cell.get("colspan", "1"))
        except (TypeError, ValueError):
            colspan = 1
        for _ in range(max(1, colspan)):
            out.append(text)
    return out


def _combine_header_label(top: str, leaf: str) -> str:
    """Compose a column label from a (top-level group, leaf) header pair."""
    top_clean = top.strip("—–- ").strip()
    if leaf and top_clean and top_clean != leaf:
        return f"{top_clean} {leaf}"
    return leaf or top_clean or top


def _parse_header_table(soup: BeautifulSoup) -> list[dict[str, str]]:
    """Parse a table with <thead> headers into a list of header→value dicts.

    Reads header rows dynamically — never hardcodes column positions. Handles:
      - Wide tables (Wizard 9-level spell slots → 14+ columns)
      - Multi-row <thead> with colspan group headers (Bard "Spell Slots per Spell Level"
        spans 9 leaf columns labelled 1..9). The two header rows are flattened into
        composite labels like "Spell Slots per Spell Level 1".
    """
    table = soup.find("table")
    if not table:
        return []

    thead = table.find("thead")
    header_rows: list[list[str]] = []
    if thead:
        for tr in thead.find_all("tr"):
            header_rows.append(_expand_header_row(tr))

    headers: list[str] = []
    if header_rows:
        max_width = max(len(r) for r in header_rows)
        # Pad shorter rows with empty strings to align.
        padded = [r + [""] * (max_width - len(r)) for r in header_rows]
        for col in range(max_width):
            if len(padded) == 1:
                headers.append(padded[0][col])
            else:
                top = padded[0][col]
                # Use the deepest non-empty header below row 0 as the leaf.
                leaf = ""
                for row in padded[1:]:
                    if row[col]:
                        leaf = row[col]
                headers.append(_combine_header_label(top, leaf))

    if not headers:
        first = table.find("tr")
        if first:
            headers = _expand_header_row(first)

    rows = []
    body = table.find("tbody") or table
    header_count = len(headers)
    for tr in body.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if not cells:
            continue
        cell_values = [_strip(c.get_text(" ", strip=True)) for c in cells]
        # Some SRD tables include a trailing empty <td> per row — strip those.
        while len(cell_values) > header_count and not cell_values[-1]:
            cell_values.pop()
        if cell_values == headers:
            continue
        if len(cell_values) != header_count:
            continue
        rows.append(dict(zip(headers, cell_values)))
    return rows


# --------------------------------------------------------------------------- #
# Abilities — normalization for human-readable names → AbilityCode
# --------------------------------------------------------------------------- #

_ABILITY_MAP = {
    "strength": "strength",
    "str": "strength",
    "dexterity": "dexterity",
    "dex": "dexterity",
    "constitution": "constitution",
    "con": "constitution",
    "intelligence": "intelligence",
    "int": "intelligence",
    "wisdom": "wisdom",
    "wis": "wisdom",
    "charisma": "charisma",
    "cha": "charisma",
}


def to_ability(name: str) -> str:
    code = to_code(name)
    if code not in _ABILITY_MAP:
        raise ValueError(f"Unknown ability name: {name!r}")
    return _ABILITY_MAP[code]


def to_abilities(text: str) -> list[str]:
    """Split a phrase like 'Strength and Constitution' or 'Wisdom, Charisma' into ability codes."""
    parts = re.split(r"\s*(?:,|and|or)\s*", text.strip(), flags=re.IGNORECASE)
    return [to_ability(p) for p in parts if p.strip()]


# --------------------------------------------------------------------------- #
# Skills parser — playing-the-game.md (Tier: easy)
# --------------------------------------------------------------------------- #


def parse_skills() -> list[dict]:
    tokens = _tokens("playing-the-game.md")
    # Find the "Skills" section then the first HTML table inside it.
    for i, tok in enumerate(tokens):
        if _heading_level(tok) == 2 and to_code(_heading_text(tok)) == "using_each_ability":
            # Skills are nested under "Using Each Ability" → "Skills"
            pass
    # Simpler: scan for a <table> whose header is Skill / Ability / Example Uses.
    for i, tok in enumerate(tokens):
        if tok.get("type") in {"block_html", "html_block"}:
            html = tok.get("raw", "")
            if "<table" in html.lower() and "Skill" in html and "Ability" in html:
                soup = BeautifulSoup(html, "html.parser")
                rows = _parse_header_table(soup)
                if not rows:
                    continue
                # Confirm it's the skills table by checking column names
                cols = set(rows[0].keys())
                if not {"Skill", "Ability"}.issubset(cols):
                    continue
                skills = []
                for r in rows:
                    name = _strip(r["Skill"])
                    ability_text = _strip(r["Ability"])
                    skills.append({
                        "code": to_code(name),
                        "name": name,
                        "ability": to_ability(ability_text),
                    })
                # Deduplicate (some tables can repeat rows) and sort
                seen: set[str] = set()
                unique = []
                for s in sorted(skills, key=lambda x: x["code"]):
                    if s["code"] in seen:
                        continue
                    seen.add(s["code"])
                    unique.append(s)
                return unique
    raise RuntimeError("Skills table not found in playing-the-game.md")


# --------------------------------------------------------------------------- #
# Feats parser — feats.md
# --------------------------------------------------------------------------- #


_CATEGORY_HEADINGS = {
    "origin_feats": "origin",
    "general_feats": "general",
    "fighting_style_feats": "fighting_style",
    "epic_boon_feats": "epic_boon",
}


_PREREQ_LEVEL_RE = re.compile(r"Level\s+(\d+)\+", re.IGNORECASE)
_PREREQ_ABILITY_RE = re.compile(
    r"(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)\+",
    re.IGNORECASE,
)
_PREREQ_ABILITY_ANY_RE = re.compile(
    r"(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)"
    r"(?:\s*,\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))*"
    r"\s+or\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)\+",
    re.IGNORECASE,
)
_PREREQ_SPELLCASTING_RE = re.compile(r"Spellcasting\s+(?:or\s+Pact\s+Magic\s+)?[Ff]eature", re.IGNORECASE)


def _parse_prereq_line(line: str) -> list[dict]:
    """Parse a feat's italic subheader 'Prerequisite' clause into structured prereqs.

    The subheader looks like:
        _General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)_
    We're handed only the 'Level 4+, Strength or Dexterity 13+' chunk.
    """
    if not line:
        return []
    out: list[dict] = []
    # Try ability_any first (longer pattern) before the simpler ability match.
    m = _PREREQ_ABILITY_ANY_RE.search(line)
    if m:
        groups = [g for g in m.groups()[:-1] if g]
        score = int(m.group(m.lastindex))
        out.append({
            "type": "ability_any",
            "value": score,
            "abilities": [to_ability(g) for g in groups],
        })
        # Strip the matched chunk so it doesn't double-match.
        line = (line[: m.start()] + line[m.end() :]).strip(", ")
    for m in _PREREQ_LEVEL_RE.finditer(line):
        out.append({"type": "level", "value": int(m.group(1))})
    for m in _PREREQ_ABILITY_RE.finditer(line):
        out.append({
            "type": "ability",
            "value": int(m.group(2)),
            "abilities": [to_ability(m.group(1))],
        })
    if _PREREQ_SPELLCASTING_RE.search(line):
        out.append({"type": "spellcasting"})
    return out


def parse_feats() -> list[dict]:
    tokens = _tokens("feats.md")
    feats: list[dict] = []
    current_category: Optional[str] = None
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        lvl = _heading_level(tok)
        if lvl == 3:
            head_code = to_code(_heading_text(tok))
            current_category = _CATEGORY_HEADINGS.get(head_code)
            i += 1
            continue
        if lvl == 4 and current_category:
            feat_name = _heading_text(tok)
            # The next token should be a paragraph with italic subheader: _Category (Prerequisite: ...)_
            subheader = ""
            desc_parts: list[str] = []
            j = i + 1
            while j < len(tokens):
                nxt = tokens[j]
                if _heading_level(nxt) and _heading_level(nxt) <= 4:
                    break
                txt = _text(nxt).strip()
                if not subheader and txt.startswith("_") and txt.rstrip("_").endswith(""):
                    # First italic line is the subheader
                    subheader = txt.strip("_").strip()
                    j += 1
                    continue
                if txt:
                    desc_parts.append(txt)
                j += 1
            prereq_chunk = ""
            repeatable = False
            if "Prerequisite:" in subheader:
                prereq_chunk = subheader.split("Prerequisite:", 1)[1].rstrip(")").strip()
            if "Repeatable" in subheader:
                repeatable = True
            prereqs = _parse_prereq_line(prereq_chunk)
            description = "\n\n".join(desc_parts).strip() or subheader or feat_name
            feats.append({
                "code": to_code(feat_name),
                "name": feat_name,
                "category": current_category,
                "prerequisites": prereqs,
                "repeatable": repeatable,
                "description": description,
            })
            i = j
            continue
        i += 1
    if not feats:
        raise RuntimeError("No feats parsed from feats.md")
    feats.sort(key=lambda f: f["code"])
    return feats


# --------------------------------------------------------------------------- #
# Species parser — character-origins.md
# --------------------------------------------------------------------------- #


def _split_section_by_heading(
    tokens: list[dict], target_h2_code: str
) -> list[dict]:
    """Return the slice of tokens that lives under the given h2 heading."""
    out: list[dict] = []
    inside = False
    for tok in tokens:
        lvl = _heading_level(tok)
        if lvl == 2:
            inside = to_code(_heading_text(tok)) == target_h2_code
            continue
        if inside:
            if lvl == 2:
                break
            out.append(tok)
    return out


def _split_into_h4_blocks(tokens: list[dict]) -> list[tuple[str, list[dict]]]:
    """Group tokens into (h4_heading_text, [tokens_in_block]) pairs."""
    blocks: list[tuple[str, list[dict]]] = []
    current_name: Optional[str] = None
    current_tokens: list[dict] = []
    for tok in tokens:
        lvl = _heading_level(tok)
        if lvl == 4:
            if current_name is not None:
                blocks.append((current_name, current_tokens))
            current_name = _heading_text(tok)
            current_tokens = []
        elif lvl is not None and lvl <= 3:
            if current_name is not None:
                blocks.append((current_name, current_tokens))
                current_name = None
                current_tokens = []
        elif current_name is not None:
            current_tokens.append(tok)
    if current_name is not None:
        blocks.append((current_name, current_tokens))
    return blocks


_BOLD_LABEL_RE = re.compile(r"\*\*([^*]+):\*\*\s*(.*)")


def _bold_labelled_lines(tokens: list[dict]) -> dict[str, str]:
    """Extract the `**Label:** value` pairs from a list of paragraph tokens.

    The SRD uses bold labels heavily for background/species fields. The mistune
    AST represents `**X:**` as a strong child; the simplest robust extractor
    re-renders the paragraph and regexes the bold pattern.
    """
    labels: dict[str, str] = {}
    for tok in tokens:
        if tok.get("type") != "paragraph":
            continue
        # Reconstruct paragraph as approximate markdown so the regex can match.
        rendered = _render_inline(tok.get("children", []))
        for line in rendered.splitlines():
            m = _BOLD_LABEL_RE.match(line.strip())
            if m:
                labels[_strip(m.group(1))] = _strip(m.group(2))
    return labels


def _render_inline(children: list[dict]) -> str:
    """Re-render inline tokens to a markdown-ish string preserving **bold** and _italic_."""
    out = []
    for c in children or []:
        t = c.get("type")
        if t == "text":
            out.append(c.get("raw", ""))
        elif t == "strong":
            out.append("**" + _render_inline(c.get("children", [])) + "**")
        elif t == "emphasis":
            out.append("_" + _render_inline(c.get("children", [])) + "_")
        elif t == "codespan":
            out.append(c.get("raw", ""))
        elif t == "softbreak":
            out.append("\n")
        elif t == "linebreak":
            out.append("\n")
        elif t == "link":
            out.append(_render_inline(c.get("children", [])))
        else:
            out.append(_text(c))
    return "".join(out)


_ITALIC_HEADER_RE = re.compile(r"_([^_]+)\._\s*(.*)", re.DOTALL)


def _extract_italic_paragraph_traits(tokens: list[dict]) -> list[dict]:
    """Find paragraphs that start with `_Trait Name._ ...` and return them as traits."""
    traits: list[dict] = []
    for tok in tokens:
        if tok.get("type") != "paragraph":
            continue
        rendered = _render_inline(tok.get("children", [])).strip()
        m = _ITALIC_HEADER_RE.match(rendered)
        if m:
            name = _strip(m.group(1))
            desc = _strip(m.group(2))
            if name and desc:
                traits.append({"name": name, "description": desc})
    return traits


_SIZE_MAP = {"small": "Small", "medium": "Medium", "large": "Large"}
_SPEED_RE = re.compile(r"(\d+)\s*(?:feet|ft)", re.IGNORECASE)


def parse_species() -> list[dict]:
    tokens = _tokens("character-origins.md")
    section = _split_section_by_heading(tokens, "character_species")
    # Drop the "Parts of a Species" sub-section by trimming until "Species Descriptions" h3
    start = 0
    for idx, tok in enumerate(section):
        if _heading_level(tok) == 3 and to_code(_heading_text(tok)) == "species_descriptions":
            start = idx + 1
            break
    species_tokens = section[start:]
    blocks = _split_into_h4_blocks(species_tokens)
    species: list[dict] = []
    for name, block in blocks:
        labels = _bold_labelled_lines(block)
        if not labels:
            continue  # Not a species block
        creature_type = labels.get("Creature Type", "")
        size_text = labels.get("Size", "").lower()
        size = None
        for key, val in _SIZE_MAP.items():
            if key in size_text:
                size = val
                break
        if not size:
            raise ValueError(f"Species {name!r}: could not derive size from {labels.get('Size')!r}")
        speed_text = labels.get("Speed", "")
        m = _SPEED_RE.search(speed_text)
        if not m:
            raise ValueError(f"Species {name!r}: could not parse speed from {speed_text!r}")
        speed = int(m.group(1))
        # Traits: italic-header paragraphs after the "Special Traits" intro line.
        # In SRD 5.2.1 the labels also include a Languages field as plain text.
        languages_text = labels.get("Languages", "Common")
        default_languages, language_choices = _parse_languages(languages_text)
        traits = _extract_italic_paragraph_traits(block)
        species.append({
            "code": to_code(name),
            "name": name,
            "creature_type": creature_type or "Humanoid",
            "size": size,
            "speed": speed,
            "default_languages": default_languages,
            "language_choices": language_choices,
            "traits": traits,
        })
    species.sort(key=lambda s: s["code"])
    if not species:
        raise RuntimeError("No species parsed")
    return species


_LANG_CHOICE_RE = re.compile(r"plus\s+(?:one|two|three)\b|plus\s+(\d+)\s+", re.IGNORECASE)
_LANG_CHOICE_COUNT_WORDS = {"one": 1, "two": 2, "three": 3}


def _parse_languages(text: str) -> tuple[list[str], Optional[dict]]:
    """Extract default languages and any 'choose N more' clause."""
    if not text:
        return ["Common"], None
    # Patterns: "Common", "Common plus one language of your choice", "Common, Draconic"
    chunks = [c.strip().rstrip(".") for c in re.split(r"\s+plus\s+|\s*,\s*|\s+and\s+", text, flags=re.IGNORECASE) if c.strip()]
    defaults: list[str] = []
    choices: Optional[dict] = None
    for chunk in chunks:
        if not chunk:
            continue
        low = chunk.lower()
        if "language" in low and ("choice" in low or "more" in low or "additional" in low):
            count = 1
            for word, n in _LANG_CHOICE_COUNT_WORDS.items():
                if word in low:
                    count = n
                    break
            m = re.search(r"(\d+)", chunk)
            if m:
                count = int(m.group(1))
            choices = {"count": count, "from": "any"}
        else:
            defaults.append(chunk.title() if chunk.islower() else chunk)
    if not defaults:
        defaults = ["Common"]
    return defaults, choices


# --------------------------------------------------------------------------- #
# Backgrounds parser — character-origins.md
# --------------------------------------------------------------------------- #


def parse_backgrounds() -> list[dict]:
    tokens = _tokens("character-origins.md")
    section = _split_section_by_heading(tokens, "character_backgrounds")
    # Skip the "Parts of a Background" preamble.
    start = 0
    for idx, tok in enumerate(section):
        if _heading_level(tok) == 3 and to_code(_heading_text(tok)) == "background_descriptions":
            start = idx + 1
            break
    bg_tokens = section[start:]
    blocks = _split_into_h4_blocks(bg_tokens)
    backgrounds: list[dict] = []
    for name, block in blocks:
        labels = _bold_labelled_lines(block)
        if not labels:
            continue
        # Ability Scores: comma/and-separated list like "Wisdom, Charisma, Constitution"
        abilities_raw = labels.get("Ability Scores", "")
        if not abilities_raw:
            continue
        ability_scores = to_abilities(abilities_raw)
        feat_text = labels.get("Feat", "").strip().rstrip(".")
        if not feat_text:
            raise ValueError(f"Background {name!r} missing Feat label")
        # Strip cross-reference suffix and any spell-list variant: e.g.
        #   'Magic Initiate (Cleric) (see "Feats")' → 'Magic Initiate'
        feat_text = re.sub(r'\s*\(see\s+"?Feats"?\)\s*', "", feat_text, flags=re.IGNORECASE).strip()
        feat_text = re.sub(r"\s*\([^)]*\)\s*", "", feat_text).strip()
        skills_raw = labels.get("Skill Proficiencies", "").rstrip(".")
        skills = [s.strip() for s in re.split(r"\s+and\s+|\s*,\s*", skills_raw, flags=re.IGNORECASE) if s.strip()]
        skill_codes = [to_code(s) for s in skills]
        tool = labels.get("Tool Proficiency", "").rstrip(".")
        equipment = labels.get("Equipment", "").rstrip(".")
        backgrounds.append({
            "code": to_code(name),
            "name": name,
            "ability_scores": ability_scores,
            "origin_feat_code": to_code(feat_text),
            "skill_proficiencies": skill_codes,
            "tool_proficiency": tool,
            "equipment_text": equipment,
        })
    backgrounds.sort(key=lambda b: b["code"])
    if not backgrounds:
        raise RuntimeError("No backgrounds parsed")
    return backgrounds


# --------------------------------------------------------------------------- #
# Classes parser — classes.md
# --------------------------------------------------------------------------- #


_HIT_DIE_RE = re.compile(r"D(\d+)", re.IGNORECASE)
_PROF_BONUS_RE = re.compile(r"\+?(\d+)")
_SKILL_CHOICE_RE = re.compile(r"Choose\s+(\d+)\s*:\s*(.+)", re.IGNORECASE)
_SKILL_CHOICE_ANY_RE = re.compile(r"Choose\s+any\s+(\d+)\s+skills", re.IGNORECASE)


def _class_skill_list(text: str, all_skill_codes: list[str]) -> tuple[int, list[str]]:
    """Parse the 'Skill Proficiencies' cell of a class core-traits table.

    Two SRD shapes seen so far:
      - "Choose 2: Animal Handling, Athletics, ..." → enumerated list
      - "Choose any 3 skills (see Playing the Game)" → Bard, draw from full skill list
    """
    m_any = _SKILL_CHOICE_ANY_RE.search(text)
    if m_any:
        return int(m_any.group(1)), sorted(all_skill_codes)
    m = _SKILL_CHOICE_RE.search(text)
    if not m:
        raise ValueError(f"Could not parse skill choices: {text!r}")
    count = int(m.group(1))
    raw = m.group(2).rstrip(".")
    skills = []
    for chunk in re.split(r"\s*,\s*|\s+or\s+", raw, flags=re.IGNORECASE):
        cleaned = re.sub(r"^\s*or\s+", "", chunk, flags=re.IGNORECASE).strip()
        if cleaned:
            skills.append(cleaned)
    return count, [to_code(s) for s in skills]


@dataclass
class _ClassSection:
    name: str
    start: int
    end: int


def _split_classes(tokens: list[dict]) -> list[_ClassSection]:
    """Find every ## class section. End at the next ## heading."""
    out: list[_ClassSection] = []
    open_idx = None
    open_name = None
    for i, tok in enumerate(tokens):
        if _heading_level(tok) == 2:
            if open_idx is not None:
                out.append(_ClassSection(open_name, open_idx, i))
            open_idx = i + 1
            open_name = _heading_text(tok)
    if open_idx is not None:
        out.append(_ClassSection(open_name, open_idx, len(tokens)))
    return out


def _scope_to_features(tokens: list[dict], section_start: int, section_end: int) -> int:
    """Return the index just before the first ### subclass heading or section_end."""
    for i in range(section_start, section_end):
        tok = tokens[i]
        if _heading_level(tok) == 3:
            heading = _heading_text(tok)
            # "Bard Subclass: College of Lore", "Bard Spell List", etc — stop here.
            if "Subclass" in heading or "Spell List" in heading:
                return i
    return section_end


def parse_one_class(
    class_name: str,
    tokens: list[dict],
    start: int,
    end: int,
    all_skill_codes: list[str],
) -> dict:
    """Parse a single class section. Returns a dict ready for ClassDefinition validation."""
    feature_end = _scope_to_features(tokens, start, end)
    body = tokens[start:feature_end]

    core_table_soup = _find_html_table_after(body, 0)
    if not core_table_soup:
        raise RuntimeError(f"Class {class_name}: core traits table not found")
    core = _parse_kv_table(core_table_soup)

    primary = to_ability(core["Primary Ability"].split(" ")[0])
    hit_die_m = _HIT_DIE_RE.search(core["Hit Point Die"])
    if not hit_die_m:
        raise ValueError(f"Class {class_name}: hit die not parseable from {core['Hit Point Die']!r}")
    hit_die = int(hit_die_m.group(1))
    saving_throws = to_abilities(core["Saving Throw Proficiencies"])
    skill_count, skill_codes = _class_skill_list(core["Skill Proficiencies"], all_skill_codes)
    armor = [a.strip() for a in re.split(r",\s*|\s+and\s+", core.get("Armor Training", "").rstrip(".")) if a.strip()]
    weapons = [w.strip() for w in re.split(r",\s*|\s+and\s+", core.get("Weapon Proficiencies", "").rstrip(".")) if w.strip()]

    # Find the second HTML table (the class features progression table).
    # Strategy: find the index where the core table sits, then look for the next table after it.
    second_table_search_start = 0
    found_first = False
    for idx, tok in enumerate(body):
        is_table = tok.get("type") in {"block_html", "html_block"} and "<table" in tok.get("raw", "").lower()
        if is_table:
            if found_first:
                second_table_search_start = idx
                break
            found_first = True
            second_table_search_start = idx + 1
    prog_soup = _find_html_table_after(body, second_table_search_start)
    if not prog_soup:
        raise RuntimeError(f"Class {class_name}: progression table not found")
    prog_rows = _parse_header_table(prog_soup)
    if not prog_rows:
        raise RuntimeError(f"Class {class_name}: progression table parsed zero rows")

    # Build h4 description map: code → list of (level, description)
    h4_map: dict[str, list[tuple[int, str]]] = {}
    cur_level: Optional[int] = None
    cur_name: Optional[str] = None
    cur_parts: list[str] = []
    h4_level_re = re.compile(r"Level\s+(\d+):\s*(.+)", re.IGNORECASE)

    def _flush():
        nonlocal cur_level, cur_name, cur_parts
        if cur_name is not None and cur_level is not None:
            desc = "\n\n".join(p for p in cur_parts if p).strip()
            if not desc:
                desc = cur_name
            h4_map.setdefault(to_code(cur_name), []).append((cur_level, desc))
        cur_level, cur_name, cur_parts = None, None, []

    for tok in body:
        lvl = _heading_level(tok)
        if lvl == 4:
            _flush()
            m = h4_level_re.match(_heading_text(tok))
            if m:
                cur_level = int(m.group(1))
                cur_name = _strip(m.group(2))
                cur_parts = []
        elif lvl is not None and lvl <= 3:
            _flush()
        else:
            if cur_name is not None:
                txt = ""
                if tok.get("type") == "paragraph":
                    txt = _render_inline(tok.get("children", [])).strip()
                elif tok.get("type") == "list":
                    bullets = []
                    for li in tok.get("children", []):
                        bullets.append("- " + _text(li).strip())
                    txt = "\n".join(bullets)
                else:
                    txt = _text(tok).strip()
                if txt:
                    cur_parts.append(txt)
    _flush()

    # Multiclass text — find ### Becoming a <Class> section and grab the prose.
    multiclass_text: Optional[str] = None
    for idx, tok in enumerate(body):
        if _heading_level(tok) == 3 and "Becoming" in _heading_text(tok):
            # Collect until next ###
            parts = []
            for nxt in body[idx + 1 :]:
                lvl = _heading_level(nxt)
                if lvl is not None and lvl <= 3:
                    break
                parts.append(_text(nxt).strip())
            multiclass_text = "\n\n".join(p for p in parts if p).strip() or None
            break

    # Build level progression.
    features_by_level: dict[str, dict] = {}
    asi_levels: list[int] = []
    universal_columns = {"Level", "Proficiency Bonus", "Class Features"}
    for row in prog_rows:
        try:
            level = int(_strip(row["Level"]))
        except (KeyError, ValueError):
            continue
        pb_text = _strip(row.get("Proficiency Bonus", ""))
        pb_match = _PROF_BONUS_RE.search(pb_text)
        if not pb_match:
            raise ValueError(f"Class {class_name} level {level}: prof bonus unparseable: {pb_text!r}")
        prof_bonus = int(pb_match.group(1))
        raw_features = row.get("Class Features", "")
        feature_names = [
            _strip(f) for f in raw_features.split(",")
            if _strip(f) and _strip(f) not in {"—", "-", "–"}
        ]
        features: list[dict] = []
        for fname in feature_names:
            # Skip subclass placeholders — no feature description shipped in this phase.
            if "Subclass" in fname or fname.lower() in {"subclass feature"}:
                features.append({
                    "name": fname,
                    "description": "Subclass feature gained at this level (subclasses are not yet supported).",
                })
                continue
            if fname == "Ability Score Improvement":
                asi_levels.append(level)
            code = to_code(fname)
            candidates = h4_map.get(code, [])
            if not candidates:
                # Try stripping parenthetical qualifiers, e.g. "Action Surge (one use)" → "Action Surge"
                stripped = re.sub(r"\s*\([^)]*\)\s*", "", fname).strip()
                if stripped and stripped != fname:
                    candidates = h4_map.get(to_code(stripped), [])
            if not candidates:
                raise RuntimeError(
                    f"Class {class_name}: feature {fname!r} listed at level {level} has no description block"
                )
            # Pick the description at level ≤ row level, closest from below.
            eligible = [c for c in candidates if c[0] <= level]
            chosen = max(eligible, key=lambda c: c[0]) if eligible else min(candidates, key=lambda c: c[0])
            features.append({"name": fname, "description": chosen[1]})
        class_specific: dict[str, str | int] = {}
        for key, val in row.items():
            if key in universal_columns:
                continue
            # Coerce numeric-looking values to int for cleaner schema.
            v = _strip(val)
            if v.isdigit():
                class_specific[key] = int(v)
            else:
                class_specific[key] = v
        features_by_level[str(level)] = {
            "proficiency_bonus": prof_bonus,
            "features": features,
            "class_specific": dict(sorted(class_specific.items())),
        }

    # Sanity assertions.
    if len(features_by_level) == 20 and len(asi_levels) < 4:
        raise RuntimeError(
            f"Class {class_name}: only {len(asi_levels)} ASI levels detected — expected at least 4"
        )

    return {
        "code": to_code(class_name),
        "name": class_name,
        "primary_ability": primary,
        "hit_die": hit_die,
        "saving_throw_proficiencies": saving_throws,
        "skill_choices": {"count": skill_count, "from": skill_codes},
        "armor_training": armor,
        "weapon_proficiencies": weapons,
        "starting_equipment_text": _strip(core.get("Starting Equipment", "")),
        "asi_levels": sorted(set(asi_levels)),
        "features_by_level": dict(sorted(features_by_level.items(), key=lambda kv: int(kv[0]))),
        "multiclass_text": multiclass_text,
    }


def parse_classes(only: Optional[str] = None, all_skill_codes: Optional[list[str]] = None) -> list[dict]:
    tokens = _tokens("classes.md")
    sections = _split_classes(tokens)
    if all_skill_codes is None:
        all_skill_codes = [s["code"] for s in parse_skills()]
    classes: list[dict] = []
    for sec in sections:
        if only and to_code(sec.name) != only:
            continue
        classes.append(parse_one_class(sec.name, tokens, sec.start, sec.end, all_skill_codes))
    classes.sort(key=lambda c: c["code"])
    return classes


# --------------------------------------------------------------------------- #
# Validation pass — cross-file integrity
# --------------------------------------------------------------------------- #


def cross_validate(
    skills: list[dict],
    feats: list[dict],
    species: list[dict],
    backgrounds: list[dict],
    classes: list[dict],
) -> None:
    skill_codes = {s["code"] for s in skills}
    feat_codes = {f["code"] for f in feats}
    for bg in backgrounds:
        if bg["origin_feat_code"] not in feat_codes:
            raise RuntimeError(
                f"Background {bg['code']!r} references unknown feat {bg['origin_feat_code']!r}"
            )
        for sc in bg["skill_proficiencies"]:
            if sc not in skill_codes:
                raise RuntimeError(
                    f"Background {bg['code']!r} references unknown skill {sc!r}"
                )
    for cls in classes:
        for sc in cls["skill_choices"]["from"]:
            if sc not in skill_codes:
                raise RuntimeError(
                    f"Class {cls['code']!r} skill choice references unknown skill {sc!r}"
                )
    seen: set[str] = set()
    for collection_name, collection in (("skills", skills), ("feats", feats), ("species", species), ("backgrounds", backgrounds), ("classes", classes)):
        seen.clear()
        for entry in collection:
            if entry["code"] in seen:
                raise RuntimeError(f"Duplicate code {entry['code']!r} in {collection_name}")
            seen.add(entry["code"])


# --------------------------------------------------------------------------- #
# Write helpers
# --------------------------------------------------------------------------- #


def _wrap(payload_key: str, payload: list[dict]) -> dict:
    return {
        "edition": EDITION_CODE,
        "schema_version": CURRENT_SCHEMA_VERSION,
        f"{payload_key}": payload,
    }


def _write(filename: str, data: dict) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / filename
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")
    return path


def _validate_pydantic(model_cls, payload: dict, label: str) -> None:
    try:
        model_cls.model_validate(payload)
    except ValidationError as exc:
        raise SystemExit(f"Pydantic validation failed for {label}:\n{exc}") from exc


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #


def main(argv: Iterable[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--spike", action="store_true", help="Parse only Barbarian (Phase 0.4 spike)")
    args = p.parse_args(list(argv) if argv is not None else None)

    if args.spike:
        classes = parse_classes(only="barbarian")
        if len(classes) != 1:
            raise SystemExit(f"Spike expected 1 class, got {len(classes)}")
        cls = classes[0]
        ClassDefinition.model_validate(cls)
        # Spike assertions per plan 0.4
        assert cls["code"] == "barbarian"
        assert set(cls["features_by_level"].keys()) == {str(i) for i in range(1, 21)}
        assert cls["asi_levels"] == [4, 8, 12, 16], f"asi_levels was {cls['asi_levels']!r}"
        # Deterministic re-run: render twice and compare.
        first = json.dumps(cls, indent=2, sort_keys=True)
        again = json.dumps(parse_classes(only="barbarian")[0], indent=2, sort_keys=True)
        assert first == again, "Spike: re-parse produced different output"
        print("Spike OK — Barbarian parsed, validated, deterministic.")
        print(f"  asi_levels = {cls['asi_levels']}")
        print(f"  levels parsed = {len(cls['features_by_level'])}")
        print(f"  class_specific columns at L1 = {list(cls['features_by_level']['1']['class_specific'].keys())}")
        print(f"  L1 features = {[f['name'] for f in cls['features_by_level']['1']['features']]}")
        return 0

    print("Parsing skills…")
    skills = parse_skills()
    print(f"  {len(skills)} skills")

    print("Parsing feats…")
    feats = parse_feats()
    print(f"  {len(feats)} feats")

    print("Parsing species…")
    species = parse_species()
    print(f"  {len(species)} species")

    print("Parsing backgrounds…")
    backgrounds = parse_backgrounds()
    print(f"  {len(backgrounds)} backgrounds")

    print("Parsing classes…")
    classes = parse_classes(all_skill_codes=[s["code"] for s in skills])
    print(f"  {len(classes)} classes")

    print("Cross-file validation…")
    cross_validate(skills, feats, species, backgrounds, classes)

    # Pydantic file-wrapper validation before write — abort if anything fails.
    skills_payload = _wrap("skills", skills)
    feats_payload = _wrap("feats", feats)
    species_payload = _wrap("species", species)
    backgrounds_payload = _wrap("backgrounds", backgrounds)
    classes_payload = _wrap("classes", classes)

    _validate_pydantic(SkillsFile, skills_payload, "skills.json")
    _validate_pydantic(FeatsFile, feats_payload, "feats.json")
    _validate_pydantic(SpeciesFile, species_payload, "species.json")
    _validate_pydantic(BackgroundsFile, backgrounds_payload, "backgrounds.json")
    _validate_pydantic(ClassesFile, classes_payload, "classes.json")

    paths = [
        _write("skills.json", skills_payload),
        _write("feats.json", feats_payload),
        _write("species.json", species_payload),
        _write("backgrounds.json", backgrounds_payload),
        _write("classes.json", classes_payload),
    ]
    for path in paths:
        print(f"Wrote {path.relative_to(_API_SITE_DIR)}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
