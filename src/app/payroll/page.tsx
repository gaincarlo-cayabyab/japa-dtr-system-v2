import { createClient } from '@/lib/supabase/server'
import { PayrollClient } from './PayrollClient'
import { PageBanner } from '@/components/PageBanner'
import { Calculator, Scale, Moon, TrendingUp, Building2 } from 'lucide-react'

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
      <PageBanner
        theme="payroll"
        pattern="rings"
        eyebrow="Philippine DOLE Labor Standards · Automated Wage Engine"
        eyebrowIcon={<Scale className="w-3.5 h-3.5 text-amber-700" />}
        icon={<Calculator className="w-5 h-5 text-white" />}
        title="Philippine DOLE Payroll & Salary Engine"
        description="Automated cutoff payroll computation for regular hours, overtime, holiday multipliers, rest days, and night differential."
        chips={[
          {
            icon: <Building2 className="w-3.5 h-3.5 text-amber-600" />,
            label: `${branches.length} Office Branches`,
          },
          {
            icon: <TrendingUp className="w-3.5 h-3.5 text-orange-600" />,
            label: 'OT & Holiday Multipliers',
          },
          {
            icon: <Moon className="w-3.5 h-3.5 text-rose-600" />,
            label: 'Night Diff +10% & Sunday +30%',
          },
        ]}
      />

      <PayrollClient branches={branches} />
    </div>
  )
}
