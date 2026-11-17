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
    # 4. Default fallback
    return '192.168.68.146'

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

_employee_cache: Dict[str, str] = {}
_pending_upload_queue: List[Dict[str, Any]] = []


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


def sync_all_device_users(conn) -> int:
    """
    Pulls all enrolled users from TA500 hardware memory.
    If any newly enrolled employee is found, pushes them to Supabase employees table.
    """
    global _employee_cache
    try:
        users = conn.get_users()
        if not users:
            return 0

        new_or_updated = []
        for u in users:
            uid = str(u.user_id)
            raw_name = (u.name or '').strip()
            name = raw_name if raw_name else f'NN-{uid}'

            # Check if this is a newly enrolled user or if their name was updated on device
            if uid not in _employee_cache:
                new_or_updated.append({
                    'device_user_id': uid,
                    'full_name': name,
                    'branch': 'Dagupan Main',
                })
            elif _employee_cache[uid].startswith('NN-') and not name.startswith('NN-'):
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
    # Strategy 1: Standard TCP connection
    try:
        zk = ZK(target_ip, port=ZK_PORT, timeout=ZK_TIMEOUT,
                password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()
        if conn:
            return conn
    except Exception as e_tcp:
        # Strategy 2: UDP Fallback (solves Errno 104 Connection reset by peer)
        try:
            zk_udp = ZK(target_ip, port=ZK_PORT, timeout=ZK_TIMEOUT,
                        password=0, force_udp=True, ommit_ping=True)
            conn_udp = zk_udp.connect()
            if conn_udp:
                logger.info(f"TA500 connected via UDP mode ({target_ip}) ✅")
                return conn_udp
        except Exception:
            pass
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
        res = session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(3, 5))
        if res.status_code in (200, 201):
            for r in _pending_upload_queue:
                seen.add(r['_key'])
            save_seen_set(seen)

            latest_uid = _pending_upload_queue[-1]['device_user_id']
            emp_name = _employee_cache.get(latest_uid, f'ID #{latest_uid}')
            logger.info(f'✅ SYNCED: {len(_pending_upload_queue)} new punch(es) to cloud! (Latest: {emp_name})')
            _pending_upload_queue.clear()
            return True
        else:
            logger.warning(f'Supabase returned HTTP {res.status_code} — kept in queue')
    except Exception as e:
        logger.warning(f'Slow Wi-Fi: upload queued ({len(_pending_upload_queue)} punch(es)). Retrying next cycle...')

    return False


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
    print('🚀 JAPA DTR Sync Bridge (Samsung Galaxy Tab A8) v8')
    print(f'   Target IP : {ZK_IP}:{ZK_PORT}')
    print(f'   Poll Rate : Fast 6s (Instant Punch + Enrolled Employee Sync)')
    print(f'   Features  : Auto-Discovery, UDP Fallback, Dynamic Network Support')
    print('=' * 60)

    seen = load_seen_set()
    logger.info(f'Loaded {len(seen)} previously-synced punch hashes.')

    refresh_employee_cache()
    logger.info('Tablet bridge active. Press Ctrl+C to stop.')

    local_token = load_local_token()
    ta500_fail_count = 0
    cycle_counter = 0

    while True:
        cycle_counter += 1

        # ── 1. Check cloud meta commands ─────────────────────────────────────
        meta = fetch_cloud_meta()
        manual_emp_sync = meta.get('sync_employees') == 1

        # Hardware clear requested from web portal
        if meta.get('clear_hardware') == 1:
            logger.info('🧹 Remote clear requested from web portal!')
            conn = connect_device()
            if conn:
                try:
                    conn.clear_attendance()
                    logger.info('✅ TA500 physical hardware memory CLEARED!')
                except Exception as e:
                    logger.error(f'Error clearing hardware: {e}')
                finally:
                    safe_disconnect(conn)
            acknowledge_command('clear_hardware')
            seen.clear()
            save_seen_set(seen)
            _pending_upload_queue.clear()
            logger.info('✅ Local cache & queue reset. Ready for fresh punches!')
            time.sleep(POLL_INTERVAL)
            continue

        # Clear token changed
        remote_token = meta.get('clear_token', local_token)
        if remote_token != local_token:
            logger.info(f'Cloud clear detected (token {local_token} -> {remote_token}). Resetting local cache.')
            seen.clear()
            save_seen_set(seen)
            _pending_upload_queue.clear()
            local_token = remote_token
            save_local_token(local_token)

        # ── 2. Flush any pending offline punches first ───────────────────────
        if _pending_upload_queue:
            flush_upload_queue(seen)

        # ── 3. Quick read from TA500 (LAN only, <200ms) ──────────────────────
        conn = connect_device()
        if not conn:
            ta500_fail_count += 1
            # Auto-probe network on attempt 2, 5, 12, 25
            if ta500_fail_count in (2, 5, 12, 25):
                logger.info("🔍 Probing local Wi-Fi for TA500 biometric machine...")
                discovered = scan_for_ta500()
                if discovered and discovered != ZK_IP:
                    logger.info(f"🔄 Switched bridge target IP to newly discovered: {discovered}")
                    ZK_IP = discovered
                    save_device_ip(discovered)
                    ta500_fail_count = 0
                    continue

            cooldown = min(5 * ta500_fail_count, 15)
            logger.warning(f'TA500 LAN busy/unreachable (attempt #{ta500_fail_count}). Retrying in {cooldown}s...')
            if ta500_fail_count == 3:
                subnet, local_ip = get_local_subnet()
                logger.info(f"💡 Tip: Tablet IP is {local_ip}. Bridge is querying {ZK_IP}.")
                logger.info("   1. Verify TA500 is connected to the same Wi-Fi router.")
                logger.info("   2. Check TA500 screen: Menu > Comm. > Wireless Network > IP Address.")
                logger.info("   3. Restart TA500 (turn off/on) to clear hung sockets.")
                logger.info("   4. You can also specify IP directly: python tablet_bridge.py <NEW_TA500_IP>")
            time.sleep(cooldown)
            continue

        if ta500_fail_count > 0:
            logger.info('TA500 LAN connection restored ✅')
            ta500_fail_count = 0

        new_punches_found = 0
        try:
            # ── Check for new enrolled employees (Periodic every ~18s OR on-demand) ──
            should_sync_users = manual_emp_sync or (cycle_counter % 3 == 0)
            if should_sync_users:
                sync_all_device_users(conn)
                if manual_emp_sync:
                    acknowledge_command('sync_employees')

            # ── Check punches ──
            attendances = conn.get_attendance() or []

            # Check if any punch has an unknown user ID not in cache
            unknown_uids = {str(a.user_id) for a in attendances
                            if str(a.user_id) not in _employee_cache}
            if unknown_uids and not should_sync_users:
                sync_all_device_users(conn)

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

                if any(q['_key'] == key for q in _pending_upload_queue):
                    continue

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
                new_punches_found += 1

        except Exception as e:
            logger.warning(f'TA500 read notice: {e}')
        finally:
            safe_disconnect(conn)

        # ── 4. If new punches found, push to cloud immediately ───────────────
        if new_punches_found > 0:
            logger.info(f'Detected {new_punches_found} new punch(es) on TA500! Uploading...')
            flush_upload_queue(seen)

        time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    main()
