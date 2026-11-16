import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = request.nextUrl
    const periodStart = searchParams.get('period_start')
    const periodEnd = searchParams.get('period_end')

    let query = supabase.from('payroll_payments').select('*')
    if (periodStart) query = query.gte('period_start', periodStart)
    if (periodEnd) query = query.lte('period_end', periodEnd)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch payroll payments'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const {
      device_user_id,
      period_start,
      period_end,
      payment_status,
      amount_paid,
      gross_pay,
      payment_method,
      notes,
    } = body

    if (!device_user_id || !period_start || !period_end) {
      return NextResponse.json(
        { success: false, error: 'device_user_id, period_start, and period_end are required.' },
        { status: 400 }
      )
    }

    const payload = {
      device_user_id: String(device_user_id),
      period_start,
      period_end,
      payment_status: payment_status || 'unpaid',
      amount_paid: Number(amount_paid) || 0,
      gross_pay: Number(gross_pay) || 0,
      payment_method: payment_method || 'cash',
      paid_at: payment_status !== 'unpaid' ? new Date().toISOString() : null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('payroll_payments')
      .upsert(payload, { onConflict: 'device_user_id,period_start,period_end' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to record payment'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
