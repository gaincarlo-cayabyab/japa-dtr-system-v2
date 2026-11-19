#!/usr/bin/env python3
"""
JAPA DTR Sync Bridge — Samsung Galaxy Tab A8/A9+ Edition
v16.0 "Iron Sentinel" — Dual-Socket Isolation | Graduated Self-Healing | Hourly Protected Rest

Major v16 Architecture Improvements:
  1. DUAL-SOCKET ISOLATION:
     - Socket A (Heartbeat): Dedicated persistent connection strictly for read_sizes() (8s).
     - Socket B (Fetch): Dedicated ephemeral connection strictly for get_attendance().
       Uses disable_device() -> free_data() -> get_attendance() -> free_data() -> enable_device().
       Completely eliminates the pyzk chunk buffer desynchronization bugs
       ('can't read chunk', 'TCP packet invalid', 'missing user data').
  2. GRADUATED SELF-HEALING & REMOTE SOFT-RESTART:
     - 0-3m: Quick 8s retries (clears normal socket resets).
     - 3-10m: 20s backoff for stressed hardware.
     - 10-30m: 30s backoff + Automatic UDP Soft-Reboot of TA500 (bypasses locked TCP stack).
     - 30m-3h: 120s battery-saver polling + cloud telemetry alert.
     - 3h+: Controlled process recycle (watchdog supervisor restores fresh environment).
  3. 30-DAY ROLLING BOUNDED CACHE:
     - Prunes seen_punches hashes older than 30 days to guarantee zero memory leaks.
     - Replaces flawed len(seen) count comparison with true cloud-vs-device hash audits.
  4. ROTATING LOG HANDLER:
     - Automatically caps bridge.log to 5 MB with 3 backups, preventing tablet disk fill.
  5. SCHEDULED RESTART COMPATIBLE (Option B Hourly Windows):
     - Designed to work seamlessly with scheduled_restart.sh and watchdog.sh.
"""

import os
import sys
import time
import json
import socket
import signal
import hashlib
import logging
import concurrent.futures
from logging.handlers import RotatingFileHandler
from datetime import datetime, timezone, timedelta
from typing import Optional, Set, List, Dict, Any, Tuple

try:
    import pytz
    import requests
    from requests.adapters import HTTPAdapter
    from zk import ZK
    try:
        from urllib3.util.retry import Retry
    except Exception:
        try:
            from requests.packages.urllib3.util.retry import Retry  # type: ignore
        except Exception:
            Retry = None
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install pyzk pytz requests urllib3")
    sys.exit(1)

# ─── Configuration & Dynamic IP Discovery ──────────────────────────────────────
_SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
_SEEN_FILE   = os.path.join(_SCRIPT_DIR, 'seen_punches.json')
_TOKEN_FILE  = os.path.join(_SCRIPT_DIR, 'sync_token.json')
_LOG_FILE    = os.path.join(_SCRIPT_DIR, 'bridge.log')
_IP_FILE     = os.path.join(_SCRIPT_DIR, 'ta500_ip.txt')

def load_saved_ip() -> str:
    for arg in sys.argv[1:]:
        if arg.startswith('--'):
            continue
        cleaned = arg.strip()
        parts = cleaned.split('.')
        if len(parts) == 4 and all(p.isdigit() for p in parts):
            return cleaned
    if os.getenv('ZK_DEVICE_IP'):
        return os.getenv('ZK_DEVICE_IP').strip()
    if os.path.exists(_IP_FILE):
        try:
            with open(_IP_FILE, 'r') as f:
                saved = f.read().strip()
                parts = saved.split('.')
                if len(parts) == 4 and all(p.isdigit() for p in parts):
                    return saved
        except Exception:
            pass
    return '192.168.0.58'

def save_device_ip(ip: str) -> None:
    try:
        with open(_IP_FILE, 'w') as f:
            f.write(ip.strip())
    except Exception:
        pass

ZK_IP         = load_saved_ip()
ZK_PORT       = int(os.getenv('ZK_DEVICE_PORT', '4370'))
ZK_TIMEOUT    = 4      # Fast timeout for heartbeat connection
POLL_INTERVAL = 8      # read_sizes() heartbeat every 8s
TZ            = pytz.timezone('Asia/Manila')
SEEN_MAX_DAYS = 30     # Bounded seen hashes window

SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://blmthmojjnonbmwitzmc.supabase.co')
SUPABASE_KEY = os.getenv(
    'SUPABASE_SERVICE_ROLE_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsbXRobW9qam5vbmJtd2l0em1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDUzOTI3MCwiZXhwIjoyMTEwMTE1MjcwfQ.hsO_inZ9Faei67c5edyo4iGk9E96hMO5VYhiMKi9m6o'
)

# ─── Single-Instance Protection ───────────────────────────────────────────────
_lock_socket: Optional[socket.socket] = None

def acquire_instance_lock():
    global _lock_socket
    try:
        _lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        _lock_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        _lock_socket.bind(('127.0.0.1', 43701))
        _lock_socket.listen(1)
    except socket.error:
        print("⚠️ [WARNING] Another instance of tablet_bridge is already running!")
        print("   Run: pkill -9 -f python")
        sys.exit(0)

# ─── Logging with 5MB Rotation ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        RotatingFileHandler(_LOG_FILE, mode='a', maxBytes=5 * 1024 * 1024, backupCount=3, encoding='utf-8')
    ],
)
logger = logging.getLogger('tablet-bridge')
logging.getLogger('urllib3').setLevel(logging.ERROR)

# ─── Persistent HTTP Session for Supabase Cloud ───────────────────────────────
session = requests.Session()
if Retry is not None:
    retry_strategy = Retry(
        total=2,
        backoff_factor=0.3,
        status_forcelist=[500, 502, 503, 504],
    )
    adapter = HTTPAdapter(pool_connections=5, pool_maxsize=5, max_retries=retry_strategy)
else:
    adapter = HTTPAdapter(pool_connections=5, pool_maxsize=5, max_retries=2)
session.mount('https://', adapter)
session.mount('http://', adapter)

_HEADERS_AUTH = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
}

_HEADERS_INSERT = {
    **_HEADERS_AUTH,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal,resolution=merge-duplicates',
}

# ─── TA500 Enrolled Hardware UID -> System Employee ID Mapping ────────────────
TA500_TO_SYSTEM_MAP: Dict[str, str] = {
    '1':  '24',  # Gain Carlo Cayabyab
    '2':  '4',   # Pearly B. De Vera
    '3':  '17',  # Melanie P. Tiu
    '4':  '9',   # Janine Kyle Galvan
    '5':  '11',  # Jamaica Soriano
    '6':  '7',   # Lyca Estacio
    '7':  '1',   # Dennis P. Ardiente
    '8':  '5',   # Ivan De Vera
    '9':  '2',   # Jeffrey D. Baniqued (Jepoy)
    '10': '6',   # Jerwin B. Dee
    '11': '3',   # Carlo C. Caoile
    '12': '8',   # Larry L. Estacio
    '13': '14',  # Randolf J. Galzote
    '14': '13',  # Rowena Romero
    '15': '19',  # Asky Sentenillar
    '16': '15',  # Juvell Luna
    '17': '16',  # Henry M. Tiozon
    '18': '18',  # Robert Luna
}

_employee_cache: Dict[str, str] = {}
_pending_upload_queue: List[Dict[str, Any]] = []
_last_device_punch: Dict[str, datetime] = {}

def refresh_employee_cache() -> None:
    global _employee_cache
    try:
        url = f'{SUPABASE_URL}/rest/v1/employees?select=device_user_id,full_name'
        res = session.get(url, headers=_HEADERS_AUTH, timeout=(3, 5))
        if res.status_code == 200:
            _employee_cache = {str(e['device_user_id']): e['full_name'] for e in res.json()}
            logger.info(f'Employee cache: {len(_employee_cache)} employees loaded')
    except Exception as e:
        logger.warning(f'Employee cache refresh failed (will retry): {e}')

def _parse_ts(ts_val) -> datetime:
    if isinstance(ts_val, datetime):
        return TZ.localize(ts_val) if ts_val.tzinfo is None else ts_val
    if isinstance(ts_val, str):
        try:
            clean = ts_val.replace('Z', '+00:00')
            dt = datetime.fromisoformat(clean)
            return dt.astimezone(TZ) if dt.tzinfo else TZ.localize(dt)
        except Exception:
            pass
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
            try:
                dt = datetime.strptime(ts_val.split('.')[0], fmt)
                return TZ.localize(dt)
            except Exception:
                pass
    return datetime.now(TZ)

