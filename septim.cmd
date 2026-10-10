@echo off
rem septim sous Windows : relaie vers l'usine qui tourne dans Docker (LANCER.bat la demarre). Fichier en ASCII.
setlocal
cd /d "%~dp0"
if /i "%~1"=="start" goto up
if /i "%~1"=="studio" goto up
if /i "%~1"=="connect" if /i "%~2"=="claude-code" goto connect
if /i "%~1"=="env" goto env
docker compose exec septim septim %*
exit /b %errorlevel%

:up
docker compose up -d
docker compose logs septim --no-log-prefix --tail 50 2>nul | findstr /c:"Studio SEPTIM"
exit /b 0

:env
rem septim env : regle le fichier .env de ce dossier. Il est monte dans un conteneur le temps de la commande.
if not exist "%~dp0.env" echo # Reglages SEPTIM : septim env init, septim env set CLE=valeur> "%~dp0.env"
docker compose run --rm --no-deps -v "%~dp0.env:/app/.env" septim %*
if errorlevel 1 exit /b 1
if /i "%~2"=="set" goto reapply
if /i "%~2"=="unset" goto reapply
if /i "%~2"=="init" goto reapply
exit /b 0

:reapply
rem Si l'usine tourne, on la recree pour qu'elle relise .env.
set "RUNNING="
for /f %%i in ('docker compose ps -q septim 2^>nul') do set "RUNNING=%%i"
if defined RUNNING docker compose up -d
exit /b 0

:connect
where claude >nul 2>nul
if errorlevel 1 goto noclaude
set "TOKEN="
for /f "delims=" %%t in ('docker compose exec -T septim cat /data/.token 2^>nul') do set "TOKEN=%%t"
if not defined TOKEN goto notrunning
set "PORT=%SEPTIM_PORT%"
if not defined PORT set "PORT=4321"
claude mcp remove septim --scope user >nul 2>nul
claude mcp add --transport http --scope user septim http://localhost:%PORT%/mcp --header "Authorization: Bearer %TOKEN%"
if errorlevel 1 exit /b 1
echo.
echo Claude Code est branche sur SEPTIM. Relance Claude Code, puis tape /mcp : septim doit etre connecte.
exit /b 0

:noclaude
echo Claude Code (la commande "claude") est introuvable dans ce terminal.
echo Installe-le : https://docs.claude.com/claude-code  puis relance cette commande.
exit /b 1

:notrunning
echo SEPTIM ne tourne pas. Lance d'abord LANCER.bat, puis relance cette commande.
exit /b 1
