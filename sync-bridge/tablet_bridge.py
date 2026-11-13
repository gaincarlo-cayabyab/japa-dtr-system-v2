#!/usr/bin/env python3
"""
JAPA DTR Sync Bridge — Samsung Galaxy Tab A8 Edition (v4 Production)
Runs on company tablet via Termux. Connects FingerTec TA500 (192.168.68.146:4370) to Supabase.

Key Improvements:
  1. Two-way hardware clear: Web UI "Clear All Logs" signals this bridge
     to wipe the TA500 physical memory (conn.clear_attendance()) so old
     punches never ghost-sync back after a reset!
  2. Safe TCP management: Exponential backoff on connection errors to give
     the TA500 network buffer time to reset, avoiding [Errno 104] loops.
  3. Seen-punches persistence: Only truly new punches are ever pushed.
  4. Automatic employee auto-enrollment for new fingerprint users.
"""

import os
import sys
import time
import json
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, Set

try:
    import pytz
    import requests
    from zk import ZK
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install pyzk pytz requests")
    sys.exit(1)

# ─── Configuration ────────────────────────────────────────────────────────────
ZK_IP         = os.getenv('ZK_DEVICE_IP',  '192.168.68.146')
ZK_PORT       = int(os.getenv('ZK_DEVICE_PORT', '4370'))
ZK_TIMEOUT    = 10  # Seconds for TCP socket timeout
POLL_INTERVAL = 20  # Poll every 20 seconds (ideal for TA500 socket health)
TZ            = pytz.timezone('Asia/Manila')

SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://blmthmojjnonbmwitzmc.supabase.co')
SUPABASE_KEY = os.getenv(
    'SUPABASE_SERVICE_ROLE_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsbXRobW9qam5vbmJtd2l0em1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDUzOTI3MCwiZXhwIjoyMTEwMTE1MjcwfQ.hsO_inZ9Faei67c5edyo4iGk9E96hMO5VYhiMKi9m6o'
)

_SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
_SEEN_FILE   = os.path.join(_SCRIPT_DIR, 'seen_punches.json')
_TOKEN_FILE  = os.path.join(_SCRIPT_DIR, 'sync_token.json')

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger('tablet-bridge')

# ─── HTTP Headers ─────────────────────────────────────────────────────────────
_HEADERS_AUTH = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
}

_HEADERS_INSERT = {
    **_HEADERS_AUTH,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation,resolution=ignore-duplicates',
}

_employee_cache: dict[str, str] = {}


def refresh_employee_cache() -> None:
    global _employee_cache
    try:
        url = f'{SUPABASE_URL}/rest/v1/employees?select=device_user_id,full_name'
        res = requests.get(url, headers=_HEADERS_AUTH, timeout=8)
        if res.status_code == 200:
            _employee_cache = {str(e['device_user_id']): e['full_name'] for e in res.json()}
            logger.info(f'Employee cache: {len(_employee_cache)} employees loaded')
    except Exception as e:
        logger.warning(f'Employee cache refresh failed: {e}')


def auto_register_employees(conn, unknown_uids: Set[str]) -> None:
    try:
        users = conn.get_users()
        new_emps = []
        for u in users:
            uid = str(u.user_id)
            if uid in unknown_uids:
                name = (u.name or '').strip() or f'NN-{uid}'
                new_emps.append({
                    'device_user_id': uid,
                    'full_name': name,
                    'branch': 'Dagupan Main',
                })
        if new_emps:
            url = f'{SUPABASE_URL}/rest/v1/employees?on_conflict=device_user_id'
            res = requests.post(url, headers=_HEADERS_INSERT, json=new_emps, timeout=8)
            if res.status_code in (200, 201):
                logger.info(f'Auto-registered new employees: {[e["full_name"] for e in new_emps]}')
                refresh_employee_cache()
    except Exception as e:
        logger.error(f'Auto-register employees error: {e}')


