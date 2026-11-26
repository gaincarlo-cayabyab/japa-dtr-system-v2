import { createClient } from '@/lib/supabase/server'
import type { Employee } from '@/types/database'
import { EmployeeManager } from './EmployeeManager'
import { PageBanner } from '@/components/PageBanner'
import { Users, Building2, UserCheck, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .order('full_name')

  const { data: compensation } = await supabase
    .from('employee_compensation')
    .select('*')

  const compMap = new Map<string, { daily_rate: number; hourly_rate: number; schedule_type: string }>()
  compensation?.forEach((c) => {
    const daily = Number(c.daily_rate) || 550.0
    const hourly = c.hourly_rate ? Number(c.hourly_rate) : Math.round((daily / 8) * 100) / 100
    compMap.set(c.device_user_id, {
      daily_rate: daily,
      hourly_rate: hourly,
      schedule_type: c.schedule_type || 'mon_sat',
    })
  })

  const employeesWithRate = (employees ?? []).map((emp) => {
    const comp = compMap.get(emp.device_user_id)
    return {
      ...emp,
      daily_rate: comp?.daily_rate ?? 550.0,
      hourly_rate: comp?.hourly_rate ?? 68.75,
      schedule_type: comp?.schedule_type ?? (emp.full_name.includes('GAIN CARLO') ? 'mon_fri' : 'mon_sat'),
    }
  })

  const totalEmployees = (employees ?? []).length
  const unmappedCount = (employees ?? []).filter((e) =>
    e.full_name.includes('NN-')
  ).length
  const branchCount = new Set((employees ?? []).map((e) => e.branch).filter(Boolean)).size

  return (
    <div className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <PageBanner
        theme="employees"
        pattern="dots"
        eyebrow="Workforce Master Roster & Compensation Profiles"
        eyebrowIcon={<Users className="w-3.5 h-3.5 text-violet-700" />}
        icon={<Users className="w-5 h-5 text-white" />}
        title="Employee Directory & Device Mapping"
        description="Manage biometric device ID assignments, branch rosters, weekly schedules, and daily wage rates across payroll."
        chips={[
          {
            icon: <UserCheck className="w-3.5 h-3.5 text-violet-600" />,
            label: `${totalEmployees} Enrolled Personnel`,
          },
          {
            icon: <Building2 className="w-3.5 h-3.5 text-purple-600" />,
            label: `${branchCount} Active Branches`,
          },
          {
            icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
            label: unmappedCount > 0 ? `${unmappedCount} Unmapped Profiles` : 'All Device IDs Mapped',
          },
        ]}
      />

      {unmappedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
          <span className="text-lg">⚠️</span>
          <span>
            <strong>{unmappedCount} employee(s)</strong> have unmapped device IDs (names starting with <code className="font-mono">NN-</code>).
            Edit them to assign proper names.
          </span>
        </div>
      )}

      <EmployeeManager initialEmployees={employeesWithRate as (Employee & { daily_rate?: number })[]} />
    </div>
  )
}
