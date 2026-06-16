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
    SpellsFile,
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


def _emphasis_only_text(token: dict) -> Optional[str]:
    """Return the inner text of a paragraph that is a single italic run, else None.

    mistune renders ``_..._`` as an emphasis node, so the surrounding underscores never
    survive into the flattened text — detect the node, not the characters. Used to pick out
    a feat's category subheader (``_General Feat (Prerequisite: Level 4+)_``) from its body
    paragraphs (``_Initiative Proficiency._ When you roll…``), which are emphasis + text.
    """
    if token.get("type") != "paragraph":
        return None
    children = [c for c in token.get("children", []) if c.get("type") != "softbreak"]
    if len(children) == 1 and children[0].get("type") == "emphasis":
        return _text(children[0]).strip() or None
    return None


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
_PREREQ_FIGHTING_STYLE_RE = re.compile(r"Fighting\s+Style\s+Feature", re.IGNORECASE)


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
    if _PREREQ_FIGHTING_STYLE_RE.search(line):
        out.append({"type": "class_feature", "feature": "fighting_style"})
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
                emphasis = _emphasis_only_text(nxt)
                if not subheader and emphasis is not None:
                    # First standalone italic paragraph is the category subheader,
                    # e.g. "_General Feat (Prerequisite: Level 4+)_".
                    subheader = emphasis
                    j += 1
                    continue
                txt = _text(nxt).strip()
                if txt:
                    desc_parts.append(txt)
                j += 1
            prereq_chunk = ""
            repeatable = False
            if "Prerequisite:" in subheader:
                prereq_chunk = subheader.split("Prerequisite:", 1)[1].rstrip(")").strip()
            if "Repeatable" in subheader or any(
                p.lstrip().startswith("Repeatable.") for p in desc_parts
            ):
                # The "Repeatable" clause is its own `_Repeatable._ …` paragraph, not the
                # category subheader — check the body too.
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
    """Find paragraphs that start with `_Trait Name._ ...` and return them as traits.

    A trait's text can span multiple paragraphs (e.g. a usage/recharge clause in a follow-up
    paragraph). Plain-prose paragraphs after a trait are appended to that trait until the next
    labelled trait. Standalone bold/italic paragraphs (table captions like **Draconic Ancestors**)
    and non-paragraph blocks (tables) are not folded into the prose.
    """
    traits: list[dict] = []
    cur: Optional[dict] = None

    def _flush() -> None:
        nonlocal cur
        if cur and cur["name"]:
            desc = "\n\n".join(p for p in cur["parts"] if p).strip()
            if desc:
                traits.append({"name": cur["name"], "description": desc})
        cur = None

    for tok in tokens:
        if tok.get("type") != "paragraph":
            continue
        children = [c for c in tok.get("children", []) if c.get("type") != "softbreak"]
        rendered = _render_inline(tok.get("children", [])).strip()
        m = _ITALIC_HEADER_RE.match(rendered)
        if m:
            _flush()
            cur = {"name": _strip(m.group(1)), "parts": [_strip(m.group(2))]}
        elif cur is not None and rendered:
            # Skip standalone bold/italic captions; keep genuine prose continuations.
            is_caption = len(children) == 1 and children[0].get("type") in {"strong", "emphasis"}
            if not is_caption:
                cur["parts"].append(rendered)
    _flush()
    return traits


_SIZE_MAP = {"small": "Small", "medium": "Medium", "large": "Large"}
_SPEED_RE = re.compile(r"(\d+)\s*(?:feet|ft)", re.IGNORECASE)


def _merge_species_subchoices(species: list[dict]) -> None:
    """Fold hand-authored species sub-choices + leveled grants onto parsed species (A.4).

    Same mechanical-merge model as _merge_authored_choices: the data is authored by
    comprehension and verified against source, attached here by species code so species.json
    stays the single loaded source of truth. An unknown species code aborts the build.
    """
    path = Path(__file__).resolve().parent / "authored" / EDITION_CODE / "species_subchoices.json"
    if not path.exists():
        return
    authored = json.loads(path.read_text(encoding="utf-8"))
    by_code = {s["code"]: s for s in species}
    for code, entry in authored.get("species_sub_choices", {}).items():
        sp = by_code.get(code)
        if not sp:
            raise SystemExit(f"species_subchoices.json references unknown species {code!r}")
        sp["sub_choices"] = entry.get("sub_choices", [])
        sp["leveled_grants_by_sub_choice"] = entry.get("leveled_grants_by_sub_choice", {})


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
        # SRD lists the primary size first (e.g. "Medium … or Small"); pick the earliest-mentioned
        # so a two-size species (Human, Tiefling) records its primary size, not the alternative.
        size = None
        best_pos = None
        for key, val in _SIZE_MAP.items():
            pos = size_text.find(key)
            if pos != -1 and (best_pos is None or pos < best_pos):
                best_pos, size = pos, val
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
            "sub_choices": [],  # populated by _merge_species_subchoices (A.4)
            "leveled_grants_by_sub_choice": {},
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