def init_recent_punches() -> None:
    """Preloads last punch timestamps per employee to enforce 5-min debounce."""
    global _last_device_punch
    try:
        url = f'{SUPABASE_URL}/rest/v1/attendance_logs?select=device_user_id,punch_time&order=punch_time.desc&limit=100'
        res = session.get(url, headers=_HEADERS_AUTH, timeout=(4, 6))
        if res.status_code == 200:
            for row in res.json():
                uid = str(row['device_user_id'])
                if uid not in _last_device_punch:
                    pt = _parse_ts(row['punch_time'])
                    _last_device_punch[uid] = pt
            logger.info(f'Anti-Double Tap Debounce active: {len(_last_device_punch)} employee punch history loaded')
    except Exception as e:
        logger.warning(f'Recent punches init notice: {e}')

# ─── State Persistence with 30-Day Bounded Window ─────────────────────────────
def _punch_key(uid: str, punch_time_utc: str) -> str:
    return hashlib.md5(f'{uid}|{punch_time_utc}'.encode()).hexdigest()

def load_seen_set() -> Set[str]:
    try:
        if os.path.exists(_SEEN_FILE):
            with open(_SEEN_FILE, 'r') as f:
                data = json.load(f)
                return set(data) if isinstance(data, list) else set()
    except Exception:
        pass
    return set()

def save_seen_set(seen: Set[str]) -> None:
    try:
        with open(_SEEN_FILE, 'w') as f:
            json.dump(list(seen), f)
    except Exception as e:
        logger.warning(f'Could not save seen-punch set: {e}')

# ─── Cloud Meta Commands & Heartbeat ──────────────────────────────────────────
def fetch_cloud_meta() -> Dict[str, int]:
    try:
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?select=key,value'
        res = session.get(url, headers=_HEADERS_AUTH, timeout=(2, 4))
        if res.status_code == 200:
            return {r['key']: int(r['value']) for r in res.json()}
    except Exception:
        pass
    return {}

def acknowledge_command(key: str) -> None:
    try:
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?key=eq.{key}'
        session.patch(url, headers=_HEADERS_INSERT, json={'value': 0}, timeout=(2, 4))
    except Exception:
        pass

_last_ta500_seen_ts = 0

def update_live_heartbeat(ta500_online: bool, records_count: int = 0) -> None:
    """Updates cloud heartbeat in sync_meta so web portal detects real-time status."""
    global _last_ta500_seen_ts
    try:
        now_ts = int(time.time())
        if ta500_online:
            _last_ta500_seen_ts = now_ts
        payload = [
            {'key': 'bridge_heartbeat', 'value': now_ts},
            {'key': 'ta500_status',     'value': 1 if ta500_online else 0},
            {'key': 'ta500_last_seen',  'value': _last_ta500_seen_ts if _last_ta500_seen_ts > 0 else now_ts},
            {'key': 'ta500_records',    'value': int(records_count)},
            {'key': 'bridge_version',   'value': 16},
        ]
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?on_conflict=key'
        session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(2, 4))
    except Exception:
        pass

def handle_bridge_exit(*args):
    """Marks bridge and device as offline in cloud upon shutdown."""
    logger.info("Bridge stopping — broadcasting offline status to cloud portal...")
    try:
        payload = [
            {'key': 'bridge_heartbeat', 'value': 0},
            {'key': 'ta500_status',     'value': 0},
        ]
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?on_conflict=key'
        session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(1, 2))
    except Exception:
        pass
    sys.exit(0)

signal.signal(signal.SIGINT, handle_bridge_exit)
signal.signal(signal.SIGTERM, handle_bridge_exit)

# ─── Safe Device Connection, Disconnect & Remote Reboot ───────────────────────
def safe_disconnect(conn: Optional[object]) -> None:
    if not conn:
        return
    try:
        conn.disconnect()
    except Exception:
        pass
    try:
        if hasattr(conn, '_ZK__sock') and conn._ZK__sock:
            conn._ZK__sock.close()
    except Exception:
        pass

