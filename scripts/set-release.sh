#!/usr/bin/env bash
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Reads a release version from releases.json and writes
# the corresponding service versions into .env.
#
# Usage:
#   ./scripts/set-release.sh          # uses "latest" from manifest
#   ./scripts/set-release.sh 0.27.1   # uses specified version

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/releases.json"
ENV_FILE="$REPO_ROOT/.env"

if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not installed." >&2
    exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
    echo "Error: releases.json not found at $MANIFEST" >&2
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: .env not found at $ENV_FILE" >&2
    exit 1
fi

# Resolve version
if [[ $# -ge 1 ]]; then
    VERSION="$1"
else
    VERSION=$(jq -r '.latest' "$MANIFEST")
    if [[ "$VERSION" == "null" || -z "$VERSION" ]]; then
        echo "Error: no 'latest' field in releases.json" >&2
        exit 1
    fi
fi

# Validate version exists in manifest
RELEASE=$(jq -r ".releases[\"$VERSION\"] // empty" "$MANIFEST")
if [[ -z "$RELEASE" ]]; then
    echo "Error: release '$VERSION' not found in releases.json" >&2
    echo ""
    echo "Available releases:"
    jq -r '.releases | keys[]' "$MANIFEST" | sort -V | sed 's/^/  /'
    exit 1
fi

# Read service versions
SERVICES=$(echo "$RELEASE" | jq -r '.services | to_entries[] | "\(.key)=\(.value)"')

# Update .env — overwrite matching lines, preserve everything else
while IFS='=' read -r key value; do
    # Match the key at start of line, optionally followed by =value and optional comment
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
        echo "Warning: key '$key' not found in .env, skipping" >&2
    fi
done <<< "$SERVICES"

# Update the RELEASE line
if grep -q "^RELEASE=" "$ENV_FILE"; then
    sed -i "s|^RELEASE=.*|RELEASE=${VERSION}|" "$ENV_FILE"
else
    echo "Warning: RELEASE key not found in .env, skipping" >&2
fi

# Summary
DESCRIPTION=$(echo "$RELEASE" | jq -r '.description // "no description"')
echo "Release $VERSION — $DESCRIPTION"
echo ""
echo "Set in .env:"
echo "  RELEASE=$VERSION"
echo "$SERVICES" | sed 's/^/  /'
