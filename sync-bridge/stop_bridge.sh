#!/bin/bash
# ==============================================================================
# JAPA DTR — Graceful Bridge Stop Utility
# Sends SIGTERM to tablet_bridge.py so it cleanly sends CMD_EXIT to the TA500
# before exiting, completely preventing "LAN busy holding previous session".
# ==============================================================================

echo "[INFO] Stopping JAPA DTR Bridge gracefully..."
pkill -15 -f "python.*tablet_bridge.py" 2>/dev/null || pkill -f "tablet_bridge.py" 2>/dev/null

for i in {1..5}; do
    if ! pgrep -f "tablet_bridge.py" > /dev/null; then
        echo "[SUCCESS] Bridge stopped cleanly. Port 4370 session released on TA500."
        exit 0
    fi
    sleep 1
done

# Fallback only if stuck
if pgrep -f "tablet_bridge.py" > /dev/null; then
    echo "[WARN] Process still lingering, forcing termination..."
    pkill -9 -f "tablet_bridge.py" 2>/dev/null
fi
echo "[DONE] Bridge shutdown complete."
