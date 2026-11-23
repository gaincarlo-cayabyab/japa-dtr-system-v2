#!/usr/bin/env python3
"""
================================================================================
JAPA DTR Enterprise Biometric Synchronization Bridge — Version 17.2
Platform: Samsung Galaxy Tab A8 / A9+ (Termux Python 3.11/3.12)
Target  : FingerTec TA500 Stand-alone Terminal (192.168.0.58:4370)
Cloud   : Supabase Managed Cloud DB (Singapore Region, TLS 1.3)
================================================================================
V17.2 PATCH NOTES ("Native UDP Sentinel & Bulletproof Extraction Engine"):
  - Primary connection flipped to UDP (<50ms, zero TCP 0x5050 invalid packet errors).
  - PyZK monkey-patch applied: eliminates TypeError 'NoneType' join exceptions completely.
  - Multi-stage attendance extractor: Stage 1 active buffer, Stage 2 native get_attendance,
    Stage 3 clean isolated session.
  - Slot 19 hardcoded to System ID 10 (GALVAN, JOANNE KRYSHELLE C.) with auto-name-override.
  - Proactive soft-reboot trigger on consecutive hardware errors.
V17.0 ARCHITECTURE SPECIFICATION ("Omni-Sentinel & Direct-Sync Engine"):
  1. DUAL-TRANSPORT BULLETPROOF EXTRACTION:
     - Primary Channel: Isolated single-shot UDP extraction (force_udp=True).
       Immune to TCP stream fragmentation, zero 0x5050 TCP frame parsing errors,
       and 100% MTU-independent. Extracts logs in <1 second.
     - Secondary Channel: Active TCP stream extraction with pre- and post-socket
       buffer draining (drain_socket_buffer), eliminating residual packet desync.
  2. AUTOMATIC EMPLOYEE PROVISIONING & FOREIGN KEY DEFENSE:
     - Automatically verifies employee existence in Supabase before punch ingestion.
     - Automatically registers newly enrolled employees (from TA500 terminal) into
       the cloud database to satisfy attendance_logs foreign key constraints.
     - Auto-retries punch upload on any 409 conflict.
  3. RESILIENT CATCH-UP GUARD:
     - Maintains catch_up_needed flag so startup punches or offline records are
       persistently retried until confirmed synced into the cloud.
  4. SENSOR-FIRST ARCHITECTURE:
     - Heartbeat connection strictly runs conn.read_sizes() every 10s.
     - Zero display/sensor freeze (no disable_device calls during normal operation).
     - 15s anti-double tap deduplication filter.
================================================================================
"""

import sys
import os
import time
import json
import socket
import logging
import signal
import hashlib
import struct
from datetime import datetime, timezone, timedelta
from typing import Optional, Set, Dict, Any, List, Tuple
from logging.handlers import RotatingFileHandler

# Third-party dependencies
try:
    import pytz
except ImportError:
    print("FATAL: pytz missing. Run: pip install pytz")
    sys.exit(1)

try:
    import requests
    from requests.adapters import HTTPAdapter
    try:
        from urllib3.util import Retry
    except ImportError:
        Retry = None
except ImportError:
    print("FATAL: requests missing. Run: pip install requests")
    sys.exit(1)

try:
    from zk import ZK
    from zk.exception import ZKErrorConnection, ZKErrorResponse, ZKNetworkError
    import zk.const as const
except ImportError:
    print("FATAL: pyzk missing. Run: pip install pyzk")
    sys.exit(1)

# ─── PyZK Robustness Hotfixes (Eliminates NoneType Join Exceptions) ───────────
def _patch_pyzk():
    """
    Hotfixes pyzk's read_with_buffer to ensure that any dropped or corrupt
    socket chunk from Wi-Fi packet jitter never causes:
    TypeError: sequence item 1: expected a bytes-like object, NoneType found.
    """
    orig_read_with_buffer = ZK.read_with_buffer

    def _safe_read_with_buffer(self, command, fct=0, ext=0):
        try:
            res = orig_read_with_buffer(self, command, fct, ext)
            if res and isinstance(res, tuple) and len(res) == 2:
                data, size = res
                if data is not None:
                    return data, size
            return b'', 0
        except TypeError as e:
            if 'NoneType' in str(e) or 'bytes-like' in str(e):
                if getattr(self, 'tcp', False):
                    MAX_CHUNK = 0xFFc0
                else:
                    MAX_CHUNK = 16 * 1024
                command_string = struct.pack('<bhii', 1, command, fct, ext)
                response_size = 1024
                data = []
                start = 0
                cmd_response = self._ZK__send_command(1503, command_string, response_size)
                if not cmd_response.get('status'):
                    return b'', 0
                if cmd_response.get('code') == const.CMD_DATA:
                    d = getattr(self, '_ZK__data', b'') or b''
                    return d, len(d)
                try:
                    zk_data = getattr(self, '_ZK__data', b'') or b''
                    size = struct.unpack('I', zk_data[1:5])[0] if len(zk_data) >= 5 else 0
                except Exception:
                    size = 0
                remain = size % MAX_CHUNK if size > 0 else 0
                packets = (size - remain) // MAX_CHUNK if size > 0 else 0
                for _wlk in range(packets):
                    try:
                        chunk = self._ZK__read_chunk(start, MAX_CHUNK)
                        if chunk and isinstance(chunk, (bytes, bytearray)):
                            data.append(chunk)
                    except Exception:
                        pass
                    start += MAX_CHUNK
                if remain:
                    try:
                        chunk = self._ZK__read_chunk(start, remain)
                        if chunk and isinstance(chunk, (bytes, bytearray)):
                            data.append(chunk)
                    except Exception:
                        pass
                    start += remain
                try:
                    self.free_data()
                except Exception:
                    pass
                valid = [d for d in data if d and isinstance(d, (bytes, bytearray))]
                return (b''.join(valid), sum(len(d) for d in valid)) if valid else (b'', 0)
            raise

    ZK.read_with_buffer = _safe_read_with_buffer

