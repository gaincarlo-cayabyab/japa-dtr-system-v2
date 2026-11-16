import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/auth'

export async function DELETE(request: NextRequest) {
  try {
    // Security check: Only IT Administrator (super_admin) can clear logs
    const cookieStore = cookies()
    const token = cookieStore.get('japa_session')?.value
    const session = token ? verifySessionToken(token) : null

    if (!session || session.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only IT Administrator (Super Admin) has authorization to clear attendance logs.' },
        { status: 403 }
      )
    }

    const supabase = await createClient()

    // Parse body for selective clearing options
    let body: { mode?: string; date?: string; device_user_id?: string } = {}
    try {
      body = await request.json()
    } catch {
      // No body — treat as clear all
    }

    const mode = body.mode ?? 'all'
    const targetDate = body.date        // YYYY-MM-DD
    const targetEmpId = body.device_user_id

    let query = supabase
      .from('attendance_logs')
      .delete({ count: 'exact' })

    if (mode === 'all') {
      // Delete everything — use a "not impossible" filter to satisfy Supabase's requirement
      query = query.neq('id', '00000000-0000-0000-0000-000000000000')
    } else if (mode === 'date' && targetDate) {
      // Clear by specific date (all employees on that day, covering 04:00 AM to 03:59 AM next day)
      const nextDateObj = new Date(`${targetDate}T00:00:00+08:00`)
      nextDateObj.setDate(nextDateObj.getDate() + 1)
      const nextDate = nextDateObj.toISOString().slice(0, 10)
      query = query
        .gte('punch_time', `${targetDate}T04:00:00+08:00`)
        .lt('punch_time', `${nextDate}T04:00:00+08:00`)
    } else if (mode === 'employee' && targetEmpId) {
      // Clear by specific employee (all dates)
      query = query.eq('device_user_id', String(targetEmpId))
    } else if (mode === 'date_employee' && targetDate && targetEmpId) {
      // Clear specific employee on specific date
      const nextDateObj = new Date(`${targetDate}T00:00:00+08:00`)
      nextDateObj.setDate(nextDateObj.getDate() + 1)
      const nextDate = nextDateObj.toISOString().slice(0, 10)
      query = query
        .eq('device_user_id', String(targetEmpId))
        .gte('punch_time', `${targetDate}T04:00:00+08:00`)
        .lt('punch_time', `${nextDate}T04:00:00+08:00`)
    } else {
      return NextResponse.json({ error: 'Invalid mode or missing parameters.' }, { status: 400 })
    }

    const { error, count } = await query

    if (error) {
      console.error('Clear attendance error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Only bump hardware token when clearing all
    if (mode === 'all') {
      try {
        await supabase.rpc('increment_clear_token')
      } catch {
        // ignore if rpc not defined
      }
      try {
        await supabase.from('sync_meta').upsert({ key: 'clear_hardware', value: 1 })
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      success: true,
      deleted: count ?? 0,
      mode,
      message: `Cleared ${count ?? 0} attendance records (mode: ${mode}).`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to clear logs'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
