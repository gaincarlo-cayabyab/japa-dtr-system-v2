#!/usr/bin/env python3
"""
JAPA DTR Sync Bridge — Samsung Galaxy Tab A8 Edition (v3)
Runs directly on the company tablet in Termux to sync FingerTec TA500 24/7.

Key fixes vs v2:
  - Proper deduplication: local seen-set persisted to JSON so old records
    are NEVER re-counted as new after a Supabase clear or bridge restart.
  - Exponential back-off on connection failures (10s → 20s → 40s → 60s max)
    to stop hammering the TA500 when its socket is busy.
  - Poll interval raised to 30 s (safe for TA500 firmware).
  - Only HTTP 201 (Created) rows counted as truly new inserts.
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
    print(f"Missing package: {e}")
    print("Run: pip install pyzk pytz requests")
    sys.exit(1)

# ─── Configuration ────────────────────────────────────────────────────────────
ZK_IP         = os.getenv('ZK_DEVICE_IP',  '192.168.68.146')
ZK_PORT       = int(os.getenv('ZK_DEVICE_PORT', '4370'))
ZK_TIMEOUT    = int(os.getenv('ZK_TIMEOUT', '15'))  # seconds per TCP op
POLL_INTERVAL = int(os.getenv('POLL_INTERVAL', '30'))  # 30 s is safe for TA500
TZ            = pytz.timezone('Asia/Manila')

SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://blmthmojjnonbmwitzmc.supabase.co')
SUPABASE_KEY = os.getenv(
    'SUPABASE_SERVICE_ROLE_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsbXRobW9qam5vbmJtd2l0em1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDUzOTI3MCwiZXhwIjoyMTEwMTE1MjcwfQ.hsO_inZ9Faei67c5edyo4iGk9E96hMO5VYhiMKi9m6o'
)

# Path to persist the "already synced" record hashes across restarts
_SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
_SEEN_FILE    = os.path.join(_SCRIPT_DIR, 'seen_punches.json')
_TOKEN_FILE   = os.path.join(_SCRIPT_DIR, 'sync_token.json')

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger('tablet-bridge')

# ─── Supabase REST Helpers ────────────────────────────────────────────────────
# Use ignore-duplicates so Supabase skips existing rows silently.
# With return=representation + ignore-duplicates Supabase returns ONLY
# the newly inserted rows (HTTP 201), not the skipped ones.
_HEADERS_INSERT = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=representation,resolution=ignore-duplicates',
}
_HEADERS_GET = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
}

_employee_cache: dict[str, str] = {}


def refresh_employee_cache() -> None:
    global _employee_cache
    try:
        url = f'{SUPABASE_URL}/rest/v1/employees?select=device_user_id,full_name'
        res = requests.get(url, headers=_HEADERS_GET, timeout=10)
        if res.status_code == 200:
            _employee_cache = {str(e['device_user_id']): e['full_name'] for e in res.json()}
            logger.info(f'Employee cache: {len(_employee_cache)} employees loaded')
    except Exception as e:
        logger.warning(f'Employee cache refresh failed: {e}')


def auto_register_employees(conn, unknown_uids: Set[str]) -> None:
    """Fetch user templates from device and register unknowns in Supabase."""
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
            res = requests.post(url, headers=_HEADERS_INSERT, json=new_emps, timeout=10)
            if res.status_code in (200, 201):
                logger.info(f'Auto-registered: {[e["full_name"] for e in new_emps]}')
                refresh_employee_cache()
    except Exception as e:
        logger.error(f'Auto-register employees error: {e}')


# ─── Seen-punch persistence ───────────────────────────────────────────────────
def _punch_key(uid: str, punch_time_utc: str) -> str:
    """Stable hash key for a punch record (uid + UTC ISO timestamp)."""
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


# ─── Sync token (clear detection) ────────────────────────────────────────────
def get_remote_token() -> int:
    """Fetch the cloud clear_token. Returns -1 on network error."""
    try:
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?select=value&key=eq.clear_token'
        res = requests.get(url, headers=_HEADERS_GET, timeout=8)
        if res.status_code == 200:
            rows = res.json()
            return int(rows[0]['value']) if rows else 0
    except Exception as e:
        logger.warning(f'Could not fetch sync token: {e}')
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


# ─── Device connection ────────────────────────────────────────────────────────
def connect_device() -> Optional[object]:
    zk = ZK(ZK_IP, port=ZK_PORT, timeout=ZK_TIMEOUT,
             password=0, force_udp=False, ommit_ping=True)
    try:
        return zk.connect()
    except Exception as e:
        logger.warning(f'TA500 connect error: {e}')
        return None


# ─── Main sync cycle ─────────────────────────────────────────────────────────
def sync_cycle(seen: Set[str]) -> int:
    """
    Pull attendance from TA500, push only NEW punches to Supabase.
    Returns the count of genuinely new records inserted.
    """
    conn = connect_device()
    if not conn:
        return -1  # signal: device unreachable

    new_count = 0
    try:
        attendances = conn.get_attendance()
        if not attendances:
            logger.info('TA500: no attendance records found.')
            return 0

        logger.info(f'TA500: {len(attendances)} total punch(es) on device.')

        # Auto-register unknown employees
        unknown_uids = {str(a.user_id) for a in attendances
                        if str(a.user_id) not in _employee_cache}
        if unknown_uids:
            logger.info(f'Unknown employee IDs on device: {unknown_uids} — registering…')
            auto_register_employees(conn, unknown_uids)

        # Build records, skipping already-seen punches
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
                continue  # already synced — skip entirely

            status_val = getattr(att, 'punch', None)
            if status_val is None:
                status_val = int(att.status or 0)

            to_push.append({
                'device_user_id': uid,
                'punch_time':     utc_iso,
                'status':         int(status_val),
                'raw_status':     int(att.status or 0),
                'synced_at':      sync_time,
                '_key':           key,   # temp field, removed before POST
            })

        if not to_push:
            logger.info('No new punches to sync (all already seen).')
            return 0

        logger.info(f'{len(to_push)} new punch(es) to push…')

        # Remove temp key before sending to Supabase
        payload = [{k: v for k, v in r.items() if k != '_key'} for r in to_push]

        url = (f'{SUPABASE_URL}/rest/v1/attendance_logs'
               f'?on_conflict=device_user_id,punch_time')
        res = requests.post(url, headers=_HEADERS_INSERT, json=payload, timeout=15)

        if res.status_code in (200, 201):
            inserted = res.json() or []
            new_count = len(inserted)
            # Mark every record we tried to push as "seen" regardless — so
            # they won't be re-tried next cycle even if Supabase ignored them
            for r in to_push:
                seen.add(r['_key'])
            save_seen_set(seen)
            if new_count > 0:
                logger.info(f'✅ SYNCED: {new_count} new punch(es) pushed to cloud!')
            else:
                # Already existed in Supabase (returned 0 rows) but we still
                # mark them seen so we stop trying
                logger.info(f'Sync complete — {len(to_push)} punch(es) already in cloud.')
        else:
            logger.error(f'Supabase insert failed: HTTP {res.status_code} — {res.text[:200]}')

    except Exception as e:
        logger.error(f'Sync cycle error: {e}')
        new_count = -1
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass

    return new_count


# ─── Main loop with exponential back-off ─────────────────────────────────────
def main():
    print('=' * 60)
    print('🚀 JAPA DTR Sync Bridge (Samsung Galaxy Tab A8) v3')
    print(f'   Device  : {ZK_IP}:{ZK_PORT}')
    print(f'   Poll    : every {POLL_INTERVAL}s (backoff up to 60s on errors)')
    print(f'   Seen DB : {_SEEN_FILE}')
    print('=' * 60)

    seen = load_seen_set()
    logger.info(f'Loaded {len(seen)} previously-synced punch hashes.')

    refresh_employee_cache()
    logger.info('Tablet bridge active. Press Ctrl+C to stop.')

    fail_count      = 0
    MAX_BACKOFF     = 60   # seconds
    BASE_BACKOFF    = 10   # seconds
    local_token     = load_local_token()

    while True:
        # ── Check if web UI cleared attendance logs ──────────────────────────
        remote_token = get_remote_token()
        if remote_token >= 0 and remote_token != local_token:
            logger.info(
                f'🔄 Cloud clear detected (token {local_token} → {remote_token}). '
                f'Wiping local seen-set so all device records will re-sync.'
            )
            seen.clear()
            save_seen_set(seen)
            local_token = remote_token
            save_local_token(local_token)

        result = sync_cycle(seen)

        if result == -1:
            # Device unreachable — apply exponential back-off
            fail_count += 1
            backoff = min(BASE_BACKOFF * (2 ** (fail_count - 1)), MAX_BACKOFF)
            logger.warning(f'Device unreachable (fail #{fail_count}). '
                           f'Waiting {backoff}s before retry…')
            time.sleep(backoff)
        else:
            # Success (or no records) — reset fail counter, normal poll interval
            if fail_count > 0:
                logger.info('TA500 connection restored ✅')
            fail_count = 0
            time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    main()