def _strong_only_text(token: dict) -> Optional[str]:
    """Inner text of a paragraph that is a single bold run (a spell-table caption), else None."""
    if token.get("type") != "paragraph":
        return None
    children = [c for c in token.get("children", []) if c.get("type") != "softbreak"]
    if len(children) == 1 and children[0].get("type") == "strong":
        return _text(children[0]).strip()
    return None


def _parse_level_spell_table(soup: BeautifulSoup) -> dict[str, list[str]]:
    """Parse a 2-column ``<Level | Spells>`` HTML table into ``{level: [spell_code, …]}``."""
    out: dict[str, list[str]] = {}
    body = soup.find("tbody") or soup
    for tr in body.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) < 2:
            continue
        lvl = cells[0].get_text(strip=True)
        if not lvl.isdigit():
            continue
        spells = [to_code(s.strip()) for s in cells[1].get_text().split(",") if s.strip()]
        if spells:
            out[lvl] = spells
    return out


def _parse_subclass_spells(tokens: list[dict]) -> tuple[dict, dict]:
    """Parse a subclass's spell table(s) from its section tokens (deferral #2).

    Returns ``(always_prepared_spells_by_level, leveled_grants_by_sub_choice)``. Flat subclasses
    (Cleric/Paladin/Sorcerer/Warlock) have one ``Level | Spells`` table → always_prepared. Druid
    Circle of the Land has four ``**<Land>**`` tables → leveled_grants keyed by land code.
    """
    always_prepared: dict[str, list[str]] = {}
    leveled_grants: dict[str, dict[str, list[str]]] = {}
    caption = ""
    for tok in tokens:
        lvl = _heading_level(tok)
        if lvl is not None and lvl <= 3:
            break  # end of this subclass's section
        cap = _strong_only_text(tok)
        if cap is not None:
            caption = cap
            continue
        if tok.get("type") in {"block_html", "html_block"} and "<table" in tok.get("raw", "").lower():
            rows = _parse_level_spell_table(BeautifulSoup(tok["raw"], "html.parser"))
            if not rows:
                continue
            if caption.lower().endswith("land"):
                land = to_code(re.sub(r"\s*Land$", "", caption, flags=re.IGNORECASE))
                leveled_grants[land] = rows
            else:
                always_prepared.update(rows)
    return always_prepared, leveled_grants


def _parse_subclass(section_tokens: list[dict], class_name: str) -> Optional[dict]:
    """Parse the single SRD subclass within a class section.

    Each class section contains one ``### <Class> Subclass: <Name>`` H3 followed by
    ``#### Level N: <Feature>`` H4 blocks, terminating at the next heading of level ≤ 3
    (next subclass / spell list / class). Returns a dict ready for SubclassDefinition
    validation, or None if the section has no subclass.
    """
    start_idx: Optional[int] = None
    subclass_name: Optional[str] = None
    for idx, tok in enumerate(section_tokens):
        if _heading_level(tok) == 3 and "Subclass:" in _heading_text(tok):
            subclass_name = _heading_text(tok).split("Subclass:", 1)[1].strip()
            start_idx = idx + 1
            break
    if start_idx is None or not subclass_name:
        return None

    features: list[dict] = []
    cur_level: Optional[int] = None
    cur_name: Optional[str] = None
    cur_parts: list[str] = []
    h4_level_re = re.compile(r"Level\s+(\d+):\s*(.+)", re.IGNORECASE)

    def _flush():
        nonlocal cur_level, cur_name, cur_parts
        if cur_name is not None and cur_level is not None:
            desc = "\n\n".join(p for p in cur_parts if p).strip() or cur_name
            features.append({"name": cur_name, "level": cur_level, "description": desc})
        cur_level, cur_name, cur_parts = None, None, []

    for tok in section_tokens[start_idx:]:
        lvl = _heading_level(tok)
        if lvl is not None and lvl <= 3:
            break
        if lvl == 4:
            _flush()
            m = h4_level_re.match(_heading_text(tok))
            if m:
                cur_level = int(m.group(1))
                cur_name = _strip(m.group(2))
                cur_parts = []
        elif cur_name is not None:
            ttype = tok.get("type")
            if ttype in {"block_html", "html_block"}:
                continue  # spell tables etc. — captured structurally in a later PR, not as prose
            if ttype == "paragraph":
                txt = _render_inline(tok.get("children", [])).strip()
            elif ttype == "list":
                txt = "\n".join("- " + _text(li).strip() for li in tok.get("children", []))
            else:
                txt = _text(tok).strip()
            if txt:
                cur_parts.append(txt)
    _flush()

    if not features:
        raise RuntimeError(f"Class {class_name}: subclass {subclass_name!r} has no Level-N features")

    always_prepared, leveled_grants = _parse_subclass_spells(section_tokens[start_idx:])
    return {
        "code": to_code(subclass_name),
        "name": subclass_name,
        "subclass_level": min(f["level"] for f in features),
        "features": features,
        "always_prepared_spells_by_level": always_prepared,
        "leveled_grants_by_sub_choice": leveled_grants,
    }


