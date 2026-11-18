import { createClient } from '@/lib/supabase/server'
import { SyncClient } from './SyncClient'
import type { AttendanceLog } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function SyncPage() {
  const supabase = await createClient()

  const [{ data: recentLogs }, { count: totalRecords }, { data: lastSyncRow }] = await Promise.all([
    supabase
      .from('attendance_logs')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(20),
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('attendance_logs')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const lastSync = lastSyncRow?.synced_at ?? null

  return (
    <SyncClient
      initialTotalRecords={totalRecords ?? 0}
      initialLastSync={lastSync}
      initialRecentLogs={(recentLogs as AttendanceLog[]) || []}
    />
  )
}
