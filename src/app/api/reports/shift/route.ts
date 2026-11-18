import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken, checkUserCanEdit } from '@/lib/auth'

function getNextWorkDate(workDate: string): string {
  const [y, m, d] = workDate.split('-').map(Number)
  const nextDateObj = new Date(Date.UTC(y, m - 1, d + 1))
  return nextDateObj.toISOString().slice(0, 10)
}

function parseTimeToTimestamp(timeStr: string, workDate: string, nextDate: string): string {
  if (timeStr.includes('T')) return timeStr

  const trimmed = timeStr.trim().toUpperCase()
  let hours = 0
  let minutes = 0

  if (trimmed.includes('AM') || trimmed.includes('PM')) {
    const isPM = trimmed.includes('PM')
    const clean = trimmed.replace(/AM|PM/g, '').trim()
    const [hStr, mStr] = clean.split(':')
    let h = parseInt(hStr, 10)
    const m = parseInt(mStr || '0', 10)
    if (isPM && h < 12) h += 12
    if (!isPM && h === 12) h = 0
    hours = h
    minutes = m
  } else {
    const [hStr, mStr] = trimmed.split(':')
    hours = parseInt(hStr, 10)
    minutes = parseInt(mStr || '0', 10)
  }

  const hPad = String(hours).padStart(2, '0')
  const mPad = String(minutes).padStart(2, '0')

  // Operational window: 00:00 to 03:59 belongs to nextDate (post-midnight work for this shift)
  const targetDate = hours < 4 ? nextDate : workDate
  return `${targetDate}T${hPad}:${mPad}:00+08:00`
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get('japa_session')?.value
    const session = token ? verifySessionToken(token) : null

    const supabase = await createClient()
    const authCheck = await checkUserCanEdit(session, supabase)
    if (!authCheck.canEdit) {
      return NextResponse.json(
        { error: authCheck.reason || 'Forbidden: 1-Hour Edit Access approval from IT Administrator or Manager is required to edit shifts.' },
        { status: 403 }
      )
    }
    const body = await request.json()
    const {
      device_user_id,
      work_date,
      first_check_in,
      last_check_out,
      has_in_time = true,
      has_out_time = true,
      action,
      attendance_status = 'present',
      notes,
    } = body

    if (!device_user_id || !work_date) {
      return NextResponse.json(
        { error: 'device_user_id and work_date are required.' },
        { status: 400 }
      )
    }

    // Operational shift window: 04:00 AM of work_date to 03:59:59 AM of next day
    const nextDate = getNextWorkDate(work_date)
    const windowStart = `${work_date}T04:00:00+08:00`
    const windowEnd = `${nextDate}T03:59:59+08:00`

    // ACTION: DELETE ENTIRE SHIFT / RESET
    if (action === 'delete_all') {
      const { error: delErr } = await supabase
        .from('attendance_logs')
        .delete()
        .eq('device_user_id', String(device_user_id))
        .gte('punch_time', windowStart)
        .lte('punch_time', windowEnd)

      if (delErr) {
        console.error('Error deleting attendance logs:', delErr)
        throw delErr
      }

      const { error: noteDelErr } = await supabase
        .from('shift_notes')
        .delete()
        .eq('device_user_id', String(device_user_id))
        .eq('work_date', work_date)

      if (noteDelErr) {
        console.error('Error deleting shift note:', noteDelErr)
        throw noteDelErr
      }

      return NextResponse.json({
        success: true,
        message: 'Shift punches and notes deleted successfully.',
        action: 'deleted',
      })
    }

    // Save attendance status & notes in shift_notes
    if (attendance_status !== undefined || notes !== undefined) {
      const { error: upsertErr } = await supabase.from('shift_notes').upsert(
        {
          device_user_id: String(device_user_id),
          work_date,
          attendance_status: attendance_status || 'present',
          notes: notes?.trim() || '',
          created_by_username: session?.username || 'authorized_user',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'device_user_id,work_date' }
      )

      if (upsertErr) {
        console.error('Error upserting shift notes:', upsertErr)
        throw upsertErr
      }
    }

    // Cleanly delete all existing punches for this employee in this shift window first.
    // This guarantees:
    // 1. No PostgreSQL 23505 duplicate key violations when updating punches.
    // 2. No leftover intermediate punches distorting daily_dtr min/max calculations.
    const { error: clearErr } = await supabase
      .from('attendance_logs')
      .delete()
      .eq('device_user_id', String(device_user_id))
      .gte('punch_time', windowStart)
      .lte('punch_time', windowEnd)

    if (clearErr) {
      console.error('Error clearing old punches for shift edit:', clearErr)
      throw clearErr
    }

    // If marked absent, vacation leave, or sick leave -> punches are cleared, hours are 0.
    if (attendance_status && attendance_status !== 'present') {
      // Nothing more to insert
    } else {
      // ── STATUS IS PRESENT ──
      const inTime = first_check_in && has_in_time ? parseTimeToTimestamp(first_check_in, work_date, nextDate) : null
      const outTime = last_check_out && has_out_time ? parseTimeToTimestamp(last_check_out, work_date, nextDate) : null

      // Validate: if both inTime and outTime are set, outTime must be after inTime
      if (inTime && outTime) {
        const inMs = new Date(inTime).getTime()
        const outMs = new Date(outTime).getTime()
        if (outMs <= inMs) {
          return NextResponse.json(
            { error: 'Time Out must be later than Time In. For night shifts past midnight, use a midnight preset (e.g. 12:00 AM or 1:00 AM).' },
            { status: 400 }
          )
        }
      }

      const toInsert: { device_user_id: string; punch_time: string; status: number; synced_at: string }[] = []
      if (inTime) {
        toInsert.push({
          device_user_id: String(device_user_id),
          punch_time: inTime,
          status: 0,
          synced_at: new Date().toISOString(),
        })
      }
      if (outTime) {
        toInsert.push({
          device_user_id: String(device_user_id),
          punch_time: outTime,
          status: 1,
          synced_at: new Date().toISOString(),
        })
      }

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('attendance_logs').insert(toInsert)
        if (insErr) {
          console.error('Error inserting edited punches:', insErr)
          throw insErr
        }
      }
    }

    // Fetch updated daily_dtr record to return to client
    const { data: updatedDtr } = await supabase
      .from('daily_dtr')
      .select('*')
      .eq('device_user_id', String(device_user_id))
      .eq('work_date', work_date)
      .maybeSingle()

    // If daily_dtr view hasn't propagated or returns null, construct fallback object
    let finalDtr = updatedDtr
    if (!finalDtr && attendance_status === 'present' && (has_in_time || has_out_time)) {
      const { data: latestPunches } = await supabase
        .from('attendance_logs')
        .select('punch_time')
        .eq('device_user_id', String(device_user_id))
        .gte('punch_time', windowStart)
        .lte('punch_time', windowEnd)
        .order('punch_time', { ascending: true })

      if (latestPunches && latestPunches.length > 0) {
        const { data: emp } = await supabase
          .from('employees')
          .select('id, full_name, branch')
          .eq('device_user_id', String(device_user_id))
          .maybeSingle()

        const firstIn = latestPunches[0].punch_time
        const lastOut = latestPunches.length > 1 ? latestPunches[latestPunches.length - 1].punch_time : null

        let hoursWorked = 0
        let otHours = 0
        if (firstIn && lastOut) {
          const inDt = new Date(firstIn)
          const outDt = new Date(lastOut)
          const diffHrs = Math.max(0, (outDt.getTime() - inDt.getTime()) / (1000 * 60 * 60))
          hoursWorked = Math.max(0, Math.round((diffHrs > 5 ? diffHrs - 1 : diffHrs) * 10) / 10)
          otHours = Math.max(0, Math.round(Math.max(0, hoursWorked - 8) * 10) / 10)
        }

        finalDtr = {
          employee_id: emp?.id || String(device_user_id),
          device_user_id: String(device_user_id),
          full_name: emp?.full_name || 'Staff Member',
          branch: emp?.branch || 'Dagupan Main',
          work_date,
          first_check_in: firstIn,
          last_check_out: lastOut,
          total_punches: latestPunches.length,
          hours_worked: hoursWorked,
          overtime_hours: otHours,
          shift_status: lastOut ? 'Completed' : 'On Duty',
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Shift updated successfully.',
      updatedDtr: finalDtr,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update shift'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get('japa_session')?.value
    const session = token ? verifySessionToken(token) : null

    const supabase = await createClient()
    const authCheck = await checkUserCanEdit(session, supabase)
    if (!authCheck.canEdit) {
      return NextResponse.json(
        { error: authCheck.reason || 'Forbidden: 1-Hour Edit Access approval from IT Administrator or Manager is required to delete shifts.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const device_user_id = searchParams.get('device_user_id')
    const work_date = searchParams.get('work_date')

    if (!device_user_id || !work_date) {
      return NextResponse.json({ error: 'device_user_id and work_date are required' }, { status: 400 })
    }

    const nextDate = getNextWorkDate(work_date)
    const windowStart = `${work_date}T04:00:00+08:00`
    const windowEnd = `${nextDate}T03:59:59+08:00`

    // Delete attendance logs
    const { error: logErr } = await supabase
      .from('attendance_logs')
      .delete()
      .eq('device_user_id', String(device_user_id))
      .gte('punch_time', windowStart)
      .lte('punch_time', windowEnd)

    if (logErr) throw logErr

    // Delete shift notes
    const { error: noteErr } = await supabase
      .from('shift_notes')
      .delete()
      .eq('device_user_id', String(device_user_id))
      .eq('work_date', work_date)

    if (noteErr) throw noteErr

    return NextResponse.json({ success: true, message: 'Shift deleted successfully.' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete shift'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