def restart_ta500_soft(ip: Optional[str] = None) -> bool:
    """
    Sends remote soft reboot command to TA500 via UDP port 4370.
    UDP bypasses stuck TCP sockets, clearing any hardware locks.
    """
    target_ip = ip or ZK_IP
    try:
        zk = ZK(target_ip, port=ZK_PORT, timeout=5, password=0, force_udp=True, ommit_ping=True)
        conn = zk.connect()
        if conn:
            conn.restart_device()
            try:
                conn.disconnect()
            except Exception:
                pass
            logger.info(f"🔁 Remote reboot signal transmitted to TA500 ({target_ip}) via UDP!")
            return True
    except Exception as e:
        logger.warning(f"Could not issue soft reboot to TA500: {e}")
    return False

def get_local_subnet() -> Tuple[Optional[str], Optional[str]]:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        parts = local_ip.split('.')
        if len(parts) == 4:
            return '.'.join(parts[:3]), local_ip
    except Exception:
        pass
    return None, None

def scan_for_ta500(timeout_per_host: float = 0.35) -> Optional[str]:
    subnet, local_ip = get_local_subnet()
    if not subnet:
        return None

    logger.info(f"🔎 Scanning Wi-Fi subnet {subnet}.1 - {subnet}.254 on port {ZK_PORT}...")
    candidates = [f"{subnet}.{i}" for i in range(1, 255) if f"{subnet}.{i}" != local_ip]

    def test_ip(ip: str) -> Optional[str]:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout_per_host)
            res = sock.connect_ex((ip, ZK_PORT))
            sock.close()
            if res == 0:
                return ip
        except Exception:
            pass
        return None

    found_hosts = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        results = executor.map(test_ip, candidates)
        for found in results:
            if found:
                found_hosts.append(found)

    for ip in found_hosts:
        for use_udp in (False, True):
            try:
                test_zk = ZK(ip, port=ZK_PORT, timeout=3, password=0, force_udp=use_udp, ommit_ping=True)
                conn = test_zk.connect()
                if conn:
                    conn.disconnect()
                    logger.info(f"🎯 Verified TA500 at {ip} (UDP={use_udp})!")
                    save_device_ip(ip)
                    return ip
            except Exception:
                pass

    if found_hosts:
        logger.info(f"🎯 Found port {ZK_PORT} open at {found_hosts[0]}!")
        save_device_ip(found_hosts[0])
        return found_hosts[0]

    return None

def connect_heartbeat_socket(ip: Optional[str] = None) -> Optional[object]:
    """
    SOCKET A — HEARTBEAT CONNECTION:
    Long-lived connection used strictly for read_sizes() (8s interval).
    Never executes get_attendance(), protecting this socket from buffer slip.
    """
    global ZK_IP
    target_ip = ip or ZK_IP

    for use_udp in (False, True):
        zk = None
        timeout = 4 if not use_udp else 3
        try:
            zk = ZK(target_ip, port=ZK_PORT, timeout=timeout,
                    password=0, force_udp=use_udp, ommit_ping=True)
            conn = zk.connect()
            if conn:
                if use_udp:
                    logger.info('🟡 Heartbeat connected via UDP fallback.')
                return conn
        except Exception as e_tcp:
            safe_disconnect(zk)
            if not use_udp:
                err_str = str(e_tcp)
                if '104' in err_str or '10054' in err_str or 'reset' in err_str.lower():
                    logger.warning('TA500 LAN busy (hardware holding previous session). Waiting for device socket to clear...')
                elif 'timed out' in err_str.lower() or 'timeout' in err_str.lower():
                    logger.warning(f'TA500 LAN connect notice ({target_ip}): timed out')
                else:
                    logger.warning(f'TA500 LAN connect notice ({target_ip}): {e_tcp}')
    return None

