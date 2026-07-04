@echo off
setlocal
cd /d "%~dp0"
rem ============================================================
rem Reconstruye TODO el stack (14 servicios) y lo deja corriendo.
rem Uso: ejec-todo.bat [nocache]
rem   nocache = build desde cero (sin cache de capas; mucho mas lento)
rem ============================================================
set "BUILDFLAGS="
if /i "%~1"=="nocache" set "BUILDFLAGS=--no-cache"

echo === Pre-pull de imagenes base (mitiga timeouts TLS a Docker Hub en frio) ===
for %%I in (node:20-alpine nginx:alpine golang:1.22-alpine alpine:3.20 python:3.11-slim caddy:2-alpine redis:alpine) do docker pull %%I

echo === Build de todos los servicios %BUILDFLAGS% ===
docker compose build %BUILDFLAGS%
if errorlevel 1 goto :error

echo === Levantando el stack ===
docker compose up -d
if errorlevel 1 goto :error

docker compose ps
echo.
echo Listo. Abre http://localhost:8080 con recarga forzada (Ctrl+F5).
echo Hash del bundle servido (debe cambiar si se toco el shell):
curl -s http://localhost:8080/ | findstr index-
exit /b 0

:error
echo ERROR: fallo el build o el arranque. Revisa la salida anterior.
exit /b 1
