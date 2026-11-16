import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/auth'

export async function DELETE() {
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

    // 1. Delete all attendance logs from Supabase
    const { error, count } = await supabase
      .from('attendance_logs')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      console.error('Clear attendance error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 2. Bump the sync_meta clear_token
    await supabase.rpc('increment_clear_token')

    // 3. Request the tablet bridge to clear the physical TA500 hardware memory
    await supabase
      .from('sync_meta')
      .upsert({ key: 'clear_hardware', value: 1 })

    return NextResponse.json({
      success: true,
      deleted: count ?? 0,
      hardware_clear_requested: true,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
