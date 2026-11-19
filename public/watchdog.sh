#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# JAPA DTR — Termux Process Supervisor Watchdog
# Bridge Engine v16 "Iron Sentinel"
#
# Keeps the bridge daemon alive 24/7. If the script crashes, is killed by
# scheduled maintenance, or is closed by Android, this loop automatically
# restarts it within 10 seconds.
#
# Run in background:
#   nohup ~/sync-bridge/watchdog.sh > /dev/null 2>&1 &
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/watchdog.log"
PYTHON_BIN="/data/data/com.termux/files/usr/bin/python"

if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python"
fi

# Acquire Termux wakelock if termux-api is available (keeps CPU alive)
if command -v termux-wake-lock > /dev/null 2>&1; then
    termux-wake-lock
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚡ Termux CPU Wake Lock Acquired." >> "$LOG_FILE"
fi

echo "==========================================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🛡️ JAPA DTR Bridge v16 Watchdog Supervisor Started" >> "$LOG_FILE"
echo "==========================================================" >> "$LOG_FILE"

cd "$SCRIPT_DIR"

while true; do
    START_TIME=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$START_TIME] 🚀 Starting JAPA DTR Bridge v16..." >> "$LOG_FILE"
    
    # Run tablet_bridge.py in foreground of this loop
    $PYTHON_BIN tablet_bridge.py
    EXIT_CODE=$?
    
    STOP_TIME=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$STOP_TIME] ⚠️ Bridge daemon exited with code $EXIT_CODE." >> "$LOG_FILE"
    echo "[$STOP_TIME] ⏳ Auto-restarting bridge in 10 seconds..." >> "$LOG_FILE"
    sleep 10
done
