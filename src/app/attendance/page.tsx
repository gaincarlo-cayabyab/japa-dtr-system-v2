import { createClient } from '@/lib/supabase/server'
import type { AttendanceLog, Employee } from '@/types/database'
import { AttendanceTable } from './AttendanceTable'

export const dynamic = 'force-dynamic'

export default async function AttendancePage() {
  const supabase = await createClient()

  const [{ data: logs }, { data: employees }] = await Promise.all([
    supabase
      .from('attendance_logs')
      .select('*')
      .order('punch_time', { ascending: false })
      .limit(500),
    supabase.from('employees').select('*').order('full_name'),
  ])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Live punch records from FingerTec TA500
        </p>
      </div>

      <AttendanceTable
        initialLogs={(logs ?? []) as AttendanceLog[]}
        employees={(employees ?? []) as Employee[]}
      />
    </div>
  )
}
