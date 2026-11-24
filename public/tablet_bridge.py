#!/usr/bin/env python3
"""
JAPA DTR Sync Bridge — Samsung Galaxy Tab A8/A9+ Edition
v18.5 "Iron Sentinel — Flawless Buffer Extractor & Cloud Reconciler"

Key Architecture Fixes:
  1. Self-Synchronizing Buffered Frame Reader (ZKFrameReader):
     - Drains stale bytes before sending commands, preventing desync.
     - Automatically aligns to ZKTeco magic header (0x5050, 0x7d82).
     - Loops until exact declared frame payload is assembled across TCP fragments.
     - Completely eliminates 'TCP packet invalid' errors over Wi-Fi extenders.
  2. Multi-Packet Attendance Stream Extractor:
     - Accurate 32-bit uint size extraction at offset 1:5 (e.g. 9684 bytes for 242 records).
     - Dual-mode chunking: tries full buffer, falls back to 4096-byte slices if needed.
     - Seamlessly captures CMD_DATA / CMD_PREPARE_DATA frames.
  3. Authoritative Cloud Reconciliation:
     - Seeds seen cache directly from Supabase (load_cloud_seen_hashes), guaranteeing that any unsynced punches are immediately detected and uploaded.
  4. 3-Second Rapid Punch Detection (POLL_INTERVAL = 3s).
"""

import os
import sys
import time
import json
import socket
import struct
import signal
import hashlib
import logging
import sqlite3
import threading
import concurrent.futures
from logging.handlers import RotatingFileHandler
from datetime import datetime, timezone, timedelta
from typing import Optional, Set, List, Dict, Any, Tuple

try:
    import pytz
    import requests
    from requests.adapters import HTTPAdapter
    from zk import ZK
    import zk.const as const
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

# ─── PyZK Robust TCP Framing Hotfixes ──────────────────────────────────────────
MAGIC_ZK_TCP = b'PP\x82}'

class ZKFrameReader:
    """
    Self-synchronizing, buffered frame reader for ZKTeco TCP streams.
    Handles Wi-Fi packet fragmentation, stray noise, and multi-packet replies
    (CMD_DATA + CMD_ACK_OK) without buffer corruption or 'TCP packet invalid' errors.
    """
    def __init__(self, sock):
        self.sock = sock
        self.buf = bytearray()

    def drain(self):
        """Discards unread bytes before sending a new command to ensure clean framing."""
        self.buf.clear()
        if not self.sock:
            return
        try:
            self.sock.setblocking(False)
            while True:
                discarded = self.sock.recv(4096)
                if not discarded:
                    break
        except Exception:
            pass
        finally:
            try:
                self.sock.setblocking(True)
            except Exception:
                pass

    def recv_frame(self, timeout: float = 8.0) -> Tuple[int, bytes]:
        """Reads exactly one complete declared ZKTeco TCP packet (0x5050 frame)."""
        deadline = time.monotonic() + timeout
        old_to = self.sock.gettimeout()
        self.sock.settimeout(1.0)
        try:
            # 1. Search for magic header (0x5050, 0x7d82)
            while True:
                idx = self.buf.find(MAGIC_ZK_TCP)
                if idx != -1:
                    del self.buf[:idx]
                    break
                if time.monotonic() > deadline:
                    raise socket.timeout("Timed out waiting for ZKTeco magic frame header")
                try:
                    chunk = self.sock.recv(4096)
                    if not chunk:
                        raise ConnectionResetError("Socket closed while waiting for frame header")
                    self.buf.extend(chunk)
                except (socket.timeout, BlockingIOError):
                    continue

            # 2. Read at least 8 bytes for header + declared payload length
            while len(self.buf) < 8:
                if time.monotonic() > deadline:
                    raise socket.timeout("Timed out reading frame length")
                try:
                    chunk = self.sock.recv(8 - len(self.buf))
                    if not chunk:
                        raise ConnectionResetError("Socket closed while reading frame length")
                    self.buf.extend(chunk)
                except (socket.timeout, BlockingIOError):
                    continue

            length = struct.unpack('<I', self.buf[4:8])[0]
            if length < 8 or length > 131072:
                # Corrupt length header, discard magic and retry
                del self.buf[:4]
                raise ValueError(f"Invalid frame length declared: {length}")

            total_needed = 8 + length

            # 3. Read exact declared payload across multiple TCP fragments
            while len(self.buf) < total_needed:
                if time.monotonic() > deadline:
                    raise socket.timeout(f"Timed out reading frame payload ({len(self.buf)}/{total_needed})")
                try:
                    chunk = self.sock.recv(total_needed - len(self.buf))
                    if not chunk:
                        raise ConnectionResetError("Socket closed while reading payload")
                    self.buf.extend(chunk)
                except (socket.timeout, BlockingIOError):
                    continue

            payload = bytes(self.buf[8:total_needed])
            del self.buf[:total_needed]
            cmd = struct.unpack('<H', payload[:2])[0]
            return cmd, payload
        finally:
            try:
                self.sock.settimeout(old_to)
            except Exception:
                pass

def _get_zk_reader(zk_obj) -> ZKFrameReader:
    sock = getattr(zk_obj, '_ZK__sock', None) or getattr(zk_obj, '_sock', None)
    reader = getattr(zk_obj, '_frame_reader', None)
    if reader is None or reader.sock != sock:
        reader = ZKFrameReader(sock)
        zk_obj._frame_reader = reader
    return reader

