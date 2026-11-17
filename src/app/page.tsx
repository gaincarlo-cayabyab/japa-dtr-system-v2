import { createClient } from '@/lib/supabase/server'
import { startOfDay, startOfMonth } from 'date-fns'
import { DashboardClient } from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const now = new Date()
  const todayISO = startOfDay(now).toISOString()
  const monthISO = startOfMonth(now).toISOString()

  // Parallel fetch of all analytics datasets
  const [
    { data: employeesData, count: totalEmployees },
    { count: allTimePunches },
    { data: todayPunchesData },
    { data: recentPunchesForHours },
    { data: dtrRecords },
  ] = await Promise.all([
    supabase
      .from('employees')
      .select('id, device_user_id, full_name, branch, department', { count: 'exact' })
      .order('full_name'),
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('attendance_logs')
      .select('id, device_user_id, punch_time, status')
      .gte('punch_time', todayISO),
    supabase
      .from('attendance_logs')
      .select('punch_time')
      .order('punch_time', { ascending: false })
      .limit(600),
    supabase
      .from('daily_dtr')
      .select('work_date, hours_worked, overtime_hours, shift_status, branch, full_name, first_check_in, last_check_out')
      .order('work_date', { ascending: false })
      .limit(350),
  ])

  // 1. Calculate Active Attendance Today
  const presentEmployeesSet = new Set((todayPunchesData ?? []).map((p) => p.device_user_id))
  const todayPresentCount = presentEmployeesSet.size
  const totalEmpCount = totalEmployees ?? (employeesData?.length || 24)
  const attendanceRate = totalEmpCount > 0 ? Math.round((todayPresentCount / totalEmpCount) * 100) : 0

  // 2. Aggregate Monthly Hours and OT from DTR
  const allDtr = dtrRecords ?? []
  const monthDtr = allDtr.filter((r) => r.work_date >= monthISO.slice(0, 10))
  const totalMonthHours = Math.round(monthDtr.reduce((acc, r) => acc + (Number(r.hours_worked) || 0), 0))
  const totalMonthOvertime = Math.round(monthDtr.reduce((acc, r) => acc + (Number(r.overtime_hours) || 0), 0) * 10) / 10

  // 3. 7-Day Trend Analysis
  const trendMap = new Map<string, { present: number; hours: number; completed: number; overtime: number }>()
  for (const r of allDtr) {
    const d = r.work_date
    if (!trendMap.has(d)) {
      trendMap.set(d, { present: 0, hours: 0, completed: 0, overtime: 0 })
    }
    const entry = trendMap.get(d)!
    entry.present += 1
    entry.hours += Number(r.hours_worked) || 0
    entry.overtime += Number(r.overtime_hours) || 0
    if (r.shift_status === 'Completed') {
      entry.completed += 1
    }
  }

  // Get last 7 active dates sorted chronologically
  const sortedDates = Array.from(trendMap.keys()).sort().slice(-7)
  const weeklyTrends = sortedDates.map((dateStr) => {
    const entry = trendMap.get(dateStr)!
    const d = new Date(dateStr)
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
    return {
      date: dateStr,
      label: dayLabel,
      present: entry.present,
      hours: Math.round(entry.hours),
      completed: entry.completed,
      overtime: Math.round(entry.overtime * 10) / 10,
      rate: totalEmpCount > 0 ? Math.round((entry.present / totalEmpCount) * 100) : 0,
    }
  })

  // 4. Hourly Punch Activity (Manila Time UTC+8)
  const hourlyCounts = new Array(24).fill(0)
  for (const p of recentPunchesForHours ?? []) {
    if (!p.punch_time) continue
    try {
      const dt = new Date(p.punch_time)
      // +8 hours for Manila
      const manilaHour = (dt.getUTCHours() + 8) % 24
      hourlyCounts[manilaHour] += 1
    } catch {
      // ignore parse errors
    }
  }

  // 5. Branch Distribution
  const branchMap = new Map<string, { total: number; present: number }>()
  for (const emp of employeesData ?? []) {
    const b = emp.branch || 'Dagupan Main'
    if (!branchMap.has(b)) branchMap.set(b, { total: 0, present: 0 })
    const item = branchMap.get(b)!
    item.total += 1
    if (presentEmployeesSet.has(emp.device_user_id)) {
      item.present += 1
    }
  }
  const branchStats = Array.from(branchMap.entries()).map(([branch, counts]) => ({
    branch,
    total: counts.total,
    present: counts.present,
    rate: counts.total > 0 ? Math.round((counts.present / counts.total) * 100) : 0,
  }))

  // 6. Shift Status Distribution
  let completedShifts = 0
  let incompleteShifts = 0
  let activeTodayShifts = 0
  for (const r of allDtr) {
    if (r.shift_status === 'Completed') completedShifts += 1
    else incompleteShifts += 1
  }
  activeTodayShifts = todayPresentCount

  const initialData = {
    stats: {
      totalEmployees: totalEmpCount,
      todayPunches: todayPunchesData?.length ?? 0,
      todayPresent: todayPresentCount,
      attendanceRate,
      allTimePunches: allTimePunches ?? 512,
      totalMonthHours,
      totalMonthOvertime,
      activeTodayShifts,
    },
    weeklyTrends,
    hourlyCounts,
    branchStats,
    shiftCompliance: {
      completed: completedShifts,
      incomplete: incompleteShifts,
      total: completedShifts + incompleteShifts,
      completionRate: (completedShifts + incompleteShifts) > 0
        ? Math.round((completedShifts / (completedShifts + incompleteShifts)) * 100)
        : 90,
    },
    todayISO,
    monthISO,
  }

  return <DashboardClient {...initialData} />
}
