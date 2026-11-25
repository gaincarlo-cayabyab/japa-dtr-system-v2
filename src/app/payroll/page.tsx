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
        eyebrowIcon={<Scale className="w-3.5 h-3.5 text-amber-200" />}
        icon={<Calculator className="w-6 h-6 text-white" />}
        title="Philippine DOLE Payroll & Salary Engine"
        description="Automated salary computation across semi-monthly cutoffs including exact/normalized shifts, overtime pay, holiday multipliers, rest-day premiums, night differential, and payslip tracking."
        chips={[
          {
            icon: <Building2 className="w-3.5 h-3.5 text-amber-100" />,
            label: `${branches.length} Office Branches`,
          },
          {
            icon: <TrendingUp className="w-3.5 h-3.5 text-yellow-200" />,
            label: 'Regular & Overtime Multipliers',
          },
          {
            icon: <Moon className="w-3.5 h-3.5 text-orange-100" />,
            label: '10 PM – 6 AM Night Diff (+10%)',
          },
          {
            icon: <Scale className="w-3.5 h-3.5 text-rose-100" />,
            label: 'DOLE Holiday & Sunday +30%',
          },
        ]}
      />

      <PayrollClient branches={branches} />
    </div>
  )
}
