import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE() {
  try {
    const supabase = await createClient()

    // 1. Delete all attendance logs
    const { error, count } = await supabase
      .from('attendance_logs')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      console.error('Clear attendance error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 2. Bump the sync_meta clear_token so the tablet bridge knows to wipe
    //    its local seen-set and re-push all device records fresh.
    await supabase.rpc('increment_clear_token')

    return NextResponse.json({ success: true, deleted: count ?? 0 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
