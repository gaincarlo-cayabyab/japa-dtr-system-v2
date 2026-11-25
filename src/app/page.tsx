import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './DashboardClient'
import {
  buildDashboardAnalytics,
  getManilaNowParts,
  type DtrAnalyticsRow,
  type EmployeeAnalyticsRow,
  type PunchAnalyticsRow,
} from '@/lib/dashboardAnalytics'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { todayDateStr, monthPrefix, todayStartISO } = getManilaNowParts()

  const [
    { data: employeesData },
    { count: allTimePunches },
    { data: todayPunchesData },
    { data: recentPunchesData },
    { data: dtrRecords },
    { data: metaRows },
  ] = await Promise.all([
    supabase
      .from('employees')
      .select('id, device_user_id, full_name, branch, department, position')
      .order('full_name'),
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('attendance_logs')
      .select('id, device_user_id, punch_time, status')
      .gte('punch_time', todayStartISO),
    supabase
      .from('attendance_logs')
      .select('device_user_id, punch_time, status')
      .order('punch_time', { ascending: false })
      .limit(1500),
    supabase
      .from('daily_dtr')
      .select(
        'work_date, device_user_id, full_name, branch, first_check_in, last_check_out, total_punches, hours_worked, overtime_hours, shift_status'
      )
      .order('work_date', { ascending: false })
      .limit(1000),
    supabase
      .from('sync_meta')
      .select('key, value')
      .in('key', ['bridge_heartbeat', 'ta500_status', 'ta500_last_seen', 'ta500_records', 'bridge_version']),
  ])

  const metaMap: Record<string, number> = {}
  for (const row of metaRows ?? []) {
    const numVal = typeof row.value === 'number' ? row.value : Number(row.value)
    if (!isNaN(numVal)) metaMap[row.key] = numVal
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const bridgeHeartbeat = metaMap['bridge_heartbeat'] || 0
  const ta500Status = metaMap['ta500_status'] || 0
  const ta500LastSeen = metaMap['ta500_last_seen'] || 0
  const ta500Records = metaMap['ta500_records'] || (allTimePunches ?? 0)
  const bridgeVersionNum = metaMap['bridge_version'] || 189
  const bridgeVersion =
    bridgeVersionNum >= 100 ? `v${(bridgeVersionNum / 10).toFixed(1)}` : `v${bridgeVersionNum}.0`
  const bridgeOnline = bridgeHeartbeat > 0 && nowSec - bridgeHeartbeat <= 60
  const effectiveLastSeen = ta500LastSeen > 0 ? ta500LastSeen : ta500Status === 1 ? bridgeHeartbeat : 0
  const ta500Online = bridgeOnline && ta500Status === 1 && (effectiveLastSeen > 0 && nowSec - effectiveLastSeen <= 60)
  const heartbeatAgeSec = bridgeHeartbeat > 0 ? Math.max(0, nowSec - bridgeHeartbeat) : 9999

  const initialData = buildDashboardAnalytics({
    employees: (employeesData ?? []) as EmployeeAnalyticsRow[],
    allTimePunches: allTimePunches ?? 0,
    todayPunches: (todayPunchesData ?? []) as PunchAnalyticsRow[],
    recentPunches: (recentPunchesData ?? []) as PunchAnalyticsRow[],
    dtrRecords: (dtrRecords ?? []) as DtrAnalyticsRow[],
    todayDateStr,
    monthPrefix,
    bridgeMeta: {
      bridgeOnline,
      ta500Online,
      bridgeVersion,
      heartbeatAgeSec,
      ta500Records,
    },
  })

  return <DashboardClient initialData={initialData} />
}