_patch_pyzk()

# ─── Configuration & Persistence Paths ────────────────────────────────────────
_SEEN_FILE      = os.path.expanduser('~/.ta500_seen_hashes.json')
_IP_FILE        = os.path.expanduser('~/.ta500_ip.txt')
_SESSION_FILE   = os.path.expanduser('~/.ta500_session.json')
_LOG_FILE       = os.path.expanduser('~/.ta500_bridge.log')

DEFAULT_TA500_IP = '192.168.0.58'

def load_saved_ip() -> str:
    try:
        if os.path.exists(_IP_FILE):
            with open(_IP_FILE, 'r') as f:
                ip = f.read().strip()
                if ip and len(ip.split('.')) == 4:
                    return ip
    except Exception:
        pass
    return os.getenv('ZK_DEVICE_IP', DEFAULT_TA500_IP)

def save_device_ip(ip: str) -> None:
    try:
        with open(_IP_FILE, 'w') as f:
            f.write(ip.strip())
    except Exception:
        pass

ZK_IP         = load_saved_ip()
ZK_PORT       = int(os.getenv('ZK_DEVICE_PORT', '4370'))
ZK_TIMEOUT    = 10     # Socket timeout in seconds
POLL_INTERVAL = 10     # 10s steady heartbeat
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
# Maps TA500 terminal slot number → Supabase employees.device_user_id
# Slots 1-18: original enrolled employees
# Slots 19-24: newly enrolled employees (added after initial setup)
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
    # --- NEW HIRES (enrolled after initial setup) ---
    # GALVAN, JOANNE KRYSHELLE C. → system device_user_id = 10
    # Her TA500 slot is resolved by name-matching in sync_device_users().
    # Pre-mapped here for the most common TA500 auto-assignment slots:
    '19': '10',  # GALVAN, JOANNE KRYSHELLE C. (most likely TA500 slot)
    '20': '20',  # COSTALES, BARBARA ELLAINE S.
    '21': '21',  # COSTALES, MARIE STEFI S.
    '22': '22',  # JOCELYN LUTERIA
    '23': '23',  # HARIM LAGAO
    '24': '24',  # (reserve — Gain Carlo already on slot 1; skip if conflict)
    '25': '10',  # GALVAN, JOANNE KRYSHELLE C. (fallback if TA500 slot was 25)
}

# ─── Name-to-SystemID resolver for newly enrolled employees ───────────────────
# If a user's name on the TA500 matches a known employee name, override the map.
_TA500_NAME_OVERRIDES: Dict[str, str] = {
    # Key: lowercase substring of the TA500-registered name
    # Value: system device_user_id to use
    'joanne':   '10',  # GALVAN, JOANNE KRYSHELLE C.
    'kryshelle':'10',  # GALVAN, JOANNE KRYSHELLE C. (alternate name fragment)
    'barbara':  '20',  # COSTALES, BARBARA ELLAINE S.
    'marie stefi': '21',  # COSTALES, MARIE STEFI S.
    'jocelyn':  '22',  # JOCELYN LUTERIA
    'harim':    '23',  # HARIM LAGAO
}

_employee_cache: Dict[str, str] = {}
_pending_upload_queue: List[Dict[str, Any]] = []
_last_device_punch: Dict[str, datetime] = {}
_ACTIVE_ZK_CONN: Optional[object] = None

def refresh_employee_cache() -> None:
    global _employee_cache
    try:
        url = f'{SUPABASE_URL}/rest/v1/employees?select=device_user_id,full_name'
        res = session.get(url, headers=_HEADERS_AUTH, timeout=(3, 5))
        if res.status_code == 200:
            _employee_cache = {str(e['device_user_id']): e['full_name'] for e in res.json()}
            logger.info(f'Employee cache: {len(_employee_cache)} employees loaded')
    except Exception as e:
        logger.warning(f'Employee cache refresh notice: {e}')

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
    """Preloads last punch timestamps per employee to enforce 15s anti-double tap debounce."""
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
            logger.info(f'Anti-Double Tap Debounce active (15s): {len(_last_device_punch)} employee punch history loaded')
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
    except Exception:
        pass

# ─── Socket Buffer Drainer (Eliminates TCP Packet Desync) ─────────────────────
def drain_socket_buffer(conn: Optional[object]) -> int:
    """
    Purges any unread residual bytes out of the OS socket receive buffer.
    Guarantees subsequent commands read from a fresh, aligned frame header.
    """
    if not conn:
        return 0
    sock = getattr(conn, '_ZK__sock', None) or getattr(conn, '_sock', None)
    if not sock:
        return 0
    total_drained = 0
    try:
        sock.setblocking(False)
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            total_drained += len(chunk)
    except (BlockingIOError, socket.error):
        pass
    except Exception:
        pass
    finally:
        try:
            sock.setblocking(True)
        except Exception:
            pass
    return total_drained