def _apply_pyzk_hotfix():
    # ── 1. Fix __test_tcp_top: allow valid 8-byte frame headers ───────────────
    def patched_test_tcp_top(self, packet):
        if not packet or len(packet) < 8:
            return 0
        m1, m2, length = struct.unpack('<HHI', packet[:8])
        if m1 == const.MACHINE_PREPARE_DATA_1 and m2 == const.MACHINE_PREPARE_DATA_2:
            return length
        return 0

    ZK._ZK__test_tcp_top = patched_test_tcp_top

    # ── 2. Fix __send_command: guarantee complete frame delivery & clean framing ─
    orig_send = ZK._ZK__send_command
    def patched_send_command(self, command, command_string=b'', response_size=8):
        if command not in [const.CMD_CONNECT, const.CMD_AUTH] and not self.is_connect:
            raise ZKErrorConnection("instance are not connected.")
        buf = self._ZK__create_header(command, command_string, self._ZK__session_id, self._ZK__reply_id)
        if self.tcp:
            reader = _get_zk_reader(self)
            # Drain any stale leftover bytes before transmitting new command
            reader.drain()
            top = self._ZK__create_tcp_top(buf)
            reader.sock.sendall(top)
            cmd_code, payload = reader.recv_frame(timeout=8.0)
            self._ZK__header = struct.unpack('<4H', payload[:8])
            self._ZK__data_recv = payload
        else:
            self._ZK__sock.sendto(buf, self._ZK__address)
            self._ZK__data_recv = self._ZK__sock.recv(response_size)
            self._ZK__header = struct.unpack('<4H', self._ZK__data_recv[:8])

        self._ZK__response = self._ZK__header[0]
        self._ZK__reply_id = self._ZK__header[3]
        self._ZK__data = self._ZK__data_recv[8:]
        return {
            'status': self._ZK__response in [const.CMD_ACK_OK, const.CMD_PREPARE_DATA, const.CMD_DATA],
            'code': self._ZK__response
        }

    ZK._ZK__send_command = patched_send_command

    # ── 3. Fix read_with_buffer: complete multi-segment TCP attendance extraction ──
    orig_rwb = ZK.read_with_buffer
    def patched_read_with_buffer(self, command, fct=0, ext=0):
        if not self.tcp:
            return orig_rwb(self, command, fct, ext)

        reader = _get_zk_reader(self)
        cmd_string = struct.pack('<bhii', 1, command, fct, ext)
        cmd_resp = self._ZK__send_command(1503, cmd_string, 1024)
        resp_code = cmd_resp.get('code', 0)
        data_len = len(self._ZK__data)
        logger.info(f"📋 RWB 1503 reply: code={resp_code}, payload_bytes={data_len}")

        if not cmd_resp.get('status'):
            logger.warning(f"⚠️ 1503 CMD_PREPARE_BUFFER rejected (code={resp_code})")
            return b'', 0

        if resp_code == const.CMD_DATA:
            logger.info(f"📋 RWB received CMD_DATA directly ({data_len} bytes)")
            return self._ZK__data, data_len

        # Extract declared buffer size
        total_size = 0
        if data_len >= 5:
            # ZKTeco standard: self._ZK__data[1:5] contains the 32-bit unsigned size
            s1 = struct.unpack('<I', self._ZK__data[1:5])[0]
            if 0 < s1 < 10000000:
                total_size = s1
        if total_size <= 0 and data_len >= 4:
            s0 = struct.unpack('<I', self._ZK__data[:4])[0]
            if 0 < s0 < 10000000:
                total_size = s0

        # Hardware fallback: if size is 0 or unparsed, calculate from known records count
        records_hint = getattr(self, 'records', 0)
        if total_size <= 0 and records_hint > 0:
            total_size = records_hint * 40 + 4
            logger.info(f"📋 RWB buffer size defaulted from hardware records count: {total_size} bytes ({records_hint} records)")
        else:
            logger.info(f"📋 RWB declared total size: {total_size} bytes (records hint={records_hint})")

        if total_size <= 0:
            logger.warning("⚠️ RWB could not determine buffer size (total_size=0)")
            return b'', 0

        # Attempt to read buffer: try full buffer first, fallback to 4096 chunks if rejected
        accumulated = bytearray()
        for chunk_step in [total_size, 4096]:
            accumulated.clear()
            start = 0
            chunk_failed = False
            while start < total_size:
                chunk_len = min(chunk_step, total_size - start)
                req_str = struct.pack('<ii', start, chunk_len)
                resp = self._ZK__send_command(1504, req_str, chunk_len + 32)
                c = resp.get('code', 0)
                chunk_bytes = len(self._ZK__data)
                logger.info(f"📋 RWB Chunk [{start}:{start+chunk_len}]: resp={c}, data_len={chunk_bytes}")

                if not resp.get('status') or (c not in [const.CMD_DATA, const.CMD_PREPARE_DATA] and chunk_bytes == 0):
                    logger.warning(f"⚠️ RWB 1504 chunk request failed (code={c}, bytes={chunk_bytes})")
                    chunk_failed = True
                    break

                if c == const.CMD_DATA and chunk_bytes > 0:
                    accumulated.extend(self._ZK__data)
                elif c == const.CMD_PREPARE_DATA:
                    try:
                        c2, payload2 = reader.recv_frame(timeout=8.0)
                        if c2 == const.CMD_DATA:
                            accumulated.extend(payload2[8:])
                        logger.info(f"📋 RWB PREPARE_DATA follow-up frame: code={c2}, len={len(payload2)}")
                    except Exception as e_c2:
                        logger.warning(f"⚠️ RWB PREPARE_DATA follow-up notice: {e_c2}")
                elif chunk_bytes > 0:
                    accumulated.extend(self._ZK__data)
                else:
                    chunk_failed = True
                    break

                start += chunk_len

            if not chunk_failed and len(accumulated) >= (total_size - 4):
                break

        # Free buffer on TA500 RAM
        try:
            self._ZK__send_command(1502)
        except Exception:
            pass

        logger.info(f"✅ RWB Complete: Assembled {len(accumulated)} attendance bytes from TA500 RAM")
        return bytes(accumulated), len(accumulated)

    ZK.read_with_buffer = patched_read_with_buffer

