#!/usr/bin/env python3
"""
JAPA DTR — FingerTec TA500 Remote Hardware Soft-Restart Utility
Bridge Engine v16.6 "Self-Clearing Sentinel"

Uses ZKTeco Protocol (Port 4370) to remotely reboot the physical TA500 terminal.
Tries UDP and TCP, and supports blind session teardown if the socket is busy.
"""

import os
import sys
import time
import json

try:
    from zk import ZK
except ImportError:
    print("[ERROR] pyzk not installed. Run: pip install pyzk")
    sys.exit(1)

_SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
_IP_FILE      = os.path.join(_SCRIPT_DIR, 'ta500_ip.txt')
_SESSION_FILE = os.path.join(_SCRIPT_DIR, 'ta500_session.json')

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
    print(f"[{time.strftime('%H:%M:%S')}] Connecting to TA500 at {ip}:{port} for remote reboot...")

    # 1. Standard reboot attempt via UDP and TCP
    for use_udp in (True, False):
        proto = "UDP" if use_udp else "TCP"
        try:
            print(f"[{time.strftime('%H:%M:%S')}] Trying {proto} connection...")
            zk = ZK(ip, port=port, timeout=4, password=0, force_udp=use_udp, ommit_ping=True)
            conn = zk.connect()
            if conn:
                print(f"[{time.strftime('%H:%M:%S')}] Connected via {proto}! Issuing conn.restart()...")
                conn.restart()  # Standard pyzk method is .restart(), NOT .restart_device()
                print(f"[{time.strftime('%H:%M:%S')}] [SUCCESS] TA500 hardware reboot signal transmitted via {proto}!")
                print(f"[{time.strftime('%H:%M:%S')}] Terminal is power-cycling. Normal boot time: 45-60 seconds.")
                return True
        except Exception as e:
            print(f"[{time.strftime('%H:%M:%S')}] {proto} standard handshake notice: {e}")

    # 2. Blind restart injection with cached session ID
    if os.path.exists(_SESSION_FILE):
        try:
            with open(_SESSION_FILE, 'r') as f:
                data = json.load(f)
            saved_sid = data.get('session_id')
            saved_rid = data.get('reply_id', 0)
            if saved_sid:
                print(f"[{time.strftime('%H:%M:%S')}] Attempting blind restart with cached Session #{saved_sid}...")
                for use_udp in (True, False):
                    proto = "UDP" if use_udp else "TCP"
                    try:
                        zk = ZK(ip, port=port, timeout=3, password=0, force_udp=use_udp, ommit_ping=True)
                        zk._ZK__create_socket()
                        zk._ZK__session_id = saved_sid
                        zk._ZK__reply_id = saved_rid
                        zk.is_connect = True
                        zk.restart()
                        print(f"[{time.strftime('%H:%M:%S')}] [SUCCESS] Blind restart injected via {proto}!")
                        return True
                    except Exception as e_blind:
                        print(f"[{time.strftime('%H:%M:%S')}] Blind injection via {proto} notice: {e_blind}")
        except Exception as e_file:
            print(f"[{time.strftime('%H:%M:%S')}] Session cache read notice: {e_file}")

    print(f"[{time.strftime('%H:%M:%S')}] [FAILED] Could not reboot TA500 remotely.")
    return False

if __name__ == '__main__':
    target = get_target_ip()
    success = restart_ta500(target)
    sys.exit(0 if success else 1)
