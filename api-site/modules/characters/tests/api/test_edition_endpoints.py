# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Reference-data endpoint tests — /api/editions/*."""


def test_list_editions_returns_seeded_row(client):
    response = client.get("/api/editions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["code"] == "srd_5_2_1"
    assert data[0]["name"] == "D&D 2024 (5.5e)"
    assert data[0]["is_active"] is True


def test_list_classes(client):
    response = client.get("/api/editions/srd_5_2_1/classes")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 12
    codes = {c["code"] for c in data}
    assert {"barbarian", "wizard", "rogue"}.issubset(codes)


def test_list_species(client):
    response = client.get("/api/editions/srd_5_2_1/species")
    assert response.status_code == 200
    assert len(response.json()) == 9


def test_list_backgrounds(client):
    response = client.get("/api/editions/srd_5_2_1/backgrounds")
    assert response.status_code == 200
    assert len(response.json()) == 4


def test_list_skills(client):
    response = client.get("/api/editions/srd_5_2_1/skills")
    assert response.status_code == 200
    assert len(response.json()) == 18


def test_list_feats_all(client):
    response = client.get("/api/editions/srd_5_2_1/feats")
    assert response.status_code == 200
    assert len(response.json()) == 17


def test_list_feats_filtered_by_category(client):
    response = client.get("/api/editions/srd_5_2_1/feats?category=origin")
    assert response.status_code == 200
    data = response.json()
    assert {f["code"] for f in data} == {"alert", "magic_initiate", "savage_attacker", "skilled"}
    assert all(f["category"] == "origin" for f in data)


def test_unknown_edition_returns_404(client):
    response = client.get("/api/editions/no_such_edition/classes")
    assert response.status_code == 404


def test_invalid_feat_category_rejected(client):
    response = client.get("/api/editions/srd_5_2_1/feats?category=bogus")
    assert response.status_code == 422
