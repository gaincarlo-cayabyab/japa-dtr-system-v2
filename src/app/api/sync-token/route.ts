import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/sync-token
 * Returns the current sync token (a counter that increments every time
 * attendance logs are cleared). The tablet bridge checks this on every
 * cycle; if the token changed, it wipes its local seen-set and re-syncs
 * all device records into Supabase fresh.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('sync_meta')
      .select('value')
      .eq('key', 'clear_token')
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ token: 0 })
    }

    return NextResponse.json({ token: data?.value ?? 0 })
  } catch {
    return NextResponse.json({ token: 0 })
  }
}

