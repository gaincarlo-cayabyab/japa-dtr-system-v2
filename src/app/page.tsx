import { createClient } from '@/lib/supabase/server'
import { startOfDay, startOfMonth } from 'date-fns'
import { DashboardClient } from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const now = new Date()
  const todayISO = startOfDay(now).toISOString()
  const monthISO = startOfMonth(now).toISOString()

  // Initial server fetch
  const [
    { count: totalEmployees },
    { count: todayPunches },
    { count: monthRecords },
    { data: recentPunches },
    { data: presentToday },
  ] = await Promise.all([
    supabase.from('employees').select('*', { count: 'exact', head: true }),
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .gte('punch_time', todayISO),
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .gte('punch_time', monthISO),
    supabase
      .from('attendance_logs')
      .select('id, device_user_id, punch_time, status, employees(full_name)')
      .order('punch_time', { ascending: false })
      .limit(10),
    supabase
      .from('attendance_logs')
      .select('device_user_id')
      .gte('punch_time', todayISO)
      .eq('status', 0),
  ])

  const presentCount = new Set(
    (presentToday ?? []).map((r) => r.device_user_id)
  ).size

  const initialStats = {
    totalEmployees: totalEmployees ?? 0,
    todayPunches: todayPunches ?? 0,
    presentCount,
    monthRecords: monthRecords ?? 0,
  }

  return (
    <DashboardClient
      initialStats={initialStats}
      initialRecentPunches={recentPunches ?? []}
      todayISO={todayISO}
      monthISO={monthISO}
    />
  )
}