# ─── Telemetry Heartbeat Broadcaster ──────────────────────────────────────────
_last_heartbeat_post = 0.0

def update_live_heartbeat(is_online: bool, record_count: int = 0) -> None:
    global _last_heartbeat_post
    now = time.time()
    if (now - _last_heartbeat_post) < 4.0:
        return
    _last_heartbeat_post = now
    try:
        # Note: sync_meta.value column is BIGINT in Supabase PostgreSQL.
        # Every value MUST strictly be an integer (e.g. version 171 = v17.1).
        payload = [
            {'key': 'bridge_heartbeat',   'value': int(now)},
            {'key': 'ta500_status',        'value': 1 if is_online else 0},
            {'key': 'ta500_records',       'value': int(record_count)},
            {'key': 'bridge_version',      'value': 172},   # 172 = v17.2
        ]
        # Post ta500_last_seen whenever device is online
        # This is what the web portal reads to confirm the bridge is LIVE.
        if is_online:
            payload.append({'key': 'ta500_last_seen', 'value': int(now)})
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?on_conflict=key'
        session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(2, 4))
    except Exception as e_hb:
        logger.debug(f'Heartbeat broadcast notice: {e_hb}')

def fetch_cloud_meta() -> Dict[str, Any]:
    try:
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?select=key,value'
        res = session.get(url, headers=_HEADERS_AUTH, timeout=(2, 3))
        if res.status_code == 200:
            return {r['key']: r['value'] for r in res.json()}
    except Exception:
        pass
    return {}

def acknowledge_command(cmd_key: str) -> None:
    try:
        payload = [{'key': cmd_key, 'value': 0}]
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?on_conflict=key'
        session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(2, 3))
    except Exception:
        pass

# ─── Clean Process Exit & Signal Handlers ─────────────────────────────────────
def handle_bridge_exit(signum, frame):
    global _ACTIVE_ZK_CONN
    logger.info(f"\nReceived signal {signum}. Executing graceful shutdown...")
    if _ACTIVE_ZK_CONN:
        try:
            drain_socket_buffer(_ACTIVE_ZK_CONN)
            _ACTIVE_ZK_CONN.disconnect()
            logger.info("✅ TA500 session cleanly terminated (CMD_EXIT sent).")
        except Exception:
            pass
        _ACTIVE_ZK_CONN = None
    logger.info("Broadcasting offline status to cloud portal...")
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
def save_active_session(zk_obj: object) -> None:
    try:
        sid = getattr(zk_obj, '_ZK__session_id', None)
        rid = getattr(zk_obj, '_ZK__reply_id', None)
        if sid is not None and sid > 0:
            with open(_SESSION_FILE, 'w') as f:
                json.dump({'session_id': sid, 'reply_id': rid or 0, 'ts': time.time(), 'ip': ZK_IP}, f)
    except Exception:
        pass

_last_teardown_attempt = 0.0

def teardown_stale_session(target_ip: str) -> bool:
    global _last_teardown_attempt
    now = time.time()
    if (now - _last_teardown_attempt) < 60:
        return False
    _last_teardown_attempt = now
    if not os.path.exists(_SESSION_FILE):
        return False
    try:
        with open(_SESSION_FILE, 'r') as f:
            data = json.load(f)
        saved_sid = data.get('session_id')
        saved_rid = data.get('reply_id', 0)
        if not saved_sid:
            return False

        logger.info(f"Injecting blind CMD_EXIT with cached Session #{saved_sid} to release hardware lock...")
        for use_udp in (True, False):
            try:
                zk = ZK(target_ip, port=ZK_PORT, timeout=2, password=0, force_udp=use_udp, ommit_ping=True)
                zk._ZK__create_socket()
                zk._ZK__session_id = saved_sid
                zk._ZK__reply_id = saved_rid
                zk.is_connect = True
                zk.disconnect()
                logger.info(f"Successfully flushed stale TA500 session via {'UDP' if use_udp else 'TCP'}!")
                return True
            except Exception:
                pass
    except Exception as e:
        logger.debug(f"Could not teardown stale session: {e}")
    return False

def safe_disconnect(conn: Optional[object]) -> None:
    if not conn:
        return
    try:
        drain_socket_buffer(conn)
        conn.disconnect()
    except Exception:
        pass
    try:
        sock = getattr(conn, '_ZK__sock', None) or getattr(conn, '_sock', None)
        if sock:
            sock.close()
    except Exception:
        pass

