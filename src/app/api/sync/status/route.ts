import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const t0 = Date.now()
  try {
    const supabase = await createClient()

    const [logsResult, countResult, recentPunches] = await Promise.all([
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
    ])

    const dbLatencyMs = Date.now() - t0
    const lastSync = logsResult.data?.synced_at ?? null

    // Determine freshness: active if last sync < 30 minutes ago, or < 24h
    let syncHealth: 'healthy' | 'warning' | 'stale' = 'healthy'
    if (lastSync) {
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
        engine_version: 'Bridge Engine v15.2',
        poll_interval_sec: 60,
        anti_double_tap_min: 5,
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
