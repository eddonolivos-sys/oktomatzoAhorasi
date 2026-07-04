#!/usr/bin/env sh
# ============================================================
# Reconstruye TODO el stack (14 servicios) y lo deja corriendo
# de forma PERMANENTE (los servicios llevan restart: unless-stopped,
# asi que sobreviven reinicios del servidor SIEMPRE que el demonio
# de Docker arranque al boot; asegurarlo una sola vez con:
#   sudo systemctl enable --now docker
# ).
# Uso: ./ejec-todo.sh [nocache]
#   nocache = build desde cero (sin cache de capas; mucho mas lento)
#
# VPS + Cloudflare Tunnel: el tunel (cloudflared como servicio systemd)
# consume el puerto 8080 publicado por caddy; con este script basta.
# Alternativa con cloudflared DENTRO de Docker:
#   docker compose -f docker-compose.yml -f docker-compose.internet.yml up -d --build
# ============================================================
set -e
cd "$(dirname "$0")"

BUILDFLAGS=""
[ "$1" = "nocache" ] && BUILDFLAGS="--no-cache"

echo "=== Pre-pull de imagenes base (mitiga timeouts TLS a Docker Hub en frio) ==="
for img in node:20-alpine nginx:alpine golang:1.22-alpine alpine:3.20 python:3.11-slim caddy:2-alpine redis:alpine; do
  docker pull "$img" || echo "aviso: no se pudo pre-pull $img (se reintentara durante el build)"
done

echo "=== Build de todos los servicios $BUILDFLAGS ==="
docker compose build $BUILDFLAGS

echo "=== Levantando el stack ==="
docker compose up -d

docker compose ps
echo
echo "Listo. Local: http://localhost:8080 (recarga forzada). Bundle servido:"
curl -s http://localhost:8080/ | grep -o 'index-[A-Za-z0-9]*\.js' | head -1 || true
