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
  const [calcTimeIn, setCalcTimeIn] = useState<string>('09:15')
  const [calcTimeOut, setCalcTimeOut] = useState<string>('18:00')
  const [calcDayType, setCalcDayType] = useState<string>('regular')
  const [hasLunchBreak, setHasLunchBreak] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<'calculator' | 'late' | 'ot' | 'holidays' | 'sunday' | 'branches'>('calculator')

  // Live Math
  const hourlyRate = Math.round((calcDailyRate / 8) * 100) / 100
  const minuteRate = hourlyRate / 60

  // Late computation (Office start: 09:00 AM)
  const isRestDay = calcDayType === 'rest_day' || calcDayType === 'special_holiday_rest' || calcDayType === 'regular_holiday_rest'
  const [inH, inM] = calcTimeIn.split(':').map(Number)
  const checkInMinutes = inH * 60 + inM
  const officeStartMinutes = 9 * 60 // 09:00 AM
  
  // Early arrivals before 9:00 AM are NOT penalized
  const lateMinutes = isRestDay ? 0 : Math.max(0, checkInMinutes - officeStartMinutes)
  
  // Late deduction: strictly proportional to hourly rate
  // If under an hour: (lateMinutes / 60) * hourlyRate
  // If >= 1 hour: (lateMinutes / 60) * hourlyRate
  const tardinessDeduction = isRestDay
    ? 0
    : Math.round(((lateMinutes / 60) * hourlyRate) * 100) / 100

  // Hours computation
  const [outH, outM] = calcTimeOut.split(':').map(Number)
  let checkOutMinutes = outH * 60 + outM
  if (checkOutMinutes < checkInMinutes) {
    // overnight shift
    checkOutMinutes += 24 * 60
  }
  const elapsedMinutes = Math.max(0, checkOutMinutes - checkInMinutes)
  
  // Lunch break deduction (12:00 PM to 1:00 PM = 60 mins)
  // Deduct 1 hr lunch if shift covers lunch window and option is active
  let effectiveLunchMins = 0
  if (hasLunchBreak && elapsedMinutes >= 300) {
    // Shift is at least 5 hours and spans midday
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
