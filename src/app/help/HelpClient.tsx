'use client'

import { useState } from 'react'
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
} from 'lucide-react'

export function HelpClient() {
  // Interactive Calculator State
  const [calcDailyRate, setCalcDailyRate] = useState<number>(550)
  const [calcTimeIn, setCalcTimeIn] = useState<string>('09:20')
  const [calcTimeOut, setCalcTimeOut] = useState<string>('20:00')
  const [calcDayType, setCalcDayType] = useState<string>('regular')

  // Live Math
  const hourlyRate = Math.round((calcDailyRate / 8) * 100) / 100
  const minuteRate = hourlyRate / 60

  // Late computation (Office start: 09:00 AM)
  const [inH, inM] = calcTimeIn.split(':').map(Number)
  const checkInMinutes = inH * 60 + inM
  const officeStartMinutes = 9 * 60 // 09:00 AM
  const lateMinutes = Math.max(0, checkInMinutes - officeStartMinutes)
  const tardinessDeduction = Math.round(lateMinutes * minuteRate * 100) / 100

  // Hours computation
  const [outH, outM] = calcTimeOut.split(':').map(Number)
  let checkOutMinutes = outH * 60 + outM
  if (checkOutMinutes < checkInMinutes) {
    // overnight
    checkOutMinutes += 24 * 60
  }
  const totalWorkedMinutes = Math.max(0, checkOutMinutes - checkInMinutes)
  const totalHours = Math.round((totalWorkedMinutes / 60) * 100) / 100
  const regHours = Math.min(8, totalHours)
  const otHours = Math.max(0, totalHours - 8)

  // Multiplier mapping
  const multipliers: Record<string, { base: number; ot: number; name: string }> = {
    regular: { base: 1.0, ot: 1.25, name: 'Regular Workday' },
    rest_day: { base: 1.3, ot: 1.69, name: 'Scheduled Rest Day' },
    special_holiday: { base: 1.3, ot: 1.69, name: 'Special Non-Working Holiday' },
    regular_holiday: { base: 2.0, ot: 2.6, name: 'Regular Holiday (Double Pay)' },
  }
  const currentMult = multipliers[calcDayType] || multipliers.regular

  const regPay = Math.round(regHours * hourlyRate * currentMult.base * 100) / 100
  const otPay = Math.round(otHours * hourlyRate * currentMult.ot * 100) / 100
  const totalPay = Math.max(0, Math.round((regPay + otPay - tardinessDeduction) * 100) / 100)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold text-white">
            <Scale className="w-3.5 h-3.5" />
            Official Philippine DOLE Labor Standards &amp; Equation Reference
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Payroll &amp; Attendance Computation Knowledge Base
          </h1>
          <p className="text-sm text-blue-100 leading-relaxed">
            Detailed transparency on how your Daily Time Record (DTR), late deductions, overtime
            multipliers, holiday premiums, and take-home pay are mathematically computed.
          </p>
        </div>
      </div>

      {/* Grid of 4 Key Formula Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Hourly & Minute Rate */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">1. Hourly &amp; Minute Rate</h3>
          <p className="text-xs text-slate-500">Based on standard 8-hour working day:</p>
          <div className="p-2.5 rounded-xl bg-slate-50 font-mono text-xs text-slate-800 space-y-1">
            <p>Hourly = Daily ÷ 8</p>
            <p>Minute = Hourly ÷ 60</p>
          </div>
        </div>

        {/* Card 2: Late Deduction */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">2. Late Deduction</h3>
          <p className="text-xs text-slate-500">Office hours: 9:00 AM to 6:00 PM:</p>
          <div className="p-2.5 rounded-xl bg-slate-50 font-mono text-xs text-slate-800 space-y-1">
            <p>Late Mins = In - 9:00 AM</p>
            <p>Deduction = Mins × Minute Rate</p>
          </div>
        </div>

        {/* Card 3: Overtime Premium */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">3. Overtime Multipliers</h3>
          <p className="text-xs text-slate-500">Hours worked past 8 hours:</p>
          <div className="p-2.5 rounded-xl bg-slate-50 font-mono text-xs text-slate-800 space-y-1">
            <p>Regular OT = Hourly × 1.25</p>
            <p>Rest Day OT = Hourly × 1.69</p>
          </div>
        </div>

        {/* Card 4: Holiday & Night Diff */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Moon className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">4. Holiday &amp; Night Diff</h3>
          <p className="text-xs text-slate-500">DOLE statutory holiday rates:</p>
          <div className="p-2.5 rounded-xl bg-slate-50 font-mono text-xs text-slate-800 space-y-1">
            <p>Regular Holiday = 200%</p>
            <p>Night (10PM-6AM) = +10%</p>
          </div>
        </div>
      </div>

      {/* Interactive Simulator Section */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Interactive Salary &amp; Late Calculator</h2>
              <p className="text-xs text-slate-500">Test any punch times and rates to audit the exact equations in real-time.</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
            Live Math Engine
          </span>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
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
              <p className="text-[11px] text-slate-400 mt-1">
                Hourly: ₱{hourlyRate.toFixed(2)}/hr • Minute: ₱{minuteRate.toFixed(4)}/min
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Time In (Office Starts at 09:00 AM)
              </label>
              <input
                type="time"
                value={calcTimeIn}
                onChange={(e) => setCalcTimeIn(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Early arrivals before 9:00 AM are NOT penalized.
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
                Day Classification
              </label>
              <select
                value={calcDayType}
                onChange={(e) => setCalcDayType(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="regular">Regular Workday (1.0x Base, 1.25x OT)</option>
                <option value="rest_day">Rest Day (1.30x Base, 1.69x OT)</option>
                <option value="special_holiday">Special Non-Working Holiday (1.30x Base)</option>
                <option value="regular_holiday">Regular Holiday (Double Pay / 2.0x Base)</option>
              </select>
            </div>
          </div>

          {/* Breakdown Steps */}
          <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Step-by-Step Calculation
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-600">Total Hours Worked:</span>
                <span className="font-bold text-slate-900">{totalHours.toFixed(2)} hrs</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-600">Regular Working Hours (Max 8h):</span>
                <span className="font-bold text-slate-900">{regHours.toFixed(2)} hrs</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-600">Overtime Hours (&gt;8h):</span>
                <span className="font-bold text-purple-700">+{otHours.toFixed(2)} hrs</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-600">Tardiness (Mins past 9:00 AM):</span>
                <span className="font-bold text-rose-600">{lateMinutes} mins late</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-600">Tardiness Deduction:</span>
                <span className="font-bold text-rose-600">-₱{tardinessDeduction.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Final Results Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white flex flex-col justify-between shadow-md">
            <div>
              <p className="text-xs uppercase font-bold text-indigo-300 tracking-wider">
                Computed Shift Take-Home
              </p>
              <p className="text-4xl font-extrabold text-emerald-400 mt-2">
                ₱{totalPay.toFixed(2)}
              </p>
              <p className="text-xs text-slate-300 mt-1">
                Net pay after OT and late deductions for this day
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-white/10 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Base Pay ({regHours}h @ {currentMult.base}x):</span>
                <span className="font-semibold text-white">₱{regPay.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Overtime Pay ({otHours}h @ {currentMult.ot}x):</span>
                <span className="font-semibold text-purple-300">+₱{otPay.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Late Deduction ({lateMinutes}m):</span>
                <span className="font-semibold text-rose-300">-₱{tardinessDeduction.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Official DOLE Statutory Multipliers Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">
              Philippine DOLE Statutory Labor Rates (Republic Act &amp; Labor Code)
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-left font-semibold text-slate-600">
                <th className="px-5 py-3.5">Workday Classification</th>
                <th className="px-5 py-3.5 text-center">Regular Hours (1st 8h)</th>
                <th className="px-5 py-3.5 text-center">Overtime Rate (&gt;8h)</th>
                <th className="px-5 py-3.5">Philippine Labor Code Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-bold text-slate-900">Regular Workday</td>
                <td className="px-5 py-3.5 text-center font-bold text-slate-700">100% (1.00x)</td>
                <td className="px-5 py-3.5 text-center font-bold text-purple-700">125% (1.25x)</td>
                <td className="px-5 py-3.5 text-slate-500">Article 87, Labor Code</td>
              </tr>
              <tr className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-bold text-slate-900">Scheduled Rest Day</td>
                <td className="px-5 py-3.5 text-center font-bold text-slate-700">130% (1.30x)</td>
                <td className="px-5 py-3.5 text-center font-bold text-purple-700">169% (1.69x)</td>
                <td className="px-5 py-3.5 text-slate-500">Article 93, Labor Code</td>
              </tr>
              <tr className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-bold text-slate-900">Special Non-Working Holiday</td>
                <td className="px-5 py-3.5 text-center font-bold text-slate-700">130% (1.30x)</td>
                <td className="px-5 py-3.5 text-center font-bold text-purple-700">169% (1.69x)</td>
                <td className="px-5 py-3.5 text-slate-500">Article 93, Labor Code</td>
              </tr>
              <tr className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-bold text-slate-900">Special Holiday on Rest Day</td>
                <td className="px-5 py-3.5 text-center font-bold text-slate-700">150% (1.50x)</td>
                <td className="px-5 py-3.5 text-center font-bold text-purple-700">195% (1.95x)</td>
                <td className="px-5 py-3.5 text-slate-500">Article 93, Labor Code</td>
              </tr>
              <tr className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-bold text-slate-900">Regular Holiday (Double Pay)</td>
                <td className="px-5 py-3.5 text-center font-bold text-slate-700">200% (2.00x)</td>
                <td className="px-5 py-3.5 text-center font-bold text-purple-700">260% (2.60x)</td>
                <td className="px-5 py-3.5 text-slate-500">Article 94, Labor Code</td>
              </tr>
              <tr className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-bold text-slate-900">Regular Holiday on Rest Day</td>
                <td className="px-5 py-3.5 text-center font-bold text-slate-700">260% (2.60x)</td>
                <td className="px-5 py-3.5 text-center font-bold text-purple-700">338% (3.38x)</td>
                <td className="px-5 py-3.5 text-slate-500">Article 94, Labor Code</td>
              </tr>
              <tr className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-bold text-slate-900">Night Shift Differential (10PM - 6AM)</td>
                <td className="px-5 py-3.5 text-center font-bold text-slate-700">+10% of hourly rate</td>
                <td className="px-5 py-3.5 text-center font-bold text-purple-700">+10% on OT rate</td>
                <td className="px-5 py-3.5 text-slate-500">Article 86, Labor Code</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
