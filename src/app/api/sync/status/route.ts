import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const [logsResult, countResult] = await Promise.all([
    supabase
      .from('attendance_logs')
      .select('synced_at, punch_time, device_user_id')
      .order('synced_at', { ascending: false })
      .limit(1),
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    device: { ip: '192.168.68.146', port: 4370 },
    last_sync: logsResult.data?.[0]?.synced_at ?? null,
    total_records: countResult.count ?? 0,
    status: 'unknown', // bridge sets this via its own health file
  })
}
