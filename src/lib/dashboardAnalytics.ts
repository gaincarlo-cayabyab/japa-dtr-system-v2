import type { DailyDtr } from '@/types/database'

export interface WeeklyTrendPoint {
  date: string
  label: string
  shortDay: string
  present: number
  absent: number
  hours: number
  regularHours: number
  overtime: number
  completed: number
  onDuty: number
  incomplete: number
  rate: number
  avgCheckInMin: number | null
}

export interface HourlyActivityPoint {
  hour: number
  label: string
  shortLabel: string
  total: number
  checkIns: number
  checkOuts: number
  isPeak: boolean
}

export interface BranchStat {
  branch: string
  total: number
  present: number
  completed: number
  monthHours: number
  monthOvertime: number
  punctualityRate: number
  rate: number
}

export interface PunctualityBreakdown {
  early: { count: number; pct: number }
  onTime: { count: number; pct: number }
  graceLate: { count: number; pct: number }
  late: { count: number; pct: number }
  totalTracked: number
  punctualityRate: number
  avgCheckInLabel: string
}

export interface WeekdayAveragePoint {
  dayIndex: number
  dayLabel: string
  workdaysCount: number
  avgPresent: number
  avgRate: number
  avgHoursPerShift: number
}

export interface EmployeeHoursLeader {
  deviceUserId: string
  name: string
  branch: string
  department: string
  shifts: number
  completedShifts: number
  totalHours: number
  regularHours: number
  overtimeHours: number
  avgHoursPerShift: number
  punctualityRate: number
}

export interface TodayRosterRow {
  deviceUserId: string
  name: string
  branch: string
  department: string
  firstCheckIn: string | null
  lastCheckOut: string | null
  punchCount: number
  hoursWorked: number
  overtimeHours: number
  status: 'Completed' | 'On Duty' | 'Incomplete' | 'Not Punched'
  isLate: boolean
}

export interface BridgeTelemetryMeta {
  bridgeOnline: boolean
  ta500Online: boolean
  bridgeVersion: string
  heartbeatAgeSec: number
  ta500Records: number
}

export interface DashboardAnalyticsPayload {
  stats: {
    totalEmployees: number
    todayPunches: number
    todayPresent: number
    todayCompleted: number
    todayOnDuty: number
    todayAbsent: number
    attendanceRate: number
    allTimePunches: number
    totalMonthHours: number
    totalMonthRegularHours: number
    totalMonthOvertime: number
    avgDailyHours: number
    punctualityRate: number
    avgCheckInLabel: string
    peakTurnout: number
  }
  weeklyTrends: WeeklyTrendPoint[]
  hourlyActivity: HourlyActivityPoint[]
  branchStats: BranchStat[]
  shiftCompliance: {
    completed: number
    onDuty: number
    incomplete: number
    total: number
    completionRate: number
  }
  punctuality: PunctualityBreakdown
  weekdayAverages: WeekdayAveragePoint[]
  topEmployeesHours: EmployeeHoursLeader[]
  todayRoster: TodayRosterRow[]
  bridgeMeta: BridgeTelemetryMeta
  todayDateStr: string
  monthPrefix: string
}

export type DtrAnalyticsRow = Pick<
  DailyDtr,
  | 'work_date'
  | 'device_user_id'
  | 'full_name'
  | 'branch'
  | 'first_check_in'
  | 'last_check_out'
  | 'total_punches'
  | 'hours_worked'
  | 'overtime_hours'
  | 'shift_status'
>

export interface EmployeeAnalyticsRow {
  id: string
  device_user_id: string
  full_name: string
  branch: string
  department: string | null
  position?: string | null
}

