@echo off
setlocal
cd /d "%~dp0"
rem ============================================================
rem Reconstruye SOLO el shell (frontend del espacio 3D) y lo redespliega.
rem Es el caso mas comun: cualquier cambio en shell/src requiere esto.
rem ============================================================
echo === Build del shell ===
docker compose build shell
if errorlevel 1 goto :error

echo === Redesplegando shell ===
docker compose up -d shell
if errorlevel 1 goto :error

echo.
echo Listo. Abre http://localhost:8080 con recarga forzada (Ctrl+F5).
echo Hash del bundle servido (debe haber CAMBIADO):
curl -s http://localhost:8080/ | findstr index-
exit /b 0

:error
echo ERROR: fallo el build o el despliegue del shell.
exit /b 1
