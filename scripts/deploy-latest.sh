# Optional version argument (e.g. 0.64.0), passed through to set-release.sh.
# Without it, set-release.sh resolves "latest" from releases.json — note that
# "latest" advances at CUT time (new-release.sh), which may be ahead of what
# you intend to ship. The deploy workflow always passes the version explicitly.
docker compose down --remove-orphans \
  && ./scripts/set-release.sh "$@" \
  && docker compose pull \
  && docker compose up -d \
  && docker image prune -af