export interface PunchAnalyticsRow {
  device_user_id?: string
  punch_time: string
  status?: number
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function getManilaNowParts(now: Date = new Date()) {
  const manilaMs = now.getTime() + 8 * 60 * 60 * 1000
  const m = new Date(manilaMs)
  const todayDateStr = m.toISOString().slice(0, 10)
  const monthPrefix = todayDateStr.slice(0, 7)
  const todayStartISO = `${todayDateStr}T00:00:00+08:00`
  const monthStartISO = `${monthPrefix}-01T00:00:00+08:00`
  return { todayDateStr, monthPrefix, todayStartISO, monthStartISO }
}

export function getManilaTimeParts(iso: string | null | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const m = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  const hour = m.getUTCHours()
  const minute = m.getUTCMinutes()
  return {
    dateStr: m.toISOString().slice(0, 10),
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
  }
}

export function formatMinutesToClock(totalMin: number | null): string {
  if (totalMin === null || isNaN(totalMin)) return '—'
  const rounded = Math.round(totalMin)
  const h24 = Math.floor(rounded / 60) % 24
  const m = rounded % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDateLabels(dateStr: string): { label: string; shortDay: string; weekdayIdx: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const weekdayIdx = dt.getUTCDay()
  const dayName = WEEKDAY_NAMES[weekdayIdx] || ''
  const monthName = MONTH_NAMES[(m - 1) % 12] || ''
  return {
    label: `${dayName}, ${monthName} ${d}`,
    shortDay: dayName,
    weekdayIdx,
  }
}

export function buildDashboardAnalytics(params: {
  employees: EmployeeAnalyticsRow[]
  allTimePunches: number
  todayPunches: PunchAnalyticsRow[]
  recentPunches: PunchAnalyticsRow[]
  dtrRecords: DtrAnalyticsRow[]
  todayDateStr: string
  monthPrefix: string
  bridgeMeta: BridgeTelemetryMeta
}): DashboardAnalyticsPayload {
  const {
    employees,
    allTimePunches,
    todayPunches,
    recentPunches,
    dtrRecords,
    todayDateStr,
    monthPrefix,
    bridgeMeta,
  } = params

  const empCount = employees.length
  const monthDtr = dtrRecords.filter((r) => r.work_date && r.work_date.startsWith(monthPrefix))
  const activeDtrBase = monthDtr.length > 0 ? monthDtr : dtrRecords

  // 1. Today attendance map by employee
  const todayPunchCountByEmp = new Map<string, number>()
  const todayPunchTimesByEmp = new Map<string, { first: string; last: string }>()
  for (const p of todayPunches) {
    const uid = p.device_user_id
    if (!uid) continue
    todayPunchCountByEmp.set(uid, (todayPunchCountByEmp.get(uid) || 0) + 1)
    const prev = todayPunchTimesByEmp.get(uid)
    if (!prev) {
      todayPunchTimesByEmp.set(uid, { first: p.punch_time, last: p.punch_time })
    } else {
      if (p.punch_time < prev.first) prev.first = p.punch_time
      if (p.punch_time > prev.last) prev.last = p.punch_time
    }
  }

  const todayDtrByEmp = new Map<string, DtrAnalyticsRow>()
  for (const r of dtrRecords) {
    if (r.work_date === todayDateStr) {
      todayDtrByEmp.set(r.device_user_id, r)
    }
  }

  const todayPresentSet = new Set<string>([
    ...Array.from(todayPunchCountByEmp.keys()),
    ...Array.from(todayDtrByEmp.keys()),
  ])

  let todayCompleted = 0
  let todayOnDuty = 0
  const todayRoster: TodayRosterRow[] = employees.map((emp) => {
    const dtr = todayDtrByEmp.get(emp.device_user_id)
    const rawTimes = todayPunchTimesByEmp.get(emp.device_user_id)
    const punchCount = dtr?.total_punches ?? todayPunchCountByEmp.get(emp.device_user_id) ?? 0
    const firstCheckIn = dtr?.first_check_in ?? rawTimes?.first ?? null
    const lastCheckOut =
      dtr?.last_check_out ?? (punchCount > 1 && rawTimes ? rawTimes.last : null)
    const hoursWorked = Math.round((Number(dtr?.hours_worked) || 0) * 10) / 10
    const overtimeHours = Math.round((Number(dtr?.overtime_hours) || 0) * 10) / 10

    let status: TodayRosterRow['status'] = 'Not Punched'
    if (dtr) {
      if (dtr.shift_status === 'Completed') {
        status = 'Completed'
        todayCompleted += 1
      } else if (dtr.shift_status === 'On Duty' || punchCount >= 1) {
        status = 'On Duty'
        todayOnDuty += 1
      } else {
        status = 'Incomplete'
      }
    } else if (punchCount >= 2 && hoursWorked >= 7.5) {
      status = 'Completed'
      todayCompleted += 1
    } else if (punchCount >= 1) {
      status = 'On Duty'
      todayOnDuty += 1
    }

    const inParts = getManilaTimeParts(firstCheckIn)
    const isLate = inParts ? inParts.totalMinutes > 9 * 60 + 5 : false

    return {
      deviceUserId: emp.device_user_id,
      name: emp.full_name,
      branch: emp.branch || 'Dagupan Main',
      department: emp.department || 'Operations',
      firstCheckIn,
      lastCheckOut,
      punchCount,
      hoursWorked,
      overtimeHours,
      status,
      isLate,
    }
  })

  // Sort roster: On Duty -> Completed -> Incomplete -> Not Punched, then check-in time / name
  const statusOrder: Record<TodayRosterRow['status'], number> = {
    'On Duty': 0,
    Completed: 1,
    Incomplete: 2,
    'Not Punched': 3,
  }
  todayRoster.sort((a, b) => {
    const diff = statusOrder[a.status] - statusOrder[b.status]
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })

  const todayPresentCount = todayPresentSet.size
  const todayAbsentCount = Math.max(0, empCount - todayPresentCount)
  const attendanceRate = empCount > 0 ? Math.round((todayPresentCount / empCount) * 100) : 0

  // 2. Monthly Hours & Average Check-In
  const rawMonthHours = monthDtr.reduce((acc, r) => acc + (Number(r.hours_worked) || 0), 0)
  const totalMonthHours = Math.round(rawMonthHours * 10) / 10
  const totalMonthOvertime =
    Math.round(monthDtr.reduce((acc, r) => acc + (Number(r.overtime_hours) || 0), 0) * 10) / 10
  const totalMonthRegularHours = Math.max(
    0,
    Math.round((totalMonthHours - totalMonthOvertime) * 10) / 10
  )

  const monthWithHours = monthDtr.filter((r) => Number(r.hours_worked) > 0)
  const avgDailyHours =
    monthWithHours.length > 0
      ? Math.round(
          (monthWithHours.reduce((a, r) => a + Number(r.hours_worked), 0) / monthWithHours.length) *
            10
        ) / 10
      : 0

  // 3. Punctuality Distribution (from active month or all recent DTR)
  let earlyCount = 0
  let onTimeCount = 0
  let graceLateCount = 0
  let lateCount = 0
  let checkInMinSum = 0
  let checkInTracked = 0

  const branchPunctualityMap = new Map<string, { onTimeOrEarly: number; total: number }>()

  for (const r of activeDtrBase) {
    const parts = getManilaTimeParts(r.first_check_in)
    if (!parts) continue
    const mins = parts.totalMinutes
    checkInMinSum += mins
    checkInTracked += 1

    const b = r.branch || 'Dagupan Main'
    if (!branchPunctualityMap.has(b)) branchPunctualityMap.set(b, { onTimeOrEarly: 0, total: 0 })
    const bp = branchPunctualityMap.get(b)!
    bp.total += 1

    if (mins < 8 * 60 + 30) {
      earlyCount += 1
      bp.onTimeOrEarly += 1
    } else if (mins <= 9 * 60 + 5) {
      onTimeCount += 1
      bp.onTimeOrEarly += 1
    } else if (mins <= 9 * 60 + 30) {
      graceLateCount += 1
    } else {
      lateCount += 1
    }
  }

  const pct = (count: number) =>
    checkInTracked > 0 ? Math.round((count / checkInTracked) * 100) : 0
  const punctualTotal = earlyCount + onTimeCount
  const punctualityRate =
    checkInTracked > 0 ? Math.round((punctualTotal / checkInTracked) * 100) : 0
  const avgCheckInLabel =
    checkInTracked > 0 ? formatMinutesToClock(checkInMinSum / checkInTracked) : '—'

  const punctuality: PunctualityBreakdown = {
    early: { count: earlyCount, pct: pct(earlyCount) },
    onTime: { count: onTimeCount, pct: pct(onTimeCount) },
    graceLate: { count: graceLateCount, pct: pct(graceLateCount) },
    late: { count: lateCount, pct: pct(lateCount) },
    totalTracked: checkInTracked,
    punctualityRate,
    avgCheckInLabel,
  }

  // 4. Daily Trend Analysis (Up to last 14 workdays sorted ascending)
  const trendMap = new Map<
    string,
    {
      present: number
      hours: number
      overtime: number
      completed: number
      onDuty: number
      incomplete: number
      checkInSum: number
      checkInCount: number
    }
  >()

  for (const r of dtrRecords) {
    const d = r.work_date
    if (!d) continue
    if (!trendMap.has(d)) {
      trendMap.set(d, {
        present: 0,
        hours: 0,
        overtime: 0,
        completed: 0,
        onDuty: 0,
        incomplete: 0,
        checkInSum: 0,
        checkInCount: 0,
      })
    }
    const entry = trendMap.get(d)!
    entry.present += 1
    entry.hours += Number(r.hours_worked) || 0
    entry.overtime += Number(r.overtime_hours) || 0
    if (r.shift_status === 'Completed') entry.completed += 1
    else if (r.shift_status === 'On Duty') entry.onDuty += 1
    else entry.incomplete += 1

    const inParts = getManilaTimeParts(r.first_check_in)
    if (inParts) {
      entry.checkInSum += inParts.totalMinutes
      entry.checkInCount += 1
    }
  }

  const sortedDates = Array.from(trendMap.keys()).sort().slice(-14)
  const weeklyTrends: WeeklyTrendPoint[] = sortedDates.map((dateStr) => {
    const entry = trendMap.get(dateStr)!
    const { label, shortDay } = formatDateLabels(dateStr)
    const totalH = Math.round(entry.hours * 10) / 10
    const otH = Math.round(entry.overtime * 10) / 10
    const regH = Math.max(0, Math.round((totalH - otH) * 10) / 10)
    const rate = empCount > 0 ? Math.min(100, Math.round((entry.present / empCount) * 100)) : 0
    return {
      date: dateStr,
      label,
      shortDay,
      present: entry.present,
      absent: Math.max(0, empCount - entry.present),
      hours: Math.round(totalH),
      regularHours: regH,
      overtime: otH,
      completed: entry.completed,
      onDuty: entry.onDuty,
      incomplete: entry.incomplete,
      rate,
      avgCheckInMin: entry.checkInCount > 0 ? Math.round(entry.checkInSum / entry.checkInCount) : null,
    }
  })

  const peakTurnout =
    weeklyTrends.length > 0 ? Math.max(...weeklyTrends.slice(-7).map((t) => t.present)) : 0

  // 5. Hourly Punch Activity (Manila UTC+8, Check-in vs Check-out breakdown)
  const hourlyActivity: HourlyActivityPoint[] = Array.from({ length: 24 }, (_, hour) => {
    const ampm = hour < 12 ? 'AM' : 'PM'
    const displayH = hour % 12 === 0 ? 12 : hour % 12
    return {
      hour,
      label: `${displayH}:00 ${ampm}`,
      shortLabel: `${displayH}${ampm === 'AM' ? 'a' : 'p'}`,
      total: 0,
      checkIns: 0,
      checkOuts: 0,
      isPeak: false,
    }
  })

  for (const p of recentPunches) {
    const parts = getManilaTimeParts(p.punch_time)
    if (!parts) continue
    const slot = hourlyActivity[parts.hour]
    slot.total += 1
    if (p.status === 0 || p.status === 3 || p.status === 4) slot.checkIns += 1
    else if (p.status === 1 || p.status === 2 || p.status === 5) slot.checkOuts += 1
    else {
      if (parts.hour < 13) slot.checkIns += 1
      else slot.checkOuts += 1
    }
  }

  const maxHourTotal = Math.max(...hourlyActivity.map((h) => h.total), 1)
  for (const h of hourlyActivity) {
    if (h.total > 0 && h.total >= maxHourTotal * 0.55) {
      h.isPeak = true
    }
  }

  // 6. Branch Stats (Active + Month Hours)
  const branchMonthHours = new Map<string, { hours: number; ot: number }>()
  for (const r of activeDtrBase) {
    const b = r.branch || 'Dagupan Main'
    if (!branchMonthHours.has(b)) branchMonthHours.set(b, { hours: 0, ot: 0 })
    const item = branchMonthHours.get(b)!
    item.hours += Number(r.hours_worked) || 0
    item.ot += Number(r.overtime_hours) || 0
  }

  const branchMap = new Map<string, { total: number; present: number; completed: number }>()
  for (const emp of employees) {
    const b = emp.branch || 'Dagupan Main'
    if (!branchMap.has(b)) branchMap.set(b, { total: 0, present: 0, completed: 0 })
    const item = branchMap.get(b)!
    item.total += 1
    if (todayPresentSet.has(emp.device_user_id)) item.present += 1
    const dtr = todayDtrByEmp.get(emp.device_user_id)
    if (dtr?.shift_status === 'Completed') item.completed += 1
  }

  const branchStats: BranchStat[] = Array.from(branchMap.entries())
    .map(([branch, counts]) => {
      const mh = branchMonthHours.get(branch) || { hours: 0, ot: 0 }
      const bp = branchPunctualityMap.get(branch)
      return {
        branch,
        total: counts.total,
        present: counts.present,
        completed: counts.completed,
        monthHours: Math.round(mh.hours),
        monthOvertime: Math.round(mh.ot * 10) / 10,
        punctualityRate: bp && bp.total > 0 ? Math.round((bp.onTimeOrEarly / bp.total) * 100) : 0,
        rate: counts.total > 0 ? Math.round((counts.present / counts.total) * 100) : 0,
      }
    })
    .sort((a, b) => b.total - a.total)

  // 7. Shift Outcome Compliance across recent records
  let completedShifts = 0
  let onDutyShifts = 0
  let incompleteShifts = 0
  for (const r of dtrRecords) {
    if (r.shift_status === 'Completed') completedShifts += 1
    else if (r.shift_status === 'On Duty') onDutyShifts += 1
    else incompleteShifts += 1
  }
  const totalShifts = completedShifts + onDutyShifts + incompleteShifts
  const completionRate = totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0

  // 8. Weekday Averages (Mon - Sat)
  const weekdayAgg = new Map<
    number,
    { dates: Set<string>; totalPresent: number; totalHours: number; records: number }
  >()
  for (let d = 1; d <= 6; d++) {
    weekdayAgg.set(d, { dates: new Set(), totalPresent: 0, totalHours: 0, records: 0 })
  }
  for (const r of dtrRecords) {
    if (!r.work_date) continue
    const { weekdayIdx } = formatDateLabels(r.work_date)
    const bucket = weekdayAgg.get(weekdayIdx)
    if (!bucket) continue
    bucket.dates.add(r.work_date)
    bucket.totalPresent += 1
    bucket.totalHours += Number(r.hours_worked) || 0
    bucket.records += 1
  }

  const weekdayAverages: WeekdayAveragePoint[] = [1, 2, 3, 4, 5, 6].map((dayIndex) => {
    const b = weekdayAgg.get(dayIndex)!
    const dayCount = b.dates.size
    const avgPresent = dayCount > 0 ? Math.round((b.totalPresent / dayCount) * 10) / 10 : 0
    const avgRate =
      dayCount > 0 && empCount > 0
        ? Math.min(100, Math.round((avgPresent / empCount) * 100))
        : 0
    const avgHoursPerShift =
      b.records > 0 ? Math.round((b.totalHours / b.records) * 10) / 10 : 0
    return {
      dayIndex,
      dayLabel: WEEKDAY_NAMES[dayIndex],
      workdaysCount: dayCount,
      avgPresent,
      avgRate,
      avgHoursPerShift,
    }
  })

  // 9. Monthly Employee Hours & Overtime Leaderboard
  const empMetaMap = new Map(employees.map((e) => [e.device_user_id, e]))
  const empHourAgg = new Map<
    string,
    {
      name: string
      branch: string
      department: string
      shifts: number
      completed: number
      hours: number
      overtime: number
      onTime: number
      tracked: number
    }
  >()

  for (const r of activeDtrBase) {
    const uid = r.device_user_id
    if (!empHourAgg.has(uid)) {
      const emp = empMetaMap.get(uid)
      empHourAgg.set(uid, {
        name: r.full_name || emp?.full_name || `User ${uid}`,
        branch: r.branch || emp?.branch || 'Dagupan Main',
        department: emp?.department || 'Operations',
        shifts: 0,
        completed: 0,
        hours: 0,
        overtime: 0,
        onTime: 0,
        tracked: 0,
      })
    }
    const item = empHourAgg.get(uid)!
    item.shifts += 1
    if (r.shift_status === 'Completed') item.completed += 1
    item.hours += Number(r.hours_worked) || 0
    item.overtime += Number(r.overtime_hours) || 0
    const parts = getManilaTimeParts(r.first_check_in)
    if (parts) {
      item.tracked += 1
      if (parts.totalMinutes <= 9 * 60 + 5) item.onTime += 1
    }
  }

  const topEmployeesHours: EmployeeHoursLeader[] = Array.from(empHourAgg.entries())
    .map(([deviceUserId, v]) => {
      const totalHours = Math.round(v.hours * 10) / 10
      const overtimeHours = Math.round(v.overtime * 10) / 10
      const regularHours = Math.max(0, Math.round((totalHours - overtimeHours) * 10) / 10)
      return {
        deviceUserId,
        name: v.name,
        branch: v.branch,
        department: v.department,
        shifts: v.shifts,
        completedShifts: v.completed,
        totalHours,
        regularHours,
        overtimeHours,
        avgHoursPerShift: v.shifts > 0 ? Math.round((v.hours / v.shifts) * 10) / 10 : 0,
        punctualityRate: v.tracked > 0 ? Math.round((v.onTime / v.tracked) * 100) : 100,
      }
    })
    .sort((a, b) => b.totalHours - a.totalHours || b.overtimeHours - a.overtimeHours)

  return {
    stats: {
      totalEmployees: empCount,
      todayPunches: todayPunches.length,
      todayPresent: todayPresentCount,
      todayCompleted,
      todayOnDuty,
      todayAbsent: todayAbsentCount,
      attendanceRate,
      allTimePunches,
      totalMonthHours,
      totalMonthRegularHours,
      totalMonthOvertime,
      avgDailyHours,
      punctualityRate,
      avgCheckInLabel,
      peakTurnout,
    },
    weeklyTrends,
    hourlyActivity,
    branchStats,
    shiftCompliance: {
      completed: completedShifts,
      onDuty: onDutyShifts,
      incomplete: incompleteShifts,
      total: totalShifts,
      completionRate,
    },
    punctuality,
    weekdayAverages,
    topEmployeesHours,
    todayRoster,
    bridgeMeta,
    todayDateStr,
    monthPrefix,
  }
}
