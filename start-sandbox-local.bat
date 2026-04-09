@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "SANDBOX_IP=127.0.0.1"

cd /d "%PROJECT_DIR%"

echo ==========================================
echo RH Direction App - Bac a sable local
echo Projet  : %PROJECT_DIR%
echo Mode    : mock
echo URL     : http://%SANDBOX_IP%:5173
echo Backend : http://%SANDBOX_IP%:3001
echo Compte  : sysadm / Tp0sana
echo ==========================================
echo.

start "RH Sandbox Backend" cmd /k "cd /d "%PROJECT_DIR%" && set RH_DATA_SOURCE=mock && npm run dev:server"
start "RH Sandbox Frontend" cmd /k "cd /d "%PROJECT_DIR%" && npm run dev:client -- --host 127.0.0.1 --port 5173"

echo Deux fenetres ont ete ouvertes pour le frontend et le backend.
echo Ce lancement force le backend en mode mock sans modifier le fichier .env.
echo.
pause
