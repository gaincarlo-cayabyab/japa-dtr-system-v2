import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface DailyDtrRow {
  full_name: string
  device_user_id: string
  branch: string
  work_date: string
  first_check_in: string | null
  last_check_out: string | null
  total_punches: number
}

function calcHoursWorked(firstIn: string | null, lastOut: string | null): string {
  if (!firstIn || !lastOut) return ''
  const ms = new Date(lastOut).getTime() - new Date(firstIn).getTime()
  if (ms <= 0) return ''
  const hours = ms / 1000 / 3600
  return `${hours.toFixed(1)}h`
}

function formatTime(ts: string | null): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = request.nextUrl

  const month = searchParams.get('month') // YYYY-MM
  const branch = searchParams.get('branch')
  const format = searchParams.get('format') ?? 'json'

  let query = supabase
    .from('daily_dtr')
    .select('*')
    .order('work_date', { ascending: true })
    .order('full_name', { ascending: true })

  if (month) {
    const start = `${month}-01`
    // Last day of month: go to first day of next month, then subtract
    const [year, mon] = month.split('-').map(Number)
    const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`
    const end = `${nextMonth}-01`
    query = query.gte('work_date', start).lt('work_date', end)
  }

  if (branch) {
    query = query.eq('branch', branch)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as DailyDtrRow[]

  if (format === 'csv') {
    const headers = [
      'Employee Name',
      'Device ID',
      'Branch',
      'Work Date',
      'First Check-In',
      'Last Check-Out',
      'Hours Worked',
      'Total Punches',
    ]

    const csvLines = [
      headers.join(','),
      ...rows.map((row) => {
        const hoursWorked = calcHoursWorked(row.first_check_in, row.last_check_out)
        return [
          `"${(row.full_name ?? '').replace(/"/g, '""')}"`,
          `"${row.device_user_id ?? ''}"`,
          `"${(row.branch ?? '').replace(/"/g, '""')}"`,
          row.work_date ?? '',
          `"${formatTime(row.first_check_in)}"`,
          `"${formatTime(row.last_check_out)}"`,
          `"${hoursWorked}"`,
          row.total_punches ?? 0,
        ].join(',')
      }),
    ]

    const csvText = csvLines.join('\r\n')
    const filename = month ? `dtr_${month}.csv` : 'dtr_export.csv'

    return new NextResponse(csvText, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // JSON response — enrich with hours_worked
  const enriched = rows.map((row) => ({
    ...row,
    hours_worked: calcHoursWorked(row.first_check_in, row.last_check_out),
  }))

  return NextResponse.json({ data: enriched, count: enriched.length })
}
