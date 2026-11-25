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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageBanner
        theme="attendance"
        pattern="waves"
        eyebrow="Real-Time Biometric Stream · FingerTec TA500"
        eyebrowIcon={<Fingerprint className="w-3.5 h-3.5 text-emerald-200" />}
        icon={<Clock className="w-6 h-6 text-white" />}
        title="Attendance Logs & Live Scan Feed"
        description="Inspect chronological fingerprint and PIN scans synced from the TA500 terminal, filter by employee or date, and apply instant administrative punch corrections."
        chips={[
          {
            icon: <Fingerprint className="w-3.5 h-3.5 text-emerald-200" />,
            label: `${scanTotal.toLocaleString()} Total Biometric Scans`,
          },
          {
            icon: <Users className="w-3.5 h-3.5 text-teal-200" />,
            label: `${employeeTotal} Mapped Personnel`,
          },
          {
            icon: <Radio className="w-3.5 h-3.5 text-cyan-200" />,
            label: 'Realtime CDC Auto-Refresh',
          },
          {
            icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-200" />,
            label: '15s Anti-Double Tap Guard',
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
