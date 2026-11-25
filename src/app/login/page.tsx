'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  Briefcase,
  Users,
  Building2,
  ChevronRight,
  ChevronLeft,
  Volume2,
  VolumeX,
  Delete,
  Lock,
  AlertCircle,
} from 'lucide-react'

interface RoleOption {
  id: string
  title: string
  badge: string
  badgeColor: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  desc: string
  username: string
}

const ROLES: RoleOption[] = [
  {
    id: 'admin',
    title: 'IT Administrator',
    badge: 'Super Admin',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: ShieldCheck,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    desc: 'Full workspace governance, hardware bridge, permissions & all logs',
    username: 'admin',
  },
  {
    id: 'japa_dee',
    title: 'JAPA Dee',
    badge: 'CEO / Executive',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Briefcase,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    desc: 'Executive business oversight, attendance review & performance reports',
    username: 'japa_dee',
  },
  {
    id: 'japa_manager',
    title: 'JAPA Manager',
    badge: 'General Manager',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: Building2,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    desc: 'Store operations, employee shifts, DTR compliance & schedules',
    username: 'japa_manager',
  },
  {
    id: 'japa_pearly',
    title: 'JAPA Pearly',
    badge: 'Office Staff',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Users,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    desc: 'Office administration, biometric punch logs & workforce records',
    username: 'japa_pearly',
  },
]

// Singleton AudioContext avoids allocating/leaking audio threads on every keypress (zero input lag)
let sharedAudioCtx: AudioContext | null = null

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!sharedAudioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return null
      sharedAudioCtx = new AudioContextClass()
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume()
    }
    return sharedAudioCtx
  } catch {
    return null
  }
}

