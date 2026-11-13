import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = request.nextUrl

  const date = searchParams.get('date')
  const employeeId = searchParams.get('employee_id')
  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const offset = (page - 1) * limit

  let query = supabase
    .from('attendance_logs')
    .select(`
      *,
      employees(full_name, branch)
    `, { count: 'exact' })
    .order('punch_time', { ascending: false })
    .range(offset, offset + limit - 1)

  if (date) {
    // Filter by date in Asia/Manila timezone
    const start = `${date}T00:00:00+08:00`
    const end   = `${date}T23:59:59+08:00`
    query = query.gte('punch_time', start).lte('punch_time', end)
  }
  if (employeeId) query = query.eq('device_user_id', employeeId)
  if (status !== null && status !== '') query = query.eq('status', parseInt(status))

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count, page })
}