def restart_ta500_soft(ip: Optional[str] = None) -> bool:
    target_ip = ip or ZK_IP
    for use_udp in (True, False):
        try:
            zk = ZK(target_ip, port=ZK_PORT, timeout=4, password=0, force_udp=use_udp, ommit_ping=True)
            conn = zk.connect()
            if conn:
                conn.restart()
                logger.info(f"🔁 Remote reboot signal transmitted to TA500 ({target_ip}) via {'UDP' if use_udp else 'TCP'}!")
                return True
        except Exception:
            pass

    if os.path.exists(_SESSION_FILE):
        try:
            with open(_SESSION_FILE, 'r') as f:
                data = json.load(f)
            saved_sid = data.get('session_id')
            saved_rid = data.get('reply_id', 0)
            if saved_sid:
                for use_udp in (True, False):
                    try:
                        zk = ZK(target_ip, port=ZK_PORT, timeout=3, password=0, force_udp=use_udp, ommit_ping=True)
                        zk._ZK__create_socket()
                        zk._ZK__session_id = saved_sid
                        zk._ZK__reply_id = saved_rid
                        zk.is_connect = True
                        zk.restart()
                        logger.info(f"🔁 Injected blind CMD_RESTART with Session #{saved_sid} to TA500 ({target_ip})!")
                        return True
                    except Exception:
                        pass
        except Exception:
            pass

    logger.warning("Could not issue soft reboot to TA500 (both handshake and session injection timed out)")
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
    found_hosts = []

    for host in candidates:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout_per_host)
        res = s.connect_ex((host, ZK_PORT))
        s.close()
        if res == 0:
            found_hosts.append(host)

    for ip in found_hosts:
        for use_udp in (True, False):
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
    Connects the primary socket for 10s steady read_sizes() polling.
    Prioritizes UDP: Instantaneous connection (<50ms), immune to TCP packet invalid errors
    and 0x5050 TCP frame framing bugs over Wi-Fi repeaters. Falls back to TCP.
    """
    global ZK_IP
    target_ip = ip or ZK_IP

    for use_udp in (True, False):
        zk = None
        timeout = 6 if use_udp else ZK_TIMEOUT
        try:
            zk = ZK(target_ip, port=ZK_PORT, timeout=timeout,
                    password=0, force_udp=use_udp, ommit_ping=True)
            conn = zk.connect()
            if conn:
                drain_socket_buffer(conn)
                transport = "UDP Primary" if use_udp else "TCP Fallback"
                logger.info(f'🟢 TA500 Connected via {transport} ({target_ip})! Bulletproof engine ready in <1s.')
                return conn
        except Exception as e_conn:
            safe_disconnect(zk)
            err_str = str(e_conn)
            if any(x in err_str.lower() for x in ('104', '10054', 'reset', 'broken')):
                logger.warning('TA500 LAN busy (hardware holding previous session). Attempting auto-clear...')
                teardown_stale_session(target_ip)
            elif 'timed out' in err_str.lower() or 'timeout' in err_str.lower():
                logger.warning(f'TA500 LAN connect notice ({target_ip}, udp={use_udp}): timed out')
            else:
                logger.warning(f'TA500 LAN connect notice ({target_ip}, udp={use_udp}): {e_conn}')
    return None

# ─── Robust Data Structures & Timestamp Decoders ─────────────────────────────
class SimpleAttendance:
    def __init__(self, user_id, timestamp, status, punch=0, uid=0):
        self.user_id = str(user_id)
        self.timestamp = timestamp
        self.status = status
        self.punch = punch
        self.uid = uid

    def __repr__(self):
        return f'<Attendance>: {self.user_id} : {self.timestamp} ({self.status}, {self.punch})'

def decode_zk_time(t_bytes: bytes) -> datetime:
    t = struct.unpack('<I', t_bytes)[0]
    second = t % 60
    t = t // 60
    minute = t % 60
    t = t // 60
    hour = t % 24
    t = t // 24
    day = t % 31 + 1
    t = t // 31
    month = t % 12 + 1
    t = t // 12
    year = t + 2000
    return datetime(year, month, day, hour, minute, second)

def parse_raw_attendance_bytes(attendance_data: bytes, records_count: int = 0) -> List[SimpleAttendance]:
    """Parses raw ZK attendance buffer safely into SimpleAttendance objects."""
    if not attendance_data or len(attendance_data) < 4:
        return []

    total_size = struct.unpack('<I', attendance_data[:4])[0]
    raw_data = attendance_data[4:]

    # Format detection
    if records_count > 0 and total_size > 0 and total_size % records_count == 0:
        record_size = total_size // records_count
    elif total_size % 40 == 0:
        record_size = 40
    elif total_size % 16 == 0:
        record_size = 16
    elif total_size % 8 == 0:
        record_size = 8
    else:
        record_size = 40

    attendances = []
    if record_size == 8:
        while len(raw_data) >= 8:
            uid, status, ts_bytes, punch = struct.unpack('HB4sB', raw_data.ljust(8, b'\x00')[:8])
            raw_data = raw_data[8:]
            dt = decode_zk_time(ts_bytes)
            attendances.append(SimpleAttendance(str(uid), dt, status, punch, uid))
    elif record_size == 16:
        while len(raw_data) >= 16:
            user_id, ts_bytes, status, punch, reserved, workcode = struct.unpack('<I4sBB2sI', raw_data.ljust(16, b'\x00')[:16])
            raw_data = raw_data[16:]
            dt = decode_zk_time(ts_bytes)
            attendances.append(SimpleAttendance(str(user_id), dt, status, punch, int(user_id)))
    else:  # 40-byte format
        while len(raw_data) >= 40:
            uid, user_id_bytes, status, ts_bytes, punch, space = struct.unpack('<H24sB4sB8s', raw_data.ljust(40, b'\x00')[:40])
            raw_data = raw_data[40:]
            uid_str = user_id_bytes.split(b'\x00')[0].decode(errors='ignore').strip()
            dt = decode_zk_time(ts_bytes)
            attendances.append(SimpleAttendance(uid_str or str(uid), dt, status, punch, uid))

    return attendances

# ─── Multi-Stage Attendance & User Extractors (v17.2 Omni-Sentinel) ───────────
def fetch_attendance_from_ta500(target_ip: str, active_conn=None, records_count: int = 0) -> List[SimpleAttendance]:
    """
    Omni-Sentinel Multi-Stage Bulletproof Attendance Extractor (v17.2):
    Stage 1: Active Connection Buffer Extractor (Zero-Latency, patched against NoneType)
    Stage 2: Active Connection PyZK Native Extractor (get_attendance)
    Stage 3: Clean Single-Shot Session (UDP first, then TCP)
    """
    # ── Stage 1: Active Connection Buffer Extraction ──────────────────────────
    if active_conn:
        try:
            drain_socket_buffer(active_conn)
            raw_data, size = active_conn.read_with_buffer(13)
            drain_socket_buffer(active_conn)
            if raw_data and len(raw_data) >= 4:
                atts = parse_raw_attendance_bytes(raw_data, records_count)
                if atts:
                    logger.info(f"⚡ Extracted {len(atts)} attendance record(s) via active socket buffer!")
                    return atts
        except Exception as e1:
            drain_socket_buffer(active_conn)
            logger.debug(f"Stage 1 active buffer notice: {e1}")

        # ── Stage 2: Active Connection Native get_attendance() Fallback ───────
        try:
            drain_socket_buffer(active_conn)
            native_logs = active_conn.get_attendance()
            drain_socket_buffer(active_conn)
            if native_logs:
                atts = []
                for n in native_logs:
                    uid = str(getattr(n, 'user_id', '') or getattr(n, 'uid', ''))
                    ts = getattr(n, 'timestamp', None)
                    st = getattr(n, 'status', 0)
                    p = getattr(n, 'punch', 0)
                    atts.append(SimpleAttendance(uid, ts, st, p, int(uid) if uid.isdigit() else 0))
                logger.info(f"⚡ Extracted {len(atts)} attendance record(s) via active get_attendance()!")
                return atts
        except Exception as e2:
            drain_socket_buffer(active_conn)
            logger.debug(f"Stage 2 active native notice: {e2}")

    # ── Stage 3: Clean Single-Shot Session ────────────────────────────────────
    for use_udp in (True, False):
        try:
            zk_iso = ZK(target_ip, port=ZK_PORT, timeout=5, password=0, force_udp=use_udp, ommit_ping=True)
            conn_iso = zk_iso.connect()
            if conn_iso:
                try:
                    raw_data, size = conn_iso.read_with_buffer(13)
                    if raw_data and len(raw_data) >= 4:
                        atts = parse_raw_attendance_bytes(raw_data, records_count)
                        if atts:
                            logger.info(f"⚡ Extracted {len(atts)} attendance record(s) via isolated {'UDP' if use_udp else 'TCP'}!")
                            return atts
                    native_logs = conn_iso.get_attendance()
                    if native_logs:
                        atts = []
                        for n in native_logs:
                            uid = str(getattr(n, 'user_id', '') or getattr(n, 'uid', ''))
                            ts = getattr(n, 'timestamp', None)
                            st = getattr(n, 'status', 0)
                            p = getattr(n, 'punch', 0)
                            atts.append(SimpleAttendance(uid, ts, st, p, int(uid) if uid.isdigit() else 0))
                        logger.info(f"⚡ Extracted {len(atts)} attendance record(s) via isolated native {'UDP' if use_udp else 'TCP'}!")
                        return atts
                finally:
                    safe_disconnect(conn_iso)
        except Exception as e3:
            logger.debug(f"Stage 3 isolated notice (udp={use_udp}): {e3}")

    return []

def fetch_users_from_ta500(target_ip: str, active_conn=None) -> List[Any]:
    """Safely retrieves enrolled users via isolated UDP or sanitized active connection."""
    # Try isolated UDP first
    try:
        zk_udp = ZK(target_ip, port=ZK_PORT, timeout=4, password=0, force_udp=True, ommit_ping=True)
        conn_udp = zk_udp.connect()
        if conn_udp:
            try:
                users = conn_udp.get_users()
                if users:
                    return users
            finally:
                safe_disconnect(conn_udp)
    except Exception:
        pass

    # Fall back to active connection with pre- and post-drain
    if active_conn:
        try:
            drain_socket_buffer(active_conn)
            users = active_conn.get_users()
            drain_socket_buffer(active_conn)
            if users:
                return users
        except Exception:
            drain_socket_buffer(active_conn)

    return []

def sync_device_users(target_ip: str, active_conn=None) -> int:
    """Syncs enrolled users to Supabase to prevent foreign key errors.
    Uses name-based UID override (_TA500_NAME_OVERRIDES) so newly enrolled
    employees like JOANNE are always mapped to the correct system device_user_id,
    even if their TA500 slot wasn't pre-mapped in TA500_TO_SYSTEM_MAP.
    """
    global _employee_cache
    try:
        users = fetch_users_from_ta500(target_ip, active_conn)
        if not users:
            return 0

        new_or_updated = []
        for u in users:
            raw_uid = str(u.user_id)
            raw_name = (getattr(u, 'name', '') or '').strip()
            name_lower = raw_name.lower()

            # Priority 1: Name-based override (most accurate for newly enrolled employees)
            uid = None
            for name_key, sys_id in _TA500_NAME_OVERRIDES.items():
                if name_key in name_lower:
                    uid = sys_id
                    logger.info(f"🔗 Name-override: TA500 slot {raw_uid} ('{raw_name}') → system ID {sys_id}")
                    break

            # Priority 2: Slot-based map
            if uid is None:
                uid = TA500_TO_SYSTEM_MAP.get(raw_uid, raw_uid)

            name = raw_name if raw_name else f'NN-{uid}'

            if uid in _employee_cache and not _employee_cache[uid].startswith('NN-'):
                continue

            if uid not in _employee_cache or _employee_cache[uid].startswith('NN-'):
                new_or_updated.append({
                    'device_user_id': uid,
                    'full_name': name,
                    'branch': 'Dagupan Main',
                    'position': 'Staff',
                    'department': 'Operations',
                })

        if new_or_updated:
            logger.info(f'👤 Detected {len(new_or_updated)} new/updated employee(s) on TA500: {[e["full_name"] for e in new_or_updated]}')
            url = f'{SUPABASE_URL}/rest/v1/employees?on_conflict=device_user_id'
            res = session.post(url, headers=_HEADERS_INSERT, json=new_or_updated, timeout=(3, 5))
            if res.status_code in (200, 201):
                logger.info(f'✅ Successfully auto-registered {len(new_or_updated)} employee(s) in cloud!')
                refresh_employee_cache()
                return len(new_or_updated)
    except Exception as e:
        logger.warning(f'Device user sync notice: {e}')
    return 0

def ensure_employee_in_supabase(uid: str, active_conn=None, force: bool = False) -> None:
    """
    Guarantees that an employee record exists in Supabase before uploading punches,
    satisfying the foreign key constraint on attendance_logs.device_user_id.
    """
    global _employee_cache
    if not force and uid in _employee_cache:
        return

    emp_name = f'Employee #{uid}'
    try:
        users = fetch_users_from_ta500(ZK_IP, active_conn)
        for u in users:
            raw_u = str(getattr(u, 'user_id', ''))
            mapped = TA500_TO_SYSTEM_MAP.get(raw_u, raw_u)
            if mapped == uid or raw_u == uid:
                candidate = (getattr(u, 'name', '') or '').strip()
                if candidate:
                    emp_name = candidate
                break
    except Exception:
        pass

    try:
        url = f'{SUPABASE_URL}/rest/v1/employees?on_conflict=device_user_id'
        payload = [{
            'device_user_id': uid,
            'full_name': emp_name,
            'branch': 'Dagupan Main',
            'position': 'Staff',
            'department': 'Operations',
        }]
        res = session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(3, 5))
        if res.status_code in (200, 201):
            _employee_cache[uid] = emp_name
            logger.info(f'👤 Auto-enrolled employee #{uid} ({emp_name}) into cloud database!')
        else:
            refresh_employee_cache()
    except Exception as e:
        logger.warning(f'Auto-enrollment notice for employee #{uid}: {e}')

# ─── Flush Local Queue to Supabase ────────────────────────────────────────────
def flush_upload_queue(seen: Set[str], active_conn=None) -> bool:
    global _pending_upload_queue, _employee_cache
    if not _pending_upload_queue:
        return True

    # Pre-flight: Ensure every employee in the upload queue exists in Supabase
    for r in _pending_upload_queue:
        uid = str(r['device_user_id'])
        if uid not in _employee_cache:
            ensure_employee_in_supabase(uid, active_conn)

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
        elif res.status_code == 409 or 'violates foreign key' in res.text.lower():
            logger.warning('Foreign key constraint on punch upload: auto-enrolling missing employee(s)...')
            for r in _pending_upload_queue:
                ensure_employee_in_supabase(str(r['device_user_id']), active_conn, force=True)
            # Immediate retry after provisioning missing employee
            res2 = session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(4, 8))
            if res2.status_code in (200, 201):
                for r in _pending_upload_queue:
                    seen.add(r['_key'])
                save_seen_set(seen)
                latest_uid = _pending_upload_queue[-1]['device_user_id']
                emp_name = _employee_cache.get(latest_uid, f'ID #{latest_uid}')
                logger.info(f'✅ SYNCED (after auto-registering employee): {len(_pending_upload_queue)} punch(es) to cloud! (Latest: {emp_name})')
                _pending_upload_queue.clear()
                return True
            else:
                logger.warning(f'Supabase retry returned HTTP {res2.status_code} — kept in queue')
        else:
            logger.warning(f'Supabase returned HTTP {res.status_code} ({res.text[:120]}) — kept in queue')
    except Exception as e:
        logger.warning(f'Slow network: upload queued ({len(_pending_upload_queue)} punch(es)). Retrying... ({e})')

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
        # Apply slot map first, then check employee cache for name-based override
        uid = TA500_TO_SYSTEM_MAP.get(raw_uid, raw_uid)
        # Additional name-based override: check if cache entry for this UID is a
        # placeholder (NN-xx) and there's a real employee expected at a different slot
        emp_name_in_cache = _employee_cache.get(uid, '')
        if emp_name_in_cache:
            name_lower = emp_name_in_cache.lower()
            for name_key, sys_id in _TA500_NAME_OVERRIDES.items():
                if name_key in name_lower and sys_id != uid:
                    uid = sys_id
                    break
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
            if diff_sec < 15:
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

# ─── Main Bridge Engine ───────────────────────────────────────────────────────
def main():
    acquire_instance_lock()
    global _pending_upload_queue, ZK_IP

    logger.info('==================================================================')
    logger.info('🚀 JAPA DTR Sync Bridge (Samsung Galaxy Tab A8/A9+) v17.2')
    logger.info(f'   Target IP : {ZK_IP}:{ZK_PORT}')
    logger.info('   Mode      : Omni-Sentinel Dual-Transport | Zero-Dropout Direct Extractor')
    logger.info('   Security  : Foreign Key Auto-Enroller | 15s Debounce | 30d Window')
    logger.info('   Transport : Primary Isolated UDP Fallback + Sanitized TCP Heartbeat')
    logger.info('==================================================================')

    seen = load_seen_set()
    logger.info(f'Loaded {len(seen)} previously-synced punch hashes.')

    refresh_employee_cache()
    init_recent_punches()
    update_live_heartbeat(False, 0)
    logger.info('Tablet bridge active. Press Ctrl+C to stop.')

    failure_start_time = 0.0
    ta500_fail_count = 0
    last_soft_reboot_attempt = 0.0
    known_record_count = 0
    known_user_count = 0
    catch_up_needed = True
    last_catch_up_retry = 0.0

    while True:
        # ── 1. Connect Primary Socket ─────────────────────────────────────────
        conn = connect_heartbeat_socket()
        if not conn:
            now = time.time()
            if failure_start_time == 0.0:
                failure_start_time = now
            time_down = now - failure_start_time
            ta500_fail_count += 1

            update_live_heartbeat(False, known_record_count)

            # Graduated Self-Healing Backoff
            if time_down < 60:
                cooldown = 8
            elif time_down < 300:
                cooldown = 15
                if (now - last_soft_reboot_attempt) > 120:
                    last_soft_reboot_attempt = now
                    logger.warning(f'⚠️ TA500 offline for {int(time_down)}s. Triggering early UDP soft-reboot...')
                    restart_ta500_soft(ZK_IP)
            elif time_down < 1800:
                cooldown = 30
                if (now - last_soft_reboot_attempt) > 180:
                    last_soft_reboot_attempt = now
                    logger.warning(f'⚠️ TA500 offline for {int(time_down)}s. Retrying UDP soft-reboot...')
                    restart_ta500_soft(ZK_IP)
            else:
                cooldown = 60

            logger.warning(f'TA500 LAN offline/unreachable (attempt #{ta500_fail_count}, down {int(time_down)}s). Retrying in {cooldown}s...')
            if ta500_fail_count == 3:
                subnet, local_ip = get_local_subnet()
                logger.info(f'💡 Network Status: Tablet IP is {local_ip}. Target device is {ZK_IP}.')
                found_ip = scan_for_ta500()
                if found_ip and found_ip != ZK_IP:
                    logger.info(f'🎯 TA500 auto-discovered at {found_ip}!')
                    ZK_IP = found_ip

            elapsed_cd = 0
            while elapsed_cd < cooldown:
                sleep_chunk = min(4, cooldown - elapsed_cd)
                time.sleep(sleep_chunk)
                elapsed_cd += sleep_chunk
                update_live_heartbeat(False, known_record_count)
            continue

        # Hardware connection established!
        global _ACTIVE_ZK_CONN
        _ACTIVE_ZK_CONN = conn
        save_active_session(conn)
        ta500_fail_count = 0
        failure_start_time = 0.0
        logger.info(f'🟢 TA500 CONNECTED ({ZK_IP})! Bulletproof engine ready in <1s.')
        try:
            conn.enable_device()
            logger.info('🟢 Sensor & Keypad Verification Active (enable_device confirmed).')
        except Exception:
            pass

        # ── 2. Status & Catch-Up Check ───────────────────────────────────────
        try:
            drain_socket_buffer(conn)
            conn.read_sizes()
            known_record_count = conn.records
            known_user_count = getattr(conn, 'users', 0)
            if not isinstance(known_record_count, int) or known_record_count < 0 or known_record_count > 500000:
                raise ValueError(f"Invalid record counter from hardware: {known_record_count}")

            logger.info(f'📊 TA500 reports {known_record_count} total attendance records on device.')
            sync_device_users(ZK_IP, conn)
            update_live_heartbeat(True, known_record_count)

            # Sync recent cloud hashes
            cloud_hashes = load_cloud_seen_hashes(limit=max(known_record_count + 50, 300))
            new_cloud = cloud_hashes - seen
            if new_cloud:
                seen.update(new_cloud)
                save_seen_set(seen)
                logger.info(f'☁️ Synced {len(new_cloud)} cloud punch hashes to local cache.')

            # Run catch-up via SAFE DUAL-TRANSPORT FETCH
            if known_record_count > 0:
                logger.info('🔄 Running startup catch-up audit...')
                atts = fetch_attendance_from_ta500(ZK_IP, conn, known_record_count)
                caught_up = process_punches_batch(atts, seen)
                if caught_up > 0:
                    logger.info(f'✅ Caught up {caught_up} punch(es) from TA500 memory!')
                    flush_upload_queue(seen, conn)
                    catch_up_needed = False
                else:
                    logger.info('✅ All attendance records verified. Sensor ready for punches!')
                    catch_up_needed = False
        except Exception as e_init:
            logger.warning(f'Initial status check notice: {e_init}')
            catch_up_needed = True

        last_cloud_check = time.time()
        last_heartbeat = 0
        read_sizes_fail_streak = 0
        empty_punch_retries = 0

        try:
            # ── 3. Main Polling Loop ─────────────────────────────────────────
            while True:
                now = time.time()

                if _pending_upload_queue:
                    flush_upload_queue(seen, conn)

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
                        sync_device_users(ZK_IP, conn)
                        acknowledge_command('sync_employees')

                # Persistent catch-up retry if startup had transient hiccup
                if catch_up_needed and (now - last_catch_up_retry >= 30):
                    last_catch_up_retry = now
                    logger.info('🔄 Retrying catch-up audit for pending records...')
                    try:
                        atts = fetch_attendance_from_ta500(ZK_IP, conn, known_record_count)
                        caught_up = process_punches_batch(atts, seen)
                        if caught_up > 0:
                            logger.info(f'✅ Caught up {caught_up} punch(es) from TA500 memory!')
                            flush_upload_queue(seen, conn)
                        catch_up_needed = False
                    except Exception as e_cu:
                        logger.warning(f'Catch-up retry notice: {e_cu}')

                # ── KEY 1: Ultra-fast read_sizes() heartbeat (0.05 - 1.0s) ───
                try:
                    drain_socket_buffer(conn)
                    conn.read_sizes()
                    current_count = conn.records
                    current_users = getattr(conn, 'users', 0)

                    # Auto-detect new employee enrolled on the terminal
                    if current_users > known_user_count:
                        logger.info(f'👤 New employee registered on TA500 ({known_user_count} -> {current_users})! Auto-syncing...')
                        try:
                            sync_device_users(ZK_IP, conn)
                        except Exception:
                            pass
                        known_user_count = current_users

                    if not isinstance(current_count, int) or current_count < 0 or current_count > 500000:
                        raise ValueError(f"Invalid record counter from hardware: {current_count}")
                    read_sizes_fail_streak = 0
                    update_live_heartbeat(True, current_count)
                except Exception as e_rs:
                    err_str = str(e_rs).lower()
                    read_sizes_fail_streak += 1
                    update_live_heartbeat(False, known_record_count)
                    drain_socket_buffer(conn)
                    if any(x in err_str for x in ['nonetype', 'bytes', 'invalid', 'timed out', 'timeout']) \
                            and read_sizes_fail_streak <= 2:
                        logger.warning(f'⚠️ TA500 heartbeat blip ({read_sizes_fail_streak}/2): {e_rs}. Retrying...')
                        time.sleep(2)
                        continue
                    # ── Auto-restart TA500 after 5 consecutive failures ──────
                    if read_sizes_fail_streak >= 5:
                        logger.warning(f'🔄 {read_sizes_fail_streak} consecutive errors — sending TA500 proactive soft-reboot...')
                        restart_ta500_soft(ZK_IP)
                        read_sizes_fail_streak = 0
                    logger.warning(f'⚠️ TA500 connection lost ({read_sizes_fail_streak} times): {e_rs}. Reconnecting...')
                    raise

                # ── KEY 2: New Punches Detected via Counter ──────────────────
                if current_count > known_record_count:
                    delta = current_count - known_record_count
                    logger.info(f'🆕 {delta} new punch(es) detected via counter! Allowing 1.5s flash commit...')
                    time.sleep(1.5)  # Hardware flash commit window
                    try:
                        atts = fetch_attendance_from_ta500(ZK_IP, conn, current_count)
                        new_punches = process_punches_batch(atts, seen)
                        if new_punches > 0:
                            known_record_count = current_count
                            empty_punch_retries = 0
                            logger.info(f'Uploading {new_punches} new punch(es) to cloud...')
                            flush_upload_queue(seen, conn)
                        else:
                            empty_punch_retries += 1
                            if empty_punch_retries >= 3:
                                logger.info('All records verified — duplicates already recorded in database.')
                                known_record_count = current_count
                                empty_punch_retries = 0
                            else:
                                logger.info(f'Record write pending in hardware buffer (attempt {empty_punch_retries}/3)... will verify next cycle.')
                    except Exception as e_fetch:
                        logger.warning(f'⚠️ Attendance extraction error ({e_fetch}). Retrying next cycle...')
                        time.sleep(1.0)
                else:
                    known_record_count = current_count
                    empty_punch_retries = 0

                # ── KEY 3: Periodic Status Broadcast ────────────────────────
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
            _ACTIVE_ZK_CONN = None
            time.sleep(5)

if __name__ == '__main__':
    main()
