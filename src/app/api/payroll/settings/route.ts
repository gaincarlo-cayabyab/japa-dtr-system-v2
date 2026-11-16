import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('payroll_settings')
      .select('*')
      .order('fiscal_year', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({ success: true, data })
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
      fiscal_year = 2026,
      work_hours_per_day,
      grace_period_minutes,
      regular_holiday_dates,
      special_holiday_dates,
    } = body

    const payload: Record<string, unknown> = {
      fiscal_year,
      updated_at: new Date().toISOString(),
    }
    if (work_hours_per_day !== undefined) payload.work_hours_per_day = work_hours_per_day
    if (grace_period_minutes !== undefined) payload.grace_period_minutes = grace_period_minutes
    if (regular_holiday_dates !== undefined) payload.regular_holiday_dates = regular_holiday_dates
    if (special_holiday_dates !== undefined) payload.special_holiday_dates = special_holiday_dates

    const { data, error } = await supabase
      .from('payroll_settings')
      .upsert(payload, { onConflict: 'fiscal_year' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
