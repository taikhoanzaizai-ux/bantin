@echo off
setlocal
set "SITE_ORIGIN=http://127.0.0.1:8787"
cd /d "%~dp0"
set "HF_HOME=%~dp0cache\huggingface"
set "HF_HUB_CACHE=%~dp0cache\huggingface\hub"
set "HUGGINGFACE_HUB_CACHE=%~dp0cache\huggingface\hub"
set "TORCH_HOME=%~dp0cache\torch"
set "XDG_CACHE_HOME=%~dp0cache"
set "PIP_CACHE_DIR=%~dp0cache\pip"
set "TEMP=%~dp0temp"
set "TMP=%~dp0temp"
if not exist "%TEMP%" mkdir "%TEMP%"
if exist .venv\Scripts\python.exe goto check
where py >nul 2>nul
if errorlevel 1 goto plainpython
py -3.11 -m venv .venv
if not errorlevel 1 goto check
py -3 -m venv .venv
if not errorlevel 1 goto check
:plainpython
python -m venv .venv
if errorlevel 1 goto fail
:check
.venv\Scripts\python.exe -c "import vieneu, fastapi, uvicorn, multipart, faster_whisper" >nul 2>nul
if not errorlevel 1 goto run
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto fail
:run
.venv\Scripts\python.exe server.py
pause
exit /b 0
:fail
echo Cai Python 3.11 tu https://www.python.org/downloads/ va thu lai.
echo Lan cai dau can Internet de tai thu vien va mo hinh.
pause
exit /b 1
