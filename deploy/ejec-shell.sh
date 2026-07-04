#!/usr/bin/env sh
# ============================================================
# Reconstruye SOLO el shell (frontend del espacio 3D) y lo redespliega.
# Es el caso mas comun: cualquier cambio en shell/src requiere esto.
# ============================================================
set -e
cd "$(dirname "$0")"

echo "=== Build del shell ==="
docker compose build shell

echo "=== Redesplegando shell ==="
docker compose up -d shell

echo
echo "Listo. Hash del bundle servido (debe haber CAMBIADO):"
curl -s http://localhost:8080/ | grep -o 'index-[A-Za-z0-9]*\.js' | head -1 || true
echo "Recuerda la recarga forzada en el navegador (cache inmutable de 1 anio)."
