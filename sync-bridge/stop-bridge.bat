@echo off
echo Stopping JAPA DTR Sync Bridge...
schtasks /End /TN "JAPA-DTR-SyncBridge"
echo Bridge stopped.
pause

