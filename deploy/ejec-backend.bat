@echo off
setlocal
cd /d "%~dp0"
rem ============================================================
rem Reconstruye SOLO el backend Go (auth/apps API) y lo redespliega.
rem Necesario si cambia backend/ (p. ej. el endpoint guest del Hito 2).
rem ============================================================
echo === Build del backend ===
docker compose build backend
if errorlevel 1 goto :error

echo === Redesplegando backend ===
docker compose up -d backend
if errorlevel 1 goto :error

echo.
echo Listo. Prueba de vida del API:
curl -s -o nul -w "GET /api/auth/me sin token -> HTTP %%{http_code} (401 esperado)\n" http://localhost:8080/api/auth/me
exit /b 0

:error
echo ERROR: fallo el build o el despliegue del backend.
exit /b 1
