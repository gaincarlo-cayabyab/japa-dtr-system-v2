'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Fingerprint,
  Shield,
  Delete,
  Lock,
  AlertCircle,
  Building2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'

interface SystemUser {
  username: string
  display_name: string
  role: string
}

export default function LoginPage() {
  const router = useRouter()
  const [users, setUsers] = useState<SystemUser[]>([])
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null)
  const [pin, setPin] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [shake, setShake] = useState(false)

  // Load available users
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
          body: JSON.stringify({
            username: selectedUser.username,
            pin: pinToSubmit,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          setShake(true)
          setTimeout(() => setShake(false), 500)
          setErrorMsg(data.error || 'Incorrect PIN')
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

    if (newPin.length === 6) {
      submitLogin(newPin)
    }
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

  // Physical keyboard listener
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

  return (
    <div className="min-h-screen w-full bg-slate-100 flex items-center justify-center p-4 sm:p-8">
      {/* 2-Column Card Container */}
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200/80 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[580px]">
        {/* ── Left Column: Brand & Operator Selection (5 cols) ── */}
        <div className="md:col-span-5 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 p-6 sm:p-8 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col justify-between">
          <div>
            {/* Logo */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-blue-600 shadow-md shadow-blue-500/25">
                <Fingerprint className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">
                  JAPA DTR
                </h1>
                <p className="text-xs font-medium text-slate-400">Enterprise Portal</p>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Operator Sign-In
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Select your profile and enter your 6-digit PIN on the keypad to continue.
              </p>
            </div>

            {/* Operator Cards List */}
            <div className="space-y-2.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Select Profile
              </label>
              {users.map((u) => {
                const isSelected = selectedUser?.username === u.username
                return (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u)
                      setPin('')
                      setErrorMsg(null)
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20 ring-2 ring-blue-600/20'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-white/20 text-white border border-white/30'
                            : 'bg-slate-100 text-blue-700 border border-slate-200'
                        }`}
                      >
                        {u.display_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold truncate leading-snug ${
                            isSelected ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {u.display_name}
                        </p>
                        <span
                          className={`text-[11px] font-medium capitalize ${
                            isSelected ? 'text-blue-100' : 'text-slate-400'
                          }`}
                        >
                          {u.role.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Device status footer */}
          <div className="pt-6 border-t border-slate-200/60 mt-6 flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>FingerTec TA500 Active</span>
          </div>
        </div>

        {/* ── Right Column: 6-Digit PIN Pad (7 cols) ── */}
        <div className="md:col-span-7 p-6 sm:p-10 flex flex-col justify-center items-center bg-white">
          <div className="w-full max-w-sm">
            {/* Selected Operator greeting */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold mb-2">
                <Lock className="w-3.5 h-3.5 text-blue-600" />
                <span>Security Verification</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {selectedUser ? selectedUser.display_name : 'Select Profile'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Enter your 6-digit PIN to authenticate
              </p>
            </div>

            {/* 6-PIN Indicator Dots */}
            <div className={`mb-7 text-center ${shake ? 'animate-shake' : ''}`}>
              <div className="flex justify-center items-center gap-3.5">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const isFilled = pin.length > idx
                  return (
                    <div
                      key={idx}
                      className={`w-4 h-4 rounded-full transition-all duration-200 ${
                        isFilled
                          ? 'bg-blue-600 scale-125 shadow-md shadow-blue-500/40 ring-4 ring-blue-100'
                          : 'bg-slate-100 border border-slate-300'
                      }`}
                    />
                  )
                })}
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-1.5 rounded-xl animate-fadeIn font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Light Modern Keypad Grid (3x4) */}
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleNumClick(digit)}
                  disabled={loading}
                  className="h-14 rounded-2xl bg-white hover:bg-slate-50 active:bg-blue-50 border border-slate-200/90 text-2xl font-semibold text-slate-800 transition-all shadow-2xs hover:shadow-xs active:scale-95 flex items-center justify-center disabled:opacity-50 select-none"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                disabled={loading || pin.length === 0}
                className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 transition-all flex items-center justify-center disabled:opacity-40 select-none"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleNumClick('0')}
                disabled={loading}
                className="h-14 rounded-2xl bg-white hover:bg-slate-50 active:bg-blue-50 border border-slate-200/90 text-2xl font-semibold text-slate-800 transition-all shadow-2xs hover:shadow-xs active:scale-95 flex items-center justify-center disabled:opacity-50 select-none"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                disabled={loading || pin.length === 0}
                className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 transition-all flex items-center justify-center active:scale-95 disabled:opacity-40 select-none"
                title="Backspace"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Loading Indicator */}
            {loading && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-blue-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Verifying PIN…
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.35s ease-in-out;
        }
      `}</style>
    </div>
  )
}
