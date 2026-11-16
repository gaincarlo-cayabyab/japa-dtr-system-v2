import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Join employees with compensation
    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('device_user_id, full_name, branch, position, department')
      .order('device_user_id', { ascending: true })

    if (empErr) throw empErr

    const { data: compList, error: compErr } = await supabase
      .from('employee_compensation')
      .select('*')

    if (compErr) throw compErr

    const compMap = new Map()
    compList?.forEach((c) => compMap.set(c.device_user_id, c))

    const result = employees.map((emp) => {
      const comp = compMap.get(emp.device_user_id)
      return {
        device_user_id: emp.device_user_id,
        full_name: emp.full_name,
        branch: emp.branch,
        position: emp.position,
        department: emp.department,
        daily_rate: comp ? Number(comp.daily_rate) : 610.0,
        monthly_rate: comp?.monthly_rate ? Number(comp.monthly_rate) : null,
        employment_type: comp?.employment_type || 'regular',
        overtime_eligible: comp?.overtime_eligible ?? true,
        night_diff_eligible: comp?.night_diff_eligible ?? true,
        effectivity_date: comp?.effectivity_date || new Date().toISOString().split('T')[0],
      }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const {
      device_user_id,
      daily_rate,
      monthly_rate,
      employment_type,
      overtime_eligible,
      night_diff_eligible,
    } = body

    if (!device_user_id) {
      return NextResponse.json(
        { success: false, error: 'device_user_id is required' },
        { status: 400 }
      )
    }

    const payload = {
      device_user_id,
      daily_rate: Number(daily_rate) || 0,
      monthly_rate: monthly_rate ? Number(monthly_rate) : null,
      employment_type: employment_type || 'regular',
      overtime_eligible: overtime_eligible ?? true,
      night_diff_eligible: night_diff_eligible ?? true,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('employee_compensation')
      .upsert(payload, { onConflict: 'device_user_id' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
