import { createClient } from '@/lib/supabase/server'
import { SyncClient } from './SyncClient'
import type { AttendanceLog } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function SyncPage() {
  const supabase = await createClient()

  const [{ data: recentLogs }, { count: totalRecords }, { data: lastSyncRow }, { data: metaRows }] = await Promise.all([
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
    supabase
      .from('sync_meta')
      .select('key, value')
      .in('key', ['bridge_heartbeat', 'ta500_status', 'ta500_last_seen', 'ta500_records']),
  ])

  const lastSync = lastSyncRow?.synced_at ?? null

  const metaMap: Record<string, number> = {}
  for (const row of metaRows || []) {
    metaMap[row.key] = row.value
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const bridgeHeartbeat = metaMap['bridge_heartbeat'] || 0
  const ta500Status = metaMap['ta500_status'] || 0
  const ta500LastSeen = metaMap['ta500_last_seen'] || 0
  const bridgeOnline = bridgeHeartbeat > 0 && (nowSec - bridgeHeartbeat <= 35)
  const ta500Online = bridgeOnline && ta500Status === 1 && (nowSec - ta500LastSeen <= 45)
  const heartbeatAgeSec = bridgeHeartbeat > 0 ? Math.max(0, nowSec - bridgeHeartbeat) : 9999

  return (
    <SyncClient
      initialTotalRecords={totalRecords ?? 0}
      initialLastSync={lastSync}
      initialRecentLogs={(recentLogs as AttendanceLog[]) || []}
      initialBridgeOnline={bridgeOnline}
      initialTa500Online={ta500Online}
      initialHeartbeatAgeSec={heartbeatAgeSec}
    />
  )
}
