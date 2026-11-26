import { createClient } from '@/lib/supabase/server'
import type { AttendanceLog, Employee } from '@/types/database'
import { AttendanceTable } from './AttendanceTable'
import { PageBanner } from '@/components/PageBanner'
import { Clock, Fingerprint, Radio, ShieldCheck, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AttendancePage() {
  const supabase = await createClient()

  const [{ data: logs, count: totalCount }, { data: employees }] = await Promise.all([
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact' })
      .order('punch_time', { ascending: false })
      .limit(2500),
    supabase.from('employees').select('*').order('full_name'),
  ])

  const scanTotal = totalCount ?? (logs?.length || 0)
  const employeeTotal = (employees ?? []).length

  return (
    <div className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <PageBanner
        theme="attendance"
        pattern="waves"
        eyebrow="Real-Time Biometric Stream · FingerTec TA500"
        eyebrowIcon={<Fingerprint className="w-3.5 h-3.5 text-emerald-700" />}
        icon={<Clock className="w-5 h-5 text-white" />}
        title="Attendance Logs & Live Scan Feed"
        description="Inspect chronological fingerprint and PIN scans synced from the TA500 terminal and apply instant punch edits."
        chips={[
          {
            icon: <Fingerprint className="w-3.5 h-3.5 text-emerald-600" />,
            label: `${scanTotal.toLocaleString()} Total Scans`,
          },
          {
            icon: <Users className="w-3.5 h-3.5 text-teal-600" />,
            label: `${employeeTotal} Mapped Staff`,
          },
          {
            icon: <Radio className="w-3.5 h-3.5 text-cyan-600" />,
            label: 'Realtime CDC Sync',
          },
          {
            icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />,
            label: '15s Anti-Double Tap',
          },
        ]}
      />

      <AttendanceTable
        initialLogs={(logs ?? []) as AttendanceLog[]}
        employees={(employees ?? []) as Employee[]}
        initialTotalCount={scanTotal}
      />
    </div>
  )
}
