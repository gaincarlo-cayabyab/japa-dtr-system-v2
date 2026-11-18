'use client'

import { useState } from 'react'
import Link from 'next/link'
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
  ArrowRight,
  ShieldCheck,
  Scale,
  MapPin,
  Coffee,
  FileText,
  HelpCircle,
  Info,
  Sparkles,
  ChevronRight,
  Check,
} from 'lucide-react'

export function HelpClient() {
  // Interactive Calculator State
  const [calcDailyRate, setCalcDailyRate] = useState<number>(400)
  const [calcTimeIn, setCalcTimeIn] = useState<string>('08:35')
  const [calcTimeOut, setCalcTimeOut] = useState<string>('18:18')
  const [calcDayType, setCalcDayType] = useState<string>('regular')
  const [hasLunchBreak, setHasLunchBreak] = useState<boolean>(true)
  const [calcEngine, setCalcEngine] = useState<'exact' | 'normalized'>('normalized')
  const [activeTab, setActiveTab] = useState<'calculator' | 'modes' | 'late' | 'ot' | 'holidays' | 'sunday' | 'branches'>('calculator')

  // Live Math
  const hourlyRate = Math.round((calcDailyRate / 8) * 100) / 100
  const minuteRate = hourlyRate / 60

  // Standard office schedule (09:00 AM start, 06:00 PM out)
  const isRestDay = calcDayType === 'rest_day' || calcDayType === 'special_holiday_rest' || calcDayType === 'regular_holiday_rest'
  const [inH, inM] = calcTimeIn.split(':').map(Number)
  const checkInMinutes = inH * 60 + inM
  const officeStartMinutes = 9 * 60 // 09:00 AM

  const [outH, outM] = calcTimeOut.split(':').map(Number)
  let checkOutMinutes = outH * 60 + outM
  if (checkOutMinutes < checkInMinutes) {
    // overnight shift
    checkOutMinutes += 24 * 60
  }

  // Normalization logic
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
      // Overtime beyond 6:30 PM: credited in completed 30-minute blocks
      const excess = checkOutMinutes - 1080
      effectiveOutMinutes = 1080 + Math.floor(excess / 30) * 30
      isDepartureNormalized = checkOutMinutes !== effectiveOutMinutes
    }
  }

  // Late computation (Office start: 09:00 AM)
  const lateMinutes = isRestDay ? 0 : Math.max(0, effectiveInMinutes - officeStartMinutes)
  const tardinessDeduction = isRestDay ? 0 : Math.round(((lateMinutes / 60) * hourlyRate) * 100) / 100

  // Elapsed minutes
  const elapsedMinutes = Math.max(0, effectiveOutMinutes - effectiveInMinutes)

  // Lunch break deduction (12:00 PM to 1:00 PM = 60 mins)
  let effectiveLunchMins = 0
  if (hasLunchBreak && elapsedMinutes >= 300) {
    effectiveLunchMins = 60
  }
  const netWorkedMinutes = Math.max(0, elapsedMinutes - effectiveLunchMins)
  const totalWorkedHours = Math.round((netWorkedMinutes / 60) * 100) / 100

  const regHours = Math.min(8, totalWorkedHours)
  const otHours = Math.max(0, totalWorkedHours - 8)

  // Multipliers mapping
  const multipliers: Record<string, { base: number; label: string; note: string }> = {
    regular: {
      base: 1.0,
      label: 'Regular Workday',
      note: 'Normal 100% daily rate. Late deduction applies after 9:00 AM.',
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
      note: 'All Saints Day, All Souls Day, etc. +30% premium if worked.',
    },
    regular_holiday: {
      base: 2.0,
      label: 'Regular Holiday (Double Pay / 200%)',
      note: 'Double pay (100% regular + 100% holiday premium).',
    },
    special_working: {
      base: 1.0,
      label: 'Agew na Pangasinan (Apr 5 / 100%)',
      note: 'RA 11374 Special Working Holiday in Pangasinan. Regular 100% daily wage.',
    },
  }
  const currentMult = multipliers[calcDayType] || multipliers.regular

  // Pay equations
  const regularPay = Math.round((regHours / 8) * calcDailyRate * 100) / 100
  const holidayPremiumPay = currentMult.base > 1.0
    ? Math.round(regularPay * (currentMult.base - 1.0) * 100) / 100
    : 0

  // Straight OT pay: OT hours * hourly rate
  const otPay = Math.round(otHours * hourlyRate * 100) / 100
  
  const totalPay = Math.max(
    0,
    Math.round((regularPay + holidayPremiumPay + otPay - tardinessDeduction) * 100) / 100
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold text-white">
            <Scale className="w-3.5 h-3.5 text-blue-200" />
            Official JAPA Enterprise Timekeeping &amp; Automated Payroll Reference
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Payroll &amp; Attendance Computation Knowledge Base
          </h1>
          <p className="text-sm text-blue-100 leading-relaxed">
            Complete mathematical formulas, Philippine DOLE labor standards, Pangasinan provincial holiday laws,
            and company-specific policies on late deductions, overtime, lunch breaks, and Sunday work.
          </p>

          <div className="pt-2 flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1 rounded-lg bg-white/10 text-blue-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> 9:00 AM Office Start
            </span>
            <span className="px-3 py-1 rounded-lg bg-white/10 text-emerald-200 flex items-center gap-1.5">
              <Coffee className="w-3.5 h-3.5" /> 12PM-1PM Lunch (Unpaid)
            </span>
            <span className="px-3 py-1 rounded-lg bg-white/10 text-amber-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Sunday: +30% &amp; No Late
            </span>
            <span className="px-3 py-1 rounded-lg bg-white/10 text-purple-200 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> RA 6721 Perez Day (Nov 13)
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Pills */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('calculator')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'calculator'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calculator className="w-4 h-4" /> Live Interactive Calculator
        </button>
        <button
          onClick={() => setActiveTab('modes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'modes'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4 text-indigo-300" /> Calculation Modes: Exact vs Normalized
        </button>
        <button
          onClick={() => setActiveTab('late')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'late'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> Late Deduction Formula
        </button>
        <button
          onClick={() => setActiveTab('ot')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'ot'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Overtime &amp; Lunch Break
        </button>
        <button
          onClick={() => setActiveTab('holidays')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'holidays'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" /> Pangasinan &amp; DOLE Holidays
        </button>
        <button
          onClick={() => setActiveTab('sunday')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'sunday'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4" /> Sunday &amp; Rest Day Policy
        </button>
        <button
          onClick={() => setActiveTab('branches')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'branches'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" /> Branch Operations
        </button>
      </div>

      {/* TAB 1: INTERACTIVE CALCULATOR */}
      {activeTab === 'calculator' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Interactive Salary &amp; Attendance Simulator</h2>
                <p className="text-xs text-slate-500">
                  Simulate any punch times and rates to audit live computations in real time.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100 inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600" /> Automated Engine Active
            </span>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Controls */}
            <div className="space-y-4">
              {/* Calculation Mode Selector */}
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
                        ? 'bg-blue-600 text-white shadow-xs font-black'
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
                        ? 'bg-emerald-600 text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Normalized Policy
                  </button>
                </div>
                {calcEngine === 'normalized' ? (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                    ✨ 8:00–9:05 AM aligns to 9:00 AM · 6:00–6:30 PM aligns to 6:00 PM (anti-OT exaggeration).
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    ⏱️ Uses exact raw timestamps entered below down to the minute.
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Time In (Standard Office Start: 09:00 AM)
                </label>
                <input
                  type="time"
                  value={calcTimeIn}
                  onChange={(e) => setCalcTimeIn(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Early arrivals before 9:00 AM (e.g. 8:30 AM) have <strong>₱0.00 late deduction</strong>.
                </p>
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Day Classification &amp; Holiday
                </label>
                <select
                  value={calcDayType}
                  onChange={(e) => setCalcDayType(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="regular">Regular Workday (1.0x Base, Straight OT, 9:00 AM start)</option>
                  <option value="rest_day">Sunday / Rest Day (1.30x Base, ZERO Late Penalty)</option>
                  <option value="perez_day">Nov 13: Speaker Perez Day (1.30x Special Non-Working, RA 6721)</option>
                  <option value="special_holiday">Special Non-Working Holiday (1.30x Premium)</option>
                  <option value="regular_holiday">Regular Holiday (Double Pay / 200%)</option>
                  <option value="special_working">Agew na Pangasinan (Apr 5 / 100% Regular)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {currentMult.note}
                </p>
              </div>

              {/* Lunch break toggle */}
              <div className="pt-2">
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
                  Elapsed hours minus 1 hr lunch so 9 AM to 6 PM equals 8 regular hours.
                </p>
              </div>
            </div>

            {/* Step-by-Step Breakdown */}
            <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Shift Step-by-Step Breakdown</span>
                <span className="text-blue-600">{currentMult.label}</span>
              </h3>

              {(isArrivalNormalized || isDepartureNormalized) && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5 text-emerald-800">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Normalized Schedule Applied:
                  </p>
                  <ul className="text-[11px] list-disc list-inside space-y-0.5 text-emerald-800">
                    {isArrivalNormalized && (
                      <li>Check-In: <strong>{calcTimeIn}</strong> → <strong>09:00 AM</strong> (morning arrival buffer).</li>
                    )}
                    {isDepartureNormalized && (
                      <li>Check-Out: <strong>{calcTimeOut}</strong> → <strong>{Math.floor(effectiveOutMinutes / 60)}:{String(effectiveOutMinutes % 60).padStart(2, '0')}</strong> (anti-OT exaggeration buffer).</li>
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
                  <span className="font-bold text-amber-700">-{effectiveLunchMins / 60} hr (60 mins)</span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Net Working Hours:</span>
                  <span className="font-bold text-slate-900">{totalWorkedHours.toFixed(2)} hrs</span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Regular Work Hours (Max 8h):</span>
                  <span className="font-bold text-slate-900">{regHours.toFixed(2)} hrs</span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Overtime Hours (&gt;8h):</span>
                  <span className="font-bold text-purple-700">+{otHours.toFixed(2)} hrs</span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Tardiness Past 9:00 AM:</span>
                  {isRestDay ? (
                    <span className="font-bold text-emerald-600">0m (Rest Day Flexible)</span>
                  ) : lateMinutes > 0 ? (
                    <span className="font-bold text-rose-600">{lateMinutes} mins late</span>
                  ) : (
                    <span className="font-bold text-emerald-600">On Time (0 mins)</span>
                  )}
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="text-slate-600">Late Deduction Math:</span>
                  {isRestDay ? (
                    <span className="font-bold text-emerald-600">₱0.00 (No Late on Sunday)</span>
                  ) : lateMinutes > 0 ? (
                    <span className="font-bold text-rose-600">
                      ({lateMinutes}m / 60) × ₱{hourlyRate.toFixed(2)} = -₱{tardinessDeduction.toFixed(2)}
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-600">₱0.00</span>
                  )}
                </div>
              </div>
            </div>

            {/* Shift Final Results Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white flex flex-col justify-between shadow-md">
              <div>
                <p className="text-xs uppercase font-bold text-indigo-300 tracking-wider">
                  Net Shift Compensation
                </p>
                <p className="text-4xl font-extrabold text-emerald-400 mt-2">
                  ₱{totalPay.toFixed(2)}
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Net earnings for this shift after holiday premiums, overtime, and late deductions.
                </p>
              </div>

              <div className="space-y-2 pt-4 border-t border-white/10 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Regular Base Pay ({regHours}h):</span>
                  <span className="font-semibold text-white">₱{regularPay.toFixed(2)}</span>
                </div>

                {holidayPremiumPay > 0 && (
                  <div className="flex justify-between text-amber-300 font-bold">
                    <span>Holiday / Rest Premium (+{Math.round((currentMult.base - 1) * 100)}%):</span>
                    <span>+₱{holidayPremiumPay.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-300">
                  <span>Overtime Pay ({otHours.toFixed(1)}h @ straight ₱{hourlyRate.toFixed(2)}):</span>
                  <span className="font-semibold text-purple-300">+₱{otPay.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>Late Deduction ({lateMinutes}m):</span>
                  <span className={`font-semibold ${tardinessDeduction > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {tardinessDeduction > 0 ? `-₱${tardinessDeduction.toFixed(2)}` : '₱0.00'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: CALCULATION MODES (EXACT VS NORMALIZED) */}
      {activeTab === 'modes' && (
        <div className="space-y-6">
          {/* Overview Hero Card */}
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-xs space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-200">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    Dual-Engine Timekeeping: Exact Biometrics vs Standard Normalized
                  </h2>
                  <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                    Choose between raw biometric audit logs or policy-normalized payroll computation that prevents overtime exaggeration.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Everywhere:</span>
                <span className="px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" /> DTR, Payroll &amp; Excel
                </span>
              </div>
            </div>

            {/* Two Modes Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Exact Biometrics */}
              <div className="p-6 rounded-2xl border-2 border-slate-200 bg-slate-50/50 hover:border-slate-300 transition-all space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                      <Clock className="w-4 h-4" />
                    </span>
                    <h3 className="font-bold text-slate-900 text-base">Exact Biometrics (Raw Real-Time)</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold text-[11px]">
                    Raw Hardware Logs
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Calculates every attendance punch and payroll minute strictly based on the exact timestamp recorded by the FingerTec TA500 biometric machine down to the second.
                </p>

                <div className="space-y-2 pt-2 border-t border-slate-200/80 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span><strong>Arrivals:</strong> Exact minute is logged. E.g., arriving at 8:36 AM logs 8:36 AM.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span><strong>Departures:</strong> Exact minute is logged. E.g., leaving at 6:18 PM logs 6:18 PM.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span><strong>Overtime:</strong> Every minute past 8 hours is credited as fractional overtime.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span><strong>Best for:</strong> Biometric dispute verification, hardware diagnostics, and strict forensic audit trails.</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Standard Normalized */}
              <div className="p-6 rounded-2xl border-2 border-indigo-500 bg-indigo-50/30 hover:border-indigo-600 transition-all space-y-4 relative shadow-sm">
                <div className="absolute top-4 right-4">
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold text-[11px] shadow-xs">
                    Recommended Policy
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-indigo-950 text-base">Standard Normalized (Shift Policy)</h3>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Applies standard company shift rules (9:00 AM – 6:00 PM) to eliminate accidental clock-out delays and prevent exaggerated overtime while preserving genuine overtime work.
                </p>

                <div className="space-y-2 pt-2 border-t border-indigo-200/60 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span><strong>Morning Buffer (8:00 AM – 9:05 AM):</strong> Standardized to <strong>9:00 AM</strong>. Early arrival does not grant false early OT, and 5-min grace avoids unfair tardiness.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span><strong>Departure Buffer (6:01 PM – 6:30 PM):</strong> Standardized to <strong>6:00 PM</strong>. Eliminates casual line delays and packing up from inflating payroll.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span><strong>Genuine Overtime (&gt; 6:30 PM):</strong> Credited in clean 30-minute blocks (e.g., 6:30 PM = 0.5h OT, 7:00 PM = 1.0h OT, 11:00 PM = 5.0h OT).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span><strong>Best for:</strong> Official payroll disbursement, clean manager reporting, and eliminating payroll disputes.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Side-by-Side Comparison Table */}
            <div className="pt-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Scale className="w-4 h-4 text-indigo-600" /> Policy Rules Comparison Table
              </h3>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold">
                      <th className="p-3 w-1/4">Scenario / Rule</th>
                      <th className="p-3 w-3/8 text-slate-700 bg-slate-50">Exact Biometrics (Raw)</th>
                      <th className="p-3 w-3/8 text-indigo-900 bg-indigo-50/60 font-black">Standard Normalized (Policy)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Arrival 8:00 AM – 9:05 AM</td>
                      <td className="p-3 text-slate-600 bg-slate-50">Raw time (e.g., 8:36 AM). Accumulates early elapsed time.</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">Normalized to 09:00 AM (0m late, 0 early false OT).</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Arrival after 9:05 AM</td>
                      <td className="p-3 text-slate-600 bg-slate-50">Raw arrival. Late penalty charged from 9:01 AM.</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">Raw arrival. Late penalty charged past 9:05 AM.</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Departure 6:01 PM – 6:30 PM</td>
                      <td className="p-3 text-slate-600 bg-slate-50">Raw departure (e.g., 6:18 PM). Generates fractional OT (+18m).</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">Normalized to 06:00 PM (0 OT, prevents incidental exaggeration).</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Genuine Overtime (&gt; 6:30 PM)</td>
                      <td className="p-3 text-slate-600 bg-slate-50">Exact minute OT (e.g., 7:14 PM = 1h 14m OT).</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">Clean 30-min blocks (e.g., 7:00 PM = 1.0h, 11:00 PM = 5.0h OT).</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Lunch Break (12:00 PM – 1:00 PM)</td>
                      <td className="p-3 text-slate-600 bg-slate-50">1 hour unpaid deduction when shift spans lunch window.</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">1 hour unpaid deduction when shift spans lunch window.</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">Sunday / Rest Day Work</td>
                      <td className="p-3 text-slate-600 bg-slate-50">+30% premium, zero late penalty, exact raw punches.</td>
                      <td className="p-3 text-indigo-900 bg-indigo-50/40 font-bold">+30% premium, zero late penalty, clean rounded shift hours.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Real-World Case Study: Dennis Ardiente */}
          <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 rounded-3xl p-6 md:p-8 text-white shadow-xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                ★
              </div>
              <div>
                <h3 className="text-lg font-black text-white">
                  Real-World Case Study: Dennis Ardiente (ID #1, Dagupan Main)
                </h3>
                <p className="text-xs text-indigo-200">
                  Live comparison showing how Standard Normalized prevents payroll inflation while honoring authentic overtime work.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Scenario 1: Casual Punch Delay */}
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">Scenario 1: Casual Punch Delay</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono text-[10px]">Regular Day</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Dennis punches in at <strong>8:36 AM</strong> and punches out at <strong>6:18 PM</strong> after chatting with coworkers and packing his gear.
                </p>
                <div className="space-y-1.5 pt-1 text-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-400">⏱️ Exact Biometrics Mode:</span>
                    <span className="font-semibold text-rose-300">Elapsed 9h 42m - 1h lunch = 8.7h (0.7h false OT)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">✨ Normalized Policy Mode:</span>
                    <span className="font-bold text-emerald-400">Normalized 9:00 AM – 6:00 PM = 8.0h (0.0h OT)</span>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-300/90 italic pt-1 border-t border-white/10">
                  Outcome: The company saves unintended overtime costs from line-waiting and packing up, while Dennis receives his full 8 hours of regular base pay without penalty.
                </p>
              </div>

              {/* Scenario 2: Genuine Authorized Overtime */}
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="font-bold text-emerald-300 uppercase tracking-wider text-[11px]">Scenario 2: Legitimate Overtime</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono text-[10px]">November 2 Shift</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Dennis punches in at <strong>8:40 AM</strong> and works late into the evening until <strong>11:00 PM</strong> for store inventory.
                </p>
                <div className="space-y-1.5 pt-1 text-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-400">⏱️ Exact Biometrics Mode:</span>
                    <span className="font-semibold text-slate-200">8:40 AM – 11:00 PM = 13.33h net (5.33h OT)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">✨ Normalized Policy Mode:</span>
                    <span className="font-bold text-emerald-400">9:00 AM – 11:00 PM = 13.0h net (8h reg + 5.0h OT)</span>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-300/90 italic pt-1 border-t border-white/10">
                  Outcome: Genuine authorized overtime is 100% credited in clean, round hours (5.0 hours of straight OT pay), fully compensating Dennis for his dedicated work.
                </p>
              </div>
            </div>
          </div>

          {/* How to Switch & Storage Persistence */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> How to Switch Modes &amp; System Integration
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600" /> 1. One-Click Switcher
                </span>
                <p>
                  Switch anytime using the top calculation toggle in both <strong>DTR Reports</strong> and <strong>Payroll &amp; Salary</strong>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" /> 2. Persistent Memory
                </span>
                <p>
                  Your selection is automatically stored in browser local storage and stays synced across pages and browser reloads.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" /> 3. Excel &amp; CSV Export
                </span>
                <p>
                  Generated Excel payroll sheets dynamically adapt to the active mode and print a formal badge in the report header.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LATE DEDUCTION FORMULA */}
      {activeTab === 'late' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Official Late &amp; Tardiness Deduction Equation</h2>
                <p className="text-xs text-slate-500">
                  Strictly derived from the employee&apos;s hourly rate with exact pro-rata proportionality.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 1. Office Cutoff: 9:00 AM
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Official shift begins at <strong>9:00 AM</strong>. Punches at or before 9:00 AM (such as 8:15 AM, 8:30 AM, or 8:59 AM) are classified as <strong>On Time</strong> and incur <strong>₱0.00 deduction</strong>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600" /> 2. Full Hour Late
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  When an employee reaches 1 full hour late (60 mins), the deduction equals exactly <strong>1 × Hourly Rate</strong>.
                  <br />
                  <code className="text-[11px] bg-slate-200 px-1 py-0.5 rounded font-bold text-slate-800">
                    Deduction = Hours Late × Hourly Rate
                  </code>
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-purple-600" /> 3. Under 1 Hour Late (Pro-Rata)
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  When tardiness is under 1 hour (&lt;60 mins), deduction is computed proportionally as a fraction of their hourly rate:
                  <br />
                  <code className="text-[11px] bg-purple-100 px-1 py-0.5 rounded font-bold text-purple-900">
                    Deduction = (Late Minutes / 60) × Hourly Rate
                  </code>
                </p>
              </div>
            </div>

            {/* Quick Reference Table Matrix */}
            <div className="pt-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Quick Reference Matrix: Late Deduction by Duration &amp; Daily Rate
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-left font-bold text-slate-700">
                      <th className="px-4 py-3">Minutes Late</th>
                      <th className="px-4 py-3">Proportional Math</th>
                      <th className="px-4 py-3 text-right">₱400 Daily (₱50.00/hr)</th>
                      <th className="px-4 py-3 text-right">₱420 Daily (₱52.50/hr)</th>
                      <th className="px-4 py-3 text-right">₱500 Daily (₱62.50/hr)</th>
                      <th className="px-4 py-3 text-right">₱550 Daily (₱68.75/hr)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-slate-900">5 minutes late</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono">(5 / 60) × Hourly</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱4.17</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱4.38</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱5.21</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱5.73</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-slate-900">10 minutes late</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono">(10 / 60) × Hourly</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱8.33</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱8.75</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱10.42</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱11.46</td>
                    </tr>
                    <tr className="hover:bg-slate-50 bg-amber-50/30">
                      <td className="px-4 py-2.5 font-bold text-slate-900">15 minutes late (1/4 hr)</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono">0.25 × Hourly</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱12.50</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱13.13</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱15.63</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱17.19</td>
                    </tr>
                    <tr className="hover:bg-slate-50 bg-amber-50/30">
                      <td className="px-4 py-2.5 font-bold text-slate-900">30 minutes late (1/2 hr)</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono">0.50 × Hourly</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱25.00</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱26.25</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱31.25</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱34.38</td>
                    </tr>
                    <tr className="hover:bg-slate-50 bg-amber-50/30">
                      <td className="px-4 py-2.5 font-bold text-slate-900">45 minutes late (3/4 hr)</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono">0.75 × Hourly</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱37.50</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱39.38</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱46.88</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱51.56</td>
                    </tr>
                    <tr className="hover:bg-slate-50 bg-rose-50/40">
                      <td className="px-4 py-2.5 font-bold text-slate-900">60 minutes late (1 full hr)</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono">1.00 × Hourly</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱50.00</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱52.50</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱62.50</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱68.75</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-slate-900">107 minutes late (e.g. Barbara Nov 6)</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono">(107 / 60) × Hourly</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱89.17</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱93.63</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱111.46</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">-₱122.60</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OVERTIME & LUNCH BREAK */}
      {activeTab === 'ot' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Overtime &amp; Lunch Break Rules</h2>
                <p className="text-xs text-slate-500">
                  Straight hourly rate calculation and automatic 1-hour midday lunch exclusion.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2">
                <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-amber-600" /> 12:00 PM – 1:00 PM Unpaid Lunch Break
                </h3>
                <p className="text-xs text-amber-950 leading-relaxed">
                  Under Philippine Labor Code (Article 85), meal periods of not less than 60 minutes are non-compensable.
                  The system automatically deducts 1 hour for shifts spanning midday so that a standard <strong>9:00 AM to 6:00 PM shift</strong> is computed as:
                </p>
                <div className="p-2.5 rounded-xl bg-white border border-amber-200 text-xs font-mono text-amber-900">
                  9 elapsed hours - 1 hour lunch = 8 regular working hours (₱0.00 overtime)
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-2">
                <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-600" /> Straight Overtime Rate Rule
                </h3>
                <p className="text-xs text-purple-950 leading-relaxed">
                  Overtime pay is computed directly using the employee&apos;s standard hourly rate for each eligible overtime hour rendered beyond the 8 regular working hours:
                </p>
                <div className="p-2.5 rounded-xl bg-white border border-purple-200 text-xs font-mono text-purple-900">
                  Overtime Pay = Overtime Hours × Hourly Rate
                </div>
                <p className="text-[11px] text-purple-700">
                  Example: 2 hours OT for an employee with ₱50.00/hr = <strong>₱100.00</strong> OT Pay.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PANGASINAN & DOLE HOLIDAYS */}
      {activeTab === 'holidays' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Philippine &amp; Pangasinan Provincial Holiday Regulations
                </h2>
                <p className="text-xs text-slate-500">
                  Official statutory rates and Republic Acts governing Pangasinan and National holidays.
                </p>
              </div>
            </div>

            {/* Special Callout: Perez Day */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300 space-y-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-bold text-[10px] uppercase tracking-wider">
                Provincial Law • Republic Act No. 6721
              </span>
              <h3 className="text-sm font-bold text-amber-950">
                November 13: Speaker Eugenio Perez Day (Pangasinan Special Non-Working Holiday)
              </h3>
              <p className="text-xs text-amber-900 leading-relaxed">
                November 13 is officially designated as <strong>Speaker Eugenio Perez Day</strong> in the Province of Pangasinan by virtue of <strong>Republic Act No. 6721</strong>.
                As a Special Non-Working Holiday, employees who work receive a <strong>+30% Premium (130% total daily rate)</strong>, <em>not double pay</em>. Double pay (200%) is reserved exclusively for Regular Holidays under DOLE rules.
              </p>
            </div>

            {/* Statutory Table */}
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-left font-bold text-slate-700">
                    <th className="px-4 py-3">Classification</th>
                    <th className="px-4 py-3 text-center">Daily Rate Multiplier</th>
                    <th className="px-4 py-3">Jurisdiction &amp; Example Dates</th>
                    <th className="px-4 py-3">Legal Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">Regular Holiday (Double Pay)</td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-700">200% (2.0x)</td>
                    <td className="px-4 py-3 text-slate-600">
                      New Year&apos;s Day (Jan 1), Maundy Thursday, Good Friday, Araw ng Kagitingan (Apr 9), Labor Day (May 1), Independence Day (Jun 12), National Heroes Day, Bonifacio Day (Nov 30), Christmas Day (Dec 25), Rizal Day (Dec 30)
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">Article 94, Labor Code</td>
                  </tr>

                  <tr className="hover:bg-slate-50 bg-amber-50/20">
                    <td className="px-4 py-3 font-bold text-slate-900">Speaker Eugenio Perez Day (Nov 13)</td>
                    <td className="px-4 py-3 text-center font-bold text-amber-700">130% (1.30x)</td>
                    <td className="px-4 py-3 text-slate-600">
                      Province of Pangasinan (Annual birth anniversary of Speaker Eugenio Perez)
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">Republic Act No. 6721</td>
                  </tr>

                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">Special Non-Working Holiday</td>
                    <td className="px-4 py-3 text-center font-bold text-amber-700">130% (1.30x)</td>
                    <td className="px-4 py-3 text-slate-600">
                      All Saints&apos; Day (Nov 1), All Souls&apos; Day (Nov 2), Ninoy Aquino Day (Aug 21), Feast of Immaculate Conception (Dec 8), Last Day of the Year (Dec 31)
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">Article 93, Labor Code</td>
                  </tr>

                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">Pangasinan Veterans &amp; Gulf Landing (Jan 9)</td>
                    <td className="px-4 py-3 text-center font-bold text-amber-700">130% (1.30x)</td>
                    <td className="px-4 py-3 text-slate-600">
                      Province of Pangasinan (Lingayen Gulf Landing &amp; Veterans Day)
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">Provincial Proclamation</td>
                  </tr>

                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">Agew na Pangasinan / Pangasinan Day (Apr 5)</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">100% (1.00x)</td>
                    <td className="px-4 py-3 text-slate-600">
                      Special Working Holiday in Pangasinan. Regular 100% daily rate applies.
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">Republic Act No. 11374</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="pt-2 text-right">
              <Link
                href="/calendar"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Open Google Calendar View with Pangasinan Holidays
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SUNDAY & REST DAY POLICY */}
      {activeTab === 'sunday' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Sunday &amp; Scheduled Rest Day Policies</h2>
                <p className="text-xs text-slate-500">
                  Flexible work arrangements with 0 late penalties and +30% premium pay.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> ZERO Late Penalty on Sunday
                </h3>
                <p className="text-xs text-emerald-950 leading-relaxed">
                  Since Sunday is the official scheduled rest day, staff have <strong>flexible reporting hours</strong>. They are free to come in at whatever time is necessary.
                  <br /><br />
                  <strong>Tardiness minutes and late deductions on Sunday are strictly ₱0.00</strong>. Staff are never penalized for reporting after 9:00 AM on a rest day.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-600" /> +30% Premium on Hours Worked
                </h3>
                <p className="text-xs text-blue-950 leading-relaxed">
                  Pursuant to Article 93 of the Philippine Labor Code, all actual hours worked on Sunday or an employee&apos;s designated rest day are credited with a <strong>1.30× (+30%) rate</strong>:
                </p>
                <div className="p-2.5 rounded-xl bg-white border border-blue-200 text-xs font-mono text-blue-900">
                  Sunday Pay = (Hours Worked / 8) × Daily Rate × 1.30
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: BRANCH OPERATIONS */}
      {activeTab === 'branches' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Branch Operations &amp; Work Schedules</h2>
                <p className="text-xs text-slate-500">
                  Branch-specific staffing structures, work weeks, and reporting separations.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Lingayen */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Lingayen, Pangasinan (Main Office)</h3>
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[10px]">Headquarters</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                  <li><strong>Regular Staff:</strong> Monday to Saturday schedule (Sunday Rest Day).</li>
                  <li><strong>IT Administrator (Gain Carlo G. Cayabyab):</strong> Monday to Friday schedule (Saturday &amp; Sunday Rest Days).</li>
                  <li><strong>Local Holidays:</strong> Eligible for Pangasinan provincial holidays (RA 6721 Nov 13, RA 11374 Apr 5, Jan 9 Veterans Day).</li>
                </ul>
              </div>

              {/* Manila */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Manila Branch</h3>
                  <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[10px]">Satellite Branch</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                  <li><strong>Assigned Staff:</strong> Marie Stefi S. Costales, Barbara Ellaine S. Costales, Jocelyn Luteria.</li>
                  <li><strong>Schedule:</strong> Monday to Saturday schedule (Sunday Rest Day).</li>
                  <li><strong>Reporting:</strong> Separated with clear space and dedicated header in DTR Reports and Payroll Computation tables.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MASTER GROSS SALARY EQUATION SUMMARY */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-lg space-y-4">
        <div className="flex items-center gap-2.5">
          <Scale className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold">Master Take-Home / Gross Salary Formula</h2>
        </div>
        <div className="p-4 rounded-2xl bg-slate-800/90 border border-slate-700 font-mono text-xs text-emerald-300 leading-relaxed overflow-x-auto">
          Gross Salary = Regular Pay + Holiday Premium Pay + Overtime Pay + Night Diff Pay - Late Deduction
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          All computations are performed in full floating-point precision and rounded to the nearest cent (2 decimal places) at the final pay step to eliminate compounding round-off errors.
        </p>
      </div>
    </div>
  )
}
