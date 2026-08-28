# Optional version argument (e.g. 0.64.0), passed through to set-release.sh.
# Without it, set-release.sh resolves "latest" from releases.json — note that
# "latest" advances at CUT time (new-release.sh), which may be ahead of what
# you intend to ship. The deploy workflow always passes the version explicitly.
#
# Order matters: set-release + pull are PREFLIGHT, run while the old stack is
# still serving — a bad version or a registry/pull failure aborts the deploy
# with production untouched. Only once images are local does the stack go
# down, so downtime is just the restart window.
#
# down --remove-orphans: the compose file may have changed since the running
# stack was created — this also removes project-labeled containers the new
# file no longer defines (renamed/removed services), which a plain down
# would leave running.
./scripts/set-release.sh "$@" \
  && docker compose pull \
  && docker compose down --remove-orphans \
  && docker compose up -d \
  && docker image prune -af
