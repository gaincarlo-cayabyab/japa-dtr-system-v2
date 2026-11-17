'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  Briefcase,
  Receipt,
  Package,
  Users,
  ChevronRight,
  ChevronLeft,
  Volume2,
  VolumeX,
  Delete,
  Lock,
  AlertCircle,
  Keyboard,
  Check,
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
  defaultPin?: string
}

const ROLES: RoleOption[] = [
  {
    id: 'admin',
    title: 'Administrator',
    badge: 'Full Access',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: ShieldCheck,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    desc: 'Full workspace governance, financials, payroll & configurations',
    username: 'admin',
  },
  {
    id: 'store_manager',
    title: 'Store Manager',
    badge: 'Managerial',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: Briefcase,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    desc: 'Order sign-offs, sales quotations, reports & branch workflow',
    username: 'japa_manager',
  },
  {
    id: 'cashier',
    title: 'Cashier POS',
    badge: 'POS Ready',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: Receipt,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    desc: 'Direct access to retail sales terminal, barcode lookup & checkout',
    username: 'japa_pearly',
  },
  {
    id: 'inventory',
    title: 'Inventory Officer',
    badge: 'Stock Audit',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Package,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    desc: 'Multi-store catalog, stock adjustments & reorder thresholds',
    username: 'japa_pearly',
  },
  {
    id: 'production',
    title: 'Production Staff',
    badge: 'Shop Floor',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: Users,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    desc: '7-stage customized printing, heat-press, cutting & job statuses',
    username: 'japa_pearly',
  },
]

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
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedRole, setSelectedRole] = useState<RoleOption>(ROLES[0])
  const [pin, setPin] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  const submitLogin = useCallback(
    async (pinToSubmit: string) => {
      setLoading(true)
      setErrorMsg(null)
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: selectedRole.username, pin: pinToSubmit }),
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
    [selectedRole, router, soundEnabled]
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
      if (step === 2) {
        if (e.key >= '0' && e.key <= '9') {
          handleNumClick(e.key)
        } else if (e.key === 'Backspace') {
          handleBackspace()
        } else if (e.key === 'Escape') {
          handleClear()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [step, handleNumClick])

  const handleSelectRole = (role: RoleOption) => {
    playKeySound('tap', soundEnabled)
    setSelectedRole(role)
    setPin('')
    setErrorMsg(null)
    setStep(2)
  }

  const RoleIcon = selectedRole.icon

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8fafc] overflow-x-hidden relative select-none">
      {/* ── LEFT HALF: JAPA 3D Print Studio Animation ─────────────────────── */}
      <div className="w-full lg:w-1/2 min-h-[580px] lg:min-h-screen relative overflow-hidden bg-gradient-to-b from-white to-[#f1f3f8] flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200/80">
        {/* Top-Left Floating Pill (Identical to Image 2) */}
        <div className="absolute top-6 left-6 z-20 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/95 backdrop-blur-md shadow-sm border border-slate-200/80">
          <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-slate-200 shadow-2xs flex-shrink-0 bg-white">
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
            <p className="text-[10px] font-medium text-slate-500 leading-none mt-0.5">
              Enterprise Operations Workspace
            </p>
          </div>
        </div>

        {/* 3D WebGL Three.js Print Studio Interactive Canvas */}
        <div className="w-full h-full min-h-[580px] lg:min-h-screen relative bg-transparent">
          <iframe
            src="/print-animation/index.html?embed=1"
            title="JAPA Global Trading printing and apparel 3D animation"
            className="w-full h-full border-0 block absolute inset-0"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>

        {/* Bottom-Left Pill (Identical to Image 2) */}
        <div className="absolute bottom-6 left-6 z-20 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/85 backdrop-blur-md shadow-xs border border-slate-200/60 text-[11px] font-medium text-slate-600">
          <span>© 2026 JAPA Global Trading</span>
        </div>

        {/* Bottom-Right Pill (Identical to Image 2) */}
        <div className="absolute bottom-6 right-6 z-20 hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/90 backdrop-blur-md shadow-xs border border-emerald-200/80 text-[11px] font-bold text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Dagupan &amp; Manila Nodes</span>
        </div>
      </div>

      {/* ── RIGHT HALF: Floating Auth Card on Dotted Pastel Background ─────── */}
      <div
        className="w-full lg:w-1/2 min-h-screen flex flex-col justify-center items-center p-4 sm:p-8 lg:p-12 relative"
        style={{
          background: 'radial-gradient(circle at 50% 50%, #eff6ff 0%, #f0fdfa 40%, #f8fafc 100%)',
          backgroundImage:
            'radial-gradient(rgba(148, 163, 184, 0.25) 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* Floating White Card (Exact replica of Image 2) */}
        <div
          className="w-full max-w-[490px] bg-white/95 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 shadow-2xl shadow-indigo-900/10 border border-white/80 ring-1 ring-slate-900/5 relative transition-all duration-300"
          style={{ boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.12)' }}
        >
          {/* Card Top Brand Row */}
          <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs flex-shrink-0 bg-white">
                <Image
                  src="/japa-logo.jpg"
                  alt="JAPA Logo"
                  fill
                  className="object-contain p-1"
                  priority
                />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 leading-tight">JAPA Global</h2>
                <p className="text-xs font-semibold text-slate-400">Enterprise Operations</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/80 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>DAG &amp; MNL</span>
              </span>
            </div>
          </div>

          {/* ── STEP 1: Select Role View (Exact UI from Image 2) ───────────── */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">Select Role</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Tap your operational team to sign in</p>
                </div>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                  Step 1 of 2
                </span>
              </div>

              {/* Roles List */}
              <div className="space-y-2.5 pt-1">
                {ROLES.map((role) => {
                  const Icon = role.icon
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => handleSelectRole(role)}
                      className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/70 bg-white hover:bg-slate-50/80 hover:border-indigo-300 hover:shadow-xs transition-all text-left group"
                    >
                      <div className="flex items-start gap-3 min-w-0 pr-2">
                        <div
                          className={`w-9 h-9 rounded-xl ${role.iconBg} ${role.iconColor} flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {role.title}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${role.badgeColor}`}
                            >
                              {role.badge}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 leading-snug line-clamp-1">
                            {role.desc}
                          </p>
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── STEP 2: Enter PIN Keypad View ─────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Back to Roles navigation bar */}
              <div className="flex items-center justify-between pb-2">
                <button
                  type="button"
                  onClick={() => {
                    playKeySound('tap', soundEnabled)
                    setStep(1)
                    setPin('')
                    setErrorMsg(null)
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back to Roles</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors ${
                      soundEnabled
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                        : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                    }`}
                    title={soundEnabled ? 'Mute Keypad Sound' : 'Enable Keypad Sound'}
                  >
                    {soundEnabled ? (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Sound ON</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                        <span>Muted</span>
                      </>
                    )}
                  </button>
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                    Step 2 of 2
                  </span>
                </div>
              </div>

              {/* Selected Role Banner */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-xl ${selectedRole.iconBg} ${selectedRole.iconColor} flex items-center justify-center flex-shrink-0 shadow-2xs`}
                  >
                    <RoleIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 leading-tight">
                      {selectedRole.title}
                    </p>
                    <p className="text-[10px] text-slate-500">Security PIN Verification</p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${selectedRole.badgeColor}`}
                >
                  {selectedRole.badge}
                </span>
              </div>

              {/* 6-Digit PIN Indicator Dots */}
              <div className={`py-2 ${shake ? 'animate-shake' : ''}`}>
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
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl font-bold justify-center animate-in fade-in">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-600" />
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>

              {/* 3x4 Keypad Grid */}
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5 max-w-[290px] mx-auto w-full pt-1">
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
                <div className="pt-2 flex items-center justify-center gap-2 text-xs font-bold text-indigo-600 animate-pulse">
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
                  <span>Verifying Security PIN…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Security & System Creator Footer below card (Identical to Image 2) */}
        <div className="mt-5 flex flex-col items-center gap-1.5 text-center">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Encrypted Session · Enterprise Role-Based Access Control</span>
          </div>
          <p className="text-[11px] text-slate-400 font-semibold">
            Engineered &amp; Maintained by <span className="text-slate-700 font-bold">Gain Carlo Cayabyab</span> · IT Administrator
          </p>
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
