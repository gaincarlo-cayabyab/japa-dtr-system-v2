@echo off
title JAPA DTR Sync Bridge (PC Edition)
echo ===================================================
echo   JAPA DTR Sync Bridge - Direct PC Background Runner
echo   Connecting to TA500 at 192.168.0.58:4370
echo ===================================================
python public\tablet_bridge.py %*
pause