_BARE_ARMOR = {"light", "medium", "heavy"}


def _split_proficiency_list(text: str, *, armor: bool = False) -> list[str]:
    """Split a core-table proficiency cell into items.

    Handles "Light and Medium armor and Shields" and Oxford-comma forms like
    "Light, Medium, and Heavy armor" — strips a stray leading 'and', and (for armor)
    expands a bare category ("Light") to its full form ("Light armor").
    """
    out: list[str] = []
    for part in re.split(r"\s*,\s*|\s+and\s+", text.rstrip(".")):
        part = re.sub(r"^and\s+", "", part.strip())
        if not part:
            continue
        if armor and part.lower() in _BARE_ARMOR:
            part = f"{part} armor"
        out.append(part)
    return out


_SPELL_SLOT_COL_RE = re.compile(r"Spell Slots per Spell Level (\d+)")


def _extract_spellcasting(features_by_level: dict) -> Optional[dict]:
    """Lift the spell columns out of each level's ``class_specific`` into a typed
    spellcasting structure (and remove them from class_specific). Returns None for
    non-casters. Regular casters fill ``spell_slots_by_level``; Warlock's Pact Magic
    ("Spell Slots" + "Slot Level") fills ``pact_slots_by_level``.
    """
    cantrips: dict[str, int] = {}
    prepared: dict[str, int] = {}
    slots: dict[str, dict[str, int]] = {}
    pact: dict[str, dict] = {}
    is_caster = False
    for lvl, data in features_by_level.items():
        cs = data["class_specific"]
        if isinstance(cs.get("Cantrips"), int):
            cantrips[lvl] = cs["Cantrips"]
            is_caster = True
        cs.pop("Cantrips", None)
        if isinstance(cs.get("Prepared Spells"), int):
            prepared[lvl] = cs["Prepared Spells"]
            is_caster = True
        cs.pop("Prepared Spells", None)
        level_slots: dict[str, int] = {}
        for key in list(cs.keys()):
            m = _SPELL_SLOT_COL_RE.fullmatch(key)
            if m:
                val = cs.pop(key)
                if isinstance(val, int) and val > 0:
                    level_slots[m.group(1)] = val
        if level_slots:
            slots[lvl] = dict(sorted(level_slots.items(), key=lambda kv: int(kv[0])))
            is_caster = True
        # Warlock Pact Magic: a flat "Spell Slots" count at a single "Slot Level".
        pact_count = cs.pop("Spell Slots", None)
        pact_level = cs.pop("Slot Level", None)
        if isinstance(pact_count, int) and pact_count > 0 and isinstance(pact_level, int):
            pact[lvl] = {"count": pact_count, "slot_level": pact_level}
            is_caster = True
    if not is_caster:
        return None
    return {
        "cantrips_known_by_level": cantrips,
        "prepared_spells_by_level": prepared,
        "spell_slots_by_level": slots,
        "pact_slots_by_level": pact,
    }


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

    primary = to_abilities(core["Primary Ability"])  # may be one or two (e.g. "Strength or Dexterity")
    hit_die_m = _HIT_DIE_RE.search(core["Hit Point Die"])
    if not hit_die_m:
        raise ValueError(f"Class {class_name}: hit die not parseable from {core['Hit Point Die']!r}")
    hit_die = int(hit_die_m.group(1))
    saving_throws = to_abilities(core["Saving Throw Proficiencies"])
    skill_count, skill_codes = _class_skill_list(core["Skill Proficiencies"], all_skill_codes)
    armor = _split_proficiency_list(core.get("Armor Training", ""), armor=True)
    weapons = _split_proficiency_list(core.get("Weapon Proficiencies", ""))
    tools = _strip(core.get("Tool Proficiencies", ""))

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
                    "description": "Subclass feature gained at this level; see the class's subclasses for details.",
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

    # Subclass lives after the feature scope, within the full section.
    subclass = _parse_subclass(tokens[start:end], class_name)
    spellcasting = _extract_spellcasting(features_by_level)

    return {
        "code": to_code(class_name),
        "name": class_name,
        "primary_ability": primary,
        "hit_die": hit_die,
        "saving_throw_proficiencies": saving_throws,
        "skill_choices": {"count": skill_count, "from": skill_codes},
        "armor_training": armor,
        "weapon_proficiencies": weapons,
        "tool_proficiencies": tools,
        "starting_equipment_text": _strip(core.get("Starting Equipment", "")),
        "asi_levels": sorted(set(asi_levels)),
        "features_by_level": dict(sorted(features_by_level.items(), key=lambda kv: int(kv[0]))),
        "multiclass_text": multiclass_text,
        "subclass_level": subclass["subclass_level"] if subclass else None,
        "subclasses": [subclass] if subclass else [],
        "spellcasting": spellcasting,
    }


