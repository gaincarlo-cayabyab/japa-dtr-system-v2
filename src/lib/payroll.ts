import type {
  DailyDtr,
  Employee,
  EmployeeCompensation,
  PayrollSettings,
  DayType,
  DailyPayrollRecord,
  EmployeePayrollSummary,
} from '@/types/database'

export interface DOLEMultipliers {
  base: number
  ot: number
  label: string
}

export const DOLE_RATES: Record<DayType, DOLEMultipliers> = {
  regular: {
    base: 1.0,
    ot: 1.25,
    label: 'Regular Workday',
  },
  rest_day: {
    base: 1.3,
    ot: 1.69,
    label: 'Rest Day',
  },
  special_holiday: {
    base: 1.3,
    ot: 1.69,
    label: 'Special Non-Working Holiday',
  },
  special_holiday_rest: {
    base: 1.5,
    ot: 1.95,
    label: 'Special Holiday (Rest Day)',
  },
  regular_holiday: {
    base: 2.0,
    ot: 2.6,
    label: 'Regular Holiday',
  },
  regular_holiday_rest: {
    base: 2.6,
    ot: 3.38,
    label: 'Regular Holiday (Rest Day)',
  },
}

/**
 * Determine the day classification (regular, holiday, rest day)
 */
export function classifyDay(
  dateStr: string,
  settings: PayrollSettings,
  isRestDay: boolean = false
): { dayType: DayType; label: string } {
  const isRegHoliday = settings.regular_holiday_dates?.includes(dateStr)
  const isSpecHoliday = settings.special_holiday_dates?.includes(dateStr)

  // Sunday is rest day by default unless specified
  const dayOfWeek = new Date(dateStr + 'T00:00:00+08:00').getDay()
  const restDay = isRestDay || dayOfWeek === 0 // 0 = Sunday

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
  // Step through in 5-minute increments
  const stepMs = 5 * 60 * 1000
  for (let t = start; t < end; t += stepMs) {
    // Check hour in Manila time (UTC+8)
    const d = new Date(t)
    const utcHours = d.getUTCHours()
    const manilaHour = (utcHours + 8) % 24
    // Night differential is 10:00 PM (22:00) to 6:00 AM (06:00)
    if (manilaHour >= 22 || manilaHour < 6) {
      nightMinutes += 5
    }
  }

  return Math.round((nightMinutes / 60) * 100) / 100
}

/**
 * Compute tardiness minutes based on standard 8:00 AM start and grace period
 */
export function calculateTardiness(
  checkIn: string | null,
  gracePeriodMinutes: number = 5,
  expectedStartHour: number = 8,
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
    return diff // total minutes late from scheduled start
  }
  return 0
}

/**
 * Compute single day DOLE payroll record
 */
export function computeDailyPayroll(
  dtr: DailyDtr,
  comp: EmployeeCompensation,
  settings: PayrollSettings
): DailyPayrollRecord {
  const dailyRate = Number(comp.daily_rate) || 0
  const hourlyRate = dailyRate / (settings.work_hours_per_day || 8)
  const minuteRate = hourlyRate / 60

  const { dayType, label } = classifyDay(dtr.work_date, settings)
  const rates = DOLE_RATES[dayType]

  const rawHours = Number(dtr.hours_worked || 0)
  const regularHours = Math.min(settings.work_hours_per_day || 8, rawHours)
  const overtimeHours = Number(dtr.overtime_hours || 0)
  const nightDiffHours = comp.night_diff_eligible
    ? calculateNightDiffHours(dtr.first_check_in, dtr.last_check_out)
    : 0

  const tardinessMinutes = calculateTardiness(
    dtr.first_check_in,
    settings.grace_period_minutes,
    8,
    0
  )
  // Per company policy: no late cash deduction, only track late duration/time
  const tardinessDeduction = 0

  // Base Pay calculation
  // For regular days: (regularHours / 8) * dailyRate
  // For special holidays / rest days: rate multiplier applies
  let regularPay = 0
  let holidayPremiumPay = 0

  if (rawHours > 0) {
    if (dayType === 'regular') {
      regularPay = (regularHours / (settings.work_hours_per_day || 8)) * dailyRate
    } else {
      // Holiday or Rest Day
      regularPay = (regularHours / (settings.work_hours_per_day || 8)) * dailyRate * rates.base
      holidayPremiumPay = regularPay - (regularHours / (settings.work_hours_per_day || 8)) * dailyRate
    }
  }

  // Overtime Pay
  let overtimePay = 0
  if (comp.overtime_eligible && overtimeHours > 0) {
    overtimePay = overtimeHours * hourlyRate * rates.ot
  }

  // Night Differential Pay: 10% premium over hourly rate
  let nightDiffPay = 0
  if (comp.night_diff_eligible && nightDiffHours > 0) {
    nightDiffPay = nightDiffHours * hourlyRate * 0.1
  }

  const totalDayPay = Math.max(
    0,
    regularPay + overtimePay + nightDiffPay
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
  const hourlyRate = dailyRate / (settings.work_hours_per_day || 8)

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
  const totalTardinessDeduction = 0 // No late cash deductions

  const grossPay = Math.max(
    0,
    totalRegularPay + totalOvertimePay + totalNightDiffPay
  )

  return {
    device_user_id: employee.device_user_id,
    employee_name: employee.full_name,
    branch: employee.branch,
    position: employee.position,
    daily_rate: dailyRate,
    hourly_rate: Math.round(hourlyRate * 100) / 100,
    days_worked: daysWorked,
    total_regular_hours: Math.round(totalRegularHours * 100) / 100,
    total_overtime_hours: Math.round(totalOvertimeHours * 100) / 100,
    total_night_diff_hours: Math.round(totalNightDiffHours * 100) / 100,
    total_regular_pay: Math.round(totalRegularPay * 100) / 100,
    total_overtime_pay: Math.round(totalOvertimePay * 100) / 100,
    total_night_diff_pay: Math.round(totalNightDiffPay * 100) / 100,
    total_holiday_pay: Math.round(totalHolidayPay * 100) / 100,
    total_tardiness_minutes: totalTardinessMinutes,
    total_tardiness_deduction: 0,
    gross_pay: Math.round(grossPay * 100) / 100,
    records,
  }
}

/**
 * Format tardiness minutes into human readable text (e.g. 15m late, 1h 20m late)
 */
export function formatLateDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m late`
  if (h > 0) return `${h}h late`
  return `${m}m late`
}
