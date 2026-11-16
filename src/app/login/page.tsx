'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Fingerprint,
  Delete,
  Lock,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Check,
  Keyboard,
} from 'lucide-react'

interface SystemUser {
  username: string
  display_name: string
  role: string
}

const ROLE_CONFIG: Record<string, { label: string; gradient: string; badgeBg: string }> = {
  ceo: {
    label: 'Chief Executive Officer (CEO)',
    gradient: 'from-amber-500 via-orange-500 to-yellow-600',
    badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  manager: {
    label: 'General Manager',
    gradient: 'from-blue-600 via-indigo-600 to-cyan-600',
    badgeBg: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  super_admin: {
    label: 'IT Administrator (Super Admin)',
    gradient: 'from-emerald-500 via-teal-600 to-indigo-600',
    badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  staff: {
    label: 'Office Staff',
    gradient: 'from-purple-500 via-indigo-500 to-pink-500',
    badgeBg: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  admin: {
    label: 'Administrator',
    gradient: 'from-violet-600 via-purple-600 to-indigo-700',
    badgeBg: 'bg-violet-50 text-violet-800 border-violet-200',
  },
  viewer: {
    label: 'Viewer',
    gradient: 'from-orange-400 via-amber-500 to-yellow-500',
    badgeBg: 'bg-orange-50 text-orange-800 border-orange-200',
  },
}

function getRoleConfig(role: string) {
  return (
    ROLE_CONFIG[role] ?? {
      label: role.replace('_', ' '),
      gradient: 'from-slate-600 to-slate-800',
      badgeBg: 'bg-slate-50 text-slate-800 border-slate-200',
    }
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export default function LoginPage() {
  const router = useRouter()
  const [users, setUsers] = useState<SystemUser[]>([])
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null)
  const [pin, setPin] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(true)

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch('/api/auth/users')
        const data = await res.json()
        if (data.users && data.users.length > 0) {
          setUsers(data.users)
          const defaultUser =
            data.users.find((u: SystemUser) => u.username === 'admin') || data.users[0]
          setSelectedUser(defaultUser)
        }
      } catch (err) {
        console.error('Failed to load users:', err)
      } finally {
        setLoadingUsers(false)
      }
    }
    loadUsers()
  }, [])

  const submitLogin = useCallback(
    async (pinToSubmit: string) => {
      if (!selectedUser) return
      setLoading(true)
      setErrorMsg(null)
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: selectedUser.username, pin: pinToSubmit }),
        })
        const data = await res.json()
        if (!res.ok) {
          setShake(true)
          setTimeout(() => setShake(false), 500)
          setErrorMsg(data.error || 'Incorrect PIN. Please try again.')
          setPin('')
          return
        }
        router.push('/')
        router.refresh()
      } catch {
        setErrorMsg('Network error. Please try again.')
        setPin('')
      } finally {
        setLoading(false)
      }
    },
    [selectedUser, router]
  )

  const handleNumClick = (digit: string) => {
    if (loading || pin.length >= 6) return
    setErrorMsg(null)
    const newPin = pin + digit
    setPin(newPin)
    if (newPin.length === 6) submitLogin(newPin)
  }

  const handleBackspace = () => {
    if (loading) return
    setErrorMsg(null)
    setPin((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    if (loading) return
    setErrorMsg(null)
    setPin('')
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleNumClick(e.key)
      } else if (e.key === 'Backspace') {
        handleBackspace()
      } else if (e.key === 'Escape') {
        handleClear()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNumClick])

  const selectedRole = selectedUser ? getRoleConfig(selectedUser.role) : null

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-10 relative select-none"
      style={{
        background:
          'linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #4338ca 65%, #6366f1 100%)',
      }}
    >
      {/* Background ambient lighting effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1.5s' }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* Main Spacious Container */}
      <div
        className="relative z-10 w-full max-w-5xl bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-white/20"
        style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}
      >
        {/* ── LEFT COLUMN: User Selection Menu (Spacious, prominent) ── */}
        <div
          className="lg:col-span-6 p-6 sm:p-8 lg:p-10 flex flex-col justify-between relative overflow-hidden"
          style={{
            background:
              'linear-gradient(155deg, #0f172a 0%, #1e1b4b 45%, #312e81 100%)',
          }}
        >
          {/* Subtle Ambient Decorative Circles */}
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />

          {/* Top Branding */}
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 flex-shrink-0">
                  <Fingerprint className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-white tracking-tight leading-tight">
                    JAPA DTR
                  </h1>
                  <p className="text-xs font-semibold text-indigo-300">
                    Enterprise Attendance Portal
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-indigo-200 text-xs font-bold border border-white/10">
                <Sparkles className="w-3 h-3 text-amber-300" />
                Station #1
              </span>
            </div>

            <div className="pt-2">
              <h2 className="text-base sm:text-lg font-black text-white leading-snug">
                Select Operator Profile
              </h2>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Choose your assigned profile to unlock the biometric control suite.
              </p>
            </div>
          </div>

          {/* User Selection Options List (Prominent, large touch-friendly buttons) */}
          <div className="relative z-10 my-6 space-y-3 flex-1 flex flex-col justify-center">
            {loadingUsers ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-16 rounded-2xl bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              users.map((u) => {
                const isSelected = selectedUser?.username === u.username
                const cfg = getRoleConfig(u.role)
                return (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u)
                      setPin('')
                      setErrorMsg(null)
                    }}
                    className={`w-full flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 ${
                      isSelected
                        ? 'bg-white/15 border-emerald-400 shadow-lg shadow-black/20 scale-[1.02] ring-2 ring-emerald-400/30'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white text-base font-black flex-shrink-0 shadow-md`}
                    >
                      {getInitials(u.display_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-black text-white truncate leading-snug">
                        {u.display_name}
                      </p>
                      <p className="text-xs text-indigo-300 font-medium capitalize mt-0.5 truncate">
                        {cfg.label}
                      </p>
                    </div>
                    {isSelected ? (
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-400/40 flex-shrink-0">
                        <Check className="w-4 h-4" />
                      </div>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer Status Banner */}
          <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-indigo-200/80">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>TA500 Biometric Bridge Online</span>
            </span>
            <span className="font-mono text-[11px] text-indigo-400">v2.4 Protected</span>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Prominent PIN Keypad ── */}
        <div className="lg:col-span-6 p-6 sm:p-8 lg:p-10 flex flex-col justify-center items-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
          <div className="w-full max-w-[340px] sm:max-w-[360px]">
            {/* Active User Header Banner */}
            {selectedUser && selectedRole ? (
              <div className="flex flex-col items-center mb-5 text-center">
                <div
                  className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${selectedRole.gradient} flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-indigo-500/20 mb-2.5`}
                >
                  {getInitials(selectedUser.display_name)}
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                  {selectedUser.display_name}
                </h3>
                <span className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  {selectedRole.label}
                </span>
                <p className="text-xs text-slate-500 mt-2">
                  Enter your 6-digit security PIN to access the dashboard.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center mb-5 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-2.5">
                  <Lock className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-500">
                  Select an operator profile on the left
                </p>
              </div>
            )}

            {/* 6-Digit PIN Indicator Dots (Larger, prominent) */}
            <div className={`mb-6 ${shake ? 'animate-shake' : ''}`}>
              <div className="flex justify-center items-center gap-3.5">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const isFilled = pin.length > idx
                  return (
                    <div
                      key={idx}
                      className={`transition-all duration-200 ${
                        isFilled
                          ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full scale-110 shadow-md'
                          : 'w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-slate-200 border-2 border-slate-300'
                      }`}
                      style={
                        isFilled
                          ? {
                              background:
                                'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.45)',
                            }
                          : {}
                      }
                    />
                  )
                })}
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="mt-3 flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-1.5 rounded-xl font-bold justify-center animate-in fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Large, Touch-Friendly 3x4 Keypad Grid */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleNumClick(digit)}
                  disabled={loading}
                  className="h-14 sm:h-16 rounded-2xl bg-white border border-slate-200 text-2xl sm:text-3xl font-black text-slate-800 transition-all duration-150 hover:border-indigo-400 hover:bg-indigo-50/70 hover:text-indigo-700 active:scale-95 disabled:opacity-40 select-none shadow-xs flex items-center justify-center"
                >
                  {digit}
                </button>
              ))}

              {/* Clear Button */}
              <button
                type="button"
                onClick={handleClear}
                disabled={loading || pin.length === 0}
                className="h-14 sm:h-16 rounded-2xl bg-rose-50 border border-rose-200 text-xs sm:text-sm font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-100 transition-all active:scale-95 disabled:opacity-30 select-none flex items-center justify-center"
              >
                Clear
              </button>

              {/* 0 Button */}
              <button
                type="button"
                onClick={() => handleNumClick('0')}
                disabled={loading}
                className="h-14 sm:h-16 rounded-2xl bg-white border border-slate-200 text-2xl sm:text-3xl font-black text-slate-800 transition-all duration-150 hover:border-indigo-400 hover:bg-indigo-50/70 hover:text-indigo-700 active:scale-95 disabled:opacity-40 select-none shadow-xs flex items-center justify-center"
              >
                0
              </button>

              {/* Backspace Button */}
              <button
                type="button"
                onClick={handleBackspace}
                disabled={loading || pin.length === 0}
                className="h-14 sm:h-16 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 transition-all flex items-center justify-center active:scale-95 disabled:opacity-30 select-none"
                title="Backspace"
              >
                <Delete className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            {/* Loading Indicator */}
            {loading && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-indigo-600 animate-pulse">
                <svg
                  className="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8z"
                  />
                </svg>
                <span>Verifying Security PIN…</span>
              </div>
            )}

            {/* Keyboard Support Hint */}
            <div className="mt-5 pt-3 border-t border-slate-200/80 flex items-center justify-center gap-1.5 text-slate-500 text-[11px] font-medium">
              <Keyboard className="w-3.5 h-3.5 text-slate-400" />
              <span>You can also type directly using your physical keyboard numpad</span>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20%,
          60% {
            transform: translateX(-8px);
          }
          40%,
          80% {
            transform: translateX(8px);
          }
        }
        .animate-shake {
          animation: shake 0.35s ease-in-out;
        }
      `}</style>
    </div>
  )
}
