#!/usr/bin/env sh
# ============================================================
# Reconstruye y redespliega UNO O VARIOS servicios por nombre.
# Uso: ./ejec-servicio.sh <servicio> [servicio2 ...]
# Servicios: shell backend space-server game-server app-dashboard
#            app-viewer-3d app-mundo-3d app-combate-3d oktomatzo2-api
#            oktomatzo2-app test-uno test-dos caddy redis
# (caddy y redis no tienen build: solo se recrean)
# ============================================================
set -e
cd "$(dirname "$0")"

if [ $# -eq 0 ]; then
  echo "Uso: ./ejec-servicio.sh <servicio> [servicio2 ...]"
  docker compose config --services
  exit 1
fi

echo "=== Build: $* ==="
docker compose build "$@"

echo "=== Redesplegando: $* ==="
docker compose up -d "$@"

docker compose ps "$@"