# ─── Seen-Punch State Persistence ─────────────────────────────────────────────
def _punch_key(uid: str, punch_time_utc: str) -> str:
    return hashlib.md5(f'{uid}|{punch_time_utc}'.encode()).hexdigest()


def load_seen_set() -> Set[str]:
    try:
        if os.path.exists(_SEEN_FILE):
            with open(_SEEN_FILE, 'r') as f:
                return set(json.load(f))
    except Exception:
        pass
    return set()


def save_seen_set(seen: Set[str]) -> None:
    try:
        with open(_SEEN_FILE, 'w') as f:
            json.dump(list(seen), f)
    except Exception as e:
        logger.warning(f'Could not save seen-punch set: {e}')


# ─── Cloud Sync Tokens & Hardware Clear Requests ──────────────────────────────
def check_hardware_clear_requested() -> bool:
    try:
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?select=value&key=eq.clear_hardware'
        res = requests.get(url, headers=_HEADERS_AUTH, timeout=6)
        if res.status_code == 200:
            rows = res.json()
            return bool(rows and int(rows[0]['value']) == 1)
    except Exception:
        pass
    return False


def acknowledge_hardware_clear() -> None:
    try:
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?key=eq.clear_hardware'
        requests.patch(url, headers=_HEADERS_INSERT, json={'value': 0}, timeout=6)
    except Exception as e:
        logger.warning(f'Could not acknowledge clear_hardware: {e}')


def get_remote_token() -> int:
    try:
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?select=value&key=eq.clear_token'
        res = requests.get(url, headers=_HEADERS_AUTH, timeout=6)
        if res.status_code == 200:
            rows = res.json()
            return int(rows[0]['value']) if rows else 0
    except Exception:
        pass
    return -1


def load_local_token() -> int:
    try:
        if os.path.exists(_TOKEN_FILE):
            with open(_TOKEN_FILE) as f:
                return int(json.load(f).get('token', 0))
    except Exception:
        pass
    return 0


def save_local_token(token: int) -> None:
    try:
        with open(_TOKEN_FILE, 'w') as f:
            json.dump({'token': token}, f)
    except Exception as e:
        logger.warning(f'Could not save local token: {e}')


# ─── Safe Device Connection & Disconnect ──────────────────────────────────────
def safe_disconnect(conn: Optional[object]) -> None:
    if not conn:
        return
    try:
        conn.disconnect()
    except Exception:
        pass
    try:
        # Guarantee socket is closed even if protocol disconnect threw
        if hasattr(conn, '_ZK__sock') and conn._ZK__sock:
            conn._ZK__sock.close()
    except Exception:
        pass


def connect_device() -> Optional[object]:
    zk = ZK(ZK_IP, port=ZK_PORT, timeout=ZK_TIMEOUT,
             password=0, force_udp=False, ommit_ping=True)
    try:
        return zk.connect()
    except Exception as e:
        logger.warning(f'TA500 connect error: {e}')
        return None