def _merge_authored_choices(classes: list[dict]) -> None:
    """Fold hand-authored choice metadata onto parsed features (A.3).

    Choices are authored by comprehension (the SRD choice prose isn't reliably
    machine-parseable) and verified against source; this is a MECHANICAL merge that only
    attaches each authored `choice` to the matching feature by (level, feature name) — class
    features via class_choices, subclass features via subclass_choices — so classes.json stays
    the single loaded source of truth. A reference to a non-existent feature aborts the build.
    """
    path = Path(__file__).resolve().parent / "authored" / EDITION_CODE / "class_choices.json"
    if not path.exists():
        return
    authored = json.loads(path.read_text(encoding="utf-8"))
    by_code = {c["code"]: c for c in classes}

    def _attach(features: list[dict], fname: str, choice: dict, where: str) -> None:
        match = next((f for f in features if f["name"] == fname), None)
        if match is None:
            raise SystemExit(f"class_choices.json: {where} has no feature {fname!r}")
        match.setdefault("choices", []).append(choice)

    for class_code, entries in authored.get("class_choices", {}).items():
        cls = by_code.get(class_code)
        if not cls:
            raise SystemExit(f"class_choices.json references unknown class {class_code!r}")
        for entry in entries:
            level = str(entry["level"])
            features = cls["features_by_level"].get(level, {}).get("features", [])
            _attach(features, entry["feature"], entry["choice"], f"{class_code} L{level}")

    for class_code, subclasses in authored.get("subclass_choices", {}).items():
        cls = by_code.get(class_code)
        if not cls:
            raise SystemExit(f"class_choices.json references unknown class {class_code!r}")
        sub_by_code = {s["code"]: s for s in cls.get("subclasses", [])}
        for subclass_code, entries in subclasses.items():
            sub = sub_by_code.get(subclass_code)
            if not sub:
                raise SystemExit(f"class_choices.json: {class_code} has no subclass {subclass_code!r}")
            for entry in entries:
                _attach(sub["features"], entry["feature"], entry["choice"], f"{class_code}/{subclass_code}")


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


_SPELL_META_RE = re.compile(r"^_(?:Level (\d+) )?([A-Za-z]+)(?: Cantrip)? \(([^)]+)\)_$")
_SPELL_FIELD_RE = re.compile(r"^\*\*(Casting Time|Range|Components?|Duration):\*\*\s*(.+)$")


