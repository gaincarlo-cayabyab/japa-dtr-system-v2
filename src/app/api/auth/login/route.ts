import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hashPin, createSessionToken, UserSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { username, pin } = await req.json()

    if (!username || !pin) {
      return NextResponse.json({ error: 'Username and 6-digit PIN are required.' }, { status: 400 })
    }

    if (typeof pin !== 'string' || pin.trim().length !== 6) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: user, error } = await supabase
      .from('system_users')
      .select('id, username, display_name, pin_hash, role, is_active')
      .eq('username', username.trim().toLowerCase())
      .single()

    if (error || !user || !user.is_active) {
      return NextResponse.json({ error: 'Invalid user or account is inactive.' }, { status: 401 })
    }

    const computedHash = hashPin(pin, user.username)
    if (computedHash !== user.pin_hash) {
      return NextResponse.json({ error: 'Incorrect 6-digit PIN. Please try again.' }, { status: 401 })
    }

    // Update last login timestamp asynchronously
    await supabase
      .from('system_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)

    const sessionPayload: UserSession = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role as any,
      loginAt: Date.now(),
    }

    const token = createSessionToken(sessionPayload)

    const response = NextResponse.json({
      success: true,
      user: {
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    })

    // Set HTTP-Only secure cookie (30 days persistence)
    response.cookies.set('japa_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    return response
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Login failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

