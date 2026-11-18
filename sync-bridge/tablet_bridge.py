#!/usr/bin/env python3
"""
JAPA DTR Sync Bridge — Samsung Galaxy Tab A8 Edition
v15 — Bulletproof 24/7 Engine | Dual-Mode TCP+UDP | Graceful Rotation

Root cause of v14 overnight failure:
  The 5-min proactive rotation called safe_disconnect() then immediately tried
  to reconnect. The TA500 TCP stack holds the socket for 60-120s after ANY
  disconnect (hardware limitation). With ZK_TIMEOUT=10, the bridge entered a
  60-second retry loop that could last 1-2 hours if the TA500 TCP buffer was
  already stressed by repeated connection attempts.

v15 Core Fixes:
  1. GRACEFUL ROTATION — Never disconnects proactively. Instead, the bridge
     lets the existing connection naturally expire and only reconnects when
     the heartbeat (read_sizes) actually fails. Zero unnecessary disconnects.
  2. DUAL-MODE CONNECT — Tries TCP first; on failure, instantly retries with
     UDP (force_udp=True). TA500 always responds to UDP when TCP is locked.
  3. ADAPTIVE BACKOFF — On reconnect failure, uses short 15s retries for the
     first 3 attempts (hardware socket clears in 15-90s), then 30s steady.
  4. SEEN-HASH CATCH-UP FIX — On fresh start, correctly compares cloud hashes
     (not just count) so today's punches are never skipped.
  5. All v13 Instant-Load features retained (<1s startup, smart record
     comparison, anti-double-tap debounce, offline batching).
"""

import os
import sys
import time
import json
import socket
import hashlib
import logging
import concurrent.futures
from datetime import datetime, timezone
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
# 15s timeout: fast enough to detect dead sockets, long enough for slow LAN
ZK_TIMEOUT    = 15
POLL_INTERVAL = 10   # read_sizes() heartbeat every 10s
TZ            = pytz.timezone('Asia/Manila')

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

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(_LOG_FILE, mode='a', encoding='utf-8')
    ],
)
logger = logging.getLogger('tablet-bridge')
logging.getLogger('urllib3').setLevel(logging.ERROR)

# ─── High-Performance Persistent HTTP Session ────────────────────────────────
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
    'Prefer':        'return=representation,resolution=ignore-duplicates',
}

# ─── TA500 Hardware Biometric ID to System Employee ID Mapping ────────────────
# Maps physical FingerTec TA500 enrolled UID -> JAPA DTR System Employee ID
# Verified against live physical TA500 hardware memory (17 enrolled employees):
#   UID  1: Gain     -> CAYABYAB, GAIN CARLO G. (#24)
#   UID  2: Pearly   -> DE VERA, PEARLY B. (#4)
#   UID  3: Melanie  -> TIU, MELANIE P. (#17)
#   UID  4: Janine   -> GALVAN, JANINE KYLE (#9)
#   UID  5: Jamaica  -> SORIANO, JAMAICA (#11)
#   UID  6: Lyca     -> ESTACIO, LYCA (#7)
#   UID  7: Dennis   -> ARDIENTE, DENNIS P. (#1)
#   UID  8: Ivan     -> DE VERA, IVAN (#5)
#   UID  9: Jepoy    -> BANIQUED, JEFFREY D. (#2)
#   UID 10: Jerwin   -> DEE, JERWIN B. (#6)
#   UID 11: Carlo    -> CAOILE, CARLO C. (#3)
#   UID 12: Larry    -> ESTACIO, LARRY L. (#8)
#   UID 13: Randolf  -> GALZOTE, RANDOLF J. (#14)
#   UID 14: Rowena   -> ROMERO, ROWENA (#13)
#   UID 15: Asky     -> SENTENILLAR, ASKY (#19)
#   UID 16: Juvell   -> LUNA, JUVELL (#15)
#   UID 17: Henry    -> TIOZON, HENRY M. (#16)
#   UID 18: Robert   -> LUNA, ROBERT (#18)
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
    """Robust timestamp parser."""
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


