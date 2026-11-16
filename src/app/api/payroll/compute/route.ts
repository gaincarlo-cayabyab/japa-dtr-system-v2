import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeEmployeePayroll } from '@/lib/payroll'
import type {
  Employee,
  DailyDtr,
  EmployeeCompensation,
  PayrollSettings,
} from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Default period: current month
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const defaultStart = `${year}-${month}-01`
    const defaultEnd = `${year}-${month}-31`

    const startDate = searchParams.get('start_date') || defaultStart
    const endDate = searchParams.get('end_date') || defaultEnd
    const branch = searchParams.get('branch')

    // 1. Fetch settings
    const { data: settingsData } = await supabase
      .from('payroll_settings')
      .select('*')
      .order('fiscal_year', { ascending: false })
      .limit(1)
      .maybeSingle()

    const defaultSettings: PayrollSettings = {
      id: 'default',
      fiscal_year: 2026,
      work_hours_per_day: 8,
      grace_period_minutes: 5,
      night_diff_start: '22:00:00',
      night_diff_end: '06:00:00',
      regular_holiday_dates: [],
      special_holiday_dates: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const settings: PayrollSettings = settingsData || defaultSettings

    // 2. Fetch employees
    let empQuery = supabase
      .from('employees')
      .select('*')
      .order('device_user_id', { ascending: true })

    if (branch) {
      empQuery = empQuery.eq('branch', branch)
    }

    const { data: employees, error: empError } = await empQuery
    if (empError) throw empError

    // 3. Fetch compensation records
    const { data: compList, error: compError } = await supabase
      .from('employee_compensation')
      .select('*')
    if (compError) throw compError

    const compMap = new Map<string, EmployeeCompensation>()
    compList?.forEach((c) => compMap.set(c.device_user_id, c))

    // 4. Fetch daily DTR within period
    let dtrQuery = supabase
      .from('daily_dtr')
      .select('*')
      .gte('work_date', startDate)
      .lte('work_date', endDate)

    if (branch) {
      dtrQuery = dtrQuery.eq('branch', branch)
    }

    const { data: dtrList, error: dtrError } = await dtrQuery
    if (dtrError) throw dtrError

    // 5. Compute payroll for each employee
    const summaries = (employees as Employee[]).map((emp) => {
      const comp = compMap.get(emp.device_user_id) || {
        id: 'temp',
        device_user_id: emp.device_user_id,
        daily_rate: 610.0,
        monthly_rate: null,
        employment_type: 'regular',
        overtime_eligible: true,
        night_diff_eligible: true,
        effectivity_date: startDate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      return computeEmployeePayroll(
        emp,
        (dtrList as DailyDtr[]) || [],
        comp,
        settings
      )
    })

    // Totals
    const totals = {
      total_employees: summaries.length,
      active_employees: summaries.filter((s) => s.days_worked > 0).length,
      total_gross_pay: summaries.reduce((acc, s) => acc + s.gross_pay, 0),
      total_regular_pay: summaries.reduce((acc, s) => acc + s.total_regular_pay, 0),
      total_overtime_pay: summaries.reduce((acc, s) => acc + s.total_overtime_pay, 0),
      total_night_diff_pay: summaries.reduce((acc, s) => acc + s.total_night_diff_pay, 0),
      total_holiday_pay: summaries.reduce((acc, s) => acc + s.total_holiday_pay, 0),
      total_tardiness_minutes: summaries.reduce((acc, s) => acc + s.total_tardiness_minutes, 0),
      total_tardiness_deduction: 0,
      total_regular_hours: summaries.reduce((acc, s) => acc + s.total_regular_hours, 0),
      total_overtime_hours: summaries.reduce((acc, s) => acc + s.total_overtime_hours, 0),
      total_night_diff_hours: summaries.reduce((acc, s) => acc + s.total_night_diff_hours, 0),
      total_days_worked: summaries.reduce((acc, s) => acc + s.days_worked, 0),
    }

    return NextResponse.json({
      success: true,
      period: { start: startDate, end: endDate },
      branch: branch || 'All Branches',
      totals,
      employees: summaries,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
