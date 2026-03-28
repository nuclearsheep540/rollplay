#!/usr/bin/env bash
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Interactive release creation script.
# Diffs HEAD against the last release commit to detect which services
# have changes, prompts for semver bumps, writes releases.json,
# syncs .env, commits, tags, and pushes.
#
# Run from main after merging a PR:
#   git checkout main && git pull
#   ./scripts/new-release.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/releases.json"

if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not installed." >&2
    exit 1
fi

# ── Safety checks ────────────────────────────────────────────────
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "Error: must be on main branch (currently on '$CURRENT_BRANCH')" >&2
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Error: working tree is not clean. Commit or stash changes first." >&2
    exit 1
fi

# ── Service → watch path mapping ──────────────────────────────────
declare -A SERVICE_PATHS=(
    [app]="rollplay/"
    [api_site]="api-site/"
    [api_game]="api-game/"
    [api_auth]="api-auth/"
    [nginx]="docker/dev/nginx/ docker/prod/nginx/"
    [postgres]="docker/dev/postgres/ docker/prod/postgres/"
    [mongo]="docker/dev/mongo/ docker/prod/db/"
    [certbot]="docker/prod/certbot-renewer/"
)

# Display order
SERVICE_ORDER=(
    app
    api_site
    api_game
    api_auth
    nginx
    postgres
    mongo
    certbot
)

# ── Semver helpers ────────────────────────────────────────────────
bump_patch() {
    local IFS='.'; read -r major minor patch <<< "$1"
    echo "$major.$minor.$((patch + 1))"
}
bump_minor() {
    local IFS='.'; read -r major minor patch <<< "$1"
    echo "$major.$((minor + 1)).0"
}
bump_major() {
    local IFS='.'; read -r major minor patch <<< "$1"
    echo "$((major + 1)).0.0"
}

# ── Resolve baseline ─────────────────────────────────────────────
LATEST=$(jq -r '.latest' "$MANIFEST")
BASELINE_COMMIT=$(jq --arg ver "$LATEST" -r '.releases[$ver].commit // empty' "$MANIFEST")

if [[ -z "$BASELINE_COMMIT" ]]; then
    echo "Error: release '$LATEST' has no commit SHA in releases.json" >&2
    exit 1
fi

# Verify the commit exists in git history
if ! git rev-parse --verify "$BASELINE_COMMIT" &>/dev/null; then
    echo "Error: commit '$BASELINE_COMMIT' not found in git history" >&2
    exit 1
fi

echo "Checking services for changes since $LATEST ($BASELINE_COMMIT)..."
echo ""

# ── Detect changes per service ────────────────────────────────────
declare -A NEW_VERSIONS
CHANGED_COUNT=0

