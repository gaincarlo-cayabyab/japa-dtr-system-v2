import { createClient } from '@/lib/supabase/server'
import { Users, Clock, UserCheck, Calendar, Radio } from 'lucide-react'
import { format, startOfDay, startOfMonth } from 'date-fns'
import { PUNCH_STATUS, PUNCH_STATUS_COLOR } from '@/types/database'

// ── helpers ────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: number | string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: number | string }) {
  const numericStatus = Number(status)
  const colorClass =
    PUNCH_STATUS_COLOR[numericStatus] ??
    'bg-slate-100 text-slate-600'
  const label =
    PUNCH_STATUS[numericStatus] ?? `Status ${status}`
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}
    >
      {label}
    </span>
  )
}

// ── page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()

  const now = new Date()
  const todayISO = startOfDay(now).toISOString()
  const monthISO = startOfMonth(now).toISOString()

  // Parallel fetches
  const [
    { count: totalEmployees },
    { count: todayPunches },
    { count: monthRecords },
    { data: recentPunches },
    { data: presentToday },
  ] = await Promise.all([
    supabase
      .from('employees')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .gte('punch_time', todayISO),
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .gte('punch_time', monthISO),
    supabase
      .from('attendance_logs')
      .select('id, device_user_id, punch_time, status, employees(full_name)')
      .order('punch_time', { ascending: false })
      .limit(10),
    supabase
      .from('attendance_logs')
      .select('device_user_id', { count: 'exact' })
      .gte('punch_time', todayISO)
      .eq('status', 0),
  ])

  const presentCount = new Set(
    (presentToday ?? []).map((r) => r.device_user_id)
  ).size

  const stats = [
    {
      title: 'Total Employees',
      value: totalEmployees ?? 0,
      icon: Users,
      color: 'bg-blue-600',
    },
    {
      title: "Today's Punches",
      value: todayPunches ?? 0,
      icon: Clock,
      color: 'bg-indigo-500',
    },
    {
      title: 'Present Today',
      value: presentCount,
      icon: UserCheck,
      color: 'bg-emerald-500',
    },
    {
      title: "This Month's Records",
      value: monthRecords ?? 0,
      icon: Calendar,
      color: 'bg-violet-500',
    },
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            {format(now, "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold">
          <Radio className="w-3 h-3" />
          Live — syncing from TA500
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* Recent punches */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent Punches</h2>
          <span className="text-xs text-slate-400">Last 10 records</span>
        </div>

        {!recentPunches || recentPunches.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No attendance records yet</p>
            <p className="text-slate-400 text-sm mt-1">
              Records will appear here once the TA500 bridge syncs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Device User ID
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Punch Time
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentPunches.map((log) => {
                  const employee = Array.isArray(log.employees)
                    ? log.employees[0]
                    : log.employees
                  const name = employee?.full_name ?? '—'
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {name}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                        {log.device_user_id}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {format(new Date(log.punch_time), 'MMM d, yyyy h:mm a')}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={log.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
