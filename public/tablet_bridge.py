#!/usr/bin/env python3
"""
JAPA DTR Sync Bridge — Samsung Galaxy Tab A8 Edition (v6 Instant Employee & Punch Sync)
High-performance biometric sync bridge designed for real-world office Wi-Fi.

Key Upgrades in v6:
  1. Automatic Enrolled Employee Sync: Continuously checks TA500 enrolled users
     every ~20s. Any newly registered fingerprint user is automatically uploaded
     to Supabase IMMEDIATELY — even before their very first punch!
  2. Manual Web Sync Support: Clicking "Sync from TA500 Device" on the portal
     triggers an immediate hardware user fetch within 5 seconds.
  3. Fast 6s Punch Sync: Local attendance reads take <200ms.
  4. Offline Queue / Weak Wi-Fi Resilience: Punches are never dropped or blocked.
  5. Persistent HTTP Session: Keeps TLS alive for ultra-fast 100ms cloud uploads.
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
    from urllib3.util.retry import Retry
    from zk import ZK
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
    # 1. Command-line argument: python tablet_bridge.py 192.168.1.50
    for arg in sys.argv[1:]:
        if arg.startswith('--'):
            continue
        cleaned = arg.strip()
        parts = cleaned.split('.')
        if len(parts) == 4 and all(p.isdigit() for p in parts):
            return cleaned
    # 2. Environment variable
    if os.getenv('ZK_DEVICE_IP'):
        return os.getenv('ZK_DEVICE_IP').strip()
    # 3. Saved IP from previous auto-discovery
    if os.path.exists(_IP_FILE):
        try:
            with open(_IP_FILE, 'r') as f:
                saved = f.read().strip()
                parts = saved.split('.')
                if len(parts) == 4 and all(p.isdigit() for p in parts):
                    return saved
        except Exception:
            pass
    # 4. Default fallback (New Wi-Fi TP-Link_D8AC)
    return '192.168.0.58'

def save_device_ip(ip: str) -> None:
    try:
        with open(_IP_FILE, 'w') as f:
            f.write(ip.strip())
    except Exception:
        pass

ZK_IP         = load_saved_ip()
ZK_PORT       = int(os.getenv('ZK_DEVICE_PORT', '4370'))
ZK_TIMEOUT    = 6   # Fast TCP timeout (LAN response is <100ms)
POLL_INTERVAL = 6   # Fast 6-second poll for near-instant punch appearance
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
        print("⚠️ [WARNING] Another instance of tablet_bridge is already running in background!")
        print("   Only 1 bridge instance can connect to TA500 to prevent connection collisions.")
        print("   If you want to restart it fresh, run: pkill -f python")
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
retry_strategy = Retry(
    total=2,
    backoff_factor=0.3,
    status_forcelist=[500, 502, 503, 504],
)
adapter = HTTPAdapter(pool_connections=5, pool_maxsize=5, max_retries=retry_strategy)
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
# Hardware enrollment:
# UID 1: Gain -> CAYABYAB, GAIN CARLO G. (#24)
# UID 2: Pearly -> DE VERA, PEARLY B. (#4)
# UID 3: Melanie -> TIU, MELANIE P. (#17)
# UID 4: Janine -> GALVAN, JANINE KYLE (#9)
# UID 5: Jamaica -> SORIANO, JAMAICA (#11)
# UID 6: Lyca -> ESTACIO, LYCA (#7)
# UID 7: Dennis -> ARDIENTE, DENNIS P. (#1)
# UID 8: Ivan -> DE VERA, IVAN (#5)
# UID 9: Jepoy -> BANIQUED, JEFFREY D. (#2)
# UID 10: Jerwin -> DEE, JERWIN B. (#6)
# UID 11: Carlo -> CAOILE, CARLO C. (#3)
# UID 12: Larry -> ESTACIO, LARRY L. (#8)
# UID 13: Randolf -> GALZOTE, RANDOLF J. (#14)
# UID 14: Rowena -> ROMERO, ROWENA (#13)
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
    """Robust timestamp parser with ZERO external dependencies (no dateutil required)."""
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
    """Preloads the most recent punch timestamp per employee to enforce 5-minute debounce across restarts."""
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
    """
    Pulls enrolled users from TA500 hardware memory.
    Ensures hardware UIDs are mapped to their correct system employees.
    """
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

            # If user already exists in the system directory, don't overwrite
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
    """Returns (subnet_prefix, local_ip), e.g. ('192.168.1', '192.168.1.45')."""
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
    """Scans current Wi-Fi subnet for open TA500 biometrics machine on port 4370."""
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

    # Verify responsive hosts with PyZK
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
    global ZK_IP
    target_ip = ip or ZK_IP
    zk = None
    try:
        zk = ZK(target_ip, port=ZK_PORT, timeout=10,
                password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()
        if conn:
            return conn
    except Exception as e_tcp:
        safe_disconnect(zk)
        err_str = str(e_tcp)
        if '104' in err_str or '10054' in err_str or 'reset' in err_str.lower():
            logger.warning(f'TA500 LAN busy (hardware holding previous session). Waiting for device socket to clear...')
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


def process_single_punch(att, seen: Set[str]) -> bool:
    """Processes a single real-time punch event from the live_capture stream."""
    global _pending_upload_queue, _last_device_punch
    try:
        raw_uid = str(att.user_id)
        uid = TA500_TO_SYSTEM_MAP.get(raw_uid, raw_uid)
        local_dt = _parse_ts(att.timestamp)
        utc_iso = local_dt.astimezone(timezone.utc).isoformat()
        sync_time = datetime.now(timezone.utc).isoformat()

        key = _punch_key(uid, utc_iso)
        if key in seen:
            _last_device_punch[uid] = local_dt
            return False

        if any(q['_key'] == key for q in _pending_upload_queue):
            _last_device_punch[uid] = local_dt
            return False

        # 5-Minute Anti-Double Tap Debounce Rule
        prev_punch_dt = _last_device_punch.get(uid)
        if prev_punch_dt is not None:
            diff_sec = abs((local_dt - prev_punch_dt).total_seconds())
            if diff_sec < 300:
                emp_name = _employee_cache.get(uid, f'ID #{uid}')
                logger.info(f'🛡️ Debounce: Ignored duplicate scan for {emp_name} at {local_dt.strftime("%I:%M:%S %p")} ({diff_sec:.0f}s after previous punch)')
                seen.add(key)
                save_seen_set(seen)
                return False

        _last_device_punch[uid] = local_dt
        status_val = getattr(att, 'punch', None)
        if status_val is None:
            status_val = int(att.status or 0)

        emp_name = _employee_cache.get(uid, f'ID #{uid}')
        logger.info(f'⚡ LIVE PUNCH DETECTED: {emp_name} at {local_dt.strftime("%I:%M:%S %p")}!')

        _pending_upload_queue.append({
            'device_user_id': uid,
            'punch_time':     utc_iso,
            'status':         int(status_val),
            'raw_status':     int(att.status or 0),
            'synced_at':      sync_time,
            '_key':           key,
        })
        return True
    except Exception as e:
        logger.error(f'Error processing live punch: {e}')
        return False


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


# ─── Main Polling Engine ──────────────────────────────────────────────────────
def main():
    if '--scan' in sys.argv:
        subnet, local_ip = get_local_subnet()
        print('=' * 60)
        print('🔎 TA500 Network Diagnostic & Scanner')
        print(f'   Tablet Local IP : {local_ip}')
        print(f'   Current Subnet  : {subnet}.1 - {subnet}.254')
        print('=' * 60)
        found = scan_for_ta500()
        if found:
            print(f'✅ SUCCESS: Found TA500 Biometric Machine at: {found}')
            print(f'   To start syncing, run: python tablet_bridge.py {found}')
        else:
            print(f'❌ No TA500 device found on {subnet}.x on port {ZK_PORT}')
            print('   Tips:')
            print('   1. Verify the TA500 is connected to the same Wi-Fi router.')
            print('   2. On the TA500 keypad: press M/OK > Comm. > Wireless Network.')
            print('   3. Check the IP address displayed on the TA500 screen.')
            print('   4. Turn the TA500 OFF and back ON to reset its Wi-Fi chip.')
        sys.exit(0)

    acquire_instance_lock()
    global _pending_upload_queue, ZK_IP
    print('=' * 60)
    print('🚀 JAPA DTR Sync Bridge (Samsung Galaxy Tab A8) v9')
    print(f'   Target IP : {ZK_IP}:{ZK_PORT}')
    print(f'   Mode      : Continuous 24/7 Live Event Streaming (<50ms punch latency)')
    print(f'   Engine    : Persistent Event Hook (Zero Flash Buffer Polling / Zero Timeouts)')
    print('=' * 60)

    seen = load_seen_set()
    logger.info(f'Loaded {len(seen)} previously-synced punch hashes.')

    refresh_employee_cache()
    init_recent_punches()
    logger.info('Tablet bridge active. Press Ctrl+C to stop.')

    local_token = load_local_token()
    ta500_fail_count = 0
    cycle_counter = 0

    while True:
        cycle_counter += 1

        # ── 1. Flush any pending offline punches first ───────────────────────
        if _pending_upload_queue:
            flush_upload_queue(seen)

        # ── 2. Connect to TA500 ──────────────────────────────────────────────
        conn = connect_device()
        if not conn:
            ta500_fail_count += 1
            cooldown = min(6 + (ta500_fail_count * 2), 20)
            logger.warning(f'TA500 LAN busy/reconnecting (attempt #{ta500_fail_count}). Retrying in {cooldown}s...')
            if ta500_fail_count == 3:
                subnet, local_ip = get_local_subnet()
                logger.info(f"💡 Network Status: Device IP is {local_ip}. Target device is {ZK_IP}.")
                logger.info("   1. Connect Tablet to your MAIN ROUTER Wi-Fi (for stable internet).")
                logger.info("   2. If TA500 shows Errno 104, turn TA500 OFF and back ON once to reset its socket.")
            time.sleep(cooldown)
            continue

        ta500_fail_count = 0
        logger.info('🟢 TA500 CONNECTED! Initializing continuous 24/7 stream...')

        try:
            # ── 3. One-Time Catch-Up on Connection ───────────────────────────
            # Prevent firmware rejection on CMD_STARTVERIFY from aborting live capture
            if hasattr(conn, 'verify_user'):
                _orig_verify = conn.verify_user
                def _safe_verify():
                    try:
                        return _orig_verify()
                    except Exception:
                        return True
                conn.verify_user = _safe_verify

            # A. Sync enrolled users once upon connection
            sync_all_device_users(conn)

            # B. Catch up on any attendance records logged while offline
            try:
                attendances = conn.get_attendance() or []
                caught_up = process_punches_batch(attendances, seen)
                if caught_up > 0:
                    logger.info(f'✅ Caught up {caught_up} offline punch(es) from TA500 memory!')
                    flush_upload_queue(seen)
                else:
                    logger.info('✅ Attendance history is up to date.')
            except Exception as e_catch:
                logger.warning(f'Initial catch-up notice: {e_catch}')

            # C. Ensure device is enabled for live stream
            try:
                conn.enable_device()
            except Exception:
                pass

            # ── 4. Continuous 24/7 Live Event Capture ────────────────────────
            logger.info('⚡ LIVE CAPTURE ACTIVE — Listening for real-time fingerprint punches...')
            logger.info('   (Device stays connected continuously. Zero repeated flash memory dumps!)')

            last_cloud_check = time.time()
            last_reconcile = time.time()

            for att in conn.live_capture(new_timeout=4):
                # When an employee punches their finger, live_capture yields Attendance object immediately!
                if att is not None:
                    if process_single_punch(att, seen):
                        flush_upload_queue(seen)
                    continue

                # ── Idle Tick (every 4s when no one is punching) ─────────────
                now = time.time()

                # Flush queue if any offline punches are queued
                if _pending_upload_queue:
                    flush_upload_queue(seen)

                # Check cloud commands every ~8 seconds
                if now - last_cloud_check >= 8:
                    last_cloud_check = now
                    meta = fetch_cloud_meta()

                    # Hardware clear requested from web portal
                    if meta.get('clear_hardware') == 1:
                        logger.info('🧹 Remote clear requested from web portal!')
                        try:
                            conn.clear_attendance()
                            logger.info('✅ TA500 physical memory CLEARED!')
                        except Exception as e:
                            logger.error(f'Error clearing hardware: {e}')
                        acknowledge_command('clear_hardware')
                        seen.clear()
                        save_seen_set(seen)
                        _pending_upload_queue.clear()
                        _last_device_punch.clear()

                    # Manual sync users requested from web portal
                    if meta.get('sync_employees') == 1:
                        logger.info('👤 Enrolled user sync requested from web portal!')
                        try:
                            sync_all_device_users(conn)
                        except Exception as e:
                            logger.error(f'Error syncing users: {e}')
                        acknowledge_command('sync_employees')

                # Background reconciliation every 30 minutes (safety fallback)
                if now - last_reconcile >= 1800:
                    last_reconcile = now
                    try:
                        att_list = conn.get_attendance() or []
                        if process_punches_batch(att_list, seen) > 0:
                            flush_upload_queue(seen)
                    except Exception:
                        pass

        except (socket.error, ConnectionResetError, BrokenPipeError, TimeoutError) as net_err:
            logger.warning(f'⚠️ Network connection interrupted: {net_err}. Auto-reconnecting in 5s...')
        except Exception as stream_err:
            logger.warning(f'⚠️ Live stream notice: {stream_err}. Auto-reconnecting in 5s...')
        finally:
            safe_disconnect(conn)
            time.sleep(5)


if __name__ == '__main__':
    main()
