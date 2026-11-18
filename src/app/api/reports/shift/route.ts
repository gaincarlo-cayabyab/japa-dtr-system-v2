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

    // ACTION: DELETE ENTIRE SHIFT / RESET
    if (action === 'delete_all') {
      if (punches.length > 0) {
        await supabase
          .from('attendance_logs')
          .delete()
          .in('id', punches.map((p) => p.id))
      }
      await supabase
        .from('shift_notes')
        .delete()
        .eq('device_user_id', String(device_user_id))
        .eq('work_date', work_date)

      return NextResponse.json({
        success: true,
        message: 'Shift punches and notes deleted successfully.',
        action: 'deleted',
      })
    }

    // Save attendance status & notes in shift_notes
    if (attendance_status !== undefined || notes !== undefined) {
      await supabase.from('shift_notes').upsert(
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
    }

    // If marked absent, vacation leave, or sick leave -> remove any punches so hours drop to 0
    if (attendance_status && attendance_status !== 'present') {
      if (punches.length > 0) {
        await supabase
          .from('attendance_logs')
          .delete()
          .in('id', punches.map((p) => p.id))
      }
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

      // 1. Time In handling
      if (inTime) {
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
      } else if (!has_in_time && punches.length > 0) {
        // User explicitly unchecked or deleted Time In
        await supabase.from('attendance_logs').delete().eq('id', punches[0].id)
      }

      // Re-fetch remaining punches after Time In modification
      const { data: updatedPunches } = await supabase
        .from('attendance_logs')
        .select('id, punch_time, status')
        .eq('device_user_id', String(device_user_id))
        .gte('punch_time', windowStart)
        .lte('punch_time', windowEnd)
        .order('punch_time', { ascending: true })

      const currentPunches = updatedPunches || []

      // 2. Time Out handling
      if (outTime) {
        if (currentPunches.length > 1) {
          const lastPunch = currentPunches[currentPunches.length - 1]
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
      } else if (!has_out_time && currentPunches.length > 1) {
        // User explicitly unchecked Time Out (delete last punch, leaving only Time In)
        const lastPunch = currentPunches[currentPunches.length - 1]
        await supabase.from('attendance_logs').delete().eq('id', lastPunch.id)
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
    await supabase
      .from('attendance_logs')
      .delete()
      .eq('device_user_id', String(device_user_id))
      .gte('punch_time', windowStart)
      .lte('punch_time', windowEnd)

    // Delete shift notes
    await supabase
      .from('shift_notes')
      .delete()
      .eq('device_user_id', String(device_user_id))
      .eq('work_date', work_date)

    return NextResponse.json({ success: true, message: 'Shift deleted successfully.' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete shift'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
