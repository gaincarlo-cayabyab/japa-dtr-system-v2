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

const ROLE_CONFIG: Record<string, { label: string; gradient: string; ring: string }> = {
  admin: { label: 'Administrator', gradient: 'from-violet-500 to-purple-600', ring: 'ring-violet-200' },
  manager: { label: 'Manager', gradient: 'from-blue-500 to-indigo-600', ring: 'ring-blue-200' },
  it_admin: { label: 'IT Admin', gradient: 'from-emerald-500 to-teal-600', ring: 'ring-emerald-200' },
  viewer: { label: 'Viewer', gradient: 'from-orange-400 to-amber-500', ring: 'ring-orange-200' },
}

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role] ?? { label: role.replace('_', ' '), gradient: 'from-slate-400 to-slate-600', ring: 'ring-slate-200' }
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
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #fda085 100%)' }}>
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-pink-300/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.75s' }} />
        {/* Dot grid */}
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      </div>

      {/* Main card */}
      <div className="relative z-10 w-full max-w-5xl mx-4 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2 min-h-[600px]" style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.25)' }}>

        {/* ── LEFT COLUMN: Branding + User Selection ── */}
        <div className="relative flex flex-col p-8 md:p-10 overflow-hidden" style={{ background: 'linear-gradient(145deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)' }}>
          {/* Decorative circles */}
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/5 rounded-full" />
          <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-white/5 rounded-full" />
          <div className="absolute top-1/3 right-0 w-24 h-24 bg-indigo-400/10 rounded-full" />

          {/* Logo */}
          <div className="relative z-10 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/40">
                  <Fingerprint className="w-6 h-6 text-white" />
                </div>
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-indigo-900 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white tracking-tight">JAPA DTR</h1>
                <p className="text-xs font-medium text-indigo-300">Enterprise Portal</p>
              </div>
            </div>

            <div className="mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-indigo-200 text-xs font-semibold border border-white/10 mb-3">
                <Sparkles className="w-3 h-3" />
                Secure Access System
              </span>
              <h2 className="text-2xl font-black text-white leading-tight">Welcome back,<br /><span className="text-indigo-200">Operator</span></h2>
              <p className="text-sm text-indigo-300/80 mt-2">Select your profile and enter your 6-digit PIN to continue.</p>
            </div>
          </div>

          {/* User Selection */}
          <div className="relative z-10 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-300/70 mb-3">Select Profile</p>
            {loadingUsers ? (
              <div className="space-y-2">
                {[1,2,3].map(i => (
                  <div key={i} className="h-14 rounded-2xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => {
                  const isSelected = selectedUser?.username === u.username
                  const cfg = getRoleConfig(u.role)
                  return (
                    <button
                      key={u.username}
                      type="button"
                      onClick={() => { setSelectedUser(u); setPin(''); setErrorMsg(null) }}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all duration-200 ${
                        isSelected
                          ? 'bg-white/15 border-white/30 shadow-lg shadow-black/10 scale-[1.01]'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-md`}>
                        {getInitials(u.display_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{u.display_name}</p>
                        <p className="text-xs text-indigo-300/80 font-medium capitalize">{cfg.label}</p>
                      </div>
                      {isSelected && (
                        <div className="flex-shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        </div>
                      )}
                      {!isSelected && (
                        <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="relative z-10 pt-6 mt-4 border-t border-white/10 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-indigo-300/80 font-medium">FingerTec TA500 — Online & Active</span>
          </div>
        </div>

        {/* ── RIGHT COLUMN: PIN Pad ── */}
        <div className="flex flex-col justify-center items-center p-8 md:p-12 bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
          <div className="w-full max-w-xs">

            {/* Selected user display */}
            {selectedUser && selectedRole ? (
              <div className="flex flex-col items-center mb-8">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${selectedRole.gradient} flex items-center justify-center text-white text-xl font-black shadow-lg mb-3`}>
                  {getInitials(selectedUser.display_name)}
                </div>
                <h3 className="text-lg font-black text-slate-900 text-center leading-tight">{selectedUser.display_name}</h3>
                <span className={`mt-1.5 inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r ${selectedRole.gradient} text-white shadow-sm`}>
                  <Lock className="w-3 h-3" />
                  {selectedRole.label}
                </span>
                <p className="text-xs text-slate-400 mt-2">Enter your 6-digit PIN to authenticate</p>
              </div>
            ) : (
              <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <Lock className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-sm text-slate-400">Select a profile from the left</p>
              </div>
            )}

            {/* PIN Dots */}
            <div className={`mb-6 ${shake ? 'animate-shake' : ''}`}>
              <div className="flex justify-center items-center gap-3">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const isFilled = pin.length > idx
                  return (
                    <div
                      key={idx}
                      className={`transition-all duration-200 ${
                        isFilled
                          ? 'w-4 h-4 rounded-full scale-110 shadow-md'
                          : 'w-3.5 h-3.5 rounded-full bg-slate-200 border-2 border-slate-300'
                      }`}
                      style={isFilled ? {
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        boxShadow: '0 4px 12px rgba(102,126,234,0.5)',
                      } : {}}
                    />
                  )
                })}
              </div>

              {/* Error */}
              {errorMsg && (
                <div className="mt-4 flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl animate-fadeIn font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Number Keypad */}
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleNumClick(digit)}
                  disabled={loading}
                  className="h-14 rounded-2xl bg-white border border-slate-200 text-xl font-bold text-slate-800 transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 active:shadow-inner disabled:opacity-50 select-none shadow-sm"
                  style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}
                >
                  {digit}
                </button>
              ))}

              {/* Clear */}
              <button
                type="button"
                onClick={handleClear}
                disabled={loading || pin.length === 0}
                className="h-14 rounded-2xl bg-rose-50 border border-rose-100 text-xs font-bold uppercase tracking-wider text-rose-500 hover:bg-rose-100 hover:text-rose-700 transition-all disabled:opacity-30 select-none"
              >
                Clear
              </button>

              {/* 0 */}
              <button
                type="button"
                onClick={() => handleNumClick('0')}
                disabled={loading}
                className="h-14 rounded-2xl bg-white border border-slate-200 text-xl font-bold text-slate-800 transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 active:shadow-inner disabled:opacity-50 select-none shadow-sm"
                style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}
              >
                0
              </button>

              {/* Backspace */}
              <button
                type="button"
                onClick={handleBackspace}
                disabled={loading || pin.length === 0}
                className="h-14 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-all flex items-center justify-center active:scale-95 disabled:opacity-30 select-none"
                title="Backspace"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Loading */}
            {loading && (
              <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-indigo-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Verifying PIN…
              </div>
            )}

            <p className="text-center text-xs text-slate-400 mt-6">
              🔒 Secured by JAPA Enterprise Portal
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  )
}
