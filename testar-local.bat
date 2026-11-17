@echo off
REM Atlas Radiologico - teste local
REM Coloque este .bat na MESMA pasta do index.html e de um clique duplo.
REM Sobe um servidor em http://127.0.0.1:8000 e abre o navegador.
REM Para encerrar: feche esta janela preta (ou Ctrl+C).

cd /d "%~dp0"

if not exist "index.html" (
  echo [ERRO] index.html nao esta nesta pasta. Coloque o .bat junto do index.html.
  pause
  exit /b 1
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8000/index.html"
  python -m http.server 8000 --bind 127.0.0.1
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8000/index.html"
  py -m http.server 8000 --bind 127.0.0.1
  goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8000/index.html"
  npx --yes http-server -p 8000 -a 127.0.0.1 -c-1 .
  goto :eof
)

echo [ERRO] Nao encontrei Python nem Node neste computador.
echo Instale o Python em https://www.python.org/downloads/ (marque "Add to PATH") e rode de novo.
pause
