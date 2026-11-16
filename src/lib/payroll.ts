import type {
  DailyDtr,
  Employee,
  EmployeeCompensation,
  PayrollSettings,
  DayType,
  DailyPayrollRecord,
  EmployeePayrollSummary,
} from '@/types/database'
import { getHolidayForDate } from '@/lib/holidays'

export interface DOLEMultipliers {
  base: number
  ot: number
  label: string
}

export const DOLE_RATES: Record<DayType, DOLEMultipliers> = {
  regular: {
    base: 1.0,
    ot: 1.0,
    label: 'Regular Workday',
  },
  rest_day: {
    base: 1.3,
    ot: 1.0,
    label: 'Rest Day (+30% Premium, No Late)',
  },
  special_holiday: {
    base: 1.3,
    ot: 1.0,
    label: 'Special Non-Working Holiday (+30%)',
  },
  special_holiday_rest: {
    base: 1.5,
    ot: 1.0,
    label: 'Special Holiday (Rest Day +50%)',
  },
  regular_holiday: {
    base: 2.0,
    ot: 1.0,
    label: 'Regular Holiday (Double Pay 200%)',
  },
  regular_holiday_rest: {
    base: 2.6,
    ot: 1.0,
    label: 'Regular Holiday (Rest Day 260%)',
  },
}

/**
 * Determine the day classification (regular, holiday, rest day)
 * Uses official Philippine & Pangasinan calendar holidays.
 * Supports 'mon_sat' (Sunday rest) and 'mon_fri' (Saturday & Sunday rest).
 */
export function classifyDay(
  dateStr: string,
  settings: PayrollSettings,
  scheduleType: 'mon_sat' | 'mon_fri' = 'mon_sat'
): { dayType: DayType; label: string } {
  // Use UTC year, month, date to guarantee exact calendar day-of-week without timezone shift
  const [y, m, d] = dateStr.split('-').map(Number)
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  // 0 = Sunday, 6 = Saturday
  const restDay = scheduleType === 'mon_fri' 
    ? (dayOfWeek === 0 || dayOfWeek === 6)
    : (dayOfWeek === 0)

  const holiday = getHolidayForDate(dateStr)

  if (holiday) {
    if (holiday.type === 'regular') {
      return restDay
        ? { dayType: 'regular_holiday_rest', label: DOLE_RATES.regular_holiday_rest.label }
        : { dayType: 'regular_holiday', label: DOLE_RATES.regular_holiday.label }
    }
    if (holiday.type === 'special_non_working') {
      return restDay
        ? { dayType: 'special_holiday_rest', label: DOLE_RATES.special_holiday_rest.label }
        : { dayType: 'special_holiday', label: DOLE_RATES.special_holiday.label }
    }
    // special_working (e.g. EDSA, Agew na Pangasinan)
    if (restDay) {
      return { dayType: 'rest_day', label: DOLE_RATES.rest_day.label }
    }
    return { dayType: 'regular', label: DOLE_RATES.regular.label }
  }

  // Also check database settings holiday arrays if present
  const isRegHoliday = settings.regular_holiday_dates?.includes(dateStr)
  const isSpecHoliday = settings.special_holiday_dates?.includes(dateStr)

  if (isRegHoliday && restDay) {
    return { dayType: 'regular_holiday_rest', label: DOLE_RATES.regular_holiday_rest.label }
  }
  if (isRegHoliday) {
    return { dayType: 'regular_holiday', label: DOLE_RATES.regular_holiday.label }
  }
  if (isSpecHoliday && restDay) {
    return { dayType: 'special_holiday_rest', label: DOLE_RATES.special_holiday_rest.label }
  }
  if (isSpecHoliday) {
    return { dayType: 'special_holiday', label: DOLE_RATES.special_holiday.label }
  }
  if (restDay) {
    return { dayType: 'rest_day', label: DOLE_RATES.rest_day.label }
  }
  return { dayType: 'regular', label: DOLE_RATES.regular.label }
}

/**
 * Computes night differential hours (between 10:00 PM and 6:00 AM next day).
 */