def parse_spells() -> list[dict]:
    """Parse the SRD spell catalogue (line-based — the stat blocks are line-oriented).

    Each spell is an H4 under '## Spell Descriptions' whose first non-blank line is the
    italic header ``_Level N School (Classes)_`` (or ``_School Cantrip (Classes)_``). H4
    entries without that header (creature stat blocks like 'Animated Object', 'Actions')
    are skipped. Handles the surveyed edge cases: singular ``**Component:**``, blank lines
    between fields, ritual via 'or Ritual' in Casting Time, concentration via Duration.
    """
    lines = _read("spells.md").splitlines()
    start = next(
        (i for i, ln in enumerate(lines) if ln.strip().lower() == "## spell descriptions"),
        None,
    )
    if start is None:
        raise RuntimeError("spells.md: '## Spell Descriptions' section not found")

    blocks: list[list[str]] = []
    cur: Optional[list[str]] = None
    for ln in lines[start + 1:]:
        if ln.startswith("#### "):
            if cur is not None:
                blocks.append(cur)
            cur = [ln]
        elif cur is not None:
            cur.append(ln)
    if cur is not None:
        blocks.append(cur)

    spells: list[dict] = []
    for block in blocks:
        name = block[0][len("#### "):].strip()
        # The first non-blank line must be the spell header; otherwise it's not a spell.
        meta = None
        meta_idx = 0
        for i in range(1, len(block)):
            if not block[i].strip():
                continue
            meta = _SPELL_META_RE.match(block[i].strip())
            meta_idx = i
            break
        if meta is None:
            continue
        level = int(meta.group(1)) if meta.group(1) else 0
        classes = [to_code(c.strip()) for c in meta.group(3).split(",") if c.strip()]

        fields: dict[str, str] = {}
        desc_lines: list[str] = []
        in_desc = False
        for ln in block[meta_idx + 1:]:
            if not in_desc:
                fm = _SPELL_FIELD_RE.match(ln.strip())
                if fm:
                    label = "Components" if fm.group(1).startswith("Component") else fm.group(1)
                    fields[label] = fm.group(2).strip()
                    continue
                if not ln.strip():
                    continue  # skip blanks between the header/fields and the description
                in_desc = True
            desc_lines.append(ln)

        casting_time = fields.get("Casting Time", "")
        duration = fields.get("Duration", "")
        spells.append({
            "code": to_code(name),
            "name": name,
            "level": level,
            "school": meta.group(2),
            "classes": classes,
            "casting_time": casting_time,
            "range": fields.get("Range", ""),
            "components": fields.get("Components", ""),
            "duration": duration,
            "ritual": "ritual" in casting_time.lower(),
            "concentration": "concentration" in duration.lower(),
            "description": "\n".join(desc_lines).strip() or name,
        })
    if not spells:
        raise RuntimeError("No spells parsed from spells.md")
    spells.sort(key=lambda s: s["code"])
    return spells


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
    _merge_species_subchoices(species)
    print(f"  {len(species)} species")

    print("Parsing backgrounds…")
    backgrounds = parse_backgrounds()
    print(f"  {len(backgrounds)} backgrounds")

    print("Parsing classes…")
    classes = parse_classes(all_skill_codes=[s["code"] for s in skills])
    _merge_authored_choices(classes)
    print(f"  {len(classes)} classes")

    print("Parsing spells…")
    spells = parse_spells()
    print(f"  {len(spells)} spells")

    print("Cross-file validation…")
    cross_validate(skills, feats, species, backgrounds, classes)

    # Pydantic file-wrapper validation before write — abort if anything fails.
    skills_payload = _wrap("skills", skills)
    feats_payload = _wrap("feats", feats)
    species_payload = _wrap("species", species)
    backgrounds_payload = _wrap("backgrounds", backgrounds)
    classes_payload = _wrap("classes", classes)
    spells_payload = _wrap("spells", spells)

    _validate_pydantic(SkillsFile, skills_payload, "skills.json")
    _validate_pydantic(FeatsFile, feats_payload, "feats.json")
    _validate_pydantic(SpeciesFile, species_payload, "species.json")
    _validate_pydantic(BackgroundsFile, backgrounds_payload, "backgrounds.json")
    _validate_pydantic(ClassesFile, classes_payload, "classes.json")
    _validate_pydantic(SpellsFile, spells_payload, "spells.json")

    paths = [
        _write("skills.json", skills_payload),
        _write("feats.json", feats_payload),
        _write("species.json", species_payload),
        _write("backgrounds.json", backgrounds_payload),
        _write("classes.json", classes_payload),
        _write("spells.json", spells_payload),
    ]
    for path in paths:
        print(f"Wrote {path.relative_to(_API_SITE_DIR)}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
