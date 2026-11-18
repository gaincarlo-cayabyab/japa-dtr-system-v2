import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeEmployeePayroll, DOLE_RATES } from '@/lib/payroll'
import type {
  Employee,
  DailyDtr,
  EmployeeCompensation,
  PayrollSettings,
} from '@/types/database'
import ExcelJS from 'exceljs'
import { format } from 'date-fns'

function formatTime(ts: string | null) {
  if (!ts) return '—'
  try {
    return format(new Date(ts), 'hh:mm aa')
  } catch {
    return ts
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const defaultStart = `${year}-${month}-01`
    const defaultEnd = `${year}-${month}-31`

    const startDate = searchParams.get('start_date') || defaultStart
    const endDate = searchParams.get('end_date') || defaultEnd
    const branch = searchParams.get('branch')
    const calcMode = (searchParams.get('calc_mode') || 'exact') as 'exact' | 'normalized'

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

    // 2. Fetch employees ordered A to Z
    let empQuery = supabase
      .from('employees')
      .select('*')
      .order('full_name', { ascending: true })

    if (branch) {
      empQuery = empQuery.eq('branch', branch)
    }

    const { data: employees, error: empError } = await empQuery
    if (empError) throw empError

    // 3. Fetch compensation
    const { data: compList } = await supabase
      .from('employee_compensation')
      .select('*')

    const compMap = new Map<string, EmployeeCompensation>()
    compList?.forEach((c) => compMap.set(c.device_user_id, c))

    // 4. Fetch daily DTR
    let dtrQuery = supabase
      .from('daily_dtr')
      .select('*')
      .gte('work_date', startDate)
      .lte('work_date', endDate)

    if (branch) {
      dtrQuery = dtrQuery.eq('branch', branch)
    }

    const { data: dtrList } = await dtrQuery

    // 5. Compute payroll summaries
    const summaries = (employees as Employee[]).map((emp) => {
      const comp = compMap.get(emp.device_user_id) || {
        id: 'temp',
        device_user_id: emp.device_user_id,
        daily_rate: 550.0,
        hourly_rate: 68.75,
        schedule_type: emp.full_name.includes('GAIN CARLO') ? 'mon_fri' : 'mon_sat',
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
        settings,
        calcMode
      )
    })

    // 6. Build Excel Workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'JAPA DTR System'
    workbook.lastModifiedBy = 'JAPA Enterprise Portal'
    workbook.created = new Date()

    const NAVY = '1E293B'
    const BLUE_HEADER = '0284C7'
    const LIGHT_ROW = 'F8FAFC'
    const BORDER_COLOR = 'E2E8F0'

    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
      left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
      bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
      right: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    }

    // ==========================================
    // TAB 1: SALARY SHEET (PAYROLL SUMMARY)
    // ==========================================
    const payrollSheet = workbook.addWorksheet('Salary Sheet (Payroll)', {
      views: [{ showGridLines: true }],
    })

    // Title Block
    payrollSheet.mergeCells('A1:Q1')
    const titleCell = payrollSheet.getCell('A1')
    titleCell.value = 'JAPA ENTERPRISE — PAYROLL & SALARY SUMMARY'
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    payrollSheet.getRow(1).height = 32

    payrollSheet.mergeCells('A2:Q2')
    const subTitleCell = payrollSheet.getCell('A2')
    const modeLabel = calcMode === 'normalized' ? 'Standard Normalized (Shift Policy)' : 'Exact Biometrics (Raw Real-Time)'
    subTitleCell.value = `Period: ${startDate} to ${endDate}   |   Branch: ${branch || 'All Branches'}   |   Calculation Mode: ${modeLabel}   |   Generated: ${format(new Date(), 'PPpp')}`
    subTitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: '475569' } }
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    payrollSheet.getRow(2).height = 20

    payrollSheet.addRow([]) // blank row 3

    // Headers
    const salaryHeaders = [
      'Employee Name',
      'Device ID',
      'Branch',
      'Position',
      'Daily Rate',
      'Hourly Rate',
      'Days Worked',
      'Reg Hours',
      'Regular Pay',
      'OT Hours',
      'OT Pay',
      'Night Diff Hrs',
      'Night Diff Pay',
      'Holiday Pay',
      'Tardiness (m)',
      'Tardiness Ded.',
      'Gross Salary',
    ]

    const headerRow = payrollSheet.addRow(salaryHeaders)
    headerRow.height = 28
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = thinBorder
    })

    // Data Rows
    summaries.forEach((emp, index) => {
      const isAlt = index % 2 === 1
      const row = payrollSheet.addRow([
        emp.employee_name,
        emp.device_user_id,
        emp.branch,
        emp.position || 'Staff',
        emp.daily_rate,
        emp.hourly_rate,
        emp.days_worked,
        emp.total_regular_hours,
        emp.total_regular_pay,
        emp.total_overtime_hours,
        emp.total_overtime_pay,
        emp.total_night_diff_hours,
        emp.total_night_diff_pay,
        emp.total_holiday_pay,
        emp.total_tardiness_minutes,
        emp.total_tardiness_deduction,
        emp.gross_pay,
      ])
      row.height = 22

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10 }
        cell.border = thinBorder
        if (isAlt) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } }
        }

        // Alignments & Number Formats
        if (colNumber === 1 || colNumber === 3 || colNumber === 4) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
        } else if (colNumber === 2) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNumber === 7 || colNumber === 15) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.numFmt = '#,##0'
        } else if (colNumber === 8 || colNumber === 10 || colNumber === 12) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
          cell.numFmt = '#,##0.0'
        } else {
          // Currency columns
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
          cell.numFmt = '₱#,##0.00'
        }

        // Highlight Gross Salary
        if (colNumber === 17) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '047857' } }
        }
      })
    })

    // Totals Row
    const startDataRow = 5
    const endDataRow = startDataRow + summaries.length - 1
    const totalRow = payrollSheet.addRow([
      'TOTALS',
      '',
      '',
      '',
      '',
      '',
      { formula: `SUM(G${startDataRow}:G${endDataRow})` },
      { formula: `SUM(H${startDataRow}:H${endDataRow})` },
      { formula: `SUM(I${startDataRow}:I${endDataRow})` },
      { formula: `SUM(J${startDataRow}:J${endDataRow})` },
      { formula: `SUM(K${startDataRow}:K${endDataRow})` },
      { formula: `SUM(L${startDataRow}:L${endDataRow})` },
      { formula: `SUM(M${startDataRow}:M${endDataRow})` },
      { formula: `SUM(N${startDataRow}:N${endDataRow})` },
      { formula: `SUM(O${startDataRow}:O${endDataRow})` },
      { formula: `SUM(P${startDataRow}:P${endDataRow})` },
      { formula: `SUM(Q${startDataRow}:Q${endDataRow})` },
    ])
    totalRow.height = 26
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10, bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } }
      cell.border = {
        top: { style: 'thin', color: { argb: '94A3B8' } },
        bottom: { style: 'double', color: { argb: '0F172A' } },
        left: { style: 'thin', color: { argb: BORDER_COLOR } },
        right: { style: 'thin', color: { argb: BORDER_COLOR } },
      }
      if (colNumber === 7 || colNumber === 15) {
        cell.numFmt = '#,##0'
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      } else if (colNumber === 8 || colNumber === 10 || colNumber === 12) {
        cell.numFmt = '#,##0.0'
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      } else if (colNumber >= 9) {
        cell.numFmt = '₱#,##0.00'
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      }
    })

    // Set auto column widths
    payrollSheet.columns = [
      { width: 22 }, // Name
      { width: 12 }, // ID
      { width: 16 }, // Branch
      { width: 16 }, // Position
      { width: 13 }, // Daily Rate
      { width: 13 }, // Hourly Rate
      { width: 13 }, // Days Worked
      { width: 12 }, // Reg Hrs
      { width: 15 }, // Reg Pay
      { width: 11 }, // OT Hrs
      { width: 14 }, // OT Pay
      { width: 14 }, // Night Diff Hrs
      { width: 15 }, // Night Diff Pay
      { width: 14 }, // Holiday Pay
      { width: 14 }, // Tardiness Mins
      { width: 15 }, // Tardiness Ded
      { width: 18 }, // Gross Salary
    ]

    // ==========================================
    // TAB 2: DTR SHEET (DOLE FORM 48)
    // ==========================================
    const dtrSheet = workbook.addWorksheet('DTR Sheet (Form 48)', {
      views: [{ showGridLines: true }],
    })

    dtrSheet.mergeCells('A1:L1')
    const dtrTitle = dtrSheet.getCell('A1')
    dtrTitle.value = 'JAPA ENTERPRISE — DAILY TIME RECORD (SMART OVERNIGHT ATTENDANCE)'
    dtrTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } }
    dtrTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    dtrTitle.alignment = { vertical: 'middle', horizontal: 'center' }
    dtrSheet.getRow(1).height = 32

    dtrSheet.mergeCells('A2:L2')
    const dtrSub = dtrSheet.getCell('A2')
    dtrSub.value = `Period: ${startDate} to ${endDate}   |   Branch: ${branch || 'All Branches'}   |   Mode: ${modeLabel}   |   Smart 4:00 AM Operational Cutoff Applied`
    dtrSub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: '475569' } }
    dtrSub.alignment = { vertical: 'middle', horizontal: 'center' }
    dtrSheet.getRow(2).height = 20

    dtrSheet.addRow([])

    const dtrHeaders = [
      'Employee Name',
      'Device ID',
      'Branch',
      'Work Date',
      'Day Classification',
      'Time In',
      'Time Out',
      'Hours Worked',
      'Regular Hours',
      'Overtime Hours',
      'Night Diff Hours',
      'Shift Status',
    ]

    const dtrHeaderRow = dtrSheet.addRow(dtrHeaders)
    dtrHeaderRow.height = 28
    dtrHeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '475569' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = thinBorder
    })

    // Add daily records
    let recordIndex = 0
    summaries.forEach((emp) => {
      emp.records.forEach((rec) => {
        const isAlt = recordIndex % 2 === 1
        recordIndex++
        const row = dtrSheet.addRow([
          emp.employee_name,
          emp.device_user_id,
          emp.branch,
          rec.work_date,
          rec.day_type_label,
          formatTime(rec.first_check_in),
          formatTime(rec.last_check_out),
          rec.hours_worked,
          rec.regular_hours,
          rec.overtime_hours,
          rec.night_diff_hours,
          rec.shift_status,
        ])
        row.height = 20
        row.eachCell((cell, colNumber) => {
          cell.font = { name: 'Calibri', size: 10 }
          cell.border = thinBorder
          if (isAlt) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } }
          }
          if (colNumber <= 3) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' }
          } else if (colNumber === 4 || colNumber === 5 || colNumber === 6 || colNumber === 7 || colNumber === 12) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'right' }
            cell.numFmt = '#,##0.0'
          }
        })
      })
    })

    dtrSheet.columns = [
      { width: 22 },
      { width: 12 },
      { width: 16 },
      { width: 14 },
      { width: 24 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
      { width: 14 },
    ]

    // ==========================================
    // TAB 3: DOLE MULTIPLIERS & LEGAL REFERENCE
    // ==========================================
    const refSheet = workbook.addWorksheet('DOLE Multipliers & Rules')
    refSheet.views = [{ showGridLines: true }]

    refSheet.mergeCells('A1:D1')
    const refTitle = refSheet.getCell('A1')
    refTitle.value = 'PHILIPPINE DOLE STATUTORY OVERTIME & HOLIDAY RATES'
    refTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFF' } }
    refTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    refTitle.alignment = { vertical: 'middle', horizontal: 'center' }
    refSheet.getRow(1).height = 28

    refSheet.addRow([])

    const refHeaders = ['Workday Classification', 'Regular Rate (1st 8 hrs)', 'Overtime Rate (>8 hrs)', 'Legal Basis / Notes']
    const rHeaderRow = refSheet.addRow(refHeaders)
    rHeaderRow.height = 24
    rHeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = thinBorder
    })

    const refRows = [
      ['Regular Workday', '100% (1.00x)', '125% (1.25x)', 'Art. 87 Labor Code'],
      ['Scheduled Rest Day', '130% (1.30x)', '169% (1.69x)', 'Art. 93 Labor Code'],
      ['Special Non-Working Holiday', '130% (1.30x)', '169% (1.69x)', 'Art. 93 Labor Code'],
      ['Special Holiday on Rest Day', '150% (1.50x)', '195% (1.95x)', 'Art. 93 Labor Code'],
      ['Regular Holiday', '200% (2.00x)', '260% (2.60x)', 'Art. 94 Labor Code'],
      ['Regular Holiday on Rest Day', '260% (2.60x)', '338% (3.38x)', 'Art. 94 Labor Code'],
      ['Night Shift Differential (10PM - 6AM)', '+10% of hourly rate', '+10% on OT rate if worked OT', 'Art. 86 Labor Code'],
    ]

    refRows.forEach((r) => {
      const row = refSheet.addRow(r)
      row.height = 22
      row.eachCell((cell, col) => {
        cell.font = { name: 'Calibri', size: 10 }
        cell.border = thinBorder
        cell.alignment = { vertical: 'middle', horizontal: col === 1 || col === 4 ? 'left' : 'center' }
      })
    })

    refSheet.columns = [
      { width: 34 },
      { width: 22 },
      { width: 22 },
      { width: 30 },
    ]

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    const filename = `JAPA_Payroll_DTR_${startDate}_to_${endDate}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
