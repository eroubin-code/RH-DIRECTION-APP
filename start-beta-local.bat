@echo off
setlocal

set "PROJECT_DIR=%~dp0"

cd /d "%PROJECT_DIR%"

echo ==========================================
echo RH Direction App - Beta locale
echo Projet  : %PROJECT_DIR%
echo URL     : http://localhost:5173
echo Backend : http://localhost:3001
echo Compte  : utiliser un compte local autorise
echo ==========================================
echo.

start "RH Backend" cmd /k "cd /d "%PROJECT_DIR%" && npm run dev:server"
start "RH Frontend" cmd /k "cd /d "%PROJECT_DIR%" && npm run dev:client -- --host 0.0.0.0 --port 5173"

echo Deux fenetres ont ete ouvertes pour le frontend et le backend.
echo Le frontend ecoute sur 0.0.0.0:5173 pour un test depuis un autre poste.
echo Remplace "localhost" par l'IP de cette machine si besoin.
echo.
pause
