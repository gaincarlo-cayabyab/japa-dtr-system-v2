import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET: Returns active grants and pending requests for all users.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: meta } = await supabase.from('sync_meta').select('key, value')

    const metaMap: Record<string, number> = {}
    for (const item of meta ?? []) {
      metaMap[item.key] = Number(item.value) || 0
    }

    const nowSec = Math.floor(Date.now() / 1000)

    const pendingRequests = []
    if (metaMap['edit_req_japa_dee'] === 1) {
      pendingRequests.push({ username: 'japa_dee', displayName: 'JAPA Dee', role: 'CEO / Executive' })
    }
    if (metaMap['edit_req_japa_pearly'] === 1) {
      pendingRequests.push({ username: 'japa_pearly', displayName: 'JAPA Pearly', role: 'Office Staff' })
    }

    const activeGrants: Record<string, { active: boolean; remainingSec: number }> = {
      japa_dee: {
        active: (metaMap['edit_grant_japa_dee'] || 0) > nowSec,
        remainingSec: Math.max(0, (metaMap['edit_grant_japa_dee'] || 0) - nowSec),
      },
      japa_pearly: {
        active: (metaMap['edit_grant_japa_pearly'] || 0) > nowSec,
        remainingSec: Math.max(0, (metaMap['edit_grant_japa_pearly'] || 0) - nowSec),
      },
    }

    return NextResponse.json({
      pendingRequests,
      activeGrants,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch edit access status'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST: Request, Approve, or Decline 1-Hour Temporary Edit Access
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, targetUsername } = body

    const sessionCookie = req.cookies.get('japa_session')?.value
    const session = sessionCookie ? verifySessionToken(sessionCookie) : null

    const supabase = await createClient()
    const nowSec = Math.floor(Date.now() / 1000)

    if (action === 'request') {
      const username = targetUsername || session?.username || 'japa_pearly'
      await supabase.from('sync_meta').upsert([
        { key: `edit_req_${username}`, value: 1 },
        { key: `edit_req_time_${username}`, value: nowSec },
      ])
      return NextResponse.json({
        success: true,
        message: '1-Hour Edit Access request submitted to IT Administrator.',
      })
    }

    if (action === 'approve') {
      // Must be Super Admin to approve
      if (session?.role !== 'super_admin' && session?.username !== 'admin') {
        return NextResponse.json({ error: 'Only IT Super Admin can approve edit requests.' }, { status: 403 })
      }

      if (!targetUsername) {
        return NextResponse.json({ error: 'Target username is required' }, { status: 400 })
      }

      const grantExpiry = nowSec + 3600 // Exactly 1 hour (3600 seconds)
      await supabase.from('sync_meta').upsert([
        { key: `edit_req_${targetUsername}`, value: 0 },
        { key: `edit_grant_${targetUsername}`, value: grantExpiry },
      ])

      return NextResponse.json({
        success: true,
        message: `Approved 1-Hour Edit Access for ${targetUsername}!`,
        grantExpiry,
      })
    }

    if (action === 'decline' || action === 'revoke') {
      if (session?.role !== 'super_admin' && session?.username !== 'admin') {
        return NextResponse.json({ error: 'Only IT Super Admin can decline or revoke edit requests.' }, { status: 403 })
      }

      if (!targetUsername) {
        return NextResponse.json({ error: 'Target username is required' }, { status: 400 })
      }

      await supabase.from('sync_meta').upsert([
        { key: `edit_req_${targetUsername}`, value: 0 },
        { key: `edit_grant_${targetUsername}`, value: 0 },
      ])

      return NextResponse.json({
        success: true,
        message: `Revoked edit access for ${targetUsername}.`,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Edit access operation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
