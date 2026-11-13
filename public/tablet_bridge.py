#!/usr/bin/env python3
"""
JAPA DTR Sync Bridge — Samsung Galaxy Tab A8 Edition
Runs directly on the company tablet in Termux to sync FingerTec TA500 24/7.
Zero external cloud dependencies — uses pure Python + requests.
"""

import os
import sys
import time
import json
import logging
from datetime import datetime, timezone
from typing import Optional

try:
    import pytz
    import requests
    from zk import ZK
except ImportError as e:
    print(f"Missing package: {e}")
    print("Please run: pip install pyzk pytz requests schedule")
    sys.exit(1)

# ─── Configuration ────────────────────────────────────────────────────────────
ZK_IP        = os.getenv('ZK_DEVICE_IP', '192.168.68.146')
ZK_PORT      = int(os.getenv('ZK_DEVICE_PORT', '4370'))
ZK_TIMEOUT   = 10
POLL_INTERVAL = 10  # Poll every 10 seconds
TZ           = pytz.timezone('Asia/Manila')

SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://blmthmojjnonbmwitzmc.supabase.co')
SUPABASE_KEY = os.getenv(
    'SUPABASE_SERVICE_ROLE_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsbXRobW9qam5vbmJtd2l0em1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDUzOTI3MCwiZXhwIjoyMTEwMTE1MjcwfQ.hsO_inZ9Faei67c5edyo4iGk9E96hMO5VYhiMKi9m6o'
)

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger('tablet-bridge')

# ─── Supabase REST Helpers ───────────────────────────────────────────────────
HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation,resolution=merge-duplicates',
}

_employee_cache: dict[str, str] = {}  # device_user_id -> full_name

def refresh_employee_cache():
    try:
        url = f'{SUPABASE_URL}/rest/v1/employees?select=device_user_id,full_name'
        res = requests.get(url, headers=HEADERS, timeout=10)
        if res.status_code == 200:
            data = res.json()
            _employee_cache.clear()
            for emp in data:
                _employee_cache[str(emp['device_user_id'])] = emp['full_name']
            logger.info(f'Loaded {len(_employee_cache)} employees from Supabase')
    except Exception as e:
        logger.warning(f'Could not refresh employee cache: {e}')

def connect_device() -> Optional[ZK]:
    zk = ZK(ZK_IP, port=ZK_PORT, timeout=ZK_TIMEOUT, password=0, force_udp=False, ommit_ping=True)
    try:
        conn = zk.connect()
        return conn
    except Exception as e:
        logger.warning(f'TA500 connect error: {e}')
        return None

def sync_cycle():
    conn = connect_device()
    if not conn:
        return

    try:
        # Fast attendance read (< 200ms) without locking device screen
        attendances = conn.get_attendance()
        if not attendances:
            return

        # Check for unknown employees
        unknown_uids = [str(a.user_id) for a in attendances if str(a.user_id) not in _employee_cache]
        if unknown_uids:
            logger.info(f'Resolving new employees from device: {unknown_uids}')
            try:
                users = conn.get_users()
                new_emps = []
                for u in users:
                    uid = str(u.user_id)
                    if uid in unknown_uids:
                        name = u.name.strip() if u.name and u.name.strip() else f'NN-{uid}'
                        new_emps.append({
                            'device_user_id': uid,
                            'full_name': name,
                            'branch': 'Dagupan Main'
                        })
                if new_emps:
                    url = f'{SUPABASE_URL}/rest/v1/employees'
                    res = requests.post(url, headers=HEADERS, json=new_emps, timeout=10)
                    if res.status_code in [200, 201]:
                        logger.info(f'Auto-registered {len(new_emps)} employees in Supabase')
                        refresh_employee_cache()
            except Exception as e:
                logger.error(f'Error resolving users: {e}')

        # Prepare punch records for Supabase
        to_insert = []
        sync_time = datetime.now(timezone.utc).isoformat()

        for att in attendances:
            uid = str(att.user_id)
            naive_dt = att.timestamp
            if isinstance(naive_dt, str):
                from dateutil import parser as dp
                naive_dt = dp.parse(naive_dt)
            local_dt = TZ.localize(naive_dt) if naive_dt.tzinfo is None else naive_dt
            utc_dt = local_dt.astimezone(timezone.utc)

            to_insert.append({
                'device_user_id': uid,
                'punch_time':     utc_dt.isoformat(),
                'status':         getattr(att, 'punch', att.status) if hasattr(att, 'punch') else int(att.status or 0),
                'raw_status':     int(att.status or 0),
                'synced_at':      sync_time,
            })

        if to_insert:
            url = f'{SUPABASE_URL}/rest/v1/attendance_logs?on_conflict=device_user_id,punch_time'
            res = requests.post(url, headers=HEADERS, json=to_insert, timeout=10)
            if res.status_code in [200, 201]:
                inserted_count = len(res.json() or [])
                if inserted_count > 0:
                    logger.info(f'✅ SYNCED: {inserted_count} new punches pushed to cloud!')
    except Exception as e:
        logger.error(f'Sync cycle error: {e}')
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass

def main():
    print('=' * 60)
    print('🚀 JAPA DTR Sync Bridge (Samsung Galaxy Tab A8)')
    print(f'Device IP : {ZK_IP}:{ZK_PORT}')
    print(f'Poll Rate : Every {POLL_INTERVAL} seconds')
    print('=' * 60)

    refresh_employee_cache()
    logger.info(f'Tablet bridge active. Polling TA500 every {POLL_INTERVAL}s...')

    while True:
        try:
            sync_cycle()
        except Exception as e:
            logger.error(f'Loop error: {e}')
        time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
    main()

