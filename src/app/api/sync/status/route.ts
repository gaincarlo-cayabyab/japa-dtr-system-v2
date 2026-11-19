import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const t0 = Date.now()
  try {
    const supabase = await createClient()

    const [logsResult, countResult, recentPunches, metaResult] = await Promise.all([
      supabase
        .from('attendance_logs')
        .select('synced_at, punch_time, device_user_id')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('attendance_logs')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('attendance_logs')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(10),
      supabase
        .from('sync_meta')
        .select('key, value')
        .in('key', ['bridge_heartbeat', 'ta500_status', 'ta500_last_seen', 'ta500_records', 'bridge_version']),
    ])

    const dbLatencyMs = Date.now() - t0
    const lastSync = logsResult.data?.synced_at ?? null

    // Parse live heartbeat metadata from tablet bridge
    const metaMap: Record<string, number> = {}
    for (const row of metaResult.data || []) {
      metaMap[row.key] = row.value
    }

    const nowSec = Math.floor(Date.now() / 1000)
    const bridgeHeartbeat = metaMap['bridge_heartbeat'] || 0
    const ta500Status = metaMap['ta500_status'] || 0
    const ta500LastSeen = metaMap['ta500_last_seen'] || 0
    const ta500Records = metaMap['ta500_records'] || 0
    const bridgeVersion = metaMap['bridge_version'] || 16

    // Bridge is alive if heartbeat arrived within last 45 seconds
    const bridgeOnline = bridgeHeartbeat > 0 && (nowSec - bridgeHeartbeat <= 45)

    // TA500 is alive if bridge is alive AND device status is 1 AND last seen within last 25 seconds
    const ta500Online = bridgeOnline && ta500Status === 1 && (nowSec - ta500LastSeen <= 25)

    const heartbeatAgeSec = bridgeHeartbeat > 0 ? Math.max(0, nowSec - bridgeHeartbeat) : 9999

    // Determine freshness: active if last sync < 30 minutes ago, or < 24h
    let syncHealth: 'healthy' | 'warning' | 'stale' = 'healthy'
    if (!bridgeOnline || !ta500Online) {
      syncHealth = 'stale'
    } else if (lastSync) {
      const diffMinutes = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60)
      if (diffMinutes > 120) {
        syncHealth = 'stale'
      } else if (diffMinutes > 30) {
        syncHealth = 'warning'
      }
    }

    return NextResponse.json({
      success: true,
      db_latency_ms: dbLatencyMs,
      last_sync: lastSync,
      total_records: countResult.count ?? 0,
      sync_health: syncHealth,
      bridge_online: bridgeOnline,
      ta500_online: ta500Online,
      ta500_records: ta500Records,
      bridge_version: bridgeVersion,
      heartbeat_age_sec: heartbeatAgeSec,
      device: {
        model: 'FingerTec TA500 Biometric Terminal',
        ip: '192.168.0.58',
        port: 4370,
        protocol: 'ZKTeco UDP',
        location: 'Dagupan Main Branch',
        lan_mac: '00:17:61:A4:8F:12',
      },
      repeater: {
        model: 'Wi-Fi Range Extender (Ethernet Bridge)',
        ip: '192.168.0.254',
        lan_port: 'RJ45 Fast Ethernet (Connected to TA500)',
        wifi_band: '2.4 GHz 802.11b/g/n',
      },
      wifi_router: {
        ssid: 'JAPA_OFFICE_WLAN',
        gateway: '192.168.0.1',
        security: 'WPA2-PSK',
      },
      tablet_bridge: {
        device: 'Samsung Galaxy Tab A9+ (SM-X210)',
        os: 'Android 14 / Termux',
        engine_version: 'Bridge Engine v16.2',
        poll_interval_sec: 8,
        anti_double_tap_min: 5,
        architecture: 'Direct Buffer Fast Extractor (Zero-Timeout)',
        scheduled_restart: 'Option B Hourly Protected Rest (Termux Cron)',
      },
      cloud: {
        provider: 'Supabase PostgreSQL',
        region: 'Singapore (ap-southeast-1)',
        table: 'attendance_logs',
        frontend: 'Vercel Edge Network (japa-dtr-system.vercel.app)',
      },
      recent_logs: recentPunches.data || [],
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({
      success: false,
      error: message,
      db_latency_ms: Date.now() - t0,
    }, { status: 500 })
  }
}
