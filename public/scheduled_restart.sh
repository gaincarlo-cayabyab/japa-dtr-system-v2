#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# JAPA DTR — Scheduled TA500 & Bridge Restart Routine
# Bridge Engine v16 "Iron Sentinel"
#
# Option B Hourly Schedule (Active):
#   - 1:00 AM, 2:00 AM, 3:00 AM, 4:00 AM, 5:00 AM (Overnight Quiet Hours)
#   - 6:00 AM - 10:59 AM (MORNING RUSH - NO REBOOTS - PROTECTED)
#   - 11:00 AM (Pre-Lunch Lull)
#   - 12:00 PM - 1:59 PM (LUNCH RUSH - NO REBOOTS - PROTECTED)
#   - 2:00 PM, 3:00 PM, 4:00 PM (Mid-Afternoon Lulls)
#   - 5:00 PM - 12:59 AM (EVENING & OVERTIME RUSH - NO REBOOTS - PROTECTED)
#
# Install in Termux crontab (`crontab -e`):
#   0 1,2,3,4,5,11,14,15,16 * * * /data/data/com.termux/files/home/sync-bridge/scheduled_restart.sh >> /data/data/com.termux/files/home/sync-bridge/restart.log 2>&1
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/restart.log"
PYTHON_BIN="/data/data/com.termux/files/usr/bin/python"

if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python"
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "==========================================================" >> "$LOG_FILE"
echo "[$TIMESTAMP] 🔄 Scheduled Maintenance Window Initiated" >> "$LOG_FILE"

# 1. Soft-reboot the physical TA500 terminal via UDP port 4370
echo "[$TIMESTAMP] 1. Sending remote reboot signal to TA500..." >> "$LOG_FILE"
cd "$SCRIPT_DIR"
$PYTHON_BIN restart_ta500.py >> "$LOG_FILE" 2>&1

# 2. Give the TA500 90 seconds to power down, clear network sockets, and reboot
echo "[$TIMESTAMP] 2. Waiting 90 seconds for TA500 hardware reboot to complete..." >> "$LOG_FILE"
sleep 90

# 3. Kill the current bridge process — the watchdog.sh supervisor will instantly
#    re-spawn a clean Bridge v16 instance connected to the freshly-rebooted TA500!
echo "[$TIMESTAMP] 3. Recycling bridge daemon process..." >> "$LOG_FILE"
pkill -f tablet_bridge.py

TIMESTAMP_END=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP_END] ✅ Maintenance complete! Bridge supervisor will restore live sync." >> "$LOG_FILE"
echo "==========================================================" >> "$LOG_FILE"
