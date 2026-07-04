@echo off
setlocal
cd /d "%~dp0"
rem ============================================================
rem Reconstruye y redespliega UNO O VARIOS servicios por nombre.
rem Uso: ejec-servicio.bat <servicio> [servicio2 ...]
rem Servicios: shell backend space-server game-server app-dashboard
rem            app-viewer-3d app-mundo-3d app-combate-3d oktomatzo2-api
rem            oktomatzo2-app test-uno test-dos caddy redis
rem (caddy y redis no tienen build: solo se recrean)
rem ============================================================
if "%~1"=="" (
  echo Uso: ejec-servicio.bat ^<servicio^> [servicio2 ...]
  docker compose config --services
  exit /b 1
)

echo === Build: %* ===
docker compose build %*
if errorlevel 1 goto :error

echo === Redesplegando: %* ===
docker compose up -d %*
if errorlevel 1 goto :error

docker compose ps %*
exit /b 0

:error
echo ERROR: fallo el build o el despliegue de: %*
exit /b 1
