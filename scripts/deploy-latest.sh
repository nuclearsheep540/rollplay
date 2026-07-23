docker compose down --remove-orphans \
  && ./scripts/set-release.sh \
  && docker compose pull \
  && docker compose up -d \
  && docker image prune -af
