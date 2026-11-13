#!/usr/bin/env python3
"""
JAPA DTR Sync Bridge
Connects FingerTec TA500 biometric device to Supabase.
Device: 192.168.68.146:4370
"""

import os
import sys
import time
import logging
import signal
import threading
from datetime import datetime, timezone
from typing import Optional

import pytz
import schedule
from dotenv import load_dotenv
from zk import ZK, const
from supabase import create_client, Client

load_dotenv()

# ─── Configuration ────────────────────────────────────────────────────────────
ZK_IP        = os.getenv('ZK_DEVICE_IP', '192.168.68.146')
ZK_PORT      = int(os.getenv('ZK_DEVICE_PORT', '4370'))
ZK_TIMEOUT   = int(os.getenv('ZK_TIMEOUT', '30'))
ZK_PASSWORD  = int(os.getenv('ZK_PASSWORD', '0'))
SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
POLL_INTERVAL = int(os.getenv('POLL_INTERVAL_SECONDS', '30'))
LOG_LEVEL    = os.getenv('LOG_LEVEL', 'INFO')
TZ           = pytz.timezone(os.getenv('TIMEZONE', 'Asia/Manila'))

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('bridge.log', encoding='utf-8'),
    ]
)
logger = logging.getLogger('japa-dtr-bridge')

# ─── Graceful shutdown ────────────────────────────────────────────────────────
_shutdown = threading.Event()

def _handle_signal(sig, frame):
    logger.info(f'Signal {sig} received — shutting down gracefully...')
    _shutdown.set()

signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)

# ─── Supabase client ──────────────────────────────────────────────────────────
def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── Employee cache ───────────────────────────────────────────────────────────
_employee_cache: dict[str, str] = {}  # device_user_id → full_name
_cache_lock = threading.Lock()

def refresh_employee_cache(supabase: Client) -> None:
    """Fetch employees from Supabase and update local cache."""
    try:
        result = supabase.table('employees').select('device_user_id, full_name').execute()
        with _cache_lock:
            _employee_cache.clear()
            for emp in (result.data or []):
                _employee_cache[str(emp['device_user_id'])] = emp['full_name']
        logger.info(f'Employee cache refreshed: {len(_employee_cache)} employees')
    except Exception as e:
        logger.error(f'Failed to refresh employee cache: {e}')

def get_employee_name(device_user_id: str) -> str:
    with _cache_lock:
        return _employee_cache.get(str(device_user_id), f'NN-{device_user_id}')

# ─── Device connection ────────────────────────────────────────────────────────
def connect_device() -> Optional[ZK]:
    """Connect to TA500 with retry logic."""
    zk = ZK(ZK_IP, port=ZK_PORT, timeout=ZK_TIMEOUT, password=ZK_PASSWORD, force_udp=False, ommit_ping=False)
    try:
        logger.info(f'Connecting to TA500 at {ZK_IP}:{ZK_PORT}...')
        conn = zk.connect()
        logger.info('Connected to TA500 successfully')
        return conn
    except Exception as e:
        logger.error(f'Failed to connect to TA500: {e}')
        return None

# ─── Sync logic ───────────────────────────────────────────────────────────────
def sync_attendance(supabase: Client) -> int:
    """
    Pull attendance records from TA500 and push new ones to Supabase.
    Returns number of new records inserted.
    """
    conn = connect_device()
    if not conn:
        logger.warning('Skipping sync — device not reachable')
        return 0

    inserted = 0
    try:
        logger.info('Disabling device screen for safe data transfer...')
        conn.disable_device()

        try:
            attendances = conn.get_attendance()
            logger.info(f'Retrieved {len(attendances)} total attendance records from device')
        finally:
            conn.enable_device()
            logger.info('Device screen re-enabled')

        # Build Supabase payload, skipping records for unknown users (not in DB)
        to_insert = []
        sync_time = datetime.now(timezone.utc).isoformat()

        for att in attendances:
            uid = str(att.user_id)
            # Localize punch_time (device stores local time, naive)
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

        if not to_insert:
            logger.info('No attendance records to sync')
            return 0

        # Upsert in batches of 100 — unique constraint on (device_user_id, punch_time) prevents duplication
        BATCH = 100
        for i in range(0, len(to_insert), BATCH):
            batch = to_insert[i:i+BATCH]
            try:
                result = supabase.table('attendance_logs').upsert(
                    batch,
                    on_conflict='device_user_id,punch_time',
                    ignore_duplicates=True,
                ).execute()
                inserted += len(result.data or [])
            except Exception as e:
                logger.error(f'Batch upsert error (batch {i//BATCH + 1}): {e}')

        logger.info(f'Sync complete: {inserted} new records inserted (of {len(to_insert)} total on device)')

    except Exception as e:
        logger.error(f'Sync error: {e}', exc_info=True)
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass

    return inserted

# ─── Auto-register unknown users ─────────────────────────────────────────────
def auto_register_unknown_users(supabase: Client) -> None:
    """
    Scan device users and insert placeholder records (NN-<id>) for any
    device user IDs not yet in the employees table.
    """
    conn = connect_device()
    if not conn:
        return
    try:
        conn.disable_device()
        try:
            users = conn.get_users()
        finally:
            conn.enable_device()

        new_users = []
        for u in users:
            uid = str(u.user_id)
            with _cache_lock:
                if uid not in _employee_cache:
                    name = u.name.strip() if u.name and u.name.strip() else f'NN-{uid}'
                    new_users.append({
                        'device_user_id': uid,
                        'full_name': name,
                        'branch': 'Dagupan Main',
                    })

        if new_users:
            supabase.table('employees').upsert(
                new_users,
                on_conflict='device_user_id',
                ignore_duplicates=True,
            ).execute()
            logger.info(f'Auto-registered {len(new_users)} new device users (placeholders)')
            refresh_employee_cache(supabase)
    except Exception as e:
        logger.error(f'Auto-register error: {e}')
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass

# ─── Main loop ────────────────────────────────────────────────────────────────
def main():
    logger.info('=' * 60)
    logger.info('JAPA DTR Sync Bridge starting...')
    logger.info(f'Device: {ZK_IP}:{ZK_PORT}  |  Poll: every {POLL_INTERVAL}s')
    logger.info('=' * 60)

    supabase = get_supabase()
    refresh_employee_cache(supabase)
    auto_register_unknown_users(supabase)

    # Run immediately on start
    sync_attendance(supabase)

    # Schedule recurring sync
    schedule.every(POLL_INTERVAL).seconds.do(sync_attendance, supabase)
    schedule.every(5).minutes.do(refresh_employee_cache, supabase)
    schedule.every(10).minutes.do(auto_register_unknown_users, supabase)

    logger.info(f'Polling every {POLL_INTERVAL} seconds. Press Ctrl+C to stop.')

    while not _shutdown.is_set():
        schedule.run_pending()
        _shutdown.wait(timeout=1)

    logger.info('Bridge shut down cleanly.')

if __name__ == '__main__':
    main()
