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
} from 'lucide-react'

interface SystemUser {
  username: string
  display_name: string
  role: string
}

const ROLE_CONFIG: Record<string, { label: string; gradient: string }> = {
  admin: { label: 'Administrator', gradient: 'from-violet-500 to-purple-600' },
  manager: { label: 'Manager', gradient: 'from-blue-500 to-indigo-600' },
  super_admin: { label: 'IT Administrator', gradient: 'from-emerald-500 to-teal-600' },
  viewer: { label: 'Viewer', gradient: 'from-orange-400 to-amber-500' },
}

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role] ?? { label: role.replace('_', ' '), gradient: 'from-slate-500 to-slate-700' }
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
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
      if (e.key >= '0' && e.key <= '9') handleNumClick(e.key)
      else if (e.key === 'Backspace') handleBackspace()
      else if (e.key === 'Escape') handleClear()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNumClick])

  const selectedRole = selectedUser ? getRoleConfig(selectedUser.role) : null

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex items-center justify-center p-3 sm:p-5 relative select-none" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 30%, #f093fb 70%, #f5576c 100%)' }}>
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
      </div>

      {/* Main card - strictly contained without overflow */}
      <div className="relative z-10 w-full max-w-4xl h-full max-h-[580px] bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>

        {/* ── LEFT COLUMN: Profile Selection ── */}
        <div className="relative flex flex-col justify-between p-5 sm:p-6 overflow-hidden" style={{ background: 'linear-gradient(145deg, #1e1b4b 0%, #312e81 45%, #4338ca 100%)' }}>
          {/* Subtle circles */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-white/5 rounded-full" />
          <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-white/5 rounded-full" />

          {/* Top Branding */}
          <div className="relative z-10">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-md shadow-indigo-500/40 flex-shrink-0">
                <Fingerprint className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-black text-white tracking-tight leading-tight">JAPA DTR</h1>
                <p className="text-[11px] font-medium text-indigo-300 leading-tight">Enterprise Portal</p>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 text-indigo-200 text-[10px] font-semibold">
                <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                Light Modern
              </span>
            </div>

            <div>
              <h2 className="text-lg font-black text-white leading-snug">Operator Sign-In</h2>
              <p className="text-xs text-indigo-300/80 mt-0.5">Choose your profile to enter your 6-digit PIN.</p>
            </div>
          </div>

          {/* User Selection List */}
          <div className="relative z-10 my-2 space-y-1.5 flex-1 flex flex-col justify-center">
            {loadingUsers ? (
              <div className="space-y-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-11 rounded-xl bg-white/5 animate-pulse" />
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
                    onClick={() => { setSelectedUser(u); setPin(''); setErrorMsg(null) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all duration-150 ${
                      isSelected
                        ? 'bg-white/15 border-white/30 shadow-md shadow-black/10 scale-[1.01]'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-xs`}>
                      {getInitials(u.display_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate leading-tight">{u.display_name}</p>
                      <p className="text-[10px] text-indigo-300/80 font-medium capitalize leading-tight">{cfg.label}</p>
                    </div>
                    {isSelected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer status */}
          <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-indigo-300/80">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              TA500 Online
            </span>
            <span className="text-[10px] text-indigo-400">v2.4 Protected</span>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Compact PIN Keypad ── */}
        <div className="flex flex-col justify-center items-center p-5 sm:p-6 bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
          <div className="w-full max-w-[280px]">

            {/* Selected User Header */}
            {selectedUser && selectedRole ? (
              <div className="flex flex-col items-center mb-4">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${selectedRole.gradient} flex items-center justify-center text-white text-base font-black shadow-md mb-1.5`}>
                  {getInitials(selectedUser.display_name)}
                </div>
                <h3 className="text-sm font-black text-slate-900 leading-tight text-center">{selectedUser.display_name}</h3>
                <span className="mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  <Lock className="w-2.5 h-2.5 text-indigo-600" />
                  {selectedRole.label}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center mb-4">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center mb-1.5">
                  <Lock className="w-5 h-5 text-slate-300" />
                </div>
                <p className="text-xs text-slate-400 font-medium">Select a profile to begin</p>
              </div>
            )}

            {/* 6-Digit PIN Indicator Dots */}
            <div className={`mb-4 ${shake ? 'animate-shake' : ''}`}>
              <div className="flex justify-center items-center gap-2.5">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const isFilled = pin.length > idx
                  return (
                    <div
                      key={idx}
                      className={`transition-all duration-150 ${
                        isFilled
                          ? 'w-3.5 h-3.5 rounded-full scale-110 shadow-sm'
                          : 'w-3 h-3 rounded-full bg-slate-200 border border-slate-300'
                      }`}
                      style={isFilled ? {
                        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                        boxShadow: '0 2px 8px rgba(79,70,229,0.5)',
                      } : {}}
                    />
                  )
                })}
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-xl font-semibold justify-center">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-600" />
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Compact 3x4 Keypad Grid */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleNumClick(digit)}
                  disabled={loading}
                  className="h-11 rounded-xl bg-white border border-slate-200 text-lg font-black text-slate-800 transition-all duration-100 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 active:scale-95 disabled:opacity-40 select-none shadow-2xs"
                >
                  {digit}
                </button>
              ))}

              {/* Clear */}
              <button
                type="button"
                onClick={handleClear}
                disabled={loading || pin.length === 0}
                className="h-11 rounded-xl bg-rose-50 border border-rose-100 text-[11px] font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-100 transition-all disabled:opacity-30 select-none"
              >
                Clear
              </button>

              {/* 0 */}
              <button
                type="button"
                onClick={() => handleNumClick('0')}
                disabled={loading}
                className="h-11 rounded-xl bg-white border border-slate-200 text-lg font-black text-slate-800 transition-all duration-100 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 active:scale-95 disabled:opacity-40 select-none shadow-2xs"
              >
                0
              </button>

              {/* Backspace */}
              <button
                type="button"
                onClick={handleBackspace}
                disabled={loading || pin.length === 0}
                className="h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-all flex items-center justify-center active:scale-95 disabled:opacity-30 select-none"
                title="Backspace"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            {/* Loading Indicator */}
            {loading && (
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-600">
                <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Verifying PIN…
              </div>
            )}

            <p className="text-center text-[10px] text-slate-400 mt-3 font-medium">
              🔒 JAPA Biometrics Security Standard
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.35s ease-in-out; }
      `}</style>
    </div>
  )
}