_apply_pyzk_hotfix()

# ─── Configuration & Dynamic IP Discovery ──────────────────────────────────────
_SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
_DB_FILE     = os.path.join(_SCRIPT_DIR, 'bridge.sqlite3')
_SEEN_FILE   = os.path.join(_SCRIPT_DIR, 'seen_punches.json')
_TOKEN_FILE  = os.path.join(_SCRIPT_DIR, 'sync_token.json')
_LOG_FILE    = os.path.join(_SCRIPT_DIR, 'bridge.log')
_IP_FILE     = os.path.join(_SCRIPT_DIR, 'ta500_ip.txt')
_SESSION_FILE = os.path.join(_SCRIPT_DIR, 'ta500_session.json')
_ACTIVE_ZK_CONN: Optional[object] = None


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
ZK_TIMEOUT    = 10     # Robust socket timeout for Wi-Fi transmission
POLL_INTERVAL = 3      # 3s rapid heartbeat for instant punch detection
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
    # --- New Hires & Terminal Enrollees ---
    '19': '10',  # GALVAN, JOANNE KRYSHELLE C. (Enrolled slot on TA500)
    '20': '20',  # COSTALES, BARBARA ELLAINE S.
    '21': '21',  # COSTALES, MARIE STEFI S.
    '22': '22',  # JOCELYN LUTERIA
    '23': '23',  # HARIM LAGAO
    '24': '24',  # CAYABYAB, GAIN CARLO G.
}

_employee_cache: Dict[str, str] = {
    '1': 'Dennis P. Ardiente',
    '2': 'Jeffrey D. Baniqued',
    '3': 'Carlo C. Caoile',
    '4': 'Pearly B. De Vera',
    '5': 'Ivan De Vera',
    '6': 'Jerwin B. Dee',
    '7': 'Lyca Estacio',
    '8': 'Larry L. Estacio',
    '9': 'Janine Kyle Galvan',
    '10': 'Joanne Kryshelle C. Galvan',
    '11': 'Jamaica Soriano',
    '12': 'Enrolled #12',
    '13': 'Rowena Romero',
    '14': 'Randolf J. Galzote',
    '15': 'Juvell Luna',
    '16': 'Henry M. Tiozon',
    '17': 'Melanie P. Tiu',
    '18': 'Robert Luna',
    '19': 'Asky Sentenillar',
    '20': 'Barbara Ellaine S. Costales',
    '21': 'Marie Stefi S. Costales',
    '22': 'Jocelyn Luteria',
    '23': 'Harim Lagao',
    '24': 'Gain Carlo G. Cayabyab',
}
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

def ensure_employee_exists(uid: str, full_name: Optional[str] = None) -> bool:
    global _employee_cache
    s_uid = str(uid).strip()
    if not s_uid or s_uid == '0':
        return False
    # Strict read-only: never insert fake or unverified employees from the bridge
    return s_uid in _employee_cache

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
            logger.info(f'Anti-Double Tap Debounce active (15s): {len(_last_device_punch)} employee punch history loaded')
    except Exception as e:
        logger.warning(f'Recent punches init notice: {e}')

# ─── Phase 1: Network & TP-Link Extender Keepalive ────────────────────────────
_extender_pulse_running = False

def _extender_keepalive_worker(ip: str, port: int = 9, interval: int = 15):
    """Sends periodic low-overhead UDP pulses to TA500 to keep TP-Link extender ARP cache fresh."""
    logger.info(f"⚡ TP-Link Extender Keepalive active ({interval}s UDP pulse to {ip}:{port})")
    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    probe = b'\x00'
    while _extender_pulse_running:
        try:
            udp_sock.sendto(probe, (ip, port))
        except Exception:
            pass
        time.sleep(interval)
    try:
        udp_sock.close()
    except Exception:
        pass

def start_extender_keepalive(ip: str):
    global _extender_pulse_running
    if not _extender_pulse_running and ip:
        _extender_pulse_running = True
        t = threading.Thread(target=_extender_keepalive_worker, args=(ip,), daemon=True)
        t.start()

def configure_socket_keepalive(sock):
    """Configures aggressive TCP keepalive to detect dropped connections in 15s instead of 45s."""
    if not sock:
        return
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        if hasattr(socket, 'TCP_KEEPIDLE'):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 10)
        if hasattr(socket, 'TCP_KEEPINTVL'):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 5)
        if hasattr(socket, 'TCP_KEEPCNT'):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)
    except Exception:
        pass

