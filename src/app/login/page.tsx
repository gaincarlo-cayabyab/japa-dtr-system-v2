'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
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
  Volume2,
  VolumeX,
  Code2,
  Building2,
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

// ── Web Audio Synthesizer for Keypad Audio Feedback ──────────────────────────
function playKeySound(type: 'tap' | 'backspace' | 'clear' | 'success' | 'error', soundEnabled: boolean) {
  if (!soundEnabled) return
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()

    if (type === 'tap') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(950, ctx.currentTime)
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.05)
    } else if (type === 'backspace') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(420, ctx.currentTime)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.06)
    } else if (type === 'clear') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(320, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.09)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.09)
    } else if (type === 'error') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(180, ctx.currentTime)
      gain.gain.setValueAtTime(0.16, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.25)
    } else if (type === 'success') {
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, ctx.currentTime)
      gain1.gain.setValueAtTime(0.18, ctx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start()
      osc1.stop(ctx.currentTime + 0.1)

      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator()
          const gain2 = ctx.createGain()
          osc2.type = 'sine'
          osc2.frequency.setValueAtTime(1320, ctx.currentTime)
          gain2.gain.setValueAtTime(0.2, ctx.currentTime)
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
          osc2.connect(gain2)
          gain2.connect(ctx.destination)
          osc2.start()
          osc2.stop(ctx.currentTime + 0.18)
        } catch {}
      }, 100)
    }
  } catch {
    // Ignore audio permission errors
  }
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
  const [soundEnabled, setSoundEnabled] = useState(true)

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
          playKeySound('error', soundEnabled)
          setShake(true)
          setTimeout(() => setShake(false), 500)
          setErrorMsg(data.error || 'Incorrect PIN. Please try again.')
          setPin('')
          return
        }
        playKeySound('success', soundEnabled)
        router.push('/')
        router.refresh()
      } catch {
        playKeySound('error', soundEnabled)
        setErrorMsg('Network error. Please try again.')
        setPin('')
      } finally {
        setLoading(false)
      }
    },
    [selectedUser, router, soundEnabled]
  )

  const handleNumClick = (digit: string) => {
    if (loading || pin.length >= 6) return
    playKeySound('tap', soundEnabled)
    setErrorMsg(null)
    const newPin = pin + digit
    setPin(newPin)
    if (newPin.length === 6) submitLogin(newPin)
  }

  const handleBackspace = () => {
    if (loading) return
    playKeySound('backspace', soundEnabled)
    setErrorMsg(null)
    setPin((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    if (loading) return
    playKeySound('clear', soundEnabled)
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
      className="min-h-screen w-full flex items-center justify-center p-3 sm:p-5 lg:p-8 select-none relative"
      style={{
        background:
          'radial-gradient(ellipse at top left, #1e1b4b 0%, #0f172a 45%, #020617 100%)',
      }}
    >
      {/* Subtle Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1.5s' }}
        />
      </div>

      {/* ── Main 2-Column Responsive Card Container ────────────────────────── */}
      <div
        className="relative z-10 w-full max-w-7xl bg-white rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-slate-700/30"
        style={{
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          minHeight: '740px',
        }}
      >
        {/* ── LEFT COLUMN: JAPA Print Studio 3D Interactive Animation ──────── */}
        <div className="lg:col-span-7 xl:col-span-7 bg-[#0b0e14] relative flex flex-col justify-between overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800/80">
          {/* Top Brand Bar */}
          <div className="p-4 sm:p-5 flex items-center justify-between border-b border-white/10 bg-black/40 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-white/20 shadow-md bg-white flex-shrink-0">
                <Image
                  src="/japa-logo.jpg"
                  alt="JAPA Logo"
                  fill
                  className="object-contain p-0.5"
                  priority
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black text-white tracking-tight">JAPA</span>
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest bg-amber-400/10 px-1.5 py-0.2 rounded border border-amber-400/30">
                    GLOBAL TRADING
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">The Craft of Print · 3D Studio</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-bold border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>TA500 Online</span>
              </span>
            </div>
          </div>

          {/* 3D WebGL Three.js Interactive Animation Embed */}
          <div className="flex-1 w-full min-h-[440px] sm:min-h-[520px] lg:min-h-[620px] relative bg-[#0b0e14]">
            <iframe
              src="/print-animation/index.html?embed=1"
              title="JAPA Global Trading printing and apparel 3D animation"
              className="w-full h-full border-0 block absolute inset-0"
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
              }}
            />
          </div>

          {/* Bottom Technical Strip */}
          <div className="px-5 py-3 border-t border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between text-xs text-slate-400 z-10">
            <span className="text-[11px]">Sublimation · Commercial Apparel · DTG · Roll Services</span>
            <span className="font-mono text-[10px] text-slate-500">v2.5 Terminal</span>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Operator Profile Selection & PIN Keypad ────────── */}
        <div className="lg:col-span-5 xl:col-span-5 p-6 sm:p-8 flex flex-col justify-between bg-gradient-to-br from-slate-50 via-white to-indigo-50/25">
          {/* Top Bar with Sound Toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                <Fingerprint className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-black text-slate-900 tracking-tight">Security Access</h2>
            </div>

            {/* Audio Feedback Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
                soundEnabled
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                  : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
              }`}
              title={soundEnabled ? 'Keypad sound enabled (Click to mute)' : 'Keypad sound muted (Click to enable)'}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Sound ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                  <span>Sound OFF</span>
                </>
              )}
            </button>
          </div>

          {/* Profile Selector (Dropdown / Pills) */}
          <div className="mb-4">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Select Operator Profile
            </label>
            <div className="grid grid-cols-2 gap-2">
              {loadingUsers ? (
                <>
                  <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
                  <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
                </>
              ) : (
                users.slice(0, 4).map((u) => {
                  const isSelected = selectedUser?.username === u.username
                  const cfg = getRoleConfig(u.role)
                  return (
                    <button
                      key={u.username}
                      type="button"
                      onClick={() => {
                        playKeySound('tap', soundEnabled)
                        setSelectedUser(u)
                        setPin('')
                        setErrorMsg(null)
                      }}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-400 shadow-xs ring-2 ring-indigo-400/20'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-2xs`}
                      >
                        {getInitials(u.display_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                          {u.display_name.split(' ')[0]}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">{u.role.replace('_', ' ')}</p>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Active Profile Header */}
          {selectedUser && selectedRole && (
            <div className="flex flex-col items-center mb-3 text-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <ShieldCheck className="w-3 h-3 text-indigo-600" />
                {selectedRole.label}
              </span>
            </div>
          )}

          {/* 6-Digit PIN Indicator Dots */}
          <div className={`mb-4 ${shake ? 'animate-shake' : ''}`}>
            <div className="flex justify-center items-center gap-3">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const isFilled = pin.length > idx
                return (
                  <div
                    key={idx}
                    className={`transition-all duration-200 ${
                      isFilled
                        ? 'w-4 h-4 sm:w-5 sm:h-5 rounded-full scale-110 shadow-sm'
                        : 'w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-slate-200 border-2 border-slate-300'
                    }`}
                    style={
                      isFilled
                        ? {
                            background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                            boxShadow: '0 3px 8px rgba(37, 99, 235, 0.4)',
                          }
                        : {}
                    }
                  />
                )
              })}
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-xl font-bold justify-center animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* 3x4 Keypad Grid */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 max-w-[300px] mx-auto w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleNumClick(digit)}
                disabled={loading}
                className="h-12 sm:h-13 rounded-2xl bg-white border border-slate-200/90 text-2xl font-black text-slate-800 transition-all hover:border-indigo-400 hover:bg-indigo-50/70 hover:text-indigo-700 active:scale-95 disabled:opacity-40 select-none shadow-xs flex items-center justify-center"
              >
                {digit}
              </button>
            ))}

            {/* Clear Button */}
            <button
              type="button"
              onClick={handleClear}
              disabled={loading || pin.length === 0}
              className="h-12 sm:h-13 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-100 transition-all active:scale-95 disabled:opacity-30 select-none flex items-center justify-center"
            >
              Clear
            </button>

            {/* 0 Button */}
            <button
              type="button"
              onClick={() => handleNumClick('0')}
              disabled={loading}
              className="h-12 sm:h-13 rounded-2xl bg-white border border-slate-200/90 text-2xl font-black text-slate-800 transition-all hover:border-indigo-400 hover:bg-indigo-50/70 hover:text-indigo-700 active:scale-95 disabled:opacity-40 select-none shadow-xs flex items-center justify-center"
            >
              0
            </button>

            {/* Backspace Button */}
            <button
              type="button"
              onClick={handleBackspace}
              disabled={loading || pin.length === 0}
              className="h-12 sm:h-13 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 transition-all flex items-center justify-center active:scale-95 disabled:opacity-30 select-none"
              title="Backspace"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-indigo-600 animate-pulse">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span>Verifying Security PIN…</span>
            </div>
          )}

          {/* Keyboard hint & Creator Credit */}
          <div className="mt-4 pt-3 border-t border-slate-200/80 flex flex-col items-center gap-1.5 text-center">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
              <Keyboard className="w-3.5 h-3.5" />
              <span>Type PIN with keypad or physical keyboard</span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold">
              Engineered by <span className="text-slate-700 font-bold">Gain Carlo Cayabyab</span> · IT Administrator
            </p>
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
