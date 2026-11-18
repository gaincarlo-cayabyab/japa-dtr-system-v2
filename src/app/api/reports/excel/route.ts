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

/**
 * Auto-fit column widths based on actual cell content.
 * Scans every row and returns the max character-width per column,
 * with a minimum of `minWidth` and a cap of `maxWidth`.
 */
function autoFitColumns(
  sheet: ExcelJS.Worksheet,
  minWidth = 10,
  maxWidth = 50
): void {
  const colWidths: number[] = []

  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      let cellText = ''
      if (cell.value === null || cell.value === undefined) {
        cellText = ''
      } else if (typeof cell.value === 'object' && 'formula' in (cell.value as object)) {
        // formula cell — use a reasonable guess
        cellText = '###########'
      } else {
        cellText = String(cell.value)
      }
      const len = cellText.length
      const colIdx = colNumber - 1
      if (!colWidths[colIdx] || colWidths[colIdx] < len) {
        colWidths[colIdx] = len
      }
    })
  })

  sheet.columns.forEach((col, idx) => {
    const dataWidth = colWidths[idx] || minWidth
    // Add a small padding factor (1.2x) + 2 chars buffer
    col.width = Math.min(maxWidth, Math.max(minWidth, Math.ceil(dataWidth * 1.15) + 2))
  })
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

    // ── 1. Fetch settings ──────────────────────────────────────
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

    // ── 2. Fetch employees ordered A → Z ───────────────────────
    let empQuery = supabase
      .from('employees')
      .select('*')
      .order('full_name', { ascending: true })

    if (branch) empQuery = empQuery.eq('branch', branch)

    const { data: employees, error: empError } = await empQuery
    if (empError) throw empError

    // ── 3. Fetch compensation ──────────────────────────────────
    const { data: compList } = await supabase
      .from('employee_compensation')
      .select('*')

    const compMap = new Map<string, EmployeeCompensation>()
    compList?.forEach((c) => compMap.set(c.device_user_id, c))

    // ── 4. Fetch daily DTR ─────────────────────────────────────
    let dtrQuery = supabase
      .from('daily_dtr')
      .select('*')
      .gte('work_date', startDate)
      .lte('work_date', endDate)

    if (branch) dtrQuery = dtrQuery.eq('branch', branch)

    const { data: dtrList } = await dtrQuery

    // ── 5. Compute payroll summaries ───────────────────────────
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

    // ── 6. Build Excel Workbook ────────────────────────────────
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'JAPA DTR System'
    workbook.lastModifiedBy = 'JAPA Enterprise Portal'
    workbook.created = new Date()

    // ── Color palette ──────────────────────────────────────────
    const NAVY = '1E293B'
    const BLUE_HDR = '0284C7'
    const SLATE_HDR = '475569'
    const GREEN_HDR = '047857'
    const LIGHT_ROW = 'F1F5F9'
    const TOTAL_BG = 'E2E8F0'
    const BORDER_CLR = 'CBD5E1'

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: BORDER_CLR } },
      left: { style: 'thin', color: { argb: BORDER_CLR } },
      bottom: { style: 'thin', color: { argb: BORDER_CLR } },
      right: { style: 'thin', color: { argb: BORDER_CLR } },
    }

    const modeLabel =
      calcMode === 'normalized'
        ? 'Standard Normalized — Shift Policy'
        : 'Exact Biometrics — Raw Real-Time'

    const generatedAt = format(new Date(), 'MMMM d, yyyy  h:mm aa')

    // ============================================================
    // TAB 1 — SALARY SHEET (PAYROLL SUMMARY)
    // ============================================================
    const payrollSheet = workbook.addWorksheet('Salary Sheet (Payroll)', {
      views: [
        {
          state: 'frozen',
          xSplit: 0,
          ySplit: 4,          // freeze rows 1-4 (title + subtitle + blank + header)
          topLeftCell: 'A5',
          activeCell: 'A5',
          showGridLines: true,
        },
      ],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,         // A4
        margins: {
          left: 0.4, right: 0.4,
          top: 0.5, bottom: 0.5,
          header: 0.3, footer: 0.3,
        },
      },
    })

    // — Row 1: Main Title ——————————————————————————————————————
    payrollSheet.mergeCells('A1:Q1')
    const titleCell = payrollSheet.getCell('A1')
    titleCell.value = 'JAPA GLOBAL TRADING  ·  PAYROLL & SALARY SUMMARY'
    titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFF' } }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    payrollSheet.getRow(1).height = 36

    // — Row 2: Sub-title ———————————————————————————————————————
    payrollSheet.mergeCells('A2:Q2')
    const subCell = payrollSheet.getCell('A2')
    subCell.value =
      `Period: ${startDate}  to  ${endDate}   ·   Branch: ${branch || 'All Branches'}   ·   ` +
      `Calculation Mode: ${modeLabel}   ·   Generated: ${generatedAt}`
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: '334155' } }
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } }
    subCell.alignment = { vertical: 'middle', horizontal: 'center' }
    payrollSheet.getRow(2).height = 22

    // — Row 3: blank spacer ————————————————————————————————————
    payrollSheet.addRow([])
    payrollSheet.getRow(3).height = 6

    // — Row 4: Column Headers ——————————————————————————————————
    const salaryHeaders = [
      'Employee Name',
      'ID',
      'Branch',
      'Position',
      'Daily Rate (₱)',
      'Hourly Rate (₱)',
      'Days Worked',
      'Regular Hrs',
      'Regular Pay (₱)',
      'OT Hours',
      'OT Pay (₱)',
      'Night Diff Hrs',
      'Night Diff Pay (₱)',
      'Holiday Pay (₱)',
      'Tardiness (min)',
      'Tardiness Ded. (₱)',
      'GROSS SALARY (₱)',
    ]

    const headerRow = payrollSheet.addRow(salaryHeaders)
    headerRow.height = 30
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HDR } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = thinBorder
    })

    // — Rows 5+: Data ——————————————————————————————————————————
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

      row.eachCell((cell, col) => {
        cell.font = { name: 'Calibri', size: 10 }
        cell.border = thinBorder
        if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } }

        if (col === 1) {
          // Employee Name — left-aligned, slightly bold
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
          cell.font = { name: 'Calibri', size: 10, bold: true }
        } else if (col === 2) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (col === 3 || col === 4) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
        } else if (col === 7 || col === 15) {
          // Days worked, tardiness minutes — integer
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.numFmt = '#,##0'
        } else if (col === 8 || col === 10 || col === 12) {
          // Hour columns — 1 decimal
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
          cell.numFmt = '#,##0.00'
        } else {
          // All peso columns
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
          cell.numFmt = '₱#,##0.00'
        }

        // Gross Salary: bold green
        if (col === 17) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '065F46' } }
          cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: isAlt ? 'D1FAE5' : 'ECFDF5' },
          }
        }
      })
    })

    // — Totals Row ——————————————————————————————————————————————
    const dataStart = 5
    const dataEnd = dataStart + summaries.length - 1
    const totalRow = payrollSheet.addRow([
      'GRAND TOTAL', '', '', '', '', '',
      { formula: `SUM(G${dataStart}:G${dataEnd})` },
      { formula: `SUM(H${dataStart}:H${dataEnd})` },
      { formula: `SUM(I${dataStart}:I${dataEnd})` },
      { formula: `SUM(J${dataStart}:J${dataEnd})` },
      { formula: `SUM(K${dataStart}:K${dataEnd})` },
      { formula: `SUM(L${dataStart}:L${dataEnd})` },
      { formula: `SUM(M${dataStart}:M${dataEnd})` },
      { formula: `SUM(N${dataStart}:N${dataEnd})` },
      { formula: `SUM(O${dataStart}:O${dataEnd})` },
      { formula: `SUM(P${dataStart}:P${dataEnd})` },
      { formula: `SUM(Q${dataStart}:Q${dataEnd})` },
    ])
    totalRow.height = 28
    totalRow.eachCell((cell, col) => {
      cell.font = { name: 'Calibri', size: 10, bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
      cell.border = {
        top: { style: 'medium', color: { argb: '64748B' } },
        bottom: { style: 'double', color: { argb: '0F172A' } },
        left: { style: 'thin', color: { argb: BORDER_CLR } },
        right: { style: 'thin', color: { argb: BORDER_CLR } },
      }

      if (col === 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' }
      } else if (col === 7 || col === 15) {
        cell.numFmt = '#,##0'
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      } else if (col === 8 || col === 10 || col === 12) {
        cell.numFmt = '#,##0.00'
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      } else if (col >= 9) {
        cell.numFmt = '₱#,##0.00'
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      }

      if (col === 17) {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: '065F46' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'A7F3D0' } }
      }
    })

    // — Mode note at bottom ————————————————————————————————————
    const noteRowNum = dataEnd + 2
    payrollSheet.mergeCells(`A${noteRowNum}:Q${noteRowNum}`)
    const noteCell = payrollSheet.getCell(`A${noteRowNum}`)
    noteCell.value =
      calcMode === 'normalized'
        ? '⚠  Standard Normalized Mode: Arrivals 8:00–9:05 AM → 9:00 AM · Departures 6:00–6:30 PM → 6:00 PM · Authorized OT credited in completed 30-min blocks.'
        : '📌  Exact Biometrics Mode: All hours computed directly from raw biometric punch timestamps. No time normalization applied.'
    noteCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: '64748B' } }
    noteCell.alignment = { vertical: 'middle', horizontal: 'left' }
    payrollSheet.getRow(noteRowNum).height = 18

    // — Initialize columns (required before autoFit) ———————————
    payrollSheet.columns = salaryHeaders.map(() => ({ width: 10 }))

    // — Auto-fit all columns ————————————————————————————————————
    autoFitColumns(payrollSheet, 10, 52)

    // ============================================================
    // TAB 2 — DTR SHEET (DOLE FORM 48)
    // ============================================================
    const dtrSheet = workbook.addWorksheet('DTR Sheet (Form 48)', {
      views: [
        {
          state: 'frozen',
          xSplit: 0,
          ySplit: 4,
          topLeftCell: 'A5',
          activeCell: 'A5',
          showGridLines: true,
        },
      ],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        margins: {
          left: 0.4, right: 0.4,
          top: 0.5, bottom: 0.5,
          header: 0.3, footer: 0.3,
        },
      },
    })

    dtrSheet.mergeCells('A1:L1')
    const dtrTitle = dtrSheet.getCell('A1')
    dtrTitle.value = 'JAPA GLOBAL TRADING  ·  DAILY TIME RECORD — DOLE FORM 48 (Smart Overnight Cut-off)'
    dtrTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } }
    dtrTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    dtrTitle.alignment = { vertical: 'middle', horizontal: 'center' }
    dtrSheet.getRow(1).height = 34

    dtrSheet.mergeCells('A2:L2')
    const dtrSub = dtrSheet.getCell('A2')
    dtrSub.value =
      `Period: ${startDate}  to  ${endDate}   ·   Branch: ${branch || 'All Branches'}   ·   ` +
      `Mode: ${modeLabel}   ·   Smart 4:00 AM Operational Cutoff Applied   ·   Generated: ${generatedAt}`
    dtrSub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: '334155' } }
    dtrSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } }
    dtrSub.alignment = { vertical: 'middle', horizontal: 'center' }
    dtrSheet.getRow(2).height = 22

    dtrSheet.addRow([])
    dtrSheet.getRow(3).height = 6

    const dtrHeaders = [
      'Employee Name',
      'Device ID',
      'Branch',
      'Work Date',
      'Day Classification',
      'Time In',
      'Time Out',
      'Hours Worked',
      'Regular Hrs',
      'OT Hours',
      'Night Diff Hrs',
      'Shift Status',
    ]

    const dtrHeaderRow = dtrSheet.addRow(dtrHeaders)
    dtrHeaderRow.height = 30
    dtrHeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_HDR } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = thinBorder
    })

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

        row.eachCell((cell, col) => {
          cell.font = { name: 'Calibri', size: 10 }
          cell.border = thinBorder
          if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } }

          if (col === 1) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' }
            cell.font = { name: 'Calibri', size: 10, bold: true }
          } else if (col <= 3) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' }
          } else if (col === 4 || col === 5 || col === 6 || col === 7 || col === 12) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'right' }
            cell.numFmt = '#,##0.00'
          }

          // Colour-code shift status
          if (col === 12) {
            const status = String(rec.shift_status || '').toLowerCase()
            if (status === 'completed') {
              cell.font = { name: 'Calibri', size: 10, color: { argb: '065F46' } }
            } else if (status === 'on duty') {
              cell.font = { name: 'Calibri', size: 10, color: { argb: '1D4ED8' } }
            } else if (status === 'absent') {
              cell.font = { name: 'Calibri', size: 10, color: { argb: '991B1B' } }
            }
          }

          // Highlight OT hours if > 0
          if (col === 10 && Number(rec.overtime_hours) > 0) {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '7C3AED' } }
          }
        })
      })
    })

    // — Initialize columns then auto-fit ———————————————————————
    dtrSheet.columns = dtrHeaders.map(() => ({ width: 10 }))
    autoFitColumns(dtrSheet, 10, 46)

    // ============================================================
    // TAB 3 — DOLE MULTIPLIERS & LEGAL REFERENCE
    // ============================================================
    const refSheet = workbook.addWorksheet('DOLE Rates & Legal Reference', {
      views: [{ showGridLines: true }],
    })

    refSheet.mergeCells('A1:D1')
    const refTitle = refSheet.getCell('A1')
    refTitle.value = 'PHILIPPINE DOLE — STATUTORY OVERTIME & HOLIDAY MULTIPLIERS'
    refTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFF' } }
    refTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    refTitle.alignment = { vertical: 'middle', horizontal: 'center' }
    refSheet.getRow(1).height = 32

    refSheet.addRow([])
    refSheet.getRow(2).height = 6

    const refHeaders = [
      'Workday Classification',
      'Regular Rate (1st 8 hrs)',
      'Overtime Rate (>8 hrs)',
      'Legal Basis / Notes',
    ]
    const rHeaderRow = refSheet.addRow(refHeaders)
    rHeaderRow.height = 26
    rHeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = thinBorder
    })

    const refRows = [
      ['Regular Workday', '100%  (1.00×)', '125%  (1.25×)', 'Labor Code Art. 87'],
      ['Scheduled Rest Day', '130%  (1.30×)', '169%  (1.69×)', 'Labor Code Art. 93'],
      ['Special Non-Working Holiday', '130%  (1.30×)', '169%  (1.69×)', 'Labor Code Art. 93'],
      ['Special Holiday on Rest Day', '150%  (1.50×)', '195%  (1.95×)', 'Labor Code Art. 93'],
      ['Regular Holiday', '200%  (2.00×)', '260%  (2.60×)', 'Labor Code Art. 94'],
      ['Regular Holiday on Rest Day', '260%  (2.60×)', '338%  (3.38×)', 'Labor Code Art. 94'],
      ['Night Shift Differential (10PM–6AM)', '+10% of hourly', '+10% on OT rate when OT is worked', 'Labor Code Art. 86'],
    ]

    refRows.forEach((r, i) => {
      const row = refSheet.addRow(r)
      row.height = 22
      if (i % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } }
        })
      }
      row.eachCell((cell, col) => {
        cell.font = { name: 'Calibri', size: 10 }
        cell.border = thinBorder
        cell.alignment = {
          vertical: 'middle',
          horizontal: col === 1 || col === 4 ? 'left' : 'center',
        }
      })
    })

    refSheet.columns = refHeaders.map(() => ({ width: 10 }))
    autoFitColumns(refSheet, 14, 50)

    // ============================================================
    // TAB 4 — CALCULATION MODE GUIDE
    // ============================================================
    const guideSheet = workbook.addWorksheet('Calculation Mode Guide', {
      views: [{ showGridLines: false }],
    })

    guideSheet.mergeCells('A1:C1')
    const guideTitle = guideSheet.getCell('A1')
    guideTitle.value = 'PAYROLL CALCULATION MODE — QUICK REFERENCE GUIDE'
    guideTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFF' } }
    guideTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    guideTitle.alignment = { vertical: 'middle', horizontal: 'center' }
    guideSheet.getRow(1).height = 32

    guideSheet.addRow([])

    const guideHeaders = ['Attribute', 'Exact Biometrics', 'Standard Normalized']
    const gHeaderRow = guideSheet.addRow(guideHeaders)
    gHeaderRow.height = 26
    gHeaderRow.eachCell((cell, col) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: col === 1 ? SLATE_HDR : col === 2 ? '0284C7' : '059669' },
      }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = thinBorder
    })

    const guideRows = [
      ['Time-In Handling', 'Exact punch time (e.g. 8:20 AM)', 'Clamp 8:00–9:05 AM → 9:00 AM'],
      ['Time-Out Handling', 'Exact punch time (e.g. 6:22 PM)', 'Clamp 6:00–6:30 PM → 6:00 PM'],
      ['OT Calculation', 'Every minute beyond 8 hrs counted', 'OT only in completed 30-min blocks after 6:30 PM'],
      ['Gross Pay Impact', 'Higher — reflects all raw OT minutes', 'Lower — eliminates casual linger OT'],
      ['Best Used For', 'Accurate legal compliance audits', 'Standard payroll, clean payslips'],
      ['Data Source', 'Raw biometric attendance_logs table', 'Normalized via shift policy rules'],
      ['This File Mode', calcMode === 'exact' ? '✅ ACTIVE' : '—', calcMode === 'normalized' ? '✅ ACTIVE' : '—'],
    ]

    guideRows.forEach((r, i) => {
      const row = guideSheet.addRow(r)
      row.height = 22
      row.eachCell((cell, col) => {
        cell.font = { name: 'Calibri', size: 10 }
        cell.border = thinBorder
        cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'center', wrapText: true }
        if (i % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_ROW } }
        }
        if (col === 1) cell.font = { name: 'Calibri', size: 10, bold: true }
        if (r[col - 1] === '✅ ACTIVE') {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '065F46' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } }
        }
      })
    })

    guideSheet.columns = guideHeaders.map(() => ({ width: 10 }))
    autoFitColumns(guideSheet, 18, 52)

    // ── Generate buffer ────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer()

    const modeTag = calcMode === 'normalized' ? 'Normalized' : 'Exact'
    const filename = `JAPA_Payroll_${modeTag}_${startDate}_to_${endDate}.xlsx`

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