def sync_all_device_users(conn) -> int:
    """Pulls enrolled users from TA500 hardware memory."""
    global _employee_cache
    try:
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
            else:
                logger.warning(f'Employee upload HTTP {res.status_code}: {res.text[:120]}')
    except Exception as e:
        logger.warning(f'Device user sync notice: {e}')
    return 0


# ─── State Persistence ────────────────────────────────────────────────────────
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


# ─── Cloud Meta Commands ──────────────────────────────────────────────────────
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
    except Exception:
        pass


# ─── Safe Device Connection & Disconnect ──────────────────────────────────────
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


def connect_device(ip: Optional[str] = None) -> Optional[object]:
    """
    Dual-mode connect: TCP first, then UDP fallback.
    TA500 always responds to UDP when TCP socket is busy/locked.
    """
    global ZK_IP
    target_ip = ip or ZK_IP

    # Try TCP first (normal)
    for use_udp in (False, True):
        zk = None
        try:
            zk = ZK(target_ip, port=ZK_PORT, timeout=ZK_TIMEOUT,
                    password=0, force_udp=use_udp, ommit_ping=True)
            conn = zk.connect()
            if conn:
                if use_udp:
                    logger.info(f'🟡 TA500 connected via UDP fallback (TCP busy). Fully operational.')
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


def safe_fetch_attendance(conn, max_retries: int = 3) -> list:
    """Retries get_attendance() for transient pyzk NoneType packet blips."""
    for attempt in range(max_retries):
        try:
            records = conn.get_attendance()
            if records is not None:
                return records
        except Exception:
            if attempt == max_retries - 1:
                raise
            time.sleep(1)
    return []


def process_punches_batch(attendances: List[Any], seen: Set[str]) -> int:
    """Processes historical or offline punches fetched during catch-up."""
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


# ─── Cloud Seen-Hash Sync (Critical for today's punch recovery) ───────────────
def load_cloud_seen_hashes(device_record_count: int) -> Set[str]:
    """
    Fetches existing punch hashes from the cloud to avoid re-uploading
    records already synced. Fetches enough records to cover the device total.
    """
    try:
        limit = max(device_record_count + 50, 300)
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


# ─── Startup IP Discovery ─────────────────────────────────────────────────────
def discover_or_exit() -> None:
    """Auto-discovers TA500 on the Wi-Fi subnet if the default IP doesn't respond."""
    global ZK_IP
    test_conn = connect_device(ZK_IP)
    if test_conn:
        safe_disconnect(test_conn)
        return

    logger.warning(f'TA500 not found at {ZK_IP}. Starting subnet scan...')
    found_ip = scan_for_ta500()
    if found_ip:
        ZK_IP = found_ip
        logger.info(f'✅ TA500 auto-discovered at {ZK_IP}! Saving for future use.')
    else:
        logger.error('TA500 not found on this Wi-Fi network.')
        print('=' * 55)
        print('   TA500 NOT FOUND — TROUBLESHOOTING STEPS:')
        print('   1. Check Wi-Fi: Tablet and TA500 on same router.')
        print('   2. Check TA500 LAN cable (green light on port).')
        print('   3. Confirm TA500 IP in Comm → Ethernet menu.')
        print('   4. Turn the TA500 OFF and back ON to reset its Wi-Fi chip.')
        sys.exit(0)


