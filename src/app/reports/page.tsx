import { createClient } from '@/lib/supabase/server'
import type { DailyDtr } from '@/types/database'
import { ReportsClient } from './ReportsClient'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = await createClient()

  const { data: dtrData } = await supabase
    .from('daily_dtr')
    .select('*')
    .order('work_date', { ascending: false })
    .order('full_name')

  const { data: employeesData } = await supabase
    .from('employees')
    .select('id, device_user_id, full_name, branch, position, department')
    .order('full_name')

  const branches = Array.from(
    new Set((employeesData ?? []).map((e) => e.branch).filter(Boolean))
  ).sort() as string[]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">DTR Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Daily Time Record summary with export
        </p>
      </div>

      <ReportsClient
        initialData={(dtrData ?? []) as DailyDtr[]}
        employees={employeesData ?? []}
        branches={branches}
      />
    </div>
  )
}
