'use client'

import { useState, useEffect, useMemo } from 'react'
import type { EmployeePayrollSummary, DailyPayrollRecord } from '@/types/database'
import { format } from 'date-fns'
import {
  Calculator,
  Download,
  Calendar,
  Filter,
  DollarSign,
  Clock,
  Moon,
  TrendingUp,
  Settings2,
  ChevronRight,
  X,
  Edit2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Search,
  Sparkles,
  Info,
  CalendarDays,
  User,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'

interface PayrollClientProps {
  branches: string[]
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-pink-600',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i)
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount || 0)
}

function formatHours(hours: number): string {
  if (!hours || hours <= 0) return '—'
  return `${hours.toFixed(1)}h`
}

function formatTime(ts: string | null) {
  if (!ts) return '—'
  try {
    return format(new Date(ts), 'hh:mm aa')
  } catch {
    return ts
  }
}

export function PayrollClient({ branches }: PayrollClientProps) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()

  // Default to full current month
  const [startDate, setStartDate] = useState(`${year}-${month}-01`)
  const [endDate, setEndDate] = useState(`${year}-${month}-${String(lastDay).padStart(2, '0')}`)
  const [branchFilter, setBranchFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // State
  const [loading, setLoading] = useState(false)
  const [payrollData, setPayrollData] = useState<{
    totals: Record<string, number>
    employees: EmployeePayrollSummary[]
  } | null>(null)

  // Modals
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeePayrollSummary | null>(null)
  const [rateModalOpen, setRateModalOpen] = useState(false)
  const [rateTarget, setRateTarget] = useState<{
    id: string
    name: string
    dailyRate: number
    hourlyRate: number
    scheduleType: 'mon_sat' | 'mon_fri'
  } | null>(null)
  const [newDailyRate, setNewDailyRate] = useState<number>(550)
  const [newHourlyRate, setNewHourlyRate] = useState<number>(68.75)
  const [newScheduleType, setNewScheduleType] = useState<'mon_sat' | 'mon_fri'>('mon_sat')
  const [savingRate, setSavingRate] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Preset Handlers
  const handlePreset = (preset: 'first_half' | 'second_half' | 'full_month') => {
    if (preset === 'first_half') {
      setStartDate(`${year}-${month}-01`)
      setEndDate(`${year}-${month}-15`)
    } else if (preset === 'second_half') {
      setStartDate(`${year}-${month}-16`)
      setEndDate(`${year}-${month}-${String(lastDay).padStart(2, '0')}`)
    } else {
      setStartDate(`${year}-${month}-01`)
      setEndDate(`${year}-${month}-${String(lastDay).padStart(2, '0')}`)
    }
  }

  // Fetch Payroll Data
  const fetchPayroll = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      })
      if (branchFilter) params.append('branch', branchFilter)

      const res = await fetch(`/api/payroll/compute?${params.toString()}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setPayrollData({
        totals: json.totals,
        employees: json.employees,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error computing payroll'
      setToast({ message: msg, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPayroll()
  }, [startDate, endDate, branchFilter])

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    if (!payrollData?.employees) return []
    return payrollData.employees.filter((emp) => {
      if (searchQuery.trim() === '') return true
      const q = searchQuery.toLowerCase()
      return (
        emp.employee_name.toLowerCase().includes(q) ||
        emp.device_user_id.toLowerCase().includes(q) ||
        (emp.position && emp.position.toLowerCase().includes(q))
      )
    })
  }, [payrollData, searchQuery])

  // Handle daily rate input change in modal
  const handleDailyRateChange = (val: number) => {
    setNewDailyRate(val)
    setNewHourlyRate(Math.round((val / 8) * 100) / 100)
  }

  // Save Daily Rate & Compensation
  const handleSaveRate = async () => {
    if (!rateTarget) return
    setSavingRate(true)
    try {
      const res = await fetch('/api/payroll/compensation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_user_id: rateTarget.id,
          daily_rate: newDailyRate,
          hourly_rate: newHourlyRate,
          schedule_type: newScheduleType,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)

      setToast({ message: `Updated compensation for ${rateTarget.name}!`, type: 'success' })
      setRateModalOpen(false)
      fetchPayroll() // recalculate immediately
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating rate'
      setToast({ message: msg, type: 'error' })
    } finally {
      setSavingRate(false)
    }
  }

  // Download Excel
  const handleDownloadExcel = () => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    })
    if (branchFilter) params.append('branch', branchFilter)
    window.open(`/api/reports/excel?${params.toString()}`, '_blank')
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-slate-600 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Payroll &amp; Salary Computation</h1>
              <p className="text-xs text-slate-500">Official Philippine DOLE labor standard calculation (9:00 AM–6:00 PM shift)</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Payroll Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Gross Payroll</p>
            <p className="text-2xl font-black text-emerald-700 mt-0.5">
              {formatCurrency(payrollData?.totals?.total_gross_pay || 0)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {payrollData?.totals?.active_employees || 0} employees active
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Regular Work Pay</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">
              {formatCurrency(payrollData?.totals?.total_regular_pay || 0)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {payrollData?.totals?.total_regular_hours?.toFixed(1) || 0} total regular hrs
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overtime Pay (+25%)</p>
            <p className="text-2xl font-black text-purple-700 mt-0.5">
              {formatCurrency(payrollData?.totals?.total_overtime_pay || 0)}
            </p>
            <p className="text-xs text-purple-500 font-semibold mt-0.5">
              {payrollData?.totals?.total_overtime_hours?.toFixed(1) || 0} OT hours
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Late Deductions</p>
            <p className="text-2xl font-black text-rose-600 mt-0.5">
              -{formatCurrency(payrollData?.totals?.total_tardiness_deduction || 0)}
            </p>
            <p className="text-xs text-rose-400 font-semibold mt-0.5">
              {payrollData?.totals?.total_tardiness_minutes || 0} total minutes late
            </p>
          </div>
        </div>
      </div>

      {/* Control Bar: Period Presets & Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Period Selection */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
            Cutoff Period:
          </span>
          <button
            onClick={() => handlePreset('first_half')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              startDate.endsWith('-01') && endDate.endsWith('-15')
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            1st Half (1st–15th)
          </button>
          <button
            onClick={() => handlePreset('second_half')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              startDate.endsWith('-16')
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            2nd Half (16th–End)
          </button>
          <button
            onClick={() => handlePreset('full_month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              startDate.endsWith('-01') && !endDate.endsWith('-15')
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Full Month
          </button>

          <div className="flex items-center gap-2 ml-2 border-l border-slate-200 pl-3">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 bg-slate-50 font-medium"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 bg-slate-50 font-medium"
            />
          </div>
        </div>

        {/* Search & Branch filter */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl pl-9 pr-3 py-2 w-56 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {branches.length > 1 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 font-medium"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Salary Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">Payroll Computation Sheet</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-100">
              {filteredEmployees.length} Employees
            </span>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Standard: 9:00 AM – 6:00 PM · Late deduction starts 9:01 AM
          </span>
        </div>

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400">
            <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-bold text-slate-600">Computing DOLE Labor Standard Payroll...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400">
            <Calculator className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-600">No payroll records found for this period.</p>
            <p className="text-xs text-slate-400 mt-1">Check selected date range or ensure employee punches are synced.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Employee Name</th>
                  <th className="px-4 py-3.5 text-center">Schedule</th>
                  <th className="px-4 py-3.5 text-right">Daily Rate</th>
                  <th className="px-4 py-3.5 text-right">Hourly Rate</th>
                  <th className="px-4 py-3.5 text-center">Days Worked</th>
                  <th className="px-4 py-3.5 text-right">Regular Pay</th>
                  <th className="px-4 py-3.5 text-right">OT Pay</th>
                  <th className="px-4 py-3.5 text-right">Night Diff</th>
                  <th className="px-4 py-3.5 text-right">Late Deduction</th>
                  <th className="px-4 py-3.5 text-right font-black text-slate-900">Gross Salary</th>
                  <th className="px-4 py-3.5 text-center">Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const gradient = getAvatarColor(emp.employee_name)
                  const initials = getInitials(emp.employee_name)
                  const isMonFri = emp.schedule_type === 'mon_fri' || emp.employee_name.includes('GAIN CARLO')
                  const hourly = emp.hourly_rate || Math.round((emp.daily_rate / 8) * 100) / 100

                  return (
                    <tr
                      key={emp.device_user_id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Employee Info */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-black shadow-xs flex-shrink-0`}>
                            {initials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 leading-tight">{emp.employee_name}</p>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">
                              ID: #{emp.device_user_id} • {emp.branch || 'JAPA Main'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Work Schedule Badge */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                            isMonFri
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {isMonFri ? 'Mon–Fri' : 'Mon–Sat'}
                        </span>
                      </td>

                      {/* Daily Rate with Edit Button */}
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => {
                            setRateTarget({
                              id: emp.device_user_id,
                              name: emp.employee_name,
                              dailyRate: emp.daily_rate,
                              hourlyRate: hourly,
                              scheduleType: isMonFri ? 'mon_fri' : 'mon_sat',
                            })
                            setNewDailyRate(emp.daily_rate)
                            setNewHourlyRate(hourly)
                            setNewScheduleType(isMonFri ? 'mon_fri' : 'mon_sat')
                            setRateModalOpen(true)
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 text-xs font-bold text-slate-700 hover:text-blue-700 transition-colors group"
                          title="Click to edit compensation"
                        >
                          <span>₱{emp.daily_rate.toFixed(2)}</span>
                          <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-blue-600" />
                        </button>
                      </td>

                      {/* Hourly Rate */}
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold text-slate-600">
                        ₱{hourly.toFixed(2)}/hr
                      </td>

                      {/* Days Worked */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          {emp.days_worked} days
                        </span>
                      </td>

                      {/* Regular Pay */}
                      <td className="px-4 py-3.5 text-right text-slate-800 font-semibold">
                        {formatCurrency(emp.total_regular_pay)}
                        <p className="text-[11px] text-slate-400 font-mono">{emp.total_regular_hours.toFixed(1)}h</p>
                      </td>

                      {/* OT Pay */}
                      <td className="px-4 py-3.5 text-right text-purple-700 font-semibold">
                        {emp.total_overtime_pay > 0 ? (
                          <>
                            {formatCurrency(emp.total_overtime_pay)}
                            <p className="text-[11px] text-purple-400 font-mono">+{emp.total_overtime_hours.toFixed(1)}h</p>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Night Diff Pay */}
                      <td className="px-4 py-3.5 text-right text-indigo-700 font-semibold">
                        {emp.total_night_diff_pay > 0 ? (
                          <>
                            {formatCurrency(emp.total_night_diff_pay)}
                            <p className="text-[11px] text-indigo-400 font-mono">{emp.total_night_diff_hours.toFixed(1)}h</p>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Late Deduction */}
                      <td className="px-4 py-3.5 text-right text-rose-600 font-semibold">
                        {emp.total_tardiness_deduction > 0 ? (
                          <>
                            -{formatCurrency(emp.total_tardiness_deduction)}
                            <p className="text-[11px] text-rose-400 font-mono">{emp.total_tardiness_minutes}m late</p>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Gross Salary */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100">
                          {formatCurrency(emp.gross_pay)}
                        </span>
                      </td>

                      {/* Action Breakdown */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => setSelectedEmployee(emp)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors"
                        >
                          View
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Compensation Modal */}
      {rateModalOpen && rateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Edit Employee Compensation</h3>
                <p className="text-xs text-slate-400 mt-0.5">Rates used for DOLE labor calculations</p>
              </div>
              <button
                onClick={() => setRateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                {getInitials(rateTarget.name)}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{rateTarget.name}</p>
                <p className="text-xs text-slate-400 font-mono">Device User ID: #{rateTarget.id}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Daily Rate (PHP ₱)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    value={newDailyRate}
                    onChange={(e) => handleDailyRateChange(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Hourly Rate (₱/hr)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    value={newHourlyRate}
                    onChange={(e) => setNewHourlyRate(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Minute rate: ₱{(newHourlyRate / 60).toFixed(4)}/min (used for late deductions from 9:00 AM)
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Work Schedule
                </label>
                <select
                  value={newScheduleType}
                  onChange={(e) => setNewScheduleType(e.target.value as 'mon_sat' | 'mon_fri')}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="mon_sat">Monday to Saturday (Sunday Rest Day)</option>
                  <option value="mon_fri">Monday to Friday (Saturday &amp; Sunday Rest Day)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRateModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingRate}
                onClick={handleSaveRate}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {savingRate ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed DTR Breakdown Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${getAvatarColor(selectedEmployee.employee_name)} flex items-center justify-center text-white text-sm font-black shadow-sm`}>
                  {getInitials(selectedEmployee.employee_name)}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {selectedEmployee.employee_name} — Shift &amp; Pay Breakdown
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ID: #{selectedEmployee.device_user_id} • Daily: ₱{selectedEmployee.daily_rate.toFixed(2)} • Hourly: ₱
                    {selectedEmployee.hourly_rate.toFixed(2)}/hr
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Table */}
            <div className="p-6 overflow-y-auto flex-1">
              {selectedEmployee.records.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-bold text-slate-600">No attendance punches recorded in this period.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left font-bold text-slate-600 uppercase tracking-wider">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Time In</th>
                      <th className="px-4 py-3">Time Out</th>
                      <th className="px-4 py-3 text-right">Hours</th>
                      <th className="px-4 py-3 text-right">OT (+25%)</th>
                      <th className="px-4 py-3 text-right">Night Diff</th>
                      <th className="px-4 py-3 text-right">Late Ded.</th>
                      <th className="px-4 py-3 text-right font-black text-slate-900">Day Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedEmployee.records.map((rec) => (
                      <tr key={rec.work_date} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900">{rec.work_date}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                            {rec.day_type_label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-emerald-700 font-bold">
                          {formatTime(rec.first_check_in)}
                        </td>
                        <td className="px-4 py-3 text-rose-700 font-bold">
                          {formatTime(rec.last_check_out)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{formatHours(rec.hours_worked)}</td>
                        <td className="px-4 py-3 text-right text-purple-700 font-bold">
                          {rec.overtime_hours > 0 ? `+${rec.overtime_hours.toFixed(1)}h` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-indigo-700 font-bold">
                          {rec.night_diff_hours > 0 ? `${rec.night_diff_hours.toFixed(1)}h` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-rose-600 font-bold">
                          {rec.tardiness_minutes > 0 ? `${rec.tardiness_minutes}m` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-emerald-700 text-sm">
                          {formatCurrency(rec.total_day_pay)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Summary */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">
                Period Gross Total ({selectedEmployee.days_worked} days):
              </span>
              <span className="text-xl font-black text-emerald-700">
                {formatCurrency(selectedEmployee.gross_pay)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