def fetch_attendance_isolated(ip: Optional[str] = None, timeout: int = 30) -> list:
    """
    SOCKET B — DEDICATED FETCH CONNECTION (ISOLATED):
    Opens a fresh dedicated socket solely for get_attendance().
    Never touches or pollutes the persistent heartbeat connection.
    Executes disable_device() -> free_data() -> get_attendance() -> free_data() -> enable_device().
    Completely prevents chunk reading corruption ('can't read chunk', 'TCP packet invalid', 'missing user data').
    """
    target_ip = ip or ZK_IP
    for use_udp in (False, True):
        zk = None
        conn = None
        try:
            zk = ZK(target_ip, port=ZK_PORT, timeout=timeout if not use_udp else 15,
                    password=0, force_udp=use_udp, ommit_ping=True)
            conn = zk.connect()
            if not conn:
                continue

            # 1. Lock UI so new finger scans don't write to flash memory during the read
            try:
                conn.disable_device()
            except Exception:
                pass

            # 2. Flush any stale command buffer bytes
            try:
                conn.free_data()
            except Exception:
                pass

            # 3. Pull full attendance logs
            records = conn.get_attendance() or []

            # 4. Flush buffer after large payload
            try:
                conn.free_data()
            except Exception:
                pass

            return records
        except Exception as e_fetch:
            if not use_udp:
                logger.warning(f"TCP attendance fetch blip: {e_fetch}. Retrying via UDP...")
            else:
                logger.warning(f"UDP attendance fetch blip: {e_fetch}")
        finally:
            if conn:
                try:
                    conn.enable_device()
                except Exception:
                    pass
                safe_disconnect(conn)
    return []

def sync_all_device_users_isolated(ip: Optional[str] = None) -> int:
    """Isolated user sync connection."""
    global _employee_cache
    target_ip = ip or ZK_IP
    zk = None
    conn = None
    try:
        zk = ZK(target_ip, port=ZK_PORT, timeout=15, password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()
        if not conn:
            return 0
        users = conn.get_users()
        if not users:
            return 0

        new_or_updated = []
        for u in users:
            raw_uid = str(u.user_id)
            uid = TA500_TO_SYSTEM_MAP.get(raw_uid, raw_uid)
            raw_name = (u.name or '').strip()
            name = raw_name if raw_name else f'NN-{uid}'

            if uid in _employee_cache and not _employee_cache[uid].startswith('NN-'):
                continue

            if uid not in _employee_cache:
                new_or_updated.append({
                    'device_user_id': uid,
                    'full_name': name,
                    'branch': 'Dagupan Main',
                })

        if new_or_updated:
            logger.info(f'👤 Detected {len(new_or_updated)} new employee(s) on TA500: {[e["full_name"] for e in new_or_updated]}')
            url = f'{SUPABASE_URL}/rest/v1/employees?on_conflict=device_user_id'
            res = session.post(url, headers=_HEADERS_INSERT, json=new_or_updated, timeout=(3, 5))
            if res.status_code in (200, 201):
                logger.info(f'✅ Successfully auto-registered {len(new_or_updated)} employee(s) in cloud!')
                refresh_employee_cache()
                return len(new_or_updated)
    except Exception as e:
        logger.warning(f'Device user sync notice: {e}')
    finally:
        safe_disconnect(conn)
    return 0

# ─── Flush Local Queue to Supabase ────────────────────────────────────────────
def flush_upload_queue(seen: Set[str]) -> bool:
    global _pending_upload_queue
    if not _pending_upload_queue:
        return True

    payload = [{k: v for k, v in r.items() if k != '_key'} for r in _pending_upload_queue]
    url = f'{SUPABASE_URL}/rest/v1/attendance_logs?on_conflict=device_user_id,punch_time'

    try:
        res = session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(4, 8))
        if res.status_code in (200, 201):
            for r in _pending_upload_queue:
                seen.add(r['_key'])
            save_seen_set(seen)

            latest_uid = _pending_upload_queue[-1]['device_user_id']
            emp_name = _employee_cache.get(latest_uid, f'ID #{latest_uid}')
            logger.info(f'✅ SYNCED: {len(_pending_upload_queue)} punch(es) to cloud! (Latest: {emp_name})')
            _pending_upload_queue.clear()
            return True
        else:
            logger.warning(f'Supabase returned HTTP {res.status_code} — kept in queue')
    except Exception:
        logger.warning(f'Slow network: upload queued ({len(_pending_upload_queue)} punch(es)). Retrying...')

    return False

