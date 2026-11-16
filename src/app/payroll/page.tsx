import { createClient } from '@/lib/supabase/server'
import { PayrollClient } from './PayrollClient'

export const dynamic = 'force-dynamic'

export default async function PayrollPage() {
  const supabase = await createClient()

  const { data: employees } = await supabase
    .from('employees')
    .select('branch')

  const branches = Array.from(
    new Set((employees ?? []).map((e) => e.branch).filter(Boolean))
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Philippine DOLE Payroll &amp; Salary Engine
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Automated computation of regular hours, overtime, holidays, and night differential
          </p>
        </div>
      </div>

      <PayrollClient branches={branches} />
    </div>
  )
}
