@echo off
setlocal
cd /d "%~dp0"
rem ============================================================
rem Reconstruye SOLO el space-server (multijugador WS + Redis) y lo redespliega.
rem Necesario si cambia services/space-server/ (p. ej. salas/host del Hito 6).
rem ============================================================
echo === Build del space-server ===
docker compose build space-server
if errorlevel 1 goto :error

echo === Redesplegando space-server (redis se mantiene) ===
docker compose up -d space-server
if errorlevel 1 goto :error

docker compose ps space-server redis
echo.
echo Listo. El WS vive en /space-ws (via Caddy) y en 127.0.0.1:8093 directo.
exit /b 0

:error
echo ERROR: fallo el build o el despliegue del space-server.
exit /b 1
