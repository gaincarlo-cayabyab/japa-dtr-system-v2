# JAPA DTR Sync Bridge

Python bridge that polls the **FingerTec TA500** biometric device and upserts attendance records into **Supabase** in real time.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.9 or higher |
| pip | bundled with Python |
| Network access | `192.168.68.146:4370` (TA500 on LAN) |
| Supabase project | URL + service role key |

---

## Installation

```bash
# 1. Enter the sync-bridge directory
cd sync-bridge

# 2. Create a virtual environment
python -m venv venv

# 3. Activate it
#    Windows:
venv\Scripts\activate
#    Linux / macOS:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create your .env from the template
cp .env.example .env
#    Then open .env and fill in your Supabase URL, service role key,
#    and confirm the device IP / port match your network.

# 6. Start the bridge
python bridge.py
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SUPABASE_URL` | _(required)_ | Your Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | _(required)_ | Service-role key (bypasses RLS — keep secret) |
| `ZK_DEVICE_IP` | `192.168.68.146` | LAN IP address of the TA500 |
| `ZK_DEVICE_PORT` | `4370` | ZKTeco SDK port (default 4370) |
| `ZK_TIMEOUT` | `30` | Socket timeout in seconds |
| `ZK_PASSWORD` | `0` | Device password (0 = none) |
| `POLL_INTERVAL_SECONDS` | `30` | How often to pull from the device |
| `LOG_LEVEL` | `INFO` | Python log level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `TIMEZONE` | `Asia/Manila` | Local timezone of the device clock (pytz name) |

---

## How It Works

```
┌──────────────┐   ZKTeco SDK (pyzk)   ┌────────────────┐
│  FingerTec   │ ────────────────────► │  bridge.py     │
│  TA500       │                       │  (this machine)│
└──────────────┘                       └───────┬────────┘
                                               │  Supabase REST
                                               ▼
                                       ┌────────────────┐
                                       │   Supabase     │
                                       │  (PostgreSQL)  │
                                       └────────────────┘
```

### Polling loop
Every `POLL_INTERVAL_SECONDS` (default 30 s) the bridge:

1. **Connects** to the TA500 via TCP.
2. **Disables** the device screen to prevent partial reads.
3. **Fetches** the full attendance log (`get_attendance()`).
4. **Re-enables** the device screen immediately.
5. **Localizes** each timestamp from the device's naive local clock to UTC.
6. **Upserts** records into `attendance_logs` in batches of 100, using the unique constraint `(device_user_id, punch_time)` — duplicate punches are silently ignored.
7. **Disconnects** from the device.

### Auto-registration of unknown users
Every 10 minutes the bridge:

1. Fetches the user list from the device.
2. Compares against the local employee cache.
3. Inserts placeholder rows (`NN-<id>`) into `employees` for any device user not yet in Supabase.

> **Tip:** A name starting with `NN-` means that device user has not been mapped to a named employee yet. Open the Employee Directory in the JAPA DTR web portal and rename them.

### Employee cache
Refreshed every 5 minutes from Supabase. Used to resolve `device_user_id` → `full_name` without hitting the DB on every record.

---

## Running as a Service

### Windows — Task Scheduler

1. Open **Task Scheduler** → *Create Basic Task*.
2. Set **Trigger** → *At system startup* (or *At log on*).
3. Set **Action** → *Start a program*:
   - Program: `C:\path\to\japa-dtr-system\sync-bridge\venv\Scripts\python.exe`
   - Arguments: `bridge.py`
   - Start in: `C:\path\to\japa-dtr-system\sync-bridge`
4. Check *Run whether user is logged on or not*.
5. Enable *Run with highest privileges* if needed.

### Linux — systemd

Create `/etc/systemd/system/japa-dtr-bridge.service`:

```ini
[Unit]
Description=JAPA DTR Sync Bridge
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/opt/japa-dtr-system/sync-bridge
ExecStart=/opt/japa-dtr-system/sync-bridge/venv/bin/python bridge.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now japa-dtr-bridge
sudo journalctl -u japa-dtr-bridge -f   # follow logs
```

---

## Troubleshooting

### ❌ Device not reachable
```
Failed to connect to TA500: timed out
```
- Confirm the machine running the bridge is on **the same LAN segment** as the TA500 (`192.168.68.x`).
- Ping the device: `ping 192.168.68.146`
- Check that port `4370` is not blocked by a firewall.
- Run the quick diagnostic: `python test_connection.py`

### ❌ Permission / RLS error from Supabase
```
401 Unauthorized
```
- Make sure you are using the **service role key**, not the anon key.
- The service role key bypasses Row Level Security — never expose it in client-side code.

### ❌ Duplicate records appearing
Duplicates are prevented by the unique constraint `(device_user_id, punch_time)` in the `attendance_logs` table and the `ignore_duplicates=True` upsert option. If you see duplicates:
- Verify the constraint exists: `\d attendance_logs` in `psql`.
- Check that `punch_time` precision is consistent (the bridge always stores UTC ISO-8601 with microseconds).

### ❌ `NN-<id>` names in the portal
This means a device user has not been mapped. Go to **Employee Directory** in the web portal and edit the employee's name and details.

### 🐛 Verbose debug logging
Set `LOG_LEVEL=DEBUG` in your `.env` and restart the bridge. All ZKTeco SDK calls and Supabase payloads will be logged to `bridge.log`.

---

## Files

| File | Purpose |
|---|---|
| `bridge.py` | Main sync daemon |
| `requirements.txt` | Python dependencies |
| `.env.example` | Environment variable template |
| `test_connection.py` | Quick device connectivity diagnostic |
| `bridge.log` | Runtime log (auto-created on first run) |