export function calculateNightDiffHours(
  checkIn: string | null,
  checkOut: string | null
): number {
  if (!checkIn || !checkOut) return 0
  const start = new Date(checkIn).getTime()
  const end = new Date(checkOut).getTime()
  if (isNaN(start) || isNaN(end) || end <= start) return 0

  let nightMinutes = 0
  const stepMs = 5 * 60 * 1000
  for (let t = start; t < end; t += stepMs) {
    const d = new Date(t)
    const utcHours = d.getUTCHours()
    const manilaHour = (utcHours + 8) % 24
    if (manilaHour >= 22 || manilaHour < 6) {
      nightMinutes += 5
    }
  }

  return Math.round((nightMinutes / 60) * 100) / 100
}

/**
 * Compute tardiness minutes based on standard 9:00 AM start.
 * Early arrivals (coming before 9:00 AM) are NOT penalized.
 */
export function calculateTardiness(
  checkIn: string | null,
  gracePeriodMinutes: number = 0,
  expectedStartHour: number = 9,
  expectedStartMinute: number = 0
): number {
  if (!checkIn) return 0
  const d = new Date(checkIn)
  if (isNaN(d.getTime())) return 0

  const manilaHour = (d.getUTCHours() + 8) % 24
  const manilaMinute = d.getUTCMinutes()

  const checkInTotalMin = manilaHour * 60 + manilaMinute
  const expectedTotalMin = expectedStartHour * 60 + expectedStartMinute

  const diff = checkInTotalMin - expectedTotalMin
  if (diff > gracePeriodMinutes) {
    return diff
  }
  return 0
}

/**
 * Compute single day payroll record with automated rules:
 * - Sunday / Rest Day: +30% pay rate, ZERO late deduction (flexible hours)
 * - Overtime Pay: straight hourly rate (hourly_rate * overtime_hours)
 */
export function computeDailyPayroll(
  dtr: DailyDtr,
  comp: EmployeeCompensation,
  settings: PayrollSettings
): DailyPayrollRecord {
  const dailyRate = Number(comp.daily_rate) || 0
  const hourlyRate = comp.hourly_rate ? Number(comp.hourly_rate) : dailyRate / (settings.work_hours_per_day || 8)
  const minuteRate = hourlyRate / 60

  const { dayType, label } = classifyDay(dtr.work_date, settings, comp.schedule_type || 'mon_sat')
  const rates = DOLE_RATES[dayType]

  const rawHours = Number(dtr.hours_worked || 0)
  const regularHours = Math.min(settings.work_hours_per_day || 8, rawHours)
  const overtimeHours = Number(dtr.overtime_hours || 0)
  const nightDiffHours = comp.night_diff_eligible
    ? calculateNightDiffHours(dtr.first_check_in, dtr.last_check_out)
    : 0

  // Rest Day / Sunday Rule:
  // "when someone work on sunday it should be 30 percent as well also there should be no late on sunday since it's rest day the staff can go to work on what ever time they want and ofcourse there hours on sunday should be the one to be computed only no late on sunday"
  const isRestDay = dayType === 'rest_day' || dayType === 'special_holiday_rest' || dayType === 'regular_holiday_rest'

  let tardinessMinutes = 0
  let tardinessDeduction = 0

  if (!isRestDay) {
    tardinessMinutes = calculateTardiness(
      dtr.first_check_in,
      0, // Exact per-minute deduction on standard workdays
      9,
      0
    )
    tardinessDeduction = tardinessMinutes * minuteRate
  }

  // Base Pay & Holiday / Rest Day Extra Pay calculation
  // Base Pay = 1.0x for regular hours worked
  // Holiday / Rest Day Pay = Extra premium (+30% for Sunday / Rest Day / Special Holiday, +100% for Regular Holiday)
  let regularPay = 0
  let holidayPremiumPay = 0

  if (rawHours > 0) {
    regularPay = (regularHours / (settings.work_hours_per_day || 8)) * dailyRate
    if (rates.base > 1.0) {
      holidayPremiumPay = regularPay * (rates.base - 1.0)
    }
  }

  // Overtime Pay: Straight hourly rate for each hour of overtime
  // "if what is the hour rate of that staff if that staff reach an hour in his/her overtime then that is the rate that he/she will get as well"
  let overtimePay = 0
  if (comp.overtime_eligible && overtimeHours > 0) {
    overtimePay = overtimeHours * hourlyRate
  }

  // Night Differential Pay: 10% premium over hourly rate
  let nightDiffPay = 0
  if (comp.night_diff_eligible && nightDiffHours > 0) {
    nightDiffPay = nightDiffHours * hourlyRate * 0.1
  }

  const totalDayPay = Math.max(
    0,
    regularPay + holidayPremiumPay + overtimePay + nightDiffPay - tardinessDeduction
  )

  return {
    work_date: dtr.work_date,
    day_type: dayType,
    day_type_label: label,
    first_check_in: dtr.first_check_in,
    last_check_out: dtr.last_check_out,
    total_punches: dtr.total_punches,
    hours_worked: rawHours,
    regular_hours: regularHours,
    overtime_hours: overtimeHours,
    night_diff_hours: nightDiffHours,
    shift_status: dtr.shift_status,
    daily_rate: dailyRate,
    hourly_rate: Math.round(hourlyRate * 100) / 100,
    regular_pay: Math.round(regularPay * 100) / 100,
    overtime_pay: Math.round(overtimePay * 100) / 100,
    night_diff_pay: Math.round(nightDiffPay * 100) / 100,
    holiday_premium_pay: Math.round(holidayPremiumPay * 100) / 100,
    tardiness_minutes: tardinessMinutes,
    tardiness_deduction: Math.round(tardinessDeduction * 100) / 100,
    total_day_pay: Math.round(totalDayPay * 100) / 100,
  }
}

