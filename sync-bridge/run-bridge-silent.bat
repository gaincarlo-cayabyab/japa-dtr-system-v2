@echo off
REM JAPA DTR Sync Bridge - Auto-start wrapper (no console window)
REM This file is called by Windows Task Scheduler on login

set BRIDGE_DIR=%~dp0
set PYTHONW=%BRIDGE_DIR%venv\Scripts\pythonw.exe
set SCRIPT=%BRIDGE_DIR%bridge.py

start "" /B "%PYTHONW%" "%SCRIPT%"

