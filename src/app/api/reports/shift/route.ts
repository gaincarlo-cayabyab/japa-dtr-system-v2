import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/auth'

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get('japa_session')?.value
    const session = token ? verifySessionToken(token) : null

    if (!session || session.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only IT Administrator (Super Admin) has authorization to edit DTR shifts.' },
        { status: 403 }
      )
    }

    const supabase = await createClient()
    const body = await request.json()
    const { device_user_id, work_date, first_check_in, last_check_out, attendance_status, notes } = body

    if (!device_user_id || !work_date) {
      return NextResponse.json(
        { error: 'device_user_id and work_date are required.' },
        { status: 400 }
      )
    }

    // Save attendance status (e.g. absent, leave, sick_leave) and notes in shift_notes
    if (attendance_status !== undefined || notes !== undefined) {
      await supabase.from('shift_notes').upsert({
        device_user_id: String(device_user_id),
        work_date,
        attendance_status: attendance_status || 'present',
        notes: notes?.trim() || '',
        created_by_username: session.username,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'device_user_id,work_date' })
    }

    // Shift operational window: from 04:00 AM of work_date to 03:59:59 AM of next day
    const nextDateObj = new Date(`${work_date}T00:00:00+08:00`)
    nextDateObj.setDate(nextDateObj.getDate() + 1)
    const nextDate = nextDateObj.toISOString().slice(0, 10)

    const windowStart = `${work_date}T04:00:00+08:00`
    const windowEnd = `${nextDate}T03:59:59+08:00`

    // Fetch existing punches for this employee in this window
    const { data: existingPunches, error: fetchErr } = await supabase
      .from('attendance_logs')
      .select('id, punch_time, status')
      .eq('device_user_id', String(device_user_id))
      .gte('punch_time', windowStart)
      .lte('punch_time', windowEnd)
      .order('punch_time', { ascending: true })

    if (fetchErr) throw fetchErr

    const punches = existingPunches || []

    // If marked as absent, vacation leave, or sick leave, remove any accidental punches for this date window
    if (attendance_status && attendance_status !== 'present') {
      if (punches.length > 0) {
        await supabase
          .from('attendance_logs')
          .delete()
          .in('id', punches.map((p) => p.id))
      }
    } else {
      // 1. Handle First Check In (when status is present)
      if (first_check_in) {
        const inTime = first_check_in.includes('T') ? first_check_in : `${work_date}T${first_check_in}:00+08:00`
        const firstPunch = punches[0]
        if (firstPunch) {
          await supabase
            .from('attendance_logs')
            .update({ punch_time: inTime, status: 0 })
            .eq('id', firstPunch.id)
        } else {
          await supabase.from('attendance_logs').insert({
            device_user_id: String(device_user_id),
            punch_time: inTime,
            status: 0,
            synced_at: new Date().toISOString(),
          })
        }
      }

      // 2. Handle Last Check Out (when status is present)
      if (last_check_out) {
        let outTime = last_check_out.includes('T') ? last_check_out : `${work_date}T${last_check_out}:00+08:00`
        // Check if checkout is after midnight (e.g. 00:00 to 03:59) -> belongs to nextDate
        const timePart = last_check_out.includes('T') ? last_check_out.slice(11, 16) : last_check_out
        const hourNum = parseInt(timePart.slice(0, 2))
        if (hourNum < 4 && !last_check_out.includes('T')) {
          outTime = `${nextDate}T${last_check_out}:00+08:00`
        }

        if (punches.length > 1) {
          const lastPunch = punches[punches.length - 1]
          await supabase
            .from('attendance_logs')
            .update({ punch_time: outTime, status: 1 })
            .eq('id', lastPunch.id)
        } else {
          await supabase.from('attendance_logs').insert({
            device_user_id: String(device_user_id),
            punch_time: outTime,
            status: 1,
            synced_at: new Date().toISOString(),
          })
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Shift updated successfully.' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update shift'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
