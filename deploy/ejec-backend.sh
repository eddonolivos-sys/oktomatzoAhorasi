#!/usr/bin/env sh
# ============================================================
# Reconstruye SOLO el backend Go (auth/apps API) y lo redespliega.
# Necesario si cambia backend/ (p. ej. el endpoint guest del Hito 2).
# ============================================================
set -e
cd "$(dirname "$0")"

echo "=== Build del backend ==="
docker compose build backend

echo "=== Redesplegando backend ==="
docker compose up -d backend

echo
echo "Prueba de vida del API (401 esperado sin token):"
curl -s -o /dev/null -w "GET /api/auth/me -> HTTP %{http_code}\n" http://localhost:8080/api/auth/me || true
