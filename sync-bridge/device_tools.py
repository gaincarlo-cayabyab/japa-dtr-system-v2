#!/usr/bin/env python3
"""
TA500 Device Management CLI Tools
Provides commands to interact directly with the FingerTec TA500 hardware:
- View/Sync Hardware Clock
- Clear Attendance Logs (Hardware + Supabase)
- Add, Edit, Delete Users
"""

import os
import sys
import argparse
from datetime import datetime
import pytz
from dotenv import load_dotenv
from zk import ZK
from supabase import create_client

_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_dir, '.env'))
load_dotenv()

IP = os.getenv('ZK_DEVICE_IP', '192.168.68.146')
PORT = int(os.getenv('ZK_DEVICE_PORT', '4370'))
SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

def get_device():
    return ZK(IP, port=PORT, timeout=10, password=0, force_udp=False, ommit_ping=True)

def cmd_status():
    zk = get_device()
    conn = zk.connect()
    try:
        t = conn.get_time()
        users = conn.get_users()
        att = conn.get_attendance()
        print(f"Device Time       : {t}")
        print(f"Firmware Version  : {conn.get_firmware_version()}")
        print(f"Enrolled Users    : {len(users)}")
        for u in users:
            print(f"  - ID: {u.user_id} | Name: {u.name} | Privilege: {u.privilege}")
        print(f"Attendance Logs   : {len(att)}")
        for a in att:
            print(f"  - User {a.user_id} at {a.timestamp} (Status: {a.status})")
    finally:
        conn.disconnect()

def cmd_sync_time():
    zk = get_device()
    conn = zk.connect()
    try:
        ph_tz = pytz.timezone('Asia/Manila')
        now_ph = datetime.now(ph_tz).replace(tzinfo=None)
        conn.set_time(now_ph)
        print(f"✅ Device time synchronized to Philippine Time: {now_ph.strftime('%Y-%m-%d %H:%M:%S')}")
    finally:
        conn.disconnect()

def cmd_clear_attendance(clear_supabase: bool = True):
    zk = get_device()
    conn = zk.connect()
    try:
        count = len(conn.get_attendance())
        conn.clear_attendance()
        print(f"✅ Cleared {count} attendance records from TA500 hardware memory.")
    finally:
        conn.disconnect()

    if clear_supabase and SUPABASE_URL and SUPABASE_KEY:
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        sb.table('attendance_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        print("✅ Cleared all attendance records from Supabase database.")

def cmd_delete_user(user_id: str):
    zk = get_device()
    conn = zk.connect()
    try:
        conn.delete_user(user_id=int(user_id))
        print(f"✅ User ID {user_id} deleted from TA500 device.")
    finally:
        conn.disconnect()

    if SUPABASE_URL and SUPABASE_KEY:
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        sb.table('employees').delete().eq('device_user_id', str(user_id)).execute()
        print(f"✅ Employee ID {user_id} removed from Supabase.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="TA500 Device Management Tools")
    parser.add_argument('action', choices=['status', 'sync-time', 'clear-attendance', 'delete-user'], help="Action to perform")
    parser.add_argument('--user-id', help="User ID (required for delete-user)")
    args = parser.parse_args()

    if args.action == 'status':
        cmd_status()
    elif args.action == 'sync-time':
        cmd_sync_time()
    elif args.action == 'clear-attendance':
        cmd_clear_attendance()
    elif args.action == 'delete-user':
        if not args.user_id:
            print("Error: --user-id is required for delete-user")
            sys.exit(1)
        cmd_delete_user(args.user_id)
