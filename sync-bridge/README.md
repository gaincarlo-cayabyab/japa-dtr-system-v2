# JAPA DTR Sync Bridge — Samsung Galaxy Tab A9+ Daemon
> **Engine Version:** v16.4 "Fast Sentinel"  
> **Target Device:** FingerTec TA500 (`192.168.0.58:4370`)  
> **Host Environment:** Samsung Galaxy Tab A9+ (Termux / Android 14)  
> **Lead Architect:** Gain Carlo Cayabyab

---

## ⚡ What is this?
This directory contains the Python synchronization daemon that connects to the on-premise **FingerTec TA500** biometric timekeeper over local LAN, extracts optical fingerprint punches in real-time, and streams them securely to the **Supabase PostgreSQL** cloud database.

---

## 📂 File Manifest
| File | Role |
|---|---|
| `tablet_bridge.py` | Core daemon engine (v16.4 NO-LOCK, direct buffer extractor, 3s poll). |
| `watchdog.sh` | 24/7 background process supervisor with Android CPU wake-lock. |
| `scheduled_restart.sh`| Option B hourly maintenance worker (UDP soft-reboot + socket rejuvenation). |
| `restart_ta500.py` | Standalone CLI utility to send UDP port 4370 remote reboot signal to TA500. |
| `bridge.log` | Rotating log file (automatically capped at 5MB, keeps 3 backups). |
| `seen_punches.json` | 30-day rolling bounded cache of synced punch hashes to eliminate duplicates. |
| `requirements.txt` | Python dependencies (`pyzk`, `pytz`, `requests`, `urllib3`). |

---

## 🚀 Quick Setup on Android (Termux)

```bash
# 1. Install prerequisites in Termux
pkg update -y
pkg install python git cronie termux-api curl -y
pip install pyzk pytz requests urllib3

# 2. Setup project directory
mkdir -p ~/sync-bridge
cd ~/sync-bridge

# 3. Download latest bridge files
curl -O https://japa-dtr-system.vercel.app/tablet_bridge.py
curl -O https://japa-dtr-system.vercel.app/restart_ta500.py
curl -O https://japa-dtr-system.vercel.app/scheduled_restart.sh
curl -O https://japa-dtr-system.vercel.app/watchdog.sh
chmod +x *.sh *.py

# 4. Setup Option B hourly maintenance in crontab
crontab -e
# Add this line:
# 0 1,2,3,4,5,11,14,15,16 * * * /data/data/com.termux/files/home/sync-bridge/scheduled_restart.sh >> /data/data/com.termux/files/home/sync-bridge/restart.log 2>&1

# 5. Start crond and launch 24/7 watchdog supervisor
crond
nohup ./watchdog.sh > /dev/null 2>&1 &

# 6. Verify live log
tail -f bridge.log
```

---

## 🛡️ Critical Technical Guidelines
* **NEVER call `conn.disable_device()`**: Freezes the TA500 on the "Working..." PC sync screen.
* **NEVER call `conn.free_data()` before buffer read**: Causes protocol packet desynchronization (`TCP packet invalid`).
* **NEVER call `conn.get_attendance()`**: Pyzk downloads ~65KB biometric template data over Wi-Fi causing timeouts.
* **Use Direct Buffer Extractor**: `attendance_data, size = conn.read_with_buffer(13)` reads attendance log records directly in 0.05 seconds.
* **15-Second Debounce**: Prevents trembling finger double-scans while allowing quick back-to-back testing.
