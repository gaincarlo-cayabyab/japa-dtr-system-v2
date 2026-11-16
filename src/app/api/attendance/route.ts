import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/auth'

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
    .select(
      `
      *,
      employees(full_name, branch)
    `,
      { count: 'exact' }
    )
    .order('punch_time', { ascending: false })
    .range(offset, offset + limit - 1)

  if (date) {
    const start = `${date}T00:00:00+08:00`
    const end = `${date}T23:59:59+08:00`
    query = query.gte('punch_time', start).lte('punch_time', end)
  }
  if (employeeId) query = query.eq('device_user_id', employeeId)
  if (status !== null && status !== '') query = query.eq('status', parseInt(status))

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count, page })
}

// Administrator: Add new attendance punch
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { device_user_id, punch_time, status } = body

    if (!device_user_id || !punch_time) {
      return NextResponse.json(
        { error: 'Employee device_user_id and punch_time are required.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('attendance_logs')
      .insert({
        device_user_id: String(device_user_id),
        punch_time,
        status: Number(status) ?? 0,
        synced_at: new Date().toISOString(),
      })
      .select('*, employees(full_name, branch)')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to add punch'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Administrator: Edit existing attendance punch
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id, device_user_id, punch_time, status } = body

    if (!id) {
      return NextResponse.json({ error: 'Log ID is required.' }, { status: 400 })
    }

    const updatePayload: Record<string, any> = {}
    if (device_user_id) updatePayload.device_user_id = String(device_user_id)
    if (punch_time) updatePayload.punch_time = punch_time
    if (status !== undefined) updatePayload.status = Number(status)

    const { data, error } = await supabase
      .from('attendance_logs')
      .update(updatePayload)
      .eq('id', id)
      .select('*, employees(full_name, branch)')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update punch'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Administrator: Delete single attendance punch (Super Admin only)
export async function DELETE(request: NextRequest) {
  try {
    // Security check: Only IT Administrator (super_admin) can delete punches
    const cookieStore = cookies()
    const token = cookieStore.get('japa_session')?.value
    const session = token ? verifySessionToken(token) : null

    if (!session || session.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only IT Administrator (Super Admin) has authorization to delete attendance punches.' },
        { status: 403 }
      )
    }

    const supabase = await createClient()
    const { searchParams } = request.nextUrl
    let id = searchParams.get('id')

    if (!id) {
      try {
        const body = await request.json()
        id = body.id
      } catch {
        // no body
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'Log ID is required.' }, { status: 400 })
    }

    const { error } = await supabase.from('attendance_logs').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true, deletedId: id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete punch'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