# ─── Sync Cycle ───────────────────────────────────────────────────────────────
def sync_cycle(seen: Set[str]) -> int:
    """
    Connects to TA500:
    - Checks for pending hardware clear. If requested, calls conn.clear_attendance()
      and wipes local seen cache.
    - Otherwise pulls new punches and pushes to Supabase.
    Returns:
      0 on success / no work
      -1 on connection error
    """
    conn = connect_device()
    if not conn:
        return -1

    try:
        # 1. Check if user clicked "Clear All Logs" on the portal
        if check_hardware_clear_requested():
            logger.info('🧹 Remote clear requested from web portal!')
            try:
                conn.clear_attendance()
                logger.info('✅ TA500 physical hardware memory CLEARED!')
            except Exception as e:
                logger.error(f'Failed to clear hardware attendance: {e}')
            finally:
                acknowledge_hardware_clear()
                seen.clear()
                save_seen_set(seen)
                logger.info('✅ Local cache cleared. Fresh slate ready!')
            return 0

        # 2. Read punches from hardware
        attendances = conn.get_attendance()
        if not attendances:
            return 0

        # Check for unknown employees
        unknown_uids = {str(a.user_id) for a in attendances
                        if str(a.user_id) not in _employee_cache}
        if unknown_uids:
            logger.info(f'Unknown employee IDs on device: {unknown_uids} — registering...')
            auto_register_employees(conn, unknown_uids)

        # Filter out already seen punches
        to_push = []
        sync_time = datetime.now(timezone.utc).isoformat()

        for att in attendances:
            uid = str(att.user_id)
            naive_dt = att.timestamp
            if isinstance(naive_dt, str):
                from dateutil import parser as dp
                naive_dt = dp.parse(naive_dt)
            local_dt = TZ.localize(naive_dt) if naive_dt.tzinfo is None else naive_dt
            utc_iso  = local_dt.astimezone(timezone.utc).isoformat()

            key = _punch_key(uid, utc_iso)
            if key in seen:
                continue

            status_val = getattr(att, 'punch', None)
            if status_val is None:
                status_val = int(att.status or 0)

            to_push.append({
                'device_user_id': uid,
                'punch_time':     utc_iso,
                'status':         int(status_val),
                'raw_status':     int(att.status or 0),
                'synced_at':      sync_time,
                '_key':           key,
            })

        if not to_push:
            return 0

        logger.info(f'Pushing {len(to_push)} new punch(es) to Supabase...')
        payload = [{k: v for k, v in r.items() if k != '_key'} for r in to_push]

        url = f'{SUPABASE_URL}/rest/v1/attendance_logs?on_conflict=device_user_id,punch_time'
        res = requests.post(url, headers=_HEADERS_INSERT, json=payload, timeout=10)

        if res.status_code in (200, 201):
            inserted = res.json() or []
            for r in to_push:
                seen.add(r['_key'])
            save_seen_set(seen)
            emp_name = _employee_cache.get(to_push[0]['device_user_id'], to_push[0]['device_user_id'])
            logger.info(f'✅ SYNCED: {len(to_push)} new punch(es) pushed to cloud! (Latest: {emp_name})')
        else:
            logger.error(f'Supabase insert failed: HTTP {res.status_code} — {res.text[:150]}')

    except Exception as e:
        logger.error(f'Sync cycle error: {e}')
        return -1
    finally:
        safe_disconnect(conn)

    return 0


# ─── Main Process Loop ────────────────────────────────────────────────────────
def main():
    print('=' * 60)
    print('🚀 JAPA DTR Sync Bridge (Samsung Galaxy Tab A8) v4')
    print(f'   Device IP : {ZK_IP}:{ZK_PORT}')
    print(f'   Poll Rate : Every {POLL_INTERVAL} seconds')
    print('=' * 60)

    seen = load_seen_set()
    logger.info(f'Loaded {len(seen)} previously-synced punch hashes.')

    refresh_employee_cache()
    logger.info('Tablet bridge active. Press Ctrl+C to stop.')

    fail_count   = 0
    MAX_BACKOFF  = 60
    BASE_BACKOFF = 15

    local_token = load_local_token()

    while True:
        # Detect cloud clear token changes
        remote_token = get_remote_token()
        if remote_token >= 0 and remote_token != local_token:
            logger.info(f'Cloud clear detected (token {local_token} -> {remote_token}). Resetting local cache.')
            seen.clear()
            save_seen_set(seen)
            local_token = remote_token
            save_local_token(local_token)

        result = sync_cycle(seen)

        if result == -1:
            fail_count += 1
            backoff = min(BASE_BACKOFF * (2 ** (fail_count - 1)), MAX_BACKOFF)
            logger.warning(f'TA500 unreachable (attempt #{fail_count}). Cooling down for {backoff}s...')
            time.sleep(backoff)
        else:
            if fail_count > 0:
                logger.info('TA500 connection restored ✅')
            fail_count = 0
            time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    main()
