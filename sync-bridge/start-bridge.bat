@echo off
echo Starting JAPA DTR Sync Bridge...
schtasks /Run /TN "JAPA-DTR-SyncBridge"
echo Bridge started. Check bridge.log for activity.
pause

