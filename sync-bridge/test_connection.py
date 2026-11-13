#!/usr/bin/env python3
"""Quick connection test for TA500 device — run before starting the bridge."""
import os
from dotenv import load_dotenv
from zk import ZK

load_dotenv()
IP   = os.getenv('ZK_DEVICE_IP', '192.168.68.146')
PORT = int(os.getenv('ZK_DEVICE_PORT', '4370'))

print(f'Testing connection to TA500 at {IP}:{PORT}...')
zk = ZK(IP, port=PORT, timeout=10, password=0)
try:
    conn = zk.connect()
    info = conn.get_firmware_version()
    users = conn.get_users()
    att = conn.get_attendance()
    print(f'✅ Connected! Firmware: {info}')
    print(f'   Users on device:      {len(users)}')
    print(f'   Attendance records:   {len(att)}')
    conn.disconnect()
except Exception as e:
    print(f'❌ Connection failed: {e}')
    print('   Check IP, port, and that the device is on the same network.')
