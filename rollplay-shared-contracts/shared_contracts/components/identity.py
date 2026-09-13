# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Identity component — who or what the character is, in the GM's terms.

A name is one identity; so is a calling, a house, a job, a role. The GM chooses how each
is answered:
  text           — a short free text (a name).
  single_select  — one choice from the GM's list (a class).
  multi_select   — any number of choices from the list (roles, trades).

A campaign may configure any number of Identity components (or none). The GM marks the
ones that make up the character's title (`is_title`); the platform derives the display
name by joining those values in config order with single spaces — "First name" and
"Family name" read as one name, a Profession stays off it. See api-site's
CharacterAggregate.derive_display_name.
"""

from typing import Annotated, List, Literal, Optional, Union

from pydantic import Field, model_validator

from ..base import ContractModel

TEXT_MAX_LENGTH_CEILING = 200
OPTION_MAX_LENGTH = 60
OPTIONS_CEILING = 50
# A description is a sentence or two on the form, never a paragraph.
DESCRIPTION_MAX_LENGTH = 240


def _check_options(options: List[str]) -> None:
    """The GM's list: every option a non-blank string within the length cap, no repeats."""
    seen = set()
    for option in options:
        if not option.strip():
            raise ValueError("options must not be blank")
        if len(option) > OPTION_MAX_LENGTH:
            raise ValueError(f"option {option!r} exceeds {OPTION_MAX_LENGTH} characters")
        if option in seen:
            raise ValueError(f"duplicate option: {option!r}")
        seen.add(option)


class TextIdentityInput(ContractModel):
    kind: Literal["text"] = "text"
    max_length: int = Field(default=60, ge=1, le=TEXT_MAX_LENGTH_CEILING)


class SingleSelectIdentityInput(ContractModel):
    kind: Literal["single_select"] = "single_select"
    options: List[str] = Field(min_length=1, max_length=OPTIONS_CEILING)

    @model_validator(mode="after")
    def check_options(self) -> "SingleSelectIdentityInput":
        _check_options(self.options)
        return self


class MultiSelectIdentityInput(ContractModel):
    kind: Literal["multi_select"] = "multi_select"
    options: List[str] = Field(min_length=1, max_length=OPTIONS_CEILING)

    @model_validator(mode="after")
    def check_options(self) -> "MultiSelectIdentityInput":
        _check_options(self.options)
        return self


IdentityInput = Annotated[
    Union[TextIdentityInput, SingleSelectIdentityInput, MultiSelectIdentityInput],
    Field(discriminator="kind"),
]


class IdentityConfiguration(ContractModel):
    type: Literal["identity"] = "identity"
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=60)
    secret: bool = False
    # GM-written, shown on the form between the hint and the input. Optional.
    description: Optional[str] = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)
    input: IdentityInput
    required: bool = True
    # Part of the character's display name. Any kind may be: a chosen house or calling
    # can be as much the title as a name.
    is_title: bool = False


class TextIdentityAnswer(ContractModel):
    kind: Literal["text"] = "text"
    # The configuration's max_length is enforced at pairing (CharacterSheet), not here —
    # a value model cannot see its configuration. The ceiling here is the platform's.
    text: str = Field(max_length=TEXT_MAX_LENGTH_CEILING)


class SingleSelectIdentityAnswer(ContractModel):
    kind: Literal["single_select"] = "single_select"
    # Whether the choice is still on the configuration's list is a version difference
    # (the GM edited the options after the character picked), never a data invariant.
    choice: str = Field(min_length=1, max_length=OPTION_MAX_LENGTH)


class MultiSelectIdentityAnswer(ContractModel):
    kind: Literal["multi_select"] = "multi_select"
    choices: List[str] = []

    @model_validator(mode="after")
    def check_choices(self) -> "MultiSelectIdentityAnswer":
        _check_options(self.choices)
        return self


IdentityAnswer = Annotated[
    Union[TextIdentityAnswer, SingleSelectIdentityAnswer, MultiSelectIdentityAnswer],
    Field(discriminator="kind"),
]


class IdentityValue(ContractModel):
    type: Literal["identity"] = "identity"
    component_id: str = Field(min_length=1, max_length=64)
    answer: IdentityAnswer

    def is_populated(self) -> bool:
        """Whether the player has answered: non-blank text, a choice, or at least one.
        What "required" checks at create — the one axis it is fair to require."""
        if self.answer.kind == "text":
            return bool(self.answer.text.strip())
        if self.answer.kind == "single_select":
            return bool(self.answer.choice)
        return len(self.answer.choices) > 0

    def as_text(self) -> str:
        """The answer as one short string: the text, the choice, or the choices joined.
        Empty when unanswered. What the display name and the adventure log show."""
        if self.answer.kind == "text":
            return self.answer.text.strip()
        if self.answer.kind == "single_select":
            return self.answer.choice
        return ", ".join(self.answer.choices)
