'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { PageBanner } from '@/components/PageBanner'
import {
  BookOpen,
  Calculator,
  Clock,
  TrendingUp,
  Moon,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  DollarSign,
  ShieldCheck,
  Scale,
  MapPin,
  Coffee,
  FileText,
  Sparkles,
  ChevronRight,
  Check,
  Cpu,
  Radio,
  KeyRound,
  BarChart3,
} from 'lucide-react'

type HelpTab =
  | 'calculator'
  | 'modes'
  | 'late'
  | 'ot'
  | 'holidays'
  | 'sunday'
  | 'branches'
  | 'system'

export function HelpClient() {
  // Interactive Calculator State
  const [calcDailyRate, setCalcDailyRate] = useState<number>(400)
  const [calcTimeIn, setCalcTimeIn] = useState<string>('08:35')
  const [calcTimeOut, setCalcTimeOut] = useState<string>('18:18')
  const [calcDayType, setCalcDayType] = useState<string>('regular')
  const [hasLunchBreak, setHasLunchBreak] = useState<boolean>(true)
  const [calcEngine, setCalcEngine] = useState<'exact' | 'normalized'>('normalized')
  const [activeTab, setActiveTab] = useState<HelpTab>('calculator')

  // Live Math matching src/lib/payroll.ts
  const hourlyRate = Math.round((calcDailyRate / 8) * 100) / 100
  const minuteRate = hourlyRate / 60

  const isRestDay =
    calcDayType === 'rest_day' ||
    calcDayType === 'special_holiday_rest' ||
    calcDayType === 'regular_holiday_rest'

  const [inH, inM] = calcTimeIn.split(':').map(Number)
  const checkInMinutes = (inH || 0) * 60 + (inM || 0)
  const officeStartMinutes = 9 * 60 // 09:00 AM

  const [outH, outM] = calcTimeOut.split(':').map(Number)
  let checkOutMinutes = (outH || 0) * 60 + (outM || 0)
  if (checkOutMinutes < checkInMinutes) {
    checkOutMinutes += 24 * 60
  }

  let effectiveInMinutes = checkInMinutes
  let effectiveOutMinutes = checkOutMinutes
  let isArrivalNormalized = false
  let isDepartureNormalized = false

  if (calcEngine === 'normalized' && !isRestDay) {
    // Morning arrival buffer: 8:00 AM (480m) to 9:05 AM (545m) normalizes to 9:00 AM (540m)
    if (checkInMinutes >= 480 && checkInMinutes <= 545) {
      effectiveInMinutes = officeStartMinutes
      isArrivalNormalized = checkInMinutes !== officeStartMinutes
    }

    // Departure buffer: 6:00 PM (1080m) to 6:30 PM (1110m) normalizes to 6:00 PM (1080m)
    if (checkOutMinutes >= 1080 && checkOutMinutes <= 1110) {
      effectiveOutMinutes = 1080
      isDepartureNormalized = checkOutMinutes !== 1080
    } else if (checkOutMinutes > 1110) {
      const excess = checkOutMinutes - 1080
      effectiveOutMinutes = 1080 + Math.floor(excess / 30) * 30
      isDepartureNormalized = checkOutMinutes !== effectiveOutMinutes
    }
  }

  // Late computation (Office start: 09:00 AM; Rest Days exempt)
  const lateMinutes = isRestDay ? 0 : Math.max(0, effectiveInMinutes - officeStartMinutes)
  const tardinessDeduction = isRestDay
    ? 0
    : Math.round((lateMinutes / 60) * hourlyRate * 100) / 100

  const elapsedMinutes = Math.max(0, effectiveOutMinutes - effectiveInMinutes)
  const effectiveLunchMins = hasLunchBreak && elapsedMinutes >= 300 ? 60 : 0
  const netWorkedMinutes = Math.max(0, elapsedMinutes - effectiveLunchMins)
  const totalWorkedHours = Math.round((netWorkedMinutes / 60) * 100) / 100

  const regHours = Math.min(8, totalWorkedHours)
  const otHours = Math.max(0, totalWorkedHours - 8)

  // Night Differential Hours (10:00 PM - 6:00 AM, +10% hourly premium)
  const nightDiffHours = useMemo(() => {
    let ndMins = 0
    for (let m = effectiveInMinutes; m < effectiveOutMinutes; m += 5) {
      const hod = Math.floor((m % 1440) / 60)
      if (hod >= 22 || hod < 6) {
        ndMins += 5
      }
    }
    return Math.round((ndMins / 60) * 100) / 100
  }, [effectiveInMinutes, effectiveOutMinutes])

  const multipliers: Record<string, { base: number; label: string; note: string }> = {
    regular: {
      base: 1.0,
      label: 'Regular Workday',
      note: 'Normal 100% daily rate. Late deduction applies past 9:00 AM.',
    },
    rest_day: {
      base: 1.3,
      label: 'Sunday / Rest Day (+30%)',
      note: '+30% premium on all hours worked. ZERO late penalty (flexible hours).',
    },
    perez_day: {
      base: 1.3,
      label: 'Nov 13: Speaker Perez Day (+30%)',
      note: 'RA 6721 Pangasinan Special Non-Working Holiday. +30% premium if worked (NOT double pay).',
    },
    special_holiday: {
      base: 1.3,
      label: 'Special Non-Working Holiday (+30%)',
      note: 'All Saints Day, All Souls Day, Christmas Eve, etc. +30% premium if worked.',
    },
    special_holiday_rest: {
      base: 1.5,
      label: 'Special Holiday on Rest Day (+50%)',
      note: 'Special Non-Working Holiday falling on scheduled Rest Day. 150% daily base & ZERO late penalty.',
    },
    regular_holiday: {
      base: 2.0,
      label: 'Regular Holiday (Double Pay / 200%)',
      note: 'Double pay (100% regular + 100% holiday premium).',
    },
    regular_holiday_rest: {
      base: 2.6,
      label: 'Regular Holiday on Rest Day (260%)',
      note: 'Regular Holiday falling on scheduled Rest Day. 260% daily base & ZERO late penalty.',
    },
    special_working: {
      base: 1.0,
      label: 'Agew na Pangasinan (Apr 5 / 100%)',
      note: 'RA 11374 Special Working Holiday in Pangasinan. Regular 100% daily wage.',
    },
  }
  const currentMult = multipliers[calcDayType] || multipliers.regular

  const regularPay = Math.round((regHours / 8) * calcDailyRate * 100) / 100
  const holidayPremiumPay =
    currentMult.base > 1.0
      ? Math.round(regularPay * (currentMult.base - 1.0) * 100) / 100
      : 0
  const otPay = Math.round(otHours * hourlyRate * 100) / 100
  const nightDiffPay = Math.round(nightDiffHours * hourlyRate * 0.1 * 100) / 100

  const totalPay = Math.max(
    0,
    Math.round((regularPay + holidayPremiumPay + otPay + nightDiffPay - tardinessDeduction) * 100) / 100
  )

  return (
    <div className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Unified Light-Theme Hero Banner */}
      <PageBanner
        theme="help"
        pattern="rings"
        eyebrow="Enterprise Portal v5.0 · Knowledge Base & Computation Spec"
        eyebrowIcon={<Scale className="w-3.5 h-3.5 text-indigo-700" />}
        icon={<BookOpen className="w-5 h-5 text-white" />}
        title="Help, Formulas & System Reference"
        description="Philippine DOLE labor formulas, Pangasinan provincial holidays, shift rules, and v18.9 biometric bridge architecture."
        chips={[
          {
            icon: <Clock className="w-3.5 h-3.5 text-indigo-600" />,
            label: '9 AM Start · 12–1 PM Lunch',
          },
          {
            icon: <Calendar className="w-3.5 h-3.5 text-blue-600" />,
            label: 'Sunday +30% & Rest-Day Exempt',
          },
          {
            icon: <Cpu className="w-3.5 h-3.5 text-emerald-600" />,
            label: 'Bridge v18.9 · 15s Anti-Double Tap',
          },
        ]}
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:flex-wrap border-b border-slate-200 pb-3 -mx-1 px-1 sm:mx-0 sm:px-0">
        {[
          { id: 'calculator', label: 'Interactive Calculator', icon: Calculator, active: 'bg-blue-600 text-white' },
          { id: 'modes', label: 'Exact vs Normalized', icon: Sparkles, active: 'bg-indigo-600 text-white' },
          { id: 'late', label: 'Late Deduction', icon: AlertTriangle, active: 'bg-rose-600 text-white' },
          { id: 'ot', label: 'Overtime, Lunch & Night Diff', icon: TrendingUp, active: 'bg-purple-600 text-white' },
          { id: 'holidays', label: 'DOLE & Pangasinan Holidays', icon: Calendar, active: 'bg-amber-600 text-white' },
          { id: 'sunday', label: 'Sunday & Rest Day', icon: ShieldCheck, active: 'bg-emerald-600 text-white' },
          { id: 'branches', label: 'Branch Operations', icon: MapPin, active: 'bg-sky-600 text-white' },
          { id: 'system', label: 'Bridge v18.9 & Portal Docs', icon: Cpu, active: 'bg-cyan-700 text-white' },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as HelpTab)}
              className={`px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
                isActive
                  ? `${tab.active} shadow-sm`
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* TAB 1: INTERACTIVE CALCULATOR */}
      {activeTab === 'calculator' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold border border-blue-100 shrink-0">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Interactive Salary &amp; Attendance Simulator</h2>
                <p className="text-xs text-slate-500">
                  Simulate any punch times, day types, and rates to audit live payroll computations.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 inline-flex items-center gap-1.5 self-start md:self-center shrink-0">
              <Check className="w-3.5 h-3.5 text-emerald-600" /> DOLE Engine Match
            </span>
          </div>

          <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Input Controls */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Calculation Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setCalcEngine('exact')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1 ${
                      calcEngine === 'exact'
                        ? 'bg-blue-600 text-white shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Exact Biometrics
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcEngine('normalized')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1 ${
                      calcEngine === 'normalized'
                        ? 'bg-emerald-600 text-white shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Normalized Policy
                  </button>
                </div>
                {calcEngine === 'normalized' ? (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                    8:00–9:05 AM aligns to 9:00 AM · 6:00–6:30 PM aligns to 6:00 PM (anti-OT exaggeration).
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Uses exact raw timestamps down to the minute.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Daily Rate (PHP ₱)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    value={calcDailyRate}
                    onChange={(e) => setCalcDailyRate(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-sm font-bold text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                  <span>Hourly: <strong>₱{hourlyRate.toFixed(2)}/hr</strong></span>
                  <span>Minute: <strong>₱{minuteRate.toFixed(4)}/min</strong></span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Time In (9:00 AM)
                  </label>
                  <input
                    type="time"
                    value={calcTimeIn}
                    onChange={(e) => setCalcTimeIn(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Time Out
                  </label>
                  <input
                    type="time"
                    value={calcTimeOut}
                    onChange={(e) => setCalcTimeOut(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 -mt-2">
                Early arrivals before 9:00 AM incur <strong>₱0.00 late deduction</strong>.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Day Classification &amp; Holiday
                </label>
                <select
                  value={calcDayType}
                  onChange={(e) => setCalcDayType(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="regular">Regular Workday (1.0x Base, 9:00 AM start)</option>
                  <option value="rest_day">Sunday / Rest Day (1.30x Base, ZERO Late)</option>
                  <option value="perez_day">Nov 13: Speaker Perez Day (1.30x, RA 6721)</option>
                  <option value="special_holiday">Special Non-Working Holiday (1.30x)</option>
                  <option value="special_holiday_rest">Special Holiday + Rest Day (1.50x, ZERO Late)</option>
                  <option value="regular_holiday">Regular Holiday (Double Pay / 2.00x)</option>
                  <option value="regular_holiday_rest">Regular Holiday + Rest Day (2.60x, ZERO Late)</option>
                  <option value="special_working">Agew na Pangasinan (Apr 5 / 1.00x Regular)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">{currentMult.note}</p>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={hasLunchBreak}
                    onChange={(e) => setHasLunchBreak(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Deduct 1-Hour Lunch Break (12:00 PM – 1:00 PM)</span>
                </label>
                <p className="text-[11px] text-slate-400 ml-6 mt-0.5">
                  Applied for shifts ≥ 5h spanning midday (9 AM – 6 PM = 8h regular).
                </p>
              </div>
            </div>

            {/* Step-by-Step Breakdown */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex flex-wrap items-center justify-between gap-2">
                <span>Shift Breakdown</span>
                <span className="text-blue-700 font-extrabold text-right">{currentMult.label}</span>
              </h3>

              {(isArrivalNormalized || isDepartureNormalized) && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5 text-emerald-800">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Normalized Schedule Applied:
                  </p>
                  <ul className="text-[11px] list-disc list-inside space-y-0.5 text-emerald-800">
                    {isArrivalNormalized && (
                      <li>Check-In: <strong>{calcTimeIn}</strong> → <strong>09:00 AM</strong></li>
                    )}
                    {isDepartureNormalized && (
                      <li>
                        Check-Out: <strong>{calcTimeOut}</strong> →{' '}
                        <strong>
                          {Math.floor(effectiveOutMinutes / 60)}:
                          {String(effectiveOutMinutes % 60).padStart(2, '0')}
                        </strong>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Total Elapsed Time:</span>
                  <span className="font-bold text-slate-900">{(elapsedMinutes / 60).toFixed(2)} hrs</span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Lunch Break (Unpaid):</span>
                  <span className="font-bold text-amber-700">
                    -{effectiveLunchMins / 60} hr ({effectiveLunchMins} mins)
                  </span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Net Working Hours:</span>
                  <span className="font-bold text-slate-900">{totalWorkedHours.toFixed(2)} hrs</span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Regular Hours (Max 8h):</span>
                  <span className="font-bold text-slate-900">{regHours.toFixed(2)} hrs</span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Overtime Hours (&gt;8h):</span>
                  <span className="font-bold text-purple-700">+{otHours.toFixed(2)} hrs</span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Night Diff (10 PM–6 AM):</span>
                  <span className="font-bold text-indigo-700">{nightDiffHours.toFixed(2)} hrs (+10%)</span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Tardiness Past 9:00 AM:</span>
                  {isRestDay ? (
                    <span className="font-bold text-emerald-700">0m (Rest Day Flexible)</span>
                  ) : lateMinutes > 0 ? (
                    <span className="font-bold text-rose-600">{lateMinutes} mins late</span>
                  ) : (
                    <span className="font-bold text-emerald-700">On Time (0 mins)</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Late Deduction Math:</span>
                  {isRestDay ? (
                    <span className="font-bold text-emerald-700">₱0.00 (Rest Day Exempt)</span>
                  ) : lateMinutes > 0 ? (
                    <span className="font-bold text-rose-600 text-right">
                      ({lateMinutes}m / 60) × ₱{hourlyRate.toFixed(2)} = -₱{tardinessDeduction.toFixed(2)}
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-700">₱0.00</span>
                  )}
                </div>
              </div>
            </div>

            {/* Light-Theme Net Shift Compensation Results Card */}
            <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-white via-indigo-50/85 to-blue-100/75 border-2 border-indigo-200/90 text-slate-900 flex flex-col justify-between shadow-sm">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 border border-indigo-200 text-[11px] uppercase font-black text-indigo-800 tracking-wider">
                  <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                  Net Shift Compensation
                </div>
                <p className="text-3xl sm:text-4xl font-black text-emerald-700 mt-3 tracking-tight">
                  ₱{totalPay.toFixed(2)}
                </p>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Net shift earnings after holiday premiums, overtime, night diff, and late deductions.
                </p>
              </div>

              <div className="space-y-2.5 pt-4 mt-4 border-t border-indigo-200/80 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Regular Base Pay ({regHours.toFixed(2)}h):</span>
                  <span className="font-bold text-slate-900">₱{regularPay.toFixed(2)}</span>
                </div>

                {holidayPremiumPay > 0 && (
                  <div className="flex justify-between text-amber-700 font-bold">
                    <span>Holiday / Rest Premium (+{Math.round((currentMult.base - 1) * 100)}%):</span>
                    <span>+₱{holidayPremiumPay.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600">
                  <span>Overtime Pay ({otHours.toFixed(2)}h @ ₱{hourlyRate.toFixed(2)}):</span>
                  <span className="font-bold text-purple-700">+₱{otPay.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Night Differential ({nightDiffHours.toFixed(2)}h @ 10%):</span>
                  <span className="font-bold text-indigo-700">+₱{nightDiffPay.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Late Deduction ({lateMinutes}m):</span>
                  <span className={`font-bold ${tardinessDeduction > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {tardinessDeduction > 0 ? `-₱${tardinessDeduction.toFixed(2)}` : '₱0.00'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CALCULATION MODES (EXACT VS NORMALIZED) */}
      {activeTab === 'modes' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-200 shadow-sm space-y-5 sm:space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:pb-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-200 shrink-0">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Dual-Engine Timekeeping: Exact Biometrics vs Standard Normalized
                  </h2>
                  <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                    Choose between raw hardware timestamps or policy-normalized shift bounds to avoid incidental OT inflation.
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold flex items-center gap-1.5 self-start md:self-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" /> DTR, Payroll &amp; Excel
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="p-4 sm:p-6 rounded-2xl border-2 border-slate-200 bg-slate-50/70 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                      <Clock className="w-4 h-4" />
                    </span>
                    <h3 className="font-bold text-slate-900 text-base">Exact Biometrics (Raw Real-Time)</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold text-[11px]">
                    Raw Logs
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Computes worked hours and payroll strictly from exact FingerTec TA500 hardware timestamps down to the minute.
                </p>

                <div className="space-y-2 pt-2 border-t border-slate-200/80 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span><strong>Arrivals:</strong> Exact minute logged (e.g., 8:36 AM starts elapsed time at 8:36 AM).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span><strong>Departures:</strong> Exact minute logged (e.g., 6:18 PM computes +18 mins OT).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span><strong>Best for:</strong> Forensic time audits and verifying raw TA500 hardware scans.</span>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 rounded-2xl border-2 border-indigo-400 bg-indigo-50/40 space-y-4 relative shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      <Sparkles className="w-4 h-4" />
                    </span>
                    <h3 className="font-bold text-indigo-950 text-base">Standard Normalized (Policy)</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold text-[11px]">
                    Recommended
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Enforces corporate shift schedule rules (09:00 AM – 06:00 PM) so casual linger around check-in/out never inflates payroll OT while crediting authorized 30-min OT blocks.
                </p>

                <div className="space-y-2 pt-2 border-t border-indigo-200/70 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span><strong>Morning Buffer (8:00 AM – 9:05 AM):</strong> Aligns cleanly to <strong>9:00 AM</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span><strong>Departure Buffer (6:00 PM – 6:30 PM):</strong> Aligns cleanly to <strong>6:00 PM</strong> (0 false OT).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span><strong>Authorized OT (&gt; 6:30 PM):</strong> Credited in clean 30-minute completed intervals (0.5h, 1.0h, 5.0h).</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Scale className="w-4 h-4 text-indigo-600" /> Policy Rules Comparison Table
              </h3>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[540px] text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold">
                      <th className="p-3 w-1/4">Scenario / Rule</th>
                      <th className="p-3 w-3/8 text-slate-700 bg-slate-50">Exact Biometrics (Raw)</th>
                      <th className="p-3 w-3/8 text-indigo-900 bg-indigo-50/70 font-black">Standard Normalized (Policy)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Arrival 8:00 AM – 9:05 AM</td>
                      <td className="p-3 text-slate-600 bg-slate-50">Raw time (e.g., 8:36 AM). Accumulates early elapsed time.</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">Normalized to 09:00 AM (0m late, 0 pre-shift OT).</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Arrival after 9:05 AM</td>
                      <td className="p-3 text-slate-600 bg-slate-50">Raw arrival. Late penalty charged past grace setting.</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">Raw arrival. Late penalty computed from 9:00 AM.</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Departure 6:01 PM – 6:30 PM</td>
                      <td className="p-3 text-slate-600 bg-slate-50">Raw departure (e.g., 6:18 PM) creates +18m fractional OT.</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">Normalized to 06:00 PM (0 OT, prevents exaggeration).</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Genuine Overtime (&gt; 6:30 PM)</td>
                      <td className="p-3 text-slate-600 bg-slate-50">Exact minute OT (e.g., 7:14 PM = 1h 14m OT).</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">Clean 30-min blocks (e.g., 7:00 PM = 1.0h, 11:00 PM = 5.0h OT).</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">4:00 AM Workday Cutoff</td>
                      <td className="p-3 text-slate-600 bg-slate-50">Punches before 4:00 AM count toward prior shift.</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">Overnight checkout before 4 AM stays paired cleanly.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Light-Theme Case Study Card */}
          <div className="bg-gradient-to-br from-white via-indigo-50/80 to-blue-100/70 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-indigo-200 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center font-black shrink-0">
                ★
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  Real-World Case Study: Dennis Ardiente (ID #1, Dagupan Main)
                </h3>
                <p className="text-xs text-slate-600">
                  Side-by-side comparison showing how Normalized Policy prevents overtime inflation while honoring late-night inventory shifts.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 text-xs">
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
                  <span className="font-bold text-amber-700 uppercase tracking-wider text-[11px]">
                    Scenario 1: Casual Punch Delay
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px]">
                    Regular Day
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Dennis scans in at <strong>8:36 AM</strong> and scans out at <strong>6:18 PM</strong> while packing his gear.
                </p>
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Exact Biometrics:</span>
                    <span className="font-bold text-rose-600">8.7h worked (0.7h casual OT)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Normalized Policy:</span>
                    <span className="font-bold text-emerald-700">9:00 AM – 6:00 PM = 8.0h (0.0h OT)</span>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 font-medium">
                  Outcome: Prevents unintended OT inflation while crediting full 8 regular hours cleanly.
                </p>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
                  <span className="font-bold text-emerald-700 uppercase tracking-wider text-[11px]">
                    Scenario 2: Authorized Late Shift
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono text-[10px]">
                    Inventory OT
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Dennis scans in at <strong>8:40 AM</strong> and works late until <strong>11:00 PM</strong> for store inventory.
                </p>
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Exact Biometrics:</span>
                    <span className="font-bold text-slate-700">13.33h net (5.33h OT + ND)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Normalized Policy:</span>
                    <span className="font-bold text-emerald-700">9:00 AM – 11:00 PM = 13.0h (5.0h OT + ND)</span>
                  </div>
                </div>
                <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl p-2.5 font-medium">
                  Outcome: Genuine overtime past 6:30 PM is fully credited in clean 30-min intervals plus Night Diff past 10 PM.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LATE DEDUCTION FORMULA */}
      {activeTab === 'late' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold border border-rose-100 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Official Late &amp; Tardiness Deduction Equation</h2>
              <p className="text-xs text-slate-500">
                Strictly derived from each employee&apos;s hourly rate (`Daily Rate ÷ 8`) with pro-rata minute accuracy.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 1. Office Start: 9:00 AM
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Standard arrival cutoff is <strong>9:00 AM</strong>. Check-ins at or before 9:00 AM (and up to 9:05 AM under Normalized mode / 5-min grace period) incur <strong>₱0.00</strong>.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" /> 2. Full Hour Late
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Every 60 minutes of tardiness equals exactly <strong>1 × Hourly Rate</strong>.
                <br />
                <code className="inline-block mt-1 text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded font-bold text-slate-800">
                  Deduction = (Late Mins / 60) × Hourly Rate
                </code>
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-purple-600" /> 3. Rest Days Exempt
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Work on <strong>Sundays / Scheduled Rest Days</strong> carries flexible hours with <strong>₱0.00 late deduction</strong> even after 9:00 AM.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              Quick Reference Matrix: Late Deduction by Minutes &amp; Daily Rate
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[540px] text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-left font-bold text-slate-700">
                    <th className="px-4 py-3">Minutes Late</th>
                    <th className="px-4 py-3">Formula</th>
                    <th className="px-4 py-3 text-right">₱400 (₱50.00/hr)</th>
                    <th className="px-4 py-3 text-right">₱450 (₱56.25/hr)</th>
                    <th className="px-4 py-3 text-right">₱500 (₱62.50/hr)</th>
                    <th className="px-4 py-3 text-right">₱550 (₱68.75/hr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    { label: '10 mins late', formula: '(10 / 60) × Hourly', vals: [8.33, 9.38, 10.42, 11.46] },
                    { label: '15 mins late (1/4 hr)', formula: '0.25 × Hourly', vals: [12.5, 14.06, 15.63, 17.19] },
                    { label: '30 mins late (1/2 hr)', formula: '0.50 × Hourly', vals: [25.0, 28.13, 31.25, 34.38] },
                    { label: '45 mins late (3/4 hr)', formula: '0.75 × Hourly', vals: [37.5, 42.19, 46.88, 51.56] },
                    { label: '60 mins late (1 full hr)', formula: '1.00 × Hourly', vals: [50.0, 56.25, 62.5, 68.75] },
                  ].map((row) => (
                    <tr key={row.label} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-slate-900">{row.label}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono">{row.formula}</td>
                      {row.vals.map((v, i) => (
                        <td key={i} className="px-4 py-2.5 text-right font-bold text-rose-600">
                          -₱{v.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: OVERTIME, LUNCH & NIGHT DIFF */}
      {activeTab === 'ot' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold border border-purple-100 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Overtime, Lunch Break &amp; Night Differential Rules</h2>
              <p className="text-xs text-slate-500">
                Midday meal break exclusion, straight OT rate, and 10 PM – 6 AM Night Differential (+10%).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
              <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-600" /> 12–1 PM Unpaid Lunch
              </h3>
              <p className="text-xs text-amber-950 leading-relaxed">
                Under Article 85 of the Philippine Labor Code, the 60-minute midday meal period is automatically deducted when a shift spans 12:00 PM–1:00 PM.
              </p>
              <div className="p-2.5 rounded-xl bg-white border border-amber-200 text-[11px] font-mono text-amber-900">
                9h elapsed (9 AM–6 PM) - 1h lunch = 8h reg
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
              <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-600" /> Straight Overtime Rule
              </h3>
              <p className="text-xs text-purple-950 leading-relaxed">
                Hours worked beyond 8 regular hours are multiplied by the employee&apos;s hourly rate (`Daily Rate ÷ 8`).
              </p>
              <div className="p-2.5 rounded-xl bg-white border border-purple-200 text-[11px] font-mono text-purple-900">
                OT Pay = OT Hours × Hourly Rate
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2">
              <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                <Moon className="w-4 h-4 text-indigo-600" /> Night Diff (+10%)
              </h3>
              <p className="text-xs text-indigo-950 leading-relaxed">
                Pursuant to Article 86, hours rendered between <strong>10:00 PM and 6:00 AM</strong> earn a +10% night differential premium (if eligible).
              </p>
              <div className="p-2.5 rounded-xl bg-white border border-indigo-200 text-[11px] font-mono text-indigo-900">
                ND Pay = ND Hours × Hourly × 0.10
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PANGASINAN & DOLE HOLIDAYS */}
      {activeTab === 'holidays' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold border border-amber-100 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Philippine &amp; Pangasinan Provincial Holiday Regulations
              </h2>
              <p className="text-xs text-slate-500">
                Official statutory multipliers including rest-day + holiday stacking rules (`src/lib/holidays.ts`).
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-bold text-[10px] uppercase tracking-wider">
              Provincial Law · Republic Act No. 6721
            </span>
            <h3 className="text-sm font-bold text-amber-950">
              November 13: Speaker Eugenio Perez Day (Pangasinan Special Non-Working Holiday)
            </h3>
            <p className="text-xs text-amber-900 leading-relaxed">
              Designated in Pangasinan under RA 6721. Employees working Nov 13 earn <strong>+30% Premium (130% total)</strong>, not double pay (200% applies to Regular Holidays only).
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[540px] text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-left font-bold text-slate-700">
                  <th className="px-4 py-3">Classification</th>
                  <th className="px-4 py-3 text-center">Workday Multiplier</th>
                  <th className="px-4 py-3">Jurisdiction &amp; Examples</th>
                  <th className="px-4 py-3">Legal Basis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">Regular Holiday (Rest Day: 260%)</td>
                  <td className="px-4 py-3 text-center font-bold text-emerald-700">200% (2.00x)</td>
                  <td className="px-4 py-3 text-slate-600">
                    New Year (Jan 1), Maundy Thursday, Good Friday, Apr 9, Labor Day (May 1), Jun 12, National Heroes, Bonifacio Day, Dec 25, Rizal Day
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono">Article 94, Labor Code</td>
                </tr>
                <tr className="hover:bg-slate-50 bg-amber-50/30">
                  <td className="px-4 py-3 font-bold text-slate-900">Speaker Eugenio Perez Day (Nov 13)</td>
                  <td className="px-4 py-3 text-center font-bold text-amber-700">130% (1.30x)</td>
                  <td className="px-4 py-3 text-slate-600">Province of Pangasinan</td>
                  <td className="px-4 py-3 text-slate-500 font-mono">Republic Act No. 6721</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">Special Non-Working (Rest Day: 150%)</td>
                  <td className="px-4 py-3 text-center font-bold text-amber-700">130% (1.30x)</td>
                  <td className="px-4 py-3 text-slate-600">
                    Chinese New Year, Black Saturday, Ninoy Aquino Day, All Saints&apos;/Souls&apos; Days, Dec 8, Dec 24, Dec 31, Jan 9 Lingayen Veterans Day
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono">Article 93 &amp; Proclamation</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">Special Working Holiday (Apr 5 / Feb 25)</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-700">100% (1.00x)</td>
                  <td className="px-4 py-3 text-slate-600">Agew na Pangasinan (Apr 5), EDSA Anniversary (Feb 25)</td>
                  <td className="px-4 py-3 text-slate-500 font-mono">RA 11374</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="pt-1 text-right">
            <Link
              href="/calendar"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline"
            >
              Open Philippine &amp; Pangasinan Holiday Calendar
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* TAB 6: SUNDAY & REST DAY POLICY */}
      {activeTab === 'sunday' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold border border-emerald-100 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Sunday &amp; Scheduled Rest Day Policies</h2>
              <p className="text-xs text-slate-500">
                Flexible arrival policy with ₱0.00 late penalty and +30% rest-day premium pay.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
              <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> ZERO Late Penalty on Rest Days
              </h3>
              <p className="text-xs text-emerald-950 leading-relaxed">
                Sunday (and Saturday for `mon_fri` IT Admin schedules) is an official scheduled rest day with <strong>flexible arrival hours</strong>. Tardiness minutes and deductions remain strictly <strong>₱0.00</strong>.
              </p>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
              <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" /> +30% Rest-Day Multiplier
              </h3>
              <p className="text-xs text-blue-950 leading-relaxed">
                All hours worked on scheduled rest days earn a <strong>1.30× base multiplier</strong> (or 1.50× / 2.60× if combined with a Special or Regular holiday).
              </p>
              <div className="p-2.5 rounded-xl bg-white border border-blue-200 text-xs font-mono text-blue-900">
                Sunday Pay = (Hours / 8) × Daily Rate × 1.30
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: BRANCH OPERATIONS */}
      {activeTab === 'branches' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold border border-sky-100 shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Branch Operations &amp; Work Schedules</h2>
              <p className="text-xs text-slate-500">
                Multi-branch staffing distribution (`Dagupan Main` and `Manila`) and schedule types (`mon_sat` vs `mon_fri`).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">Dagupan Main (Pangasinan HQ)</h3>
                <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[10px]">
                  Headquarters · TA500 Terminal
                </span>
              </div>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li><strong>Regular Staff (`mon_sat`):</strong> Monday–Saturday workweek with Sunday scheduled Rest Day.</li>
                <li><strong>IT Administrator (`mon_fri`):</strong> Monday–Friday workweek with Saturday &amp; Sunday Rest Days.</li>
                <li><strong>Biometrics:</strong> Direct physical scans via FingerTec TA500 (`192.168.0.58:4370`).</li>
                <li><strong>Provincial Laws:</strong> Full Pangasinan holiday coverage (RA 6721 Nov 13, RA 11374 Apr 5, Jan 9).</li>
              </ul>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">Manila Branch</h3>
                <span className="px-2.5 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[10px]">
                  Satellite Operations
                </span>
              </div>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li><strong>Schedule (`mon_sat`):</strong> Monday–Saturday workweek with Sunday Rest Day.</li>
                <li><strong>Analytics &amp; Reporting:</strong> Tracked individually in Dashboard branch gauges, DTR Reports, and Payroll exports.</li>
                <li><strong>Remote Administration:</strong> Real-time punch monitoring &amp; temporary 1-hour edit grants managed centrally.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: BRIDGE v18.9 & PORTAL CAPABILITIES */}
      {activeTab === 'system' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center font-bold border border-cyan-100 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Bridge v18.9 &quot;Iron Sentinel&quot; &amp; Portal v5.0 Systems
              </h2>
              <p className="text-xs text-slate-500">
                Hardware synchronization reliability gates, operational DTR view thresholds, and enterprise portal capabilities.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-cyan-50/60 border border-cyan-200 space-y-2.5">
              <h3 className="text-sm font-bold text-cyan-950 flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-700 shrink-0" /> Tablet Bridge v18.9 Hardware Pipeline
              </h3>
              <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside">
                <li><strong>Sub-1KB Atomic Chunker:</strong> Requests 1000B slices (`25 × 40B`) fitting single packets with up to 4× per-slice retries.</li>
                <li><strong>Zero-Miss Completeness Gate:</strong> Rejects truncated reads &amp; retains `catchup_pending` until 100% verified.</li>
                <li><strong>Protection Gates:</strong> `3s` live poll · `15s` anti-double-tap debounce · `5-min` full-memory catch-up audit · dates before `2026-10-01` blocked.</li>
                <li><strong>Remote TA500 Reboot (`/sync`):</strong> Supports safe queued hardware restarts with a 30s reboot grace reconnect cycle.</li>
              </ul>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-2.5">
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600 shrink-0" /> DTR Grouping &amp; Optimistic UI Sync
              </h3>
              <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside">
                <li><strong>4:00 AM Day Boundary:</strong> Shifts checking out past midnight before 4:00 AM Manila Time stay grouped to the prior operational day.</li>
                <li><strong>3-Minute Outbound Threshold:</strong> Accidental rapid double-taps within 3 minutes are not prematurely paired as Check-Out (`On Duty` preserved).</li>
                <li><strong>Silent Real-Time Sync:</strong> Supabase Realtime + silent background polling update Attendance Logs &amp; DTR Reports without intrusive banners.</li>
              </ul>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
              <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-600 shrink-0" /> Role Access &amp; 1-Hour Edit Grants
              </h3>
              <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside">
                <li><strong>Roles:</strong> `IT Administrator` (Super Admin governance), `JAPA Dee` (Executive), `JAPA Manager`, and `JAPA Pearly` (Staff).</li>
                <li><strong>1-Hour Temporary Edit Access:</strong> Non-admin roles can request 1-hour edit approval via the header control, managed exclusively by IT Admin.</li>
                <li><strong>PIN Security:</strong> Zero-lag 6-digit PIN login with role-based middleware verification.</li>
              </ul>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-2.5">
              <h3 className="text-sm font-bold text-blue-950 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600 shrink-0" /> Dashboard Command Center Analytics
              </h3>
              <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside">
                <li><strong>Multi-Mode Trend Charts (`7D / 14D`):</strong> Headcount bars, SVG smooth Attendance Rate curve, and Stacked Regular vs OT columns.</li>
                <li><strong>Peak Flow &amp; Punctuality:</strong> `6 AM – 10 PM` biometric scan wave, Shift Outcome donut ring, Arrival Punctuality ribbon, and Branch radial gauges.</li>
                <li><strong>Reports Explorer:</strong> Live filterable Today Roster, Monthly Hours &amp; OT Leaderboard, and 14-Day Attendance Ledger.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Light-Theme Master Gross Salary Equation Summary */}
      <div className="bg-gradient-to-r from-white via-emerald-50/80 to-teal-50/80 border border-emerald-200/90 text-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm space-y-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4 text-emerald-700" />
          </div>
          <h2 className="text-sm sm:text-base font-black text-slate-900">Master Take-Home / Gross Salary Formula</h2>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-emerald-200 font-mono text-[11px] sm:text-xs text-emerald-800 font-bold leading-relaxed overflow-x-auto shadow-sm">
          Gross Salary = Regular Pay + Holiday Premium Pay + Overtime Pay + Night Diff Pay − Late Deduction
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          All computations maintain full precision through intermediate steps and round to 2 decimal places (`₱0.01`) at final pay settlement to eliminate cumulative round-off drift.
        </p>
      </div>
    </div>
  )
}