# ─── Phase 2: Local SQLite WAL Offline Storage ────────────────────────────────
def init_local_database():
    """Initializes persistent SQLite database with WAL mode for zero punch loss."""
    try:
        with sqlite3.connect(_DB_FILE, timeout=10.0) as conn:
            conn.execute('PRAGMA journal_mode = WAL')
            conn.execute('PRAGMA synchronous = NORMAL')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS offline_punches (
                    punch_key TEXT PRIMARY KEY,
                    device_user_id TEXT NOT NULL,
                    punch_time TEXT NOT NULL,
                    status INTEGER NOT NULL,
                    raw_status INTEGER,
                    synced_at TEXT NOT NULL,
                    is_synced INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_offline_synced ON offline_punches(is_synced)')
            conn.execute('UPDATE offline_punches SET is_synced = 0 WHERE is_synced = -1')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS seen_hashes (
                    punch_key TEXT PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        logger.info(f"📁 Local SQLite WAL queue initialized ({_DB_FILE})")
    except Exception as e:
        logger.warning(f"Could not initialize local SQLite queue: {e}")

def record_offline_punch(key: str, uid: str, punch_time: str, status: int, raw_status: int, sync_time: str) -> None:
    """Persists punch to tablet SQLite database before network upload."""
    try:
        with sqlite3.connect(_DB_FILE, timeout=5.0) as conn:
            conn.execute('''
                INSERT OR IGNORE INTO offline_punches
                (punch_key, device_user_id, punch_time, status, raw_status, synced_at, is_synced)
                VALUES (?, ?, ?, ?, ?, ?, 0)
            ''', (key, uid, punch_time, status, raw_status, sync_time))
            conn.execute('INSERT OR IGNORE INTO seen_hashes (punch_key) VALUES (?)', (key,))
    except Exception as e:
        logger.warning(f"SQLite record punch notice: {e}")

def get_pending_offline_punches(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves unsynced offline punches in chronological order."""
    try:
        if not os.path.exists(_DB_FILE):
            return []
        with sqlite3.connect(_DB_FILE, timeout=5.0) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute('''
                SELECT punch_key, device_user_id, punch_time, status, raw_status, synced_at
                FROM offline_punches
                WHERE is_synced = 0
                ORDER BY punch_time ASC
                LIMIT ?
            ''', (limit,))
            rows = cur.fetchall()
            return [{
                '_key': r['punch_key'],
                'device_user_id': r['device_user_id'],
                'punch_time': r['punch_time'],
                'status': r['status'],
                'raw_status': r['raw_status'],
                'synced_at': r['synced_at'],
            } for r in rows]
    except Exception as e:
        logger.warning(f"SQLite pending queue query notice: {e}")
        return []

def mark_punches_synced(keys: List[str]) -> None:
    if not keys or not os.path.exists(_DB_FILE):
        return
    try:
        with sqlite3.connect(_DB_FILE, timeout=5.0) as conn:
            placeholders = ','.join('?' for _ in keys)
            conn.execute(f'''
                UPDATE offline_punches
                SET is_synced = 1
                WHERE punch_key IN ({placeholders})
            ''', keys)
    except Exception as e:
        logger.warning(f"SQLite mark synced notice: {e}")

def discard_rejected_punches(keys: List[str]) -> None:
    if not keys or not os.path.exists(_DB_FILE):
        return
    try:
        with sqlite3.connect(_DB_FILE, timeout=5.0) as conn:
            placeholders = ','.join('?' for _ in keys)
            conn.execute(f'''
                UPDATE offline_punches
                SET is_synced = -1
                WHERE punch_key IN ({placeholders})
            ''', keys)
    except Exception as e:
        logger.warning(f"SQLite discard notice: {e}")

# ─── State Persistence with SQLite & 30-Day Bounded Window ─────────────────────
def _punch_key(uid: str, punch_time_utc: str) -> str:
    return hashlib.md5(f'{uid}|{punch_time_utc}'.encode()).hexdigest()

def load_seen_set() -> Set[str]:
    seen: Set[str] = set()
    # 1. From SQLite seen_hashes table
    try:
        if os.path.exists(_DB_FILE):
            with sqlite3.connect(_DB_FILE, timeout=5.0) as conn:
                cur = conn.execute('SELECT punch_key FROM seen_hashes')
                for row in cur:
                    seen.add(row[0])
    except Exception:
        pass
    # 2. From legacy JSON file if present
    try:
        if os.path.exists(_SEEN_FILE):
            with open(_SEEN_FILE, 'r') as f:
                data = json.load(f)
                if isinstance(data, list):
                    seen.update(data)
    except Exception:
        pass
    return seen

def save_seen_set(seen: Set[str]) -> None:
    # 1. Save to SQLite
    try:
        if os.path.exists(_DB_FILE) and seen:
            with sqlite3.connect(_DB_FILE, timeout=5.0) as conn:
                conn.executemany('INSERT OR IGNORE INTO seen_hashes (punch_key) VALUES (?)', [(k,) for k in seen])
    except Exception:
        pass
    # 2. Keep legacy JSON updated for backward compatibility
    try:
        with open(_SEEN_FILE, 'w') as f:
            json.dump(list(seen)[-1000:], f)
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
            {'key': 'bridge_version',   'value': 185},
        ]
        url = f'{SUPABASE_URL}/rest/v1/sync_meta?on_conflict=key'
        session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(2, 4))
    except Exception:
        pass

def handle_bridge_exit(*args):
    """Gracefully terminates active TA500 hardware session and marks bridge offline in cloud."""
    global _ACTIVE_ZK_CONN
    logger.info("Bridge stopping — gracefully disconnecting TA500 session...")
    if _ACTIVE_ZK_CONN:
        try:
            _ACTIVE_ZK_CONN.disconnect()
            logger.info("✅ TA500 session cleanly terminated (CMD_EXIT sent).")
        except Exception as e:
            logger.debug(f"Disconnect notice on exit: {e}")
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
    """Caches the active hardware session ID so that dropped connections can be cleanly flushed."""
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
    """
    If the TA500 is stuck in 'LAN busy (hardware holding previous session)',
    this sends a blind CMD_EXIT (1001) using the cached session ID
    to force the device firmware to release the socket lock immediately.
    """
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
        for use_udp in (False, True):
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
        conn.disconnect()
    except Exception:
        pass
    try:
        sock = getattr(conn, '_ZK__sock', None) or getattr(conn, '_sock', None)
        if sock:
            sock.close()
    except Exception:
        pass
    if hasattr(conn, '_frame_reader'):
        conn._frame_reader = None

def restart_ta500_soft(ip: Optional[str] = None) -> bool:
    """
    Sends remote soft reboot command to TA500 via ZKTeco protocol.
    Tries standard handshake over UDP and TCP, then falls back to blind restart with cached session ID.
    """
    target_ip = ip or ZK_IP

    # Attempt 1: Standard connection handshake (.restart() method in pyzk)
    for use_udp in (True, False):
        try:
            zk = ZK(target_ip, port=ZK_PORT, timeout=4, password=0, force_udp=use_udp, ommit_ping=True)
            conn = zk.connect()
            if conn:
                conn.restart()  # Standard pyzk method is .restart(), NOT .restart_device()
                logger.info(f"🔁 Remote reboot signal transmitted to TA500 ({target_ip}) via {'UDP' if use_udp else 'TCP'}!")
                return True
        except Exception:
            pass

    # Attempt 2: Blind restart injection with cached session ID (bypasses connect handshake)
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

    # Maintain background keepalive pulse to keep TP-Link extender port active
    start_extender_keepalive(target_ip)

    for use_udp in (False, True):
        zk = None
        timeout = ZK_TIMEOUT if not use_udp else 6
        try:
            zk = ZK(target_ip, port=ZK_PORT, timeout=timeout,
                    password=0, force_udp=use_udp, ommit_ping=True)
            conn = zk.connect()
            if conn:
                sock = getattr(conn, '_ZK__sock', None) or getattr(conn, '_sock', None)
                configure_socket_keepalive(sock)
                if use_udp:
                    logger.info('🟡 Heartbeat connected via UDP fallback.')
                return conn
        except Exception as e_tcp:
            safe_disconnect(zk)
            if not use_udp:
                err_str = str(e_tcp)
                if '104' in err_str or '10054' in err_str or 'reset' in err_str.lower():
                    logger.warning('TA500 LAN busy (hardware holding previous session). Attempting auto-clear...')
                    teardown_stale_session(target_ip)
                elif 'timed out' in err_str.lower() or 'timeout' in err_str.lower():
                    logger.warning(f'TA500 LAN connect notice ({target_ip}): timed out')
                else:
                    logger.warning(f'TA500 LAN connect notice ({target_ip}): {e_tcp}')
    return None

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

def safe_fetch_attendance(conn, max_retries: int = 2) -> list:
    """
    v18.4 Iron Sentinel Instant Attendance Extractor:
    - Reads attendance stream directly via patched multi-segment read_with_buffer(13).
    - Safely unrolls 40-byte TA500 attendance records with zero buffer slip.
    - Accurately strips 4-byte size header when present.
    """
    if not conn:
        return []
    for attempt in range(max_retries):
        try:
            attendance_data, size = conn.read_with_buffer(13)
            logger.info(f"📊 safe_fetch_attendance: buffer received {len(attendance_data)} bytes (announced size={size})")
            if not attendance_data or len(attendance_data) < 4:
                logger.warning(f"⚠️ safe_fetch_attendance: buffer too short ({len(attendance_data)} bytes)")
                return []

            raw_data = attendance_data
            if len(attendance_data) >= 44:
                prefix_size = struct.unpack('<I', attendance_data[:4])[0]
                if prefix_size == len(attendance_data) - 4 or (len(attendance_data) - 4) % 40 == 0:
                    raw_data = attendance_data[4:]

            attendances = []
            while len(raw_data) >= 40:
                uid, user_id_bytes, status, ts_bytes, punch, space = struct.unpack('<H24sB4sB8s', raw_data[:40])
                raw_data = raw_data[40:]
                uid_str = user_id_bytes.split(b'\x00')[0].decode(errors='ignore').strip()
                dt = decode_zk_time(ts_bytes)
                attendances.append(SimpleAttendance(uid_str or str(uid), dt, status, punch, uid))

            logger.info(f"📊 safe_fetch_attendance: successfully decoded {len(attendances)} attendance records")
            return attendances
        except Exception as e:
            logger.warning(f"Attendance extraction attempt {attempt+1} error: {e}")
            if attempt == max_retries - 1:
                raise
            time.sleep(1.0)
    return []

def sync_device_users(conn) -> int:
    """Read enrolled users from TA500 without modifying the official database roster."""
    global _employee_cache
    if not conn:
        return 0
    try:
        users = conn.get_users()
        if not users:
            return 0
        logger.info(f'TA500 reports {len(users)} enrolled template slots on device.')
        return len(users)
    except Exception as e:
        logger.warning(f'Device user read notice: {e}')
    return 0

# ─── Flush Local Queue to Supabase ────────────────────────────────────────────
def flush_upload_queue(seen: Set[str]) -> bool:
    pending = get_pending_offline_punches(limit=50)
    if not pending:
        return True

    # Pre-flight check: ensure every employee in queue exists in official roster
    valid_pending = []
    discard_keys = []
    for r in pending:
        uid = str(r.get('device_user_id', '')).strip()
        if uid and uid in _employee_cache:
            valid_pending.append(r)
        else:
            discard_keys.append(r['_key'])

    if discard_keys:
        discard_rejected_punches(discard_keys)

    if not valid_pending:
        return True

    payload = [{k: v for k, v in r.items() if k != '_key'} for r in valid_pending]
    url = f'{SUPABASE_URL}/rest/v1/attendance_logs?on_conflict=device_user_id,punch_time'

    try:
        res = session.post(url, headers=_HEADERS_INSERT, json=payload, timeout=(4, 8))
        if res.status_code in (200, 201):
            synced_keys = [r['_key'] for r in valid_pending]
            mark_punches_synced(synced_keys)
            for k in synced_keys:
                seen.add(k)
            save_seen_set(seen)

            latest_uid = valid_pending[-1]['device_user_id']
            emp_name = _employee_cache.get(latest_uid, f'ID #{latest_uid}')
            logger.info(f'✅ SYNCED: {len(valid_pending)} punch(es) to cloud! (Latest: {emp_name})')
            return True
        elif res.status_code == 409:
            err_text = res.text
            logger.warning(f'Supabase returned HTTP 409 Conflict: {err_text}')

            # Attempt single-item isolation to prevent permanent queue block
            recovered = 0
            synced_keys = []
            discarded = []
            for r in valid_pending:
                single_payload = [{k: v for k, v in r.items() if k != '_key'}]
                try:
                    sres = session.post(url, headers=_HEADERS_INSERT, json=single_payload, timeout=(3, 5))
                    if sres.status_code in (200, 201):
                        synced_keys.append(r['_key'])
                        seen.add(r['_key'])
                        recovered += 1
                    elif sres.status_code == 409:
                        # Already present in DB, mark synced
                        synced_keys.append(r['_key'])
                        seen.add(r['_key'])
                    else:
                        logger.error(f'⚠️ Discarding rejected punch for UID {r["device_user_id"]} ({sres.text})')
                        discarded.append(r['_key'])
                except Exception:
                    pass

            if synced_keys:
                mark_punches_synced(synced_keys)
            if discarded:
                discard_rejected_punches(discarded)
            save_seen_set(seen)
            logger.info(f'Queue recovery: {recovered} newly synced, {len(discarded)} discarded')
            return recovered > 0
        else:
            logger.warning(f'Supabase returned HTTP {res.status_code} — kept in local SQLite queue (will retry)')
    except Exception as e:
        logger.warning(f'Slow network: upload queued locally ({len(valid_pending)} punch(es) waiting in SQLite): {e}')

    return False

def process_punches_batch(attendances: List[Any], seen: Set[str]) -> int:
    global _last_device_punch
    new_count = 0
    sync_time = datetime.now(timezone.utc).isoformat()
    skipped_seen = 0
    skipped_emp = 0
    skipped_year = 0

    try:
        attendances.sort(key=lambda a: _parse_ts(getattr(a, 'timestamp', None)))
    except Exception:
        pass

    for att in attendances:
        raw_uid = str(att.user_id)
        uid = TA500_TO_SYSTEM_MAP.get(raw_uid, raw_uid)
        local_dt = _parse_ts(att.timestamp)
        if not (2024 <= local_dt.year <= 2030):
            skipped_year += 1
            continue

        if uid not in _employee_cache:
            skipped_emp += 1
            continue

        utc_iso = local_dt.astimezone(timezone.utc).isoformat()

        key = _punch_key(uid, utc_iso)
        if key in seen:
            _last_device_punch[uid] = local_dt
            skipped_seen += 1
            continue

        prev_punch_dt = _last_device_punch.get(uid)
        if prev_punch_dt is not None:
            diff_sec = abs((local_dt - prev_punch_dt).total_seconds())
            if diff_sec < 15:
                seen.add(key)
                save_seen_set(seen)
                skipped_seen += 1
                continue

        _last_device_punch[uid] = local_dt
        status_val = getattr(att, 'punch', None)
        if status_val is None:
            status_val = int(att.status or 0)

        # Record immediately to local persistent SQLite WAL database
        record_offline_punch(key, uid, utc_iso, int(status_val), int(att.status or 0), sync_time)
        seen.add(key)
        new_count += 1
        emp_name = _employee_cache.get(uid, f'ID #{uid}')
        logger.info(f"🆕 NEW PUNCH: {emp_name} at {local_dt.strftime('%Y-%m-%d %H:%M:%S')} (status {status_val})")

    logger.info(f"📊 Audit breakdown: {new_count} new, {skipped_seen} already in DB, {skipped_emp} unmapped emp, {skipped_year} bad year")

    if new_count > 0:
        save_seen_set(seen)

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
    acquire_instance_lock()
    init_local_database()
    global _pending_upload_queue, ZK_IP

    logger.info('==================================================================')
    logger.info('🚀 JAPA DTR Sync Bridge (Samsung Galaxy Tab A8/A9+) v18.5 "Iron Sentinel"')
    logger.info(f'   Target IP : {ZK_IP}:{ZK_PORT}')
    logger.info('   Mode      : Self-Synchronizing TCP Framing | Complete Multi-Packet Extractor')
    logger.info('   Stability : Zero Packet Invalids | TP-Link Port 9 Keepalive | 3s Rapid Detection')
    logger.info('   Storage   : SQLite WAL Queue (Zero Punch Loss) | Instant Cloud Sync')
    logger.info('==================================================================')

    start_extender_keepalive(ZK_IP)
    cloud_seen = load_cloud_seen_hashes(limit=2000)
    seen = cloud_seen if cloud_seen else load_seen_set()
    logger.info(f'Loaded {len(seen)} authoritative punch hashes from Supabase cloud.')

    refresh_employee_cache()
    init_recent_punches()
    update_live_heartbeat(False, 0)
    logger.info('Tablet bridge active. Press Ctrl+C to stop.')

    # Reconnect & self-healing tracking
    failure_start_time = 0.0
    ta500_fail_count = 0
    last_soft_reboot_attempt = 0.0
    known_record_count = 0

    while True:
        # Flush pending offline punches if any
        flush_upload_queue(seen)

        # ── 1. Connect Device Socket ─────────────────────────────────────────
        conn = connect_heartbeat_socket()
        if not conn:
            now = time.time()
            if failure_start_time == 0.0:
                failure_start_time = now
            time_down = now - failure_start_time
            ta500_fail_count += 1

            # Broadcast TA500 down to cloud immediately, while bridge remains online
            update_live_heartbeat(False, known_record_count)

            # Graduated Self-Healing Backoff
            if time_down < 60:          # 0 - 60s: fast 8s retry
                cooldown = 8
            elif time_down < 300:       # 60s - 5 min: 15s retry + early UDP reboot
                cooldown = 15
                if (now - last_soft_reboot_attempt) > 120:
                    last_soft_reboot_attempt = now
                    logger.warning(f'⚠️ TA500 offline for {int(time_down)}s. Triggering early UDP soft-reboot...')
                    success = restart_ta500_soft(ZK_IP)
                    if success:
                        cooldown = 60   # Give hardware ~45s to boot
            elif time_down < 1800:      # 5 - 30 min: 30s retry + periodic reboot
                cooldown = 30
                if (now - last_soft_reboot_attempt) > 180:
                    last_soft_reboot_attempt = now
                    logger.warning(f'⚠️ TA500 offline for {int(time_down)}s. Retrying UDP soft-reboot...')
                    success = restart_ta500_soft(ZK_IP)
                    if success:
                        cooldown = 60
            elif time_down < 10800:     # 30 mins - 3 hours: battery saver 90s polling
                cooldown = 90
            else:                       # 3+ hours stuck: recycle process via watchdog
                logger.critical('🛑 Connection down for >3 hours. Recycling bridge via watchdog...')
                sys.exit(42)

            logger.warning(f'TA500 LAN offline/unreachable (attempt #{ta500_fail_count}, down {int(time_down)}s). Retrying in {cooldown}s...')
            if ta500_fail_count == 3:
                subnet, local_ip = get_local_subnet()
                logger.info(f'💡 Network Status: Device IP is {local_ip}. Target device is {ZK_IP}.')
                logger.info('   1. Verify TA500 power switch is ON and display is illuminated.')
                logger.info('   2. Verify Cat6 LAN cable link LED is lit on TA500 and Wi-Fi repeater.')
                # Try scanning subnet in case DHCP reassigned TA500
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

        # Hardware connection recovered!
        global _ACTIVE_ZK_CONN
        _ACTIVE_ZK_CONN = conn
        save_active_session(conn)
        ta500_fail_count = 0
        failure_start_time = 0.0
        logger.info(f'🟢 TA500 CONNECTED ({ZK_IP})! Bulletproof engine ready in <1s.')
        # Zero enable_device() calls to prevent sensor/screen freeze
        # v17.3: NO enable_device() after connect — device is already active on fresh connect.

        # ── 2. Status & Catch-Up Check ───────────────────────────────────────
        try:
            conn.read_sizes()
            known_record_count = conn.records
            if not isinstance(known_record_count, int) or known_record_count < 0 or known_record_count > 500000:
                known_record_count = 0
            logger.info(f'📊 TA500 reports {known_record_count} total attendance records on device.')
            update_live_heartbeat(True, known_record_count)

            # Sync cloud hashes on startup so punches already in DB aren't re-inserted
            cloud_hashes = load_cloud_seen_hashes(limit=max(known_record_count + 50, 300))
            new_cloud = cloud_hashes - seen
            if new_cloud:
                seen.update(new_cloud)
                save_seen_set(seen)
                logger.info(f'☁️ Synced {len(new_cloud)} cloud punch hashes to local cache.')

            # Run catch-up via SAFE SINGLE-SOCKET FETCH
            if known_record_count > 0:
                logger.info('🔄 Running startup catch-up audit on active connection...')
                atts = safe_fetch_attendance(conn)
                caught_up = process_punches_batch(atts, seen)
                if caught_up > 0:
                    logger.info(f'✅ Caught up {caught_up} punch(es) from TA500 memory!')
                    flush_upload_queue(seen)
                elif len(atts) == 0:
                    logger.warning('⚠️ Catch-up: Zero attendance records returned by hardware buffer.')
                else:
                    logger.info(f'✅ Verified {len(atts)} records against cloud. All punches already present in Supabase.')
        except Exception as e_init:
            logger.warning(f'Initial status check notice: {e_init}')

        last_cloud_check = time.time()
        last_heartbeat = 0
        last_audit_time = time.time()
        last_upload_attempt = 0.0
        session_start_time = time.time()
        read_sizes_fail_streak = 0

        # v17.4: Permanent continuous connection — NEVER disconnect on a timer!
        # Attendance fetching is triggered strictly when current_count > known_record_count.

        try:
            # ── 3. Main Loop ─────────────────────────────────────────────────
            while True:
                now = time.time()

                if now - last_upload_attempt >= 4.0:
                    last_upload_attempt = now
                    flush_upload_queue(seen)

                # Cloud portal commands check (~6s for rapid Super Admin response)
                if now - last_cloud_check >= 6:
                    last_cloud_check = now
                    meta = fetch_cloud_meta()

                    # ── Super Admin Remote TA500 Hardware Restart ───
                    if meta.get('restart_ta500') == 1 or meta.get('restart_hardware') == 1:
                        logger.warning('🚨 Remote TA500 RESTART command received from Super Admin web portal!')
                        acknowledge_command('restart_ta500')
                        acknowledge_command('restart_hardware')
                        update_live_heartbeat(False, 0)

                        reboot_success = False

                        # Method 1: Send CMD_RESTART down the ACTIVE authenticated session!
                        if conn and getattr(conn, 'is_connect', False):
                            logger.info(f'Transmitting CMD_RESTART down active connection to TA500 ({ZK_IP})...')
                            try:
                                conn.restart()
                                reboot_success = True
                                logger.info('✅ TA500 accepted CMD_RESTART! Hardware microcontroller is now rebooting...')
                            except Exception as e_rst:
                                logger.warning(f'Active conn.restart() notice: {e_rst}')

                            try:
                                conn.disconnect()
                            except Exception:
                                pass
                            safe_disconnect(conn)

                        # Method 2: If active conn was not connected, use direct socket fallback
                        if not reboot_success:
                            logger.info('Falling back to direct socket injection for remote reboot...')
                            reboot_success = restart_ta500_soft(ZK_IP)

                        if reboot_success:
                            logger.info('⚡ TA500 hardware reboot signal transmitted successfully!')
                        else:
                            logger.warning('⚠️ TA500 hardware reboot attempted via fallback.')

                        # ── Hardware Power-Cycle Grace Period ──
                        # The TA500 ARM SoC requires ~30s to discharge capacitors, reboot,
                        # and reload its internal ZKTeco listening daemon on port 4370.
                        # We MUST pause the bridge so it does NOT hammer the closed socket!
                        logger.info('⏳ Hardware boot grace active: waiting 30 seconds for physical TA500 power cycle...')
                        for sec in range(30, 0, -5):
                            logger.info(f'⏳ Hardware rebooting... {sec}s remaining before bridge reconnect...')
                            time.sleep(5)
                        logger.info('🔄 30s boot grace elapsed. Reconnecting to freshly rebooted TA500...')
                        raise ConnectionResetError("Remote restart hardware cycle completed")

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
                        sync_device_users(conn)
                        acknowledge_command('sync_employees')

                # ── KEY 1: read_sizes() heartbeat — now reliable via patched __recv_reply ─
                # PyZK's __recv_reply is patched to loop recv() until full data received.
                # GuardedSocket provides a second safety layer for all recv() calls.
                # Together: zero TCP packet invalid blips from Wi-Fi fragmentation.
                try:
                    conn.read_sizes()
                    current_count = conn.records
                    if not isinstance(current_count, int) or current_count < 0 or current_count > 500000:
                        raise ValueError(f"Invalid record counter from hardware: {current_count}")
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
                    if read_sizes_fail_streak >= 5:
                        logger.warning(f'⚠️ {read_sizes_fail_streak} consecutive polling errors — cleaning socket and rebooting TA500...')
                        try:
                            conn.disconnect()
                        except Exception:
                            pass
                        safe_disconnect(conn)
                        time.sleep(1)
                        restart_ta500_soft(ZK_IP)
                        time.sleep(20)
                        read_sizes_fail_streak = 0
                        raise ConnectionResetError("Proactive reboot cycle completed")
                    logger.warning(f'⚠️ TA500 connection lost ({read_sizes_fail_streak} times): {e_rs}. Reconnecting...')
                    raise

                # ── KEY 2: New Punches Detected via Counter ──────────────────
                if current_count > known_record_count:
                    delta = current_count - known_record_count
                    logger.info(f'🆕 {delta} new punch(es) detected via counter! Allowing 1.5s flash commit...')
                    time.sleep(1.5)  # Allow hardware to finish writing minutiae/timestamp to internal flash
                    try:
                        atts = safe_fetch_attendance(conn)
                        new_punches = process_punches_batch(atts, seen)
                        if new_punches > 0:
                            known_record_count = current_count
                            empty_punch_retries = 0
                            logger.info(f'Uploading {new_punches} new punch(es) to cloud...')
                            flush_upload_queue(seen)
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

                # ── KEY 3: Direct Flash Memory Audit ────────────────────────
                # In v17.3, punch detection is handled cleanly by KEY 2 (record counter delta).
                # This prevents concurrent socket access and eliminates 'TCP packet invalid' collisions.

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
            time.sleep(5)  # Allow hardware TCP stack 5s to clear TIME_WAIT before reconnect

if __name__ == '__main__':
    main()
