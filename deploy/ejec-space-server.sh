#!/usr/bin/env sh
# ============================================================
# Reconstruye SOLO el space-server (multijugador WS + Redis) y lo redespliega.
# Necesario si cambia services/space-server/ (p. ej. salas/host del Hito 6).
# ============================================================
set -e
cd "$(dirname "$0")"

echo "=== Build del space-server ==="
docker compose build space-server

echo "=== Redesplegando space-server (redis se mantiene) ==="
docker compose up -d space-server

docker compose ps space-server redis
echo
echo "Listo. El WS vive en /space-ws (via Caddy) y en 127.0.0.1:8093 directo."
