import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, checkUserCanEdit } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('japa_session')?.value
  if (!token) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 })
  }

  const session = verifySessionToken(token)
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 })
  }

  const supabase = await createClient()
  const authCheck = await checkUserCanEdit(session, supabase)

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        id: session.id,
        username: session.username,
        displayName: session.displayName,
        role: session.role,
        canEdit: authCheck.canEdit,
        grantRemainingSec: authCheck.remainingSec ?? 0,
        isSuperAdmin: session.role === 'super_admin' || session.username === 'admin',
        isManager: session.role === 'manager' || session.username === 'japa_manager',
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  )
}
