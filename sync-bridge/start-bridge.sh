#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# JAPA DTR — Termux Boot Autostart Script
# Bridge Engine v16 "Iron Sentinel"
#
# Copy to ~/.termux/boot/start-bridge.sh to automatically launch the bridge
# whenever the Samsung Galaxy Tab A9+ powers on or reboots.
# ==============================================================================

# Prevent Android from putting CPU to sleep
if command -v termux-wake-lock > /dev/null 2>&1; then
    termux-wake-lock
fi

# Ensure cron daemon is running for scheduled restarts
if command -v crond > /dev/null 2>&1; then
    crond
fi

# Wait 20 seconds for Wi-Fi to establish connection to office network
sleep 20

# Launch watchdog supervisor in background
BRIDGE_DIR="/data/data/com.termux/files/home/sync-bridge"
if [ -d "$BRIDGE_DIR" ]; then
    nohup "$BRIDGE_DIR/watchdog.sh" > /dev/null 2>&1 &
fi