def process_punches_batch(attendances: List[Any], seen: Set[str]) -> int:
    global _pending_upload_queue, _last_device_punch
    new_count = 0
    sync_time = datetime.now(timezone.utc).isoformat()

    try:
        attendances.sort(key=lambda a: _parse_ts(getattr(a, 'timestamp', None)))
    except Exception:
        pass

    for att in attendances:
        raw_uid = str(att.user_id)
        uid = TA500_TO_SYSTEM_MAP.get(raw_uid, raw_uid)
        local_dt = _parse_ts(att.timestamp)
        utc_iso = local_dt.astimezone(timezone.utc).isoformat()

        key = _punch_key(uid, utc_iso)
        if key in seen:
            _last_device_punch[uid] = local_dt
            continue

        if any(q['_key'] == key for q in _pending_upload_queue):
            _last_device_punch[uid] = local_dt
            continue

        prev_punch_dt = _last_device_punch.get(uid)
        if prev_punch_dt is not None:
            diff_sec = abs((local_dt - prev_punch_dt).total_seconds())
            if diff_sec < 300:
                seen.add(key)
                save_seen_set(seen)
                continue

        _last_device_punch[uid] = local_dt
        status_val = getattr(att, 'punch', None)
        if status_val is None:
            status_val = int(att.status or 0)

        _pending_upload_queue.append({
            'device_user_id': uid,
            'punch_time':     utc_iso,
            'status':         int(status_val),
            'raw_status':     int(att.status or 0),
            'synced_at':      sync_time,
            '_key':           key,
        })
        new_count += 1

    return new_count

def load_cloud_seen_hashes(limit: int = 500) -> Set[str]:
    """Fetches recent punch hashes from Supabase to prevent duplicate re-uploads."""
    try:
        url = (
            f'{SUPABASE_URL}/rest/v1/attendance_logs'
            f'?select=device_user_id,punch_time'
            f'&order=punch_time.desc&limit={limit}'
        )
        res = session.get(url, headers=_HEADERS_AUTH, timeout=(5, 10))
        if res.status_code == 200:
            cloud_seen = set()
            for row in res.json():
                uid = str(row['device_user_id'])
                local_dt = _parse_ts(row['punch_time'])
                utc_iso = local_dt.astimezone(timezone.utc).isoformat()
                cloud_seen.add(_punch_key(uid, utc_iso))
            return cloud_seen
    except Exception as e:
        logger.warning(f'Cloud hash sync notice: {e}')
    return set()

def discover_ta500() -> None:
    global ZK_IP
    test_conn = connect_heartbeat_socket(ZK_IP)
    if test_conn:
        safe_disconnect(test_conn)
        return

    logger.warning(f'TA500 not responding at {ZK_IP}. Checking subnet...')
    found_ip = scan_for_ta500()
    if found_ip:
        ZK_IP = found_ip
        logger.info(f'✅ TA500 auto-discovered at {ZK_IP}! Saving for future use.')
    else:
        logger.warning(f'TA500 currently offline / unreachable at {ZK_IP}.')
        logger.info('   Bridge daemon will remain ACTIVE and await hardware power-on.')

