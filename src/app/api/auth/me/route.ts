import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('japa_session')?.value
  if (!token) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 })
  }

  const session = verifySessionToken(token)
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 })
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.id,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
    },
  })
}