for service in "${SERVICE_ORDER[@]}"; do
    current=$(jq --arg ver "$LATEST" --arg svc "$service" -r '.releases[$ver].services[$svc]' "$MANIFEST")
    paths="${SERVICE_PATHS[$service]}"

    # Check if any watched paths have changes
    changed_files=""
    for path in $paths; do
        files=$(git diff --name-only "$BASELINE_COMMIT"..HEAD -- "$path" 2>/dev/null || true)
        if [[ -n "$files" ]]; then
            changed_files+="$files"$'\n'
        fi
    done

    if [[ -n "$changed_files" ]]; then
        file_count=$(echo "$changed_files" | grep -c '.' || true)
        CHANGED_COUNT=$((CHANGED_COUNT + 1))

        echo "  $service ($current) — $file_count file(s) changed:"
        echo "$changed_files" | head -5 | sed 's/^/    /'
        if [[ $file_count -gt 5 ]]; then
            echo "    ... and $((file_count - 5)) more"
        fi

        p=$(bump_patch "$current")
        m=$(bump_minor "$current")
        M=$(bump_major "$current")

        while true; do
            echo ""
            echo "  [p]atch $p  /  [m]inor $m  /  [M]ajor $M  /  [s]kip  /  [c]ustom"
            read -rp "  Bump $service: " choice
            case "$choice" in
                p) NEW_VERSIONS[$service]="$p"; break ;;
                m) NEW_VERSIONS[$service]="$m"; break ;;
                M) NEW_VERSIONS[$service]="$M"; break ;;
                s) NEW_VERSIONS[$service]="$current"; break ;;
                c)
                    read -rp "  Custom version: " custom
                    if [[ "$custom" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                        NEW_VERSIONS[$service]="$custom"; break
                    else
                        echo "  Invalid semver format (expected x.y.z)"
                    fi
                    ;;
                *) echo "  Invalid choice" ;;
            esac
        done
        echo ""
    else
        NEW_VERSIONS[$service]="$current"
        echo "  $service ($current) — no changes"
    fi
done

# ── Catch-all: prompt for any missed services ─────────────────────
echo ""
if [[ $CHANGED_COUNT -eq 0 ]]; then
    echo "No service changes detected."
    read -rp "Continue anyway? [y/N]: " cont
    if [[ "$cont" != "y" && "$cont" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi
fi

echo ""
read -rp "Add version bumps for any other services? [y/N]: " add_more
if [[ "$add_more" == "y" || "$add_more" == "Y" ]]; then
    for service in "${SERVICE_ORDER[@]}"; do
        current="${NEW_VERSIONS[$service]}"
        original=$(jq --arg ver "$LATEST" --arg svc "$service" -r '.releases[$ver].services[$svc]' "$MANIFEST")
        # Only prompt for services that weren't already bumped
        if [[ "$current" == "$original" ]]; then
            p=$(bump_patch "$current")
            m=$(bump_minor "$current")
            M=$(bump_major "$current")
            echo ""
            echo "  $service ($current)"
            echo "  [p]atch $p  /  [m]inor $m  /  [M]ajor $M  /  [s]kip  /  [c]ustom"
            read -rp "  Bump $service: " choice
            case "$choice" in
                p) NEW_VERSIONS[$service]="$p" ;;
                m) NEW_VERSIONS[$service]="$m" ;;
                M) NEW_VERSIONS[$service]="$M" ;;
                c)
                    read -rp "  Custom version: " custom
                    if [[ "$custom" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                        NEW_VERSIONS[$service]="$custom"
                    else
                        echo "  Invalid format, keeping $current"
                    fi
                    ;;
                *) ;; # skip
            esac
        fi
    done
fi

# ── Prompt for release version and description ────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Service versions for new release:"
for service in "${SERVICE_ORDER[@]}"; do
    current=$(jq --arg ver "$LATEST" --arg svc "$service" -r '.releases[$ver].services[$svc]' "$MANIFEST")
    new="${NEW_VERSIONS[$service]}"
    if [[ "$new" != "$current" ]]; then
        echo "  $service: $current → $new"
    else
        echo "  $service: $new"
    fi
done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
RELEASE_PATCH=$(bump_patch "$LATEST")
RELEASE_MINOR=$(bump_minor "$LATEST")
RELEASE_MAJOR=$(bump_major "$LATEST")
echo "Release version — [p]atch $RELEASE_PATCH  /  [m]inor $RELEASE_MINOR  /  [M]ajor $RELEASE_MAJOR  /  [c]ustom"
while true; do
    read -rp "Release version: " choice
    case "$choice" in
        p) RELEASE_VERSION="$RELEASE_PATCH"; break ;;
        m) RELEASE_VERSION="$RELEASE_MINOR"; break ;;
        M) RELEASE_VERSION="$RELEASE_MAJOR"; break ;;
        c)
            read -rp "Custom version: " custom
            if [[ "$custom" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                RELEASE_VERSION="$custom"; break
            else
                echo "Invalid semver format"
            fi
            ;;
        *) echo "Invalid choice" ;;
    esac
done

# Check version doesn't already exist
if jq --arg ver "$RELEASE_VERSION" -e '.releases[$ver]' "$MANIFEST" &>/dev/null; then
    echo "Error: release '$RELEASE_VERSION' already exists in releases.json" >&2
    exit 1
fi

read -rp "Description: " RELEASE_DESCRIPTION

# ── Write to manifest ────────────────────────────────────────────
COMMIT_SHA=$(git rev-parse --short HEAD)
DATE=$(date +%Y-%m-%d)

# Build services JSON
SERVICES_JSON="{"
first=true
for service in "${SERVICE_ORDER[@]}"; do
    if [[ "$first" == true ]]; then first=false; else SERVICES_JSON+=","; fi
    SERVICES_JSON+="\"$service\":\"${NEW_VERSIONS[$service]}\""
done
SERVICES_JSON+="}"

jq --arg ver "$RELEASE_VERSION" \
   --arg desc "$RELEASE_DESCRIPTION" \
   --arg date "$DATE" \
   --arg commit "$COMMIT_SHA" \
   --argjson services "$SERVICES_JSON" \
   '.releases[$ver] = {date: $date, commit: $commit, description: $desc, services: $services} | .latest = $ver' \
   "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"

# ── Sync .env ─────────────────────────────────────────────────────
"$SCRIPT_DIR/set-release.sh" "$RELEASE_VERSION"

# ── Commit, tag, push ─────────────────────────────────────────────
TAG="rollplay-${RELEASE_VERSION}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Ready to commit, tag, and push:"
echo "  commit: releases.json"
echo "  tag:    $TAG"
echo "  push:   origin main + $TAG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -rp "Proceed? [y/N]: " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo ""
    echo "Manifest and .env updated locally but NOT committed."
    echo "To finish manually:"
    echo "  git add releases.json"
    echo "  git commit -m \"release $RELEASE_VERSION\""
    echo "  git tag $TAG"
    echo "  git push origin main "$TAG""
    exit 0
fi

git add releases.json
git commit -m "release $RELEASE_VERSION — $RELEASE_DESCRIPTION"
git tag "$TAG"
git push origin main "$TAG"

echo ""
echo "Released $RELEASE_VERSION ($TAG) and pushed to origin."