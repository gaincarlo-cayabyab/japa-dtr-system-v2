'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Fingerprint, Shield, Delete, CheckCircle2, AlertCircle, User, Lock } from 'lucide-react'

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
          // Default to IT Administrator or first user
          const defaultUser = data.users.find((u: SystemUser) => u.username === 'admin') || data.users[0]
          setSelectedUser(defaultUser)
        }
      } catch (err) {
        console.error('Failed to load users:', err)
      }
    }
    loadUsers()
  }, [])

  const submitLogin = useCallback(async (pinToSubmit: string) => {
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

      // Success -> Redirect to dashboard
      router.push('/')
      router.refresh()
    } catch {
      setErrorMsg('Network error. Please try again.')
      setPin('')
    } finally {
      setLoading(false)
    }
  }, [selectedUser, router])

  // Keypad press handler
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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xl shadow-blue-500/20 mb-3 border border-blue-400/30">
            <Fingerprint className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">JAPA DTR Enterprise</h1>
          <p className="text-sm text-slate-400 mt-1">Biometric Attendance & Security Portal</p>
        </div>

        {/* Main Box */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50">
          {/* User Selection */}
          <div className="mb-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Select Operator
            </label>
            <div className="grid grid-cols-2 gap-2">
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
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl text-left border transition-all ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-600/10'
                        : 'bg-slate-900/50 border-slate-700/60 text-slate-300 hover:bg-slate-700/40'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {u.display_name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate leading-tight">{u.display_name}</p>
                      <span className="text-[10px] text-slate-400 capitalize">{u.role.replace('_', ' ')}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 6-PIN Indicator */}
          <div className={`mb-6 text-center ${shake ? 'animate-shake' : ''}`}>
            <p className="text-xs text-slate-400 mb-3 flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              Enter 6-Digit PIN for <span className="text-white font-medium">{selectedUser?.display_name}</span>
            </p>
            <div className="flex justify-center items-center gap-3">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const isFilled = pin.length > idx
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full transition-all duration-200 ${
                      isFilled
                        ? 'bg-blue-500 scale-125 shadow-lg shadow-blue-500/50 ring-2 ring-blue-400/40'
                        : 'bg-slate-700/80 border border-slate-600'
                    }`}
                  />
                )
              })}
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg animate-fadeIn">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {errorMsg}
              </div>
            )}
          </div>

          {/* Virtual PIN Pad (0-9) */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleNumClick(digit)}
                disabled={loading}
                className="h-14 rounded-2xl bg-slate-700/40 hover:bg-slate-700/80 active:bg-blue-600/30 border border-slate-600/40 text-xl font-bold text-white transition-all shadow-sm active:scale-95 flex items-center justify-center disabled:opacity-50"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              disabled={loading || pin.length === 0}
              className="h-14 rounded-2xl bg-slate-900/40 hover:bg-slate-800 border border-slate-700/50 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center disabled:opacity-30"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleNumClick('0')}
              disabled={loading}
              className="h-14 rounded-2xl bg-slate-700/40 hover:bg-slate-700/80 active:bg-blue-600/30 border border-slate-600/40 text-xl font-bold text-white transition-all shadow-sm active:scale-95 flex items-center justify-center disabled:opacity-50"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              disabled={loading || pin.length === 0}
              className="h-14 rounded-2xl bg-slate-900/40 hover:bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center active:scale-95 disabled:opacity-30"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-blue-400">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Verifying PIN &amp; opening session…
            </div>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Authorized personnel only • FingerTec TA500 Connected
        </p>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  )
}