/**
 * Compute complete payroll summary for an employee across a date period
 */
export function computeEmployeePayroll(
  employee: Employee,
  dtrList: DailyDtr[],
  comp: EmployeeCompensation,
  settings: PayrollSettings
): EmployeePayrollSummary {
  const dailyRate = Number(comp.daily_rate) || 0
  const hourlyRate = comp.hourly_rate
    ? Number(comp.hourly_rate)
    : dailyRate / (settings.work_hours_per_day || 8)

  const records = dtrList
    .filter((d) => d.device_user_id === employee.device_user_id)
    .sort((a, b) => a.work_date.localeCompare(b.work_date))
    .map((dtr) => computeDailyPayroll(dtr, comp, settings))

  const daysWorked = records.filter((r) => r.hours_worked > 0).length
  const totalRegularHours = records.reduce((acc, r) => acc + r.regular_hours, 0)
  const totalOvertimeHours = records.reduce((acc, r) => acc + r.overtime_hours, 0)
  const totalNightDiffHours = records.reduce((acc, r) => acc + r.night_diff_hours, 0)

  const totalRegularPay = records.reduce((acc, r) => acc + r.regular_pay, 0)
  const totalOvertimePay = records.reduce((acc, r) => acc + r.overtime_pay, 0)
  const totalNightDiffPay = records.reduce((acc, r) => acc + r.night_diff_pay, 0)
  const totalHolidayPay = records.reduce((acc, r) => acc + r.holiday_premium_pay, 0)
  const totalTardinessMinutes = records.reduce((acc, r) => acc + r.tardiness_minutes, 0)
  const totalTardinessDeduction = records.reduce((acc, r) => acc + r.tardiness_deduction, 0)

  const grossPay = Math.max(
    0,
    totalRegularPay + totalHolidayPay + totalOvertimePay + totalNightDiffPay - totalTardinessDeduction
  )

  return {
    device_user_id: employee.device_user_id,
    employee_name: employee.full_name,
    branch: employee.branch,
    position: employee.position,
    daily_rate: dailyRate,
    hourly_rate: Math.round(hourlyRate * 100) / 100,
    schedule_type: comp.schedule_type || (employee.full_name.includes('GAIN CARLO') ? 'mon_fri' : 'mon_sat'),
    days_worked: daysWorked,
    total_regular_hours: Math.round(totalRegularHours * 100) / 100,
    total_overtime_hours: Math.round(totalOvertimeHours * 100) / 100,
    total_night_diff_hours: Math.round(totalNightDiffHours * 100) / 100,
    total_regular_pay: Math.round(totalRegularPay * 100) / 100,
    total_overtime_pay: Math.round(totalOvertimePay * 100) / 100,
    total_night_diff_pay: Math.round(totalNightDiffPay * 100) / 100,
    total_holiday_pay: Math.round(totalHolidayPay * 100) / 100,
    total_tardiness_minutes: totalTardinessMinutes,
    total_tardiness_deduction: Math.round(totalTardinessDeduction * 100) / 100,
    gross_pay: Math.round(grossPay * 100) / 100,
    records,
  }
}
