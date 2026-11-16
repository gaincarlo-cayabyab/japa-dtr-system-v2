import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/auth'

// GET /api/attendance/ot-reason?device_user_id=X&work_date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = request.nextUrl
    const device_user_id = searchParams.get('device_user_id')
    const work_date = searchParams.get('work_date')
    const dates = searchParams.get('dates')

    let query = supabase
      .from('shift_notes')
      .select('*')
      .order('work_date', { ascending: false })

    if (device_user_id) query = query.eq('device_user_id', device_user_id)
    if (work_date) query = query.eq('work_date', work_date)
    if (dates) {
      const dateList = dates.split(',').filter(Boolean)
      if (dateList.length > 0) {
        query = query.in('work_date', dateList)
      }
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch OT reasons'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/attendance/ot-reason  — Super Admin only: add/update OT reason
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get('japa_session')?.value
    const session = token ? verifySessionToken(token) : null

    if (!session || session.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only IT Administrator (Super Admin) can add OT reasons.' },
        { status: 403 }
      )
    }

    const supabase = await createClient()
    const body = await request.json()
    const { device_user_id, work_date, ot_reason, attendance_status, notes } = body

    if (!device_user_id || !work_date) {
      return NextResponse.json({ error: 'device_user_id and work_date are required.' }, { status: 400 })
    }

    const payload: Record<string, any> = {
      device_user_id: String(device_user_id),
      work_date,
      created_by_username: session.username,
      updated_at: new Date().toISOString(),
    }
    if (ot_reason !== undefined) payload.ot_reason = ot_reason?.trim() || ''
    if (attendance_status !== undefined) payload.attendance_status = attendance_status
    if (notes !== undefined) payload.notes = notes?.trim() || ''

    const { data, error } = await supabase
      .from('shift_notes')
      .upsert(payload, { onConflict: 'device_user_id,work_date' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save OT reason'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
