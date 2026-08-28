# Ship Workflow — deploy-and-release from GitHub Actions

**Status:** built · 2026-08-28 — prerequisites (healthchecks) and both PR 2 pieces
(`deploy.yml`, `deploy-latest.sh` version arg) in working tree; pending commit,
merge, and dry-run dispatch of the currently-deployed version
**Decision:** Option B — a `workflow_dispatch` GitHub Actions workflow performs the
prod deploy AND publishes the GitHub Release, so the release doc can never claim a
ship that didn't happen. Chosen over (A) dev-box wrapper script — invariant only
holds if the script is used; and (C) prod-initiated dispatch — requires granting
prod an Actions-write token, and prod deliberately holds no GitHub credentials.

## Definitions (the distinction that shaped this design)

- **Cut** — a version exists: tag `rollplay-X.Y.Z` pushed, images built to GHCR,
  manifest updated. Happens freely and often (`new-release.sh`). Automated today.
- **Ship** — a cut is deployed to prod and becomes what users run. Only ships get
  a GitHub Release; `--latest` tracks the last *ship*, not the last cut.

## What already exists (reuse, don't invent)

- `build.yml` on tag `rollplay-*`: builds changed services (diff vs previous
  release in `releases.json`), pushes to GHCR, then `deploy-manifest` job SCPs
  `scripts/` + `releases.json` to prod.
- Secrets (existing — **the plan adds no new credentials anywhere**):
  `PROD_HOST`, `PROD_SSH_KEY`, `PROD_SSH_FINGERPRINT`.
- Convention: appleboy scp/ssh actions pinned by commit hash (supply-chain: these
  actions receive the prod key). The ship workflow follows it.
- Prod box: pull-only posture (ghcr read via docker login; no GitHub API creds).
  This plan keeps that posture untouched.

## Prerequisite PR — make the health gate honest

The gate is only as good as the healthchecks it reads. Audit findings (2026-08-28):

| Service | /health endpoint | Healthcheck | Works? |
|---|---|---|---|
| api-auth (dev+prod img) | yes | curl probe, `api-auth/Dockerfile` | **NO — curl not in image; 108-probe failing streak on a healthy service** |
| api-game | **none** | root `api-game/Dockerfile` has curl probe but file appears unreferenced by any compose | **NO — no endpoint, no active check** |
| api-site (prod img) | yes | curl probe, curl installed | yes |
| mongo / postgres (prod compose) | — | mongosh ping / pg_isready | yes |

**Exposure note (resolves the "spammable unauthenticated URL" concern that got
api-game's /health removed):** HEALTHCHECK probes execute inside the container's
network namespace; public traffic reaches services only through nginx `location`
blocks, and neither nginx config routes `/health` (verified 2026-08-28). With no
route and the EC2 security group as outer wall, restored /health endpoints are
unreachable from the internet — no rate limiting required. Do NOT add an nginx
route for them; if a public status URL is ever wanted, that is a separate feature
gated behind `limit_req`.

Changes:
1. Standard probe, no curl dependency (slim images have python by definition):
   `CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:PORT/health')"`
   Apply to `api-auth/Dockerfile`; add HEALTHCHECK to `docker/prod/api-auth/Dockerfile`
   and `docker/prod/api-game/Dockerfile`.
2. Restore `GET /health` to api-game `app.py` (status + version; internal-only
   per the exposure note — it is the one service with no health endpoint).
3. Resolve root `api-game/Dockerfile` — unreferenced by dev/prod compose; delete
   or document. (Also carries an unrelated `rm-rf` typo — sign it's unexercised.)
4. Rebuild dev images to pick up probe changes (healthcheck is image metadata).

## The workflow — `.github/workflows/deploy.yml`

**Trigger:** `workflow_dispatch` with **optional** input `version`. Empty (the
normal case) resolves `releases.json`'s `latest` and echoes the resolved version
loudly in the job output — matching the operator's mental model of "ship what's
current". An explicit version (e.g. `0.64.0`) pins/rolls back: re-dispatching an
older version IS the rollback path (`--latest` re-crowns automatically). Manual
trigger from the Actions tab is the only ceremony — no Environment approval gate.

**Job: ship** (single job; `concurrency: production`, `cancel-in-progress: false`;
optional GitHub Environment `production` for secret scoping / confirm-click):

1. **Checkout + validate** — tag `rollplay-$VERSION` must exist; version must
   exist in `releases.json`. Fail fast before touching prod.
2. **Sync manifest to prod** — same pinned scp step as `deploy-manifest` (re-run
   here so the workflow is self-sufficient; idempotent).
3. **Deploy** — pinned ssh action: `./scripts/deploy-latest.sh $VERSION`.
4. **Health gate, layer 1 (on host)** — poll `docker compose ps` until every
   service with a healthcheck reports healthy and the rest are running; timeout
   ~120s → job fails. (Prerequisite PR makes this signal real.)
5. **Health gate, layer 2 (end-to-end)** — from the runner, curl the site
   root (the sole probe since the patch-notes feature was removed 2026-08-28).
   Proves users are served, not just containers up — with zero new exposure
   (these URLs are reachable by any browser today).
6. **Publish release** — only reached if 1–5 passed:
   `gh release create rollplay-$VERSION --title rollplay-$VERSION --generate-notes --latest`
   with job-scoped `permissions: contents: write`, `GH_TOKEN: ${{ github.token }}`.
   Ship-time creation means `--generate-notes` spans everything since the last
   *ship* — notes automatically cover all intermediate cuts. No drafts needed.

**Failure semantics:** any step failing stops before step 6 → no release doc, no
`--latest` move. Prod may be mid-deploy on a 3–5 failure; recovery is manual ssh
or re-dispatch (documented limitation — no auto-rollback in v1).

## Prod-side change (the only one)

`scripts/deploy-latest.sh` accepts an optional version argument, passed through to
`set-release.sh "$1"`. Without it the manifest's `latest` pointer (which advances
at CUT time) decides what deploys — the trap this plan exists to close. No-arg
behaviour kept for manual use.

## What we will NOT do (v1)

- No new tokens/credentials on prod or in secrets — existing three secrets only.
- No auto-rollback on failed health gate (re-dispatch older version is the lever).
- No draft releases at cut time (ship-time `--generate-notes` covers the range).
- No SSM/tailscale replumbing of SSH access (works today via scp-action path).
- No changes to `new-release.sh` / cut flow / build.yml build+manifest jobs.

## Resolved questions (2026-08-28)

1. **No Environment approval gate** — the manual Run-workflow trigger is the
   intervention; Environments are team review ceremony we don't need.
2. **Layer 2 target: site root** — already-public URL only; /health stays
   internal (see exposure note above). (Originally site root + the patch-notes
   endpoint; that feature was removed 2026-08-28, superseded by GitHub Releases.)
3. **`deploy-manifest` stays in build.yml** — it keeps host scripts/manifest
   fresh at cut time; the ship workflow's re-sync is belt-and-braces for shipping
   after script changes. Two writers, same idempotent copy, different moments.

## Rollout order

1. PR: healthcheck prerequisites (probe fix, api-game /health, prod HEALTHCHECKs).
2. PR: `deploy-latest.sh` version arg + `deploy.yml`.
3. Dry run: dispatch current already-deployed version; verify gate passes and
   release publishes correctly.
4. First real ship on the next cut.
