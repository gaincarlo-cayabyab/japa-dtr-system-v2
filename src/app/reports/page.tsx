import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken, checkUserCanEdit } from '@/lib/auth'
import type { DailyDtr } from '@/types/database'
import { ReportsClient } from './ReportsClient'
import { PageBanner } from '@/components/PageBanner'
import { FileSpreadsheet, FileText, Clock, CheckCircle2, Calendar } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = await createClient()

  const cookieStore = await cookies()
  const token = cookieStore.get('japa_session')?.value
  const session = token ? verifySessionToken(token) : null
  const authCheck = session ? await checkUserCanEdit(session, supabase) : { canEdit: false }

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

  const totalShifts = (dtrData ?? []).length
  const completedCount = (dtrData ?? []).filter((r) => r.shift_status === 'Completed').length

  return (
    <div className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <PageBanner
        theme="reports"
        pattern="diagonal"
        eyebrow="Automated Timekeeping Ledger · Exact & Normalized Engines"
        eyebrowIcon={<FileText className="w-3.5 h-3.5 text-sky-700" />}
        icon={<FileSpreadsheet className="w-5 h-5 text-white" />}
        title="Daily Time Record (DTR) Reports"
        description="Review per-employee daily shifts, overtime hours, tardiness, shift notes, and export formatted Excel timesheets."
        chips={[
          {
            icon: <Calendar className="w-3.5 h-3.5 text-sky-600" />,
            label: `${totalShifts.toLocaleString()} Shift Records`,
          },
          {
            icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
            label: `${completedCount.toLocaleString()} Completed Shifts`,
          },
          {
            icon: <Clock className="w-3.5 h-3.5 text-cyan-600" />,
            label: '9 AM Start · 12–1 PM Lunch',
          },
        ]}
      />

      <ReportsClient
        initialData={(dtrData ?? []) as DailyDtr[]}
        employees={employeesData ?? []}
        branches={branches}
        initialUser={session ? {
          username: session.username,
          displayName: session.displayName,
          role: session.role,
          canEdit: authCheck.canEdit,
        } : null}
        initialCanEdit={authCheck.canEdit}
      />
    </div>
  )
}