function playKeySound(type: 'tap' | 'backspace' | 'clear' | 'success' | 'error', soundEnabled: boolean) {
  if (!soundEnabled) return
  const ctx = getSharedAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    if (type === 'tap') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(950, now)
      gain.gain.setValueAtTime(0.14, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.05)
    } else if (type === 'backspace') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(420, now)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.06)
    } else if (type === 'clear') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(320, now)
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.09)
    } else if (type === 'error') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(180, now)
      gain.gain.setValueAtTime(0.14, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.24)
    } else if (type === 'success') {
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, now)
      gain1.gain.setValueAtTime(0.15, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.1)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(1320, now + 0.095)
      gain2.gain.setValueAtTime(0.16, now + 0.095)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.095)
      osc2.stop(now + 0.27)
    }
  } catch {
    // Ignore audio errors
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedRole, setSelectedRole] = useState<RoleOption>(ROLES[0])
  const [pin, setPin] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Refs avoid re-attaching window keydown listeners on every keystroke
  const pinRef = useRef(pin)
  const loadingRef = useRef(loading)
  const soundRef = useRef(soundEnabled)
  const pinSectionRef = useRef<HTMLDivElement>(null)
  pinRef.current = pin
  loadingRef.current = loading
  soundRef.current = soundEnabled

  const submitLogin = useCallback(
    async (pinToSubmit: string) => {
      setLoading(true)
      loadingRef.current = true
      setErrorMsg(null)
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: selectedRole.username, pin: pinToSubmit }),
        })
        const data = await res.json()
        if (!res.ok) {
          playKeySound('error', soundRef.current)
          setShake(true)
          setTimeout(() => setShake(false), 400)
          setErrorMsg(data.error || 'Incorrect PIN. Please try again.')
          pinRef.current = ''
          setPin('')
          return
        }
        playKeySound('success', soundRef.current)
        router.push('/')
        router.refresh()
      } catch {
        playKeySound('error', soundRef.current)
        setErrorMsg('Network error. Please try again.')
        pinRef.current = ''
        setPin('')
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [selectedRole.username, router]
  )

  const handleNumClick = useCallback(
    (digit: string) => {
      if (loadingRef.current || pinRef.current.length >= 6) return
      const nextPin = pinRef.current + digit
      pinRef.current = nextPin
      setPin(nextPin)
      setErrorMsg(null)
      playKeySound('tap', soundRef.current)
      if (nextPin.length === 6) {
        void submitLogin(nextPin)
      }
    },
    [submitLogin]
  )

  const handleBackspace = useCallback(() => {
    if (loadingRef.current || pinRef.current.length === 0) return
    const nextPin = pinRef.current.slice(0, -1)
    pinRef.current = nextPin
    setPin(nextPin)
    setErrorMsg(null)
    playKeySound('backspace', soundRef.current)
  }, [])

  const handleClear = useCallback(() => {
    if (loadingRef.current || pinRef.current.length === 0) return
    pinRef.current = ''
    setPin('')
    setErrorMsg(null)
    playKeySound('clear', soundRef.current)
  }, [])

  useEffect(() => {
    if (step !== 2) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        handleNumClick(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handleBackspace()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleClear()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [step, handleNumClick, handleBackspace, handleClear])

  const handleSelectRole = (role: RoleOption) => {
    getSharedAudioContext()
    playKeySound('tap', soundEnabled)
    setSelectedRole(role)
    pinRef.current = ''
    setPin('')
    setErrorMsg(null)
    setStep(2)
    requestAnimationFrame(() => pinSectionRef.current?.focus())
  }

  const RoleIcon = selectedRole.icon

  return (
    <div className="min-h-screen lg:h-screen w-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden bg-slate-100 select-none">
      {/* ── LEFT HALF: JAPA 3D Print Studio Showcase ───────── */}
      <div className="w-full lg:w-[48%] h-[520px] lg:h-full relative overflow-hidden bg-gradient-to-b from-white to-[#f1f3f8] flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200/80">
        {/* Top-Left Brand Pill (Positioned cleanly above shifted .studio-intro) */}
        <div className="absolute top-4 left-4 sm:top-5 sm:left-6 z-20 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white shadow-sm border border-slate-200/90">
          <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0 bg-white">
            <Image
              src="/japa-logo.jpg"
              alt="JAPA Logo"
              fill
              className="object-contain p-0.5"
              priority
            />
          </div>
          <div>
            <p className="text-xs font-black text-slate-900 tracking-tight leading-none">JAPA Global</p>
            <p className="text-[10px] font-semibold text-slate-600 leading-none mt-1">
              Enterprise Operations Workspace
            </p>
          </div>
        </div>

        {/* 3D WebGL Three.js Print Studio Canvas */}
        <div className="w-full h-full relative bg-transparent">
          <iframe
            src="/print-animation/index.html?embed=1"
            title="JAPA Global Trading printing and apparel 3D animation"
            className="w-full h-full border-0 block absolute inset-0"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>

        {/* Bottom-Left Pill */}
        <div className="absolute bottom-3.5 left-5 z-20 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 shadow-xs border border-slate-200/80 text-[11px] font-semibold text-slate-700">
          <span>© 2026 JAPA Global Trading</span>
        </div>

        {/* Bottom-Right Pill */}
        <div className="absolute bottom-3.5 right-5 z-20 hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 shadow-xs border border-emerald-200 text-[11px] font-bold text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Dagupan &amp; Manila Nodes</span>
        </div>
      </div>

      {/* ── RIGHT HALF: Balanced Spacious Auth Container (Fits 100vh cleanly, Zero Lag) ── */}
      <div
        className="w-full lg:w-[52%] lg:h-full flex flex-col items-center p-4 sm:p-5 relative overflow-y-auto"
        style={{
          background:
            'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 28%, #f5f3ff 56%, #fdf2f8 82%, #ecfeff 100%)',
        }}
      >
        {/* Static Soft Ambient Layer (No costly continuous pulse/backdrop repaint during typing) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-16 w-96 h-96 bg-gradient-to-br from-sky-300/35 via-cyan-200/25 to-blue-300/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-gradient-to-tr from-purple-300/35 via-indigo-200/25 to-pink-200/20 rounded-full blur-3xl" />
          <div
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                'radial-gradient(rgba(99, 102, 241, 0.25) 1.25px, transparent 1.25px)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        <div className="w-full flex flex-col items-center my-auto relative z-10">
          {/* ── Balanced Enlarged Auth Card (Fits compact laptop viewports without clipping) ─ */}
          <div className="w-full max-w-[540px] bg-white rounded-3xl px-5 py-4 sm:px-6 sm:py-5 shadow-2xl shadow-indigo-500/10 border border-slate-200/90">
            {/* Card Top Brand Row */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-slate-200/90 shadow-xs flex-shrink-0 bg-white">
                  <Image
                    src="/japa-logo.jpg"
                    alt="JAPA Logo"
                    fill
                    className="object-contain p-0.5"
                    priority
                  />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight">JAPA Global</h2>
                  <p className="text-[11px] font-semibold text-slate-500">Enterprise Operations</p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>DAG &amp; MNL</span>
              </span>
            </div>

            {/* ── STEP 1: Select Role View (Bigger & Readable, Fits Cleanly) ─ */}
            {step === 1 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
                      Select Role
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Choose your authorized profile to sign in
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                    Step 1 of 2
                  </span>
                </div>

                <div className="space-y-2.5 pt-0.5">
                  {ROLES.map((role) => {
                    const Icon = role.icon
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => handleSelectRole(role)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-slate-200/80 bg-white hover:bg-indigo-50/40 hover:border-indigo-400 hover:shadow-sm transition-colors duration-100 text-left group active:scale-[0.99] touch-manipulation"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 pr-2">
                          <div
                            className={`w-11 h-11 rounded-xl ${role.iconBg} ${role.iconColor} flex items-center justify-center flex-shrink-0 shadow-xs`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm sm:text-base font-extrabold text-slate-900 group-hover:text-indigo-700">
                                {role.title}
                              </span>
                              <span
                                className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full border ${role.badgeColor}`}
                              >
                                {role.badge}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                              {role.desc}
                            </p>
                          </div>
                        </div>

                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── STEP 2: Balanced Enlarged 6-Digit PIN Entry (Zero-Lag) ─ */}
            {step === 2 && (
              <div ref={pinSectionRef} tabIndex={-1} className="space-y-3 outline-none">
                {/* Navigation Row */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      playKeySound('tap', soundEnabled)
                      setStep(1)
                      pinRef.current = ''
                      setPin('')
                      setErrorMsg(null)
                    }}
                    className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-slate-700 hover:text-indigo-700 py-1 px-2 -ml-2 rounded-lg hover:bg-slate-100"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Change Role</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSoundEnabled((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                        soundEnabled
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {soundEnabled ? (
                        <>
                          <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Sound ON</span>
                        </>
                      ) : (
                        <>
                          <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                          <span>Muted</span>
                        </>
                      )}
                    </button>
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                      Step 2 of 2
                    </span>
                  </div>
                </div>

                {/* Selected Role Banner */}
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl ${selectedRole.iconBg} ${selectedRole.iconColor} flex items-center justify-center flex-shrink-0 shadow-xs`}
                    >
                      <RoleIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                        {selectedRole.title}
                      </p>
                      <p className="text-xs text-slate-500 font-medium">
                        Enter 6-digit Security PIN (keyboard or tap below)
                      </p>
                    </div>
                  </div>
                  <span
                    className={`hidden sm:inline-flex text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${selectedRole.badgeColor}`}
                  >
                    {selectedRole.badge}
                  </span>
                </div>

                {/* Crisp 6-Digit Visual PIN Slots (Balanced Size) */}
                <div className={`py-0.5 ${shake ? 'animate-shake' : ''}`}>
                  <div className="grid grid-cols-6 gap-2.5 max-w-[360px] mx-auto">
                    {[0, 1, 2, 3, 4, 5].map((idx) => {
                      const isFilled = pin.length > idx
                      const isActive = pin.length === idx && !loading
                      return (
                        <div
                          key={idx}
                          className={`h-12 rounded-xl border-2 flex items-center justify-center ${
                            isFilled
                              ? 'bg-indigo-50/70 border-indigo-500 shadow-xs'
                              : isActive
                                ? 'bg-white border-blue-500 ring-2 ring-blue-100'
                                : 'bg-slate-50 border-slate-300'
                          }`}
                        >
                          {isFilled ? (
                            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 shadow-xs" />
                          ) : isActive ? (
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {errorMsg && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-xs sm:text-sm text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl font-bold justify-center">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>

                {/* Balanced 3x4 Keypad Grid (Fast Response, Comfortably Sized) */}
                <div className="grid grid-cols-3 gap-2.5 max-w-[340px] mx-auto w-full touch-manipulation">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleNumClick(digit)}
                      disabled={loading}
                      className="h-12 sm:h-[52px] rounded-2xl bg-white border-2 border-slate-200 text-xl sm:text-2xl font-black text-slate-800 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 active:bg-indigo-100 active:scale-95 transition-transform duration-75 disabled:opacity-40 select-none shadow-xs flex items-center justify-center touch-manipulation"
                    >
                      {digit}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={loading || pin.length === 0}
                    className="h-12 sm:h-[52px] rounded-2xl bg-rose-50 border-2 border-rose-200 text-xs font-black uppercase tracking-wider text-rose-600 hover:bg-rose-100 active:scale-95 transition-transform duration-75 disabled:opacity-35 select-none flex items-center justify-center touch-manipulation"
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNumClick('0')}
                    disabled={loading}
                    className="h-12 sm:h-[52px] rounded-2xl bg-white border-2 border-slate-200 text-xl sm:text-2xl font-black text-slate-800 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 active:bg-indigo-100 active:scale-95 transition-transform duration-75 disabled:opacity-40 select-none shadow-xs flex items-center justify-center touch-manipulation"
                  >
                    0
                  </button>

                  <button
                    type="button"
                    onClick={handleBackspace}
                    disabled={loading || pin.length === 0}
                    className="h-12 sm:h-[52px] rounded-2xl bg-slate-100 border-2 border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 flex items-center justify-center active:scale-95 transition-transform duration-75 disabled:opacity-35 select-none touch-manipulation"
                    title="Backspace"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                </div>

                {loading && (
                  <div className="pt-0.5 flex items-center justify-center gap-2 text-xs font-bold text-indigo-600">
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
                    <span>Verifying PIN…</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Security & System Creator Footer below card */}
          <div className="mt-3 flex flex-col items-center gap-0.5 text-center">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
              <Lock className="w-3 h-3 text-indigo-600" />
              <span>Encrypted Session · Enterprise Role-Based Access Control</span>
            </div>
            <p className="text-[11px] text-slate-600 font-semibold">
              Engineered &amp; Maintained by{' '}
              <span className="text-slate-900 font-black">Gain Carlo Cayabyab</span> · IT Administrator
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
