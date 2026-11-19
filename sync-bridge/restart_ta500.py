#!/usr/bin/env python3
"""
JAPA DTR — FingerTec TA500 Remote Hardware Soft-Restart Utility
Bridge Engine v16 "Iron Sentinel"

Uses ZKTeco UDP Protocol (Port 4370) to remotely reboot the physical TA500 terminal.
UDP bypasses any locked/busy TCP sockets, ensuring the reboot command succeeds
even when the TCP network stack is unresponsive.
"""

import os
import sys
import time

try:
    from zk import ZK
except ImportError:
    print("[ERROR] pyzk not installed. Run: pip install pyzk")
    sys.exit(1)

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_IP_FILE    = os.path.join(_SCRIPT_DIR, 'ta500_ip.txt')

def get_target_ip() -> str:
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

def restart_ta500(ip: str, port: int = 4370) -> bool:
    print(f"[{time.strftime('%H:%M:%S')}] Connecting to TA500 at {ip}:{port} via UDP for remote reboot...")
    # Force UDP so we can communicate even if TCP port 4370 is locked/busy
    zk = ZK(ip, port=port, timeout=5, password=0, force_udp=True, ommit_ping=True)
    conn = None
    try:
        conn = zk.connect()
        if not conn:
            print(f"[{time.strftime('%H:%M:%S')}] [FAILED] Could not connect to TA500 via UDP.")
            return False
        
        print(f"[{time.strftime('%H:%M:%S')}] Connected via UDP! Issuing restart_device() command...")
        conn.restart_device()
        print(f"[{time.strftime('%H:%M:%S')}] [SUCCESS] TA500 hardware reboot signal transmitted!")
        print(f"[{time.strftime('%H:%M:%S')}] Terminal is now power-cycling. Normal boot time: 60-90 seconds.")
        return True
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] [ERROR] Exception during TA500 restart: {e}")
        return False
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass

if __name__ == '__main__':
    target = get_target_ip()
    success = restart_ta500(target)
    sys.exit(0 if success else 1)