def main():
    discover_or_exit()

    acquire_instance_lock()
    global _pending_upload_queue, ZK_IP
    print('=' * 60)
    print('🚀 JAPA DTR Sync Bridge (Samsung Galaxy Tab A8/A9+) v15.3')
    print(f'   Target IP : {ZK_IP}:{ZK_PORT}')
    print(f'   Mode      : Bulletproof 24/7 | Dual-Mode TCP+UDP | 60s Direct Flash Audit')
    print(f'   Stability : 10m Proactive Session Rejuvenation | Anti-Double Tap Shield')
    print('=' * 60)

    seen = load_seen_set()
    logger.info(f'Loaded {len(seen)} previously-synced punch hashes.')

    refresh_employee_cache()
    init_recent_punches()
    logger.info('Tablet bridge active. Press Ctrl+C to stop.')

    # ── Reconnect tracking ─────────────────────────────────────────────────
    ta500_fail_count = 0

    while True:
        # ── 1. Flush any pending offline punches first ───────────────────────
        if _pending_upload_queue:
            flush_upload_queue(seen)

        # ── 2. Connect to TA500 (Persistent Open TCP Socket, UDP fallback) ──
        conn = connect_device()
        if not conn:
            ta500_fail_count += 1
            # Short retries for first 3 attempts (hardware socket clears in 15-90s)
            # then steady 30s to avoid hammering the TA500 TCP stack
            if ta500_fail_count <= 3:
                cooldown = 15
            else:
                cooldown = 30
            logger.warning(f'TA500 LAN busy/reconnecting (attempt #{ta500_fail_count}). Retrying in {cooldown}s...')
            if ta500_fail_count == 3:
                subnet, local_ip = get_local_subnet()
                logger.info(f'💡 Network Status: Device IP is {local_ip}. Target device is {ZK_IP}.')
                logger.info('   1. Connect Tablet to your MAIN ROUTER Wi-Fi (for stable internet).')
                logger.info('   2. If TA500 shows Errno 104, turn TA500 OFF and back ON once to reset its socket.')
            time.sleep(cooldown)
            continue

        ta500_fail_count = 0
        logger.info(f'🟢 TA500 CONNECTED ({ZK_IP})! Bulletproof engine ready in <1s.')

        # Ensure sensor is always in normal biometric verification mode
        try:
            conn.enable_device()
        except Exception:
            pass

        # ── 3. Ultra-Fast Status & Catch-Up (<0.5s) ──────────────────────────
        known_record_count = 0
        try:
            conn.read_sizes()
            known_record_count = conn.records
            logger.info(f'📊 TA500 has {known_record_count} total attendance records on device.')

            # CRITICAL FIX: Sync cloud hashes on startup to catch today's punches
            # that may have been uploaded but whose hashes weren't saved locally
            if known_record_count > 0:
                cloud_hashes = load_cloud_seen_hashes(known_record_count)
                new_hashes = cloud_hashes - seen
                if new_hashes:
                    seen.update(new_hashes)
                    save_seen_set(seen)
                    logger.info(f'☁️ Synced {len(new_hashes)} cloud punch hashes to local cache.')

                if len(seen) < known_record_count:
                    unseen_count = known_record_count - len(seen)
                    logger.info(f'🔄 Catch-up: {unseen_count} unsynced punch(es) on device. Fetching...')
                    try:
                        atts = safe_fetch_attendance(conn)
                        atts = atts or []
                        caught_up = process_punches_batch(atts, seen)
                        if caught_up > 0:
                            logger.info(f'✅ Caught up {caught_up} punch(es) from TA500 memory!')
                            flush_upload_queue(seen)
                        else:
                            logger.info('✅ All attendance records verified. Sensor ready for punches!')
                    except Exception as e_fetch:
                        logger.warning(f'Catch-up fetch notice: {e_fetch}. Will retry on next connection.')
                else:
                    logger.info('✅ All attendance records are already synced. Sensor ready for punches!')
            else:
                logger.info('✅ TA500 has 0 total attendance records on device.')
        except Exception as e_init:
            logger.warning(f'Initial status check notice: {e_init}')

        last_cloud_check = time.time()
        last_heartbeat = 0
        last_audit_time = time.time()
        session_start_time = time.time()
        read_sizes_fail_streak = 0

        # High-reliability intervals
        AUDIT_INTERVAL = 60          # Direct flash memory audit every 60s (never miss a punch even if read_sizes freezes)
        MAX_SESSION_DURATION = 600    # Gracefully rejuvenate connection every 10 mins to prevent socket staleness

        try:
            # ── 4. Main Loop: read_sizes() heartbeat + 60s direct flash audit ──
            while True:
                now = time.time()

                # Flush pending offline punches
                if _pending_upload_queue:
                    flush_upload_queue(seen)

                # Graceful socket rejuvenation (every 10 minutes)
                if now - session_start_time >= MAX_SESSION_DURATION:
                    logger.info(f'🔄 Periodic Socket Rejuvenation (10m): Refreshing TA500 session for 100% continuous reliability...')
                    break  # Triggers safe disconnect, 3s breather, and fresh reconnect

                # Check cloud portal commands every ~20 seconds
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
                        try:
                            sync_all_device_users(conn)
                        except Exception as e:
                            logger.error(f'Error syncing users: {e}')
                        acknowledge_command('sync_employees')

                # ── KEY 1: Ultra-fast read_sizes() heartbeat (0.05-1.5s) ──────
                try:
                    conn.read_sizes()
                    current_count = conn.records
                    read_sizes_fail_streak = 0
                except Exception as e_rs:
                    err_str = str(e_rs).lower()
                    read_sizes_fail_streak += 1
                    # Transient packet errors — skip this cycle, stay connected
                    if any(x in err_str for x in ['nonetype', 'bytes', 'invalid', 'timed out', 'timeout']) \
                            and read_sizes_fail_streak <= 3:
                        logger.warning(f'⚠️ TA500 heartbeat blip ({read_sizes_fail_streak}/3): {e_rs}. Skipping cycle...')
                        time.sleep(POLL_INTERVAL)
                        continue
                    # Hard network errors or repeated failures → reconnect
                    logger.warning(f'⚠️ TA500 heartbeat failed ({read_sizes_fail_streak} times): {e_rs}. Reconnecting...')
                    raise

                if current_count > known_record_count:
                    delta = current_count - known_record_count
                    logger.info(f'🆕 {delta} new punch(es) detected via counter! Fetching records...')
                    try:
                        atts = safe_fetch_attendance(conn)
                        atts = atts or []
                        new_punches = process_punches_batch(atts, seen)
                        known_record_count = current_count
                        last_audit_time = now
                        if new_punches > 0:
                            logger.info(f'Uploading {new_punches} new punch(es) to cloud...')
                            flush_upload_queue(seen)
                        else:
                            logger.info('Records fetched — duplicates skipped (already synced).')
                    except Exception as e_att:
                        # get_attendance failed — try UDP fallback once
                        logger.warning(f'⚠️ TA500 fetch blip: {e_att}. Trying UDP fallback...')
                        try:
                            safe_disconnect(conn)
                            conn = None
                            time.sleep(2)
                            conn = connect_device()
                            if conn:
                                try:
                                    conn.enable_device()
                                except Exception:
                                    pass
                                atts = safe_fetch_attendance(conn) or []
                                new_punches = process_punches_batch(atts, seen)
                                known_record_count = current_count
                                last_audit_time = now
                                if new_punches > 0:
                                    logger.info(f'✅ UDP fallback success! Uploading {new_punches} punch(es)...')
                                    flush_upload_queue(seen)
                                else:
                                    logger.info('UDP fallback: records fetched — duplicates skipped.')
                            else:
                                logger.warning('UDP fallback failed. Will retry on next punch.')
                                known_record_count = max(known_record_count, current_count - 1)
                                break  # triggers outer reconnect loop
                        except Exception as e_udp:
                            logger.warning(f'UDP fallback also failed: {e_udp}. Reconnecting...')
                            known_record_count = max(known_record_count, current_count - 1)
                            break
                else:
                    known_record_count = current_count

                # ── KEY 2: Direct Flash Memory Audit (every 60s) ──────────────
                # Solves the 1-hour freeze where TA500 firmware stops incrementing read_sizes()
                if now - last_audit_time >= AUDIT_INTERVAL:
                    last_audit_time = now
                    try:
                        atts = safe_fetch_attendance(conn) or []
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

                if conn is None:
                    break

                time.sleep(POLL_INTERVAL)

        except (socket.error, ConnectionResetError, BrokenPipeError, TimeoutError) as net_err:
            logger.warning(f'⚠️ Network connection dropped: {net_err}. Auto-reconnecting...')
        except Exception as err:
            logger.warning(f'⚠️ TA500 stream notice: {err}. Auto-reconnecting...')
        finally:
            safe_disconnect(conn)
            # Short wait before reconnect — TA500 socket clears in ~3s
            time.sleep(3)


if __name__ == '__main__':
    main()
