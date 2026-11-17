import crypto from 'crypto'

const AUTH_SALT = 'japa_dtr_salt_2026'
const JWT_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'japa_enterprise_dtr_secret_key_2026_xyz'

export interface UserSession {
  id: string
  username: string
  displayName: string
  role: 'super_admin' | 'admin' | 'manager' | 'ceo' | 'staff' | 'kiosk'
  loginAt: number
}

/**
 * Deterministic salted SHA-256 hash for 6-digit PIN.
 */
export function hashPin(pin: string, username: string): string {
  return crypto
    .createHash('sha256')
    .update(`${username.toLowerCase()}:${pin.trim()}:${AUTH_SALT}`)
    .digest('hex')
}

/**
 * Creates an HMAC-SHA256 signature for the session payload.
 */
function signPayload(payloadStr: string): string {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(payloadStr)
    .digest('base64url')
}

/**
 * Generates an encrypted/signed session cookie string.
 */
export function createSessionToken(session: UserSession): string {
  const data = Buffer.from(JSON.stringify(session)).toString('base64url')
  const signature = signPayload(data)
  return `${data}.${signature}`
}

/**
 * Verifies and decodes the session token.
 */
export function verifySessionToken(token: string): UserSession | null {
  try {
    if (!token || !token.includes('.')) return null
    const [data, signature] = token.split('.')
    const expectedSignature = signPayload(data)
    if (signature !== expectedSignature) return null

    const jsonStr = Buffer.from(data, 'base64url').toString('utf-8')
    const parsed = JSON.parse(jsonStr) as UserSession

    // Session valid for 30 days
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
    if (Date.now() - parsed.loginAt > THIRTY_DAYS) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

/**
 * Checks if a session has active Add/Edit/Delete permissions:
 * - IT Administrator (super_admin / admin username): Permanent full access
 * - JAPA Dee (japa_dee) / JAPA Pearly (japa_pearly): Temporary 1-hour access if granted by IT Super Admin
 */
export async function checkUserCanEdit(
  session: UserSession | null,
  supabase: any
): Promise<{ canEdit: boolean; remainingSec?: number; reason?: string }> {
  if (!session) {
    return { canEdit: false, reason: 'Unauthorized: Session missing or invalid.' }
  }

  // IT Administrator and JAPA Manager always have full edit/add/delete privileges
  if (
    session.role === 'super_admin' ||
    session.username === 'admin' ||
    session.role === 'manager' ||
    session.username === 'japa_manager'
  ) {
    return { canEdit: true }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  try {
    const { data } = await supabase
      .from('sync_meta')
      .select('value')
      .eq('key', `edit_grant_${session.username}`)
      .maybeSingle()

    const grantExpiry = data?.value ? Number(data.value) : 0
    if (grantExpiry > nowSec) {
      return { canEdit: true, remainingSec: grantExpiry - nowSec }
    }
  } catch (err) {
    console.error('Failed to check edit grant:', err)
  }

  return {
    canEdit: false,
    reason: 'Forbidden: 1-Hour Edit Access approval from IT Administrator is required.',
  }
}

