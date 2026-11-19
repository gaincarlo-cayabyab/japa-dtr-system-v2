# JAPA DTR Enterprise Biometric & Payroll System
> **Official Operational & Architectural Guide**  
> **Lead Architect & Developer:** Gain Carlo Cayabyab  
> **IT Administrator Secret Access PIN:** `082018`  
> **Production Web Portal:** [https://japa-dtr-system.vercel.app](https://japa-dtr-system.vercel.app)  
> **Sync & Telemetry Portal:** [https://japa-dtr-system.vercel.app/sync](https://japa-dtr-system.vercel.app/sync)

---

## 🧭 Executive Summary for Future AI Agents & Developers

This document serves as the **single source of truth** for the JAPA DTR system. If you are an AI assistant (Claude, Gemini, GPT, Cursor, etc.) or a new engineer stepping into this project, read this document carefully before making changes. It describes the physical hardware constraints, network topology, Python bridge engine internals, and deployment procedures.

### Key Tenets & Strict Rules
1. **Never Call `disable_device()`**: On the FingerTec TA500, calling `disable_device()` locks the physical terminal into a "Working..." PC sync animation. If the Wi-Fi connection blips while locked, the device freezes permanently, holding port 4370 busy.
2. **Never Call Standard `get_attendance()` in pyzk**: Pyzk's default `get_attendance()` downloads all user templates (~65KB) over Wi-Fi, causing socket timeouts. Always use the **Direct Buffer Extractor** (`read_with_buffer(13)`).
3. **Always Push to Both Git Remotes**: This repo maintains two remotes:
   * `origin`: `https://github.com/gaincarlo-cayabyab/japa-dtr-system.git`
   * `v2`: `https://github.com/gaincarlo-cayabyab/japa-dtr-system-v2.git`
   Always run: `git push origin main && git push v2 main`.
4. **Light Theme Only**: All portal interfaces use clean, high-contrast corporate light mode (slate-50 backgrounds, slate-900 text, vibrant status badges). No dark mode.
5. **Always Keep `public/tablet_bridge.py` in Sync**: When modifying `sync-bridge/tablet_bridge.py`, copy it to `public/tablet_bridge.py` so the tablet can pull updates directly via `curl -O https://japa-dtr-system.vercel.app/tablet_bridge.py`.

---

## 🏛️ Physical Hardware & Network Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PHYSICAL HARDWARE TIERS                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
  [ Device #1: Biometric Terminal ]
     FingerTec TA500
     Static IP: 192.168.0.58 : Port 4370 (ZKTeco Protocol)
     Firmware: Ver 6.60 | 500 DPI Optical Prism | 100,000 Flash Punch Memory
           │
           │ (Physical Cat6 RJ45 STP Cable - 100 Mbps Duplex)
           ▼
  [ Device #2: Wi-Fi Repeater / AP Bridge ]
     Static IP: 192.168.0.254 (2.4 GHz 802.11b/g/n)
     Bridges Ethernet data to office wireless network
           │
           │ (Wireless 2.4 GHz WLAN corridor, -52 dBm)
           ▼
  [ Device #3: Dedicated Android Bridge Tablet ]
     Samsung Galaxy Tab A9+ (SM-X210) / Android 14 (One UI 6.0)
     IP: 192.168.0.89 (Local Wi-Fi)
     Environment: Termux + Python 3.11 + Cronie
     Process: tablet_bridge.py v16.4 "Fast Sentinel"
     Supervisor: watchdog.sh (24/7 Auto-Restart, CPU Wakelock)
           │
           │ (Internet WAN Uplink - TLS 1.3 / HTTPS POST)
           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLOUD & WEB TIERS                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
  [ Device #4: Cloud Database & Telemetry ]
     Supabase PostgreSQL 15 (Singapore ap-southeast-1)
     Tables: attendance_logs, sync_meta, employees, payroll_records, ot_reasons
     WebSocket Realtime CDC Channel (Live Punch Push)
           ▲
           │ (Postgres Wire Protocol / Serverless Edge SSR)
           ▼
  [ Device #5: Enterprise Management Portal ]
     Next.js 14 App Router on Vercel Global Edge Network
     URL: https://japa-dtr-system.vercel.app
     Features: Live 3D Topology, Real-time Ingestion Feed, Shift DTR, Philippine Payroll
```

---

## ⚡ The Bridge Engine (v16.4 "Fast Sentinel")

The heart of the local timekeeping infrastructure is `tablet_bridge.py`, running inside Termux on the Samsung Galaxy Tab A9+.

### Key Architectural Inventions & Fixes
* **NO-LOCK Fast Extractor**: Bypasses `disable_device()` completely. The TA500 physical screen remains in normal clock/fingerprint mode 24/7.
* **Direct Buffer Extractor (`read_with_buffer(13)`)**: Reads raw attendance records directly from RAM in **0.05 seconds** (< 2KB data payload).
* **3-Second Fast Polling**: Queries `read_sizes()` every 3 seconds. When an employee places a finger, the bridge detects the new record and uploads it to Supabase in **under 3 seconds**.
* **15-Second Anti-Double Tap Debounce**: Prevents accidental double-scans within 15 seconds without blocking legitimate Time In / Time Out punch tests.
* **Zero Protocol Desync**: Removed all rogue `conn.free_data()` calls prior to buffer reading, permanently eliminating `TCP packet invalid` and `unpack requires a buffer of 4 bytes` errors.
* **Cloud-Verified State Recovery**: On startup or reconnect, the bridge checks the TA500's memory against Supabase and automatically uploads any punches missing from the cloud.
* **Zero Null Bytes (`bytes(1)`)**: Byte padding uses `bytes(1)` instead of escape sequences, preventing `SyntaxError: source code cannot contain null bytes` on Android Python.

---

## 👥 Hardware UID to System Employee ID Mapping

The TA500 terminal assigns internal incremental hardware UIDs (1 through 18). These are dynamically mapped to official system employee records inside `tablet_bridge.py`:

| Hardware UID | System Employee ID | Employee Full Name | Branch |
|:---:|:---:|:---|:---|
| `1` | **`24`** | Gain Carlo Cayabyab | Dagupan Main |
| `2` | **`4`** | Pearly B. De Vera | Dagupan Main |
| `3` | **`17`** | Melanie P. Tiu | Dagupan Main |
| `4` | **`9`** | Janine Kyle Galvan | Dagupan Main |
| `5` | **`11`** | Jamaica Soriano | Dagupan Main |
| `6` | **`7`** | Lyca Estacio | Dagupan Main |
| `7` | **`1`** | Dennis P. Ardiente | Dagupan Main |
| `8` | **`5`** | Ivan De Vera | Dagupan Main |
| `9` | **`2`** | Jeffrey D. Baniqued (Jepoy) | Dagupan Main |
| `10` | **`6`** | Jerwin B. Dee | Dagupan Main |
| `11` | **`3`** | Carlo C. Caoile | Dagupan Main |
| `12` | **`8`** | Larry L. Estacio | Dagupan Main |
| `13` | **`14`** | Randolf J. Galzote | Dagupan Main |
| `14` | **`13`** | Rowena Romero | Dagupan Main |
| `15` | **`19`** | Asky Sentenillar | Dagupan Main |
| `16` | **`15`** | Juvell Luna | Dagupan Main |
| `17` | **`16`** | Henry M. Tiozon | Dagupan Main |
| `18` | **`18`** | Robert Luna | Dagupan Main |

---

## 🕒 Option B: Hourly Hardware Maintenance Windows

To guarantee the TA500 optical prism and TCP stack never accumulate memory leaks, an automated maintenance cron job runs on the Samsung tablet.

### Cron Schedule (Termux Cronie)
```cron
0 1,2,3,4,5,11,14,15,16 * * * /data/data/com.termux/files/home/sync-bridge/scheduled_restart.sh >> /data/data/com.termux/files/home/sync-bridge/restart.log 2>&1
```

### Maintenance Windows Breakdown
* **Protected Operational Windows (NO REBOOTS)**:
  * `06:00 AM – 10:59 AM`: Morning shift arrivals (peak employee clock-ins).
  * `12:00 PM – 01:59 PM`: Lunch break & midday movements.
  * `05:00 PM – 12:59 AM`: Evening departures & night duties.
* **Scheduled Maintenance Hours (Reboots allowed)**:
  * `1:00 AM, 2:00 AM, 3:00 AM, 4:00 AM, 5:00 AM`: Overnight maintenance.
  * `11:00 AM`: Mid-morning pre-lunch flush.
  * `2:00 PM, 3:00 PM, 4:00 PM`: Afternoon low-traffic window.

### Maintenance Execution Flow
1. `scheduled_restart.sh` sends remote soft-reboot via UDP port 4370 (`restart_ta500.py`).
2. Waits 30 seconds for TA500 reboot to initialize.
3. Gracefully kills `tablet_bridge.py`.
4. `watchdog.sh` automatically relaunches `tablet_bridge.py` 10 seconds later with fresh memory and clean TCP sockets.

---

## 🛠️ Step-by-Step Tablet Operations Manual

All commands below are executed in **Termux** on the Samsung Galaxy Tab A9+.

### 1. Update & Run Bridge Manually
```bash
# Stop any running process
pkill -9 -f python

# Download latest engine directly from production web portal
cd ~/sync-bridge
curl -O https://japa-dtr-system.vercel.app/tablet_bridge.py

# Launch bridge
python tablet_bridge.py
```

### 2. Run with 24/7 Background Watchdog
```bash
cd ~/sync-bridge
nohup ./watchdog.sh > /dev/null 2>&1 &
```

### 3. Inspect Live Telemetry Logs
```bash
tail -f ~/sync-bridge/bridge.log
```

### 4. Emergency Hardware Recovery
If the TA500 physical screen ever shows the blue "Working..." PC sync graphic:
1. Press **`ESC`** on the TA500 keypad. The screen will instantly return to normal clock mode.
2. If `ESC` does not respond, power cycle the physical rocker switch on the back of the TA500 (turn OFF, wait 5 seconds, turn ON).

---

## 🗄️ Database Architecture (`Supabase`)

### Core Tables
1. **`attendance_logs`**:
   * `id`: UUID primary key.
   * `device_user_id`: Mapped system employee ID (e.g. `'24'`).
   * `punch_time`: ISO-8601 UTC timestamp of biometric punch.
   * `status`: `0` (Time In), `1` (Time Out).
   * `synced_at`: Cloud ingestion timestamp.
   * `_key`: MD5 hash of `device_user_id | punch_time` for idempotency and duplicate elimination.
2. **`sync_meta`**:
   * Key-value registry powering the real-time `/sync` monitoring topology.
   * Keys: `bridge_heartbeat`, `ta500_status`, `ta500_last_seen`, `ta500_records`, `bridge_version`, `clear_hardware`, `sync_employees`.
3. **`employees`**:
   * Personnel roster, branch assignment (`Dagupan Main` / `Manila`), salary rates, and daily schedules.
4. **`payroll_records`**:
   * Bi-monthly payroll calculations, gross compensation, SSS, PhilHealth, Pag-IBIG, tardiness deductions, and net payouts.

---

## 💻 Developer & Deployment Workflow

### Prerequisites
* Node.js 18+ & npm
* Git CLI
* Vercel CLI (`npm i -g vercel`)

### Local Development Setup
```bash
# 1. Clone repository
git clone https://github.com/gaincarlo-cayabyab/japa-dtr-system.git
cd japa-dtr-system

# 2. Install dependencies
npm install

# 3. Environment configuration
cp .env.example .env.local
# Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set

# 4. Run development server
npm run dev
# Open http://localhost:3000
```

### Build & Deploy Procedure
When pushing changes to production, follow this exact sequence:

```powershell
# 1. Test production build
npm run build

# 2. Commit and push to BOTH GitHub remotes
git add -A
git commit -m "feat/fix: descriptive summary of changes"
git push origin main
git push v2 main

# 3. Deploy to Vercel Production
npx vercel --prod --yes --token <VERCEL_DEPLOY_TOKEN>
```

---

## 📜 Key Endpoints & Routes Reference

| Route | Method | Purpose |
|---|:---:|---|
| `/` | `GET` | Executive Dashboard, Attendance Logs, & Employee Shift Analytics |
| `/sync` | `GET` | Live 3D Biometric Topology, Hardware State Simulator & Ingestion Feed |
| `/attendance` | `GET` | Detailed Employee Attendance Records & Filtering |
| `/employees` | `GET` | Staff Management, Rate Setup, Biometric UID Pairing |
| `/payroll` | `GET` | Automated Philippine Payroll Generator & Compensation Export |
| `/reports` | `GET` | DTR Generation, Printable Sheets & Excel Export |
| `/api/sync/status` | `GET` | Live Hardware Heartbeat & Network Latency Telemetry |
| `/api/attendance` | `GET/POST`| Biometric Punch Ingestion & Query Endpoint |
| `/api/auth/edit-access`| `POST`| IT Administrator 1-Hour Elevated Access Gate (PIN: `082018`) |

---

## 🏆 Project Credits
* **System Architect & Lead Developer:** Gain Carlo Cayabyab
* **Engineering Assistant:** Antigravity (Google DeepMind)
* **Organization:** JAPA Global Trading — DTR & Biometric Enterprise Solutions
* **Version:** 16.4 "Fast Sentinel" (November 2026)
