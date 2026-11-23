import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const token = request.cookies.get('japa_session')?.value
    const session = token ? verifySessionToken(token) : null

    // Strictly Super Admin Only
    const isSuperAdmin = session && (session.role === 'super_admin' || session.username === 'admin')
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Only Super Administrator (IT Administrator) can dispatch remote hardware restart commands.' },
        { status: 403 }
      )
    }

    const nowSec = Math.floor(Date.now() / 1000)

    // Note: sync_meta.value is BIGINT in Supabase PostgreSQL — strictly integers only
    const payload = [
      { key: 'restart_ta500', value: 1 },
      { key: 'restart_hardware', value: 1 },
      { key: 'restart_requested_at', value: nowSec },
    ]

    const { error } = await supabase
      .from('sync_meta')
      .upsert(payload, { onConflict: 'key' })

    if (error) {
      console.error('Failed to queue TA500 restart:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'TA500 Remote Hardware Restart signal dispatched to Tablet Bridge!',
      estimated_seconds: 45,
      requested_at: nowSec,
      steps: [
        { step: 1, label: 'Cloud Handshake', duration_sec: 5, detail: 'Signal dispatched to Supabase CDC sync_meta' },
        { step: 2, label: 'Bridge Signal Injection', duration_sec: 7, detail: 'Tablet daemon transmits ZKTeco CMD_RESTART packet' },
        { step: 3, label: 'Hardware Microcontroller Boot', duration_sec: 18, detail: 'TA500 flash sync, CPU reboot & memory reset' },
        { step: 4, label: 'Sensor Calibration & Reconnect', duration_sec: 15, detail: 'Optical prism recalibration & bridge keepalive restored' },
      ],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error during restart dispatch'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('sync_meta')
      .select('key, value')
      .in('key', ['restart_ta500', 'restart_hardware', 'restart_requested_at', 'bridge_heartbeat', 'ta500_status'])

    const map: Record<string, number> = {}
    for (const r of data || []) {
      map[r.key] = typeof r.value === 'number' ? r.value : Number(r.value)
    }

    const pending = (map['restart_ta500'] === 1 || map['restart_hardware'] === 1)
    const requestedAt = map['restart_requested_at'] || 0
    const nowSec = Math.floor(Date.now() / 1000)
    const elapsedSec = requestedAt > 0 ? Math.max(0, nowSec - requestedAt) : 0

    return NextResponse.json({
      success: true,
      pending,
      requested_at: requestedAt,
      elapsed_sec: elapsedSec,
      bridge_alive: map['bridge_heartbeat'] > 0 && (nowSec - map['bridge_heartbeat'] <= 60),
      ta500_online: map['ta500_status'] === 1,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