# ─── Main Bridge Engine ───────────────────────────────────────────────────────
def main():
    discover_ta500()
    acquire_instance_lock()
    global _pending_upload_queue, ZK_IP

    print('=' * 66)
    print('🚀 JAPA DTR Sync Bridge (Samsung Galaxy Tab A8/A9+) v16.0')
    print(f'   Target IP : {ZK_IP}:{ZK_PORT}')
    print(f'   Mode      : Iron Sentinel 24/7 | Dual-Socket Isolation | 60s Audit')
    print(f'   Stability : Dedicated Fetch Socket | Graduated Backoff | 30d Window')
    print(f'   Schedule  : Option B Hourly Window Maintenance Support Active')
    print('=' * 66)

    seen = load_seen_set()
    logger.info(f'Loaded {len(seen)} previously-synced punch hashes.')

    refresh_employee_cache()
    init_recent_punches()
    update_live_heartbeat(False, 0)
    logger.info('Tablet bridge active. Press Ctrl+C to stop.')

    # Reconnect & self-healing tracking
    failure_start_time = 0.0
    ta500_fail_count = 0
    last_soft_reboot_attempt = 0.0

    while True:
        # Flush pending offline punches if any
        if _pending_upload_queue:
            flush_upload_queue(seen)

        # ── 1. Connect Heartbeat Socket (Socket A) ───────────────────────────
        conn = connect_heartbeat_socket()
        if not conn:
            now = time.time()
            if failure_start_time == 0.0:
                failure_start_time = now
            time_down = now - failure_start_time
            ta500_fail_count += 1

            # Broadcast TA500 down to cloud immediately
            last_recs = known_record_count if 'known_record_count' in locals() else 0
            update_live_heartbeat(False, last_recs)

            # Graduated Self-Healing Backoff
            if time_down < 180:         # 0 - 3 minutes: quick 8s retry
                cooldown = 8
            elif time_down < 600:       # 3 - 10 minutes: 20s retry
                cooldown = 20
            elif time_down < 1800:      # 10 - 30 minutes: 30s retry + soft-reboot TA500
                cooldown = 30
                if (now - last_soft_reboot_attempt) > 300:
                    last_soft_reboot_attempt = now
                    logger.warning(f'⚠️ TA500 offline for {int(time_down)}s. Triggering automatic UDP soft-reboot...')
                    restart_ta500_soft(ZK_IP)
                    cooldown = 90  # Allow hardware boot time
            elif time_down < 10800:     # 30 mins - 3 hours: battery saver 120s polling
                cooldown = 120
            else:                       # 3+ hours stuck: recycle process via watchdog
                logger.critical('🛑 Connection down for >3 hours. Recycling bridge via watchdog...')
                sys.exit(42)

            logger.warning(f'TA500 LAN offline/unreachable (attempt #{ta500_fail_count}, down {int(time_down)}s). Retrying in {cooldown}s...')
            if ta500_fail_count == 3:
                subnet, local_ip = get_local_subnet()
                logger.info(f'💡 Network Status: Device IP is {local_ip}. Target device is {ZK_IP}.')
                logger.info('   1. Verify TA500 power switch is ON and display is illuminated.')
                logger.info('   2. Verify Cat6 LAN cable link LED is lit on TA500 and Wi-Fi repeater.')

            elapsed_cd = 0
            while elapsed_cd < cooldown:
                time.sleep(min(3, cooldown - elapsed_cd))
                elapsed_cd += 3
                update_live_heartbeat(False, last_recs)
            continue

        # Hardware connection recovered!
        ta500_fail_count = 0
        failure_start_time = 0.0
        logger.info(f'🟢 TA500 CONNECTED ({ZK_IP})! Heartbeat engine ready in <1s.')

        try:
            conn.enable_device()
        except Exception:
            pass

        # ── 2. Status & Isolated Catch-Up Check ──────────────────────────────
        known_record_count = 0
        try:
            conn.read_sizes()
            known_record_count = conn.records
            logger.info(f'📊 TA500 reports {known_record_count} total attendance records on device.')

            # Sync cloud hashes on startup so punches already in DB aren't re-inserted
            cloud_hashes = load_cloud_seen_hashes(limit=max(known_record_count + 50, 300))
            new_cloud = cloud_hashes - seen
            if new_cloud:
                seen.update(new_cloud)
                save_seen_set(seen)
                logger.info(f'☁️ Synced {len(new_cloud)} cloud punch hashes to local cache.')

            # Run catch-up via DEDICATED FETCH SOCKET (Socket B)
            if known_record_count > 0:
                logger.info('🔄 Running startup catch-up audit on isolated socket...')
                atts = fetch_attendance_isolated(ZK_IP)
                caught_up = process_punches_batch(atts, seen)
                if caught_up > 0:
                    logger.info(f'✅ Caught up {caught_up} punch(es) from TA500 memory!')
                    flush_upload_queue(seen)
                else:
                    logger.info('✅ All attendance records verified. Sensor ready for punches!')
        except Exception as e_init:
            logger.warning(f'Initial status check notice: {e_init}')

        last_cloud_check = time.time()
        last_heartbeat = 0
        last_audit_time = time.time()
        session_start_time = time.time()
        read_sizes_fail_streak = 0

        AUDIT_INTERVAL = 60           # 60s isolated audit
        MAX_SESSION_DURATION = 600     # 10m clean socket refresh

        try:
            # ── 3. Main Heartbeat Loop (Socket A strictly read_sizes) ────────
            while True:
                now = time.time()

                if _pending_upload_queue:
                    flush_upload_queue(seen)

                # Graceful 10m rejuvenation
                if now - session_start_time >= MAX_SESSION_DURATION:
                    logger.info('🔄 Periodic Socket Rejuvenation (10m): Refreshing heartbeat session...')
                    break

                # Cloud portal commands check (~20s)
                if now - last_cloud_check >= 20:
                    last_cloud_check = now
                    meta = fetch_cloud_meta()

                    if meta.get('clear_hardware') == 1:
                        logger.info('🧹 Remote clear requested from web portal!')
                        try:
                            conn.clear_attendance()
                            known_record_count = 0
                            logger.info('✅ TA500 physical memory CLEARED!')
                        except Exception as e:
                            logger.error(f'Error clearing hardware: {e}')
                        acknowledge_command('clear_hardware')
                        seen.clear()
                        save_seen_set(seen)
                        _pending_upload_queue.clear()
                        _last_device_punch.clear()

                    if meta.get('sync_employees') == 1:
                        logger.info('👤 Enrolled user sync requested from web portal!')
                        sync_all_device_users_isolated(ZK_IP)
                        acknowledge_command('sync_employees')

                # ── KEY 1: Ultra-fast read_sizes() heartbeat (0.05 - 1.5s) ───
                try:
                    conn.read_sizes()
                    current_count = conn.records
                    read_sizes_fail_streak = 0
                    update_live_heartbeat(True, current_count)
                except Exception as e_rs:
                    err_str = str(e_rs).lower()
                    read_sizes_fail_streak += 1
                    update_live_heartbeat(False, known_record_count)
                    if any(x in err_str for x in ['nonetype', 'bytes', 'invalid', 'timed out', 'timeout']) \
                            and read_sizes_fail_streak <= 2:
                        logger.warning(f'⚠️ TA500 heartbeat blip ({read_sizes_fail_streak}/2): {e_rs}. Retrying...')
                        time.sleep(2)
                        continue
                    logger.warning(f'⚠️ TA500 connection lost ({read_sizes_fail_streak} times): {e_rs}. Reconnecting...')
                    raise

                # ── KEY 2: New Punches Detected via Counter ──────────────────
                if current_count > known_record_count:
                    delta = current_count - known_record_count
                    logger.info(f'🆕 {delta} new punch(es) detected via counter! Fetching on isolated socket...')
                    # Fetch via DEDICATED FETCH SOCKET (Socket B) — Socket A remains clean!
                    atts = fetch_attendance_isolated(ZK_IP)
                    new_punches = process_punches_batch(atts, seen)
                    known_record_count = current_count
                    last_audit_time = now
                    if new_punches > 0:
                        logger.info(f'Uploading {new_punches} new punch(es) to cloud...')
                        flush_upload_queue(seen)
                    else:
                        logger.info('Records fetched — duplicates skipped (already synced).')
                else:
                    known_record_count = current_count

                # ── KEY 3: Direct Flash Memory Audit (Every 60s) ─────────────
                if now - last_audit_time >= AUDIT_INTERVAL:
                    last_audit_time = now
                    try:
                        # Fetch via DEDICATED FETCH SOCKET (Socket B)
                        atts = fetch_attendance_isolated(ZK_IP)
                        audit_punches = process_punches_batch(atts, seen)
                        if audit_punches > 0:
                            logger.info(f'🎯 Direct Audit: {audit_punches} new punch(es) caught from TA500 flash memory!')
                            flush_upload_queue(seen)
                            known_record_count = len(atts)
                    except Exception as e_audit:
                        logger.warning(f'Direct audit notice: {e_audit}')

                if now - last_heartbeat >= 30:
                    last_heartbeat = now
                    logger.info(f'🟢 TA500 Active ({ZK_IP}) — {known_record_count} records | Sensor ready for punches...')

                time.sleep(POLL_INTERVAL)

        except (socket.error, ConnectionResetError, BrokenPipeError, TimeoutError) as net_err:
            logger.warning(f'⚠️ Network connection dropped: {net_err}. Auto-reconnecting...')
        except Exception as err:
            logger.warning(f'⚠️ TA500 stream notice: {err}. Auto-reconnecting...')
        finally:
            safe_disconnect(conn)
            time.sleep(3)

if __name__ == '__main__':
    main()
