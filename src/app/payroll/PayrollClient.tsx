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
} from 'lucide-react'

interface PayrollClientProps {
  branches: string[]
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
  const [rateTarget, setRateTarget] = useState<{ id: string; name: string; rate: number } | null>(null)
  const [newRate, setNewRate] = useState<number>(610)
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

  // Save Daily Rate
  const handleSaveRate = async () => {
    if (!rateTarget) return
    setSavingRate(true)
    try {
      const res = await fetch('/api/payroll/compensation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_user_id: rateTarget.id,
          daily_rate: newRate,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)

      setToast({ message: `Updated daily rate for ${rateTarget.name}!`, type: 'success' })
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
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
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
            className="ml-2 text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        </div>
      )}

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Gross Payroll</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {formatCurrency(payrollData?.totals?.total_gross_pay || 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {payrollData?.totals?.active_employees || 0} active employees
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Regular Work Pay</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {formatCurrency(payrollData?.totals?.total_regular_pay || 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {payrollData?.totals?.total_regular_hours?.toFixed(1) || 0} total hours
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Overtime Pay (DOLE)</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {formatCurrency(payrollData?.totals?.total_overtime_pay || 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {payrollData?.totals?.total_overtime_hours?.toFixed(1) || 0} OT hours
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Moon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Night Shift Diff (+10%)</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {formatCurrency(payrollData?.totals?.total_night_diff_pay || 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {payrollData?.totals?.total_night_diff_hours?.toFixed(1) || 0} night hours
            </p>
          </div>
        </div>
      </div>

      {/* Control Bar: Period Presets & Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Period Selection */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">
            Period:
          </span>
          <button
            onClick={() => handlePreset('first_half')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              startDate.endsWith('-01') && endDate.endsWith('-15')
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            1st Half (1st–15th)
          </button>
          <button
            onClick={() => handlePreset('second_half')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              startDate.endsWith('-16')
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            2nd Half (16th–End)
          </button>
          <button
            onClick={() => handlePreset('full_month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              startDate.endsWith('-01') && !endDate.endsWith('-15')
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Full Month
          </button>

          <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 pl-3">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 bg-slate-50"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 bg-slate-50"
            />
          </div>
        </div>

        {/* Actions: Excel Download */}
        <div className="flex items-center gap-2">
          {branches.length > 1 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Salary Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Payroll Computation Sheet</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
              {filteredEmployees.length} Employees
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 w-56 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium">Computing Philippine DOLE payroll...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Calculator className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-sm font-medium">No payroll records found for this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3.5">Employee</th>
                  <th className="px-4 py-3.5 text-right">Daily Rate</th>
                  <th className="px-4 py-3.5 text-center">Days Worked</th>
                  <th className="px-4 py-3.5 text-right">Regular Pay</th>
                  <th className="px-4 py-3.5 text-right">OT Pay</th>
                  <th className="px-4 py-3.5 text-right">Night Diff</th>
                  <th className="px-4 py-3.5 text-right">Holiday Pay</th>
                  <th className="px-4 py-3.5 text-center">Time Late</th>
                  <th className="px-4 py-3.5 text-right font-bold text-slate-900">Gross Salary</th>
                  <th className="px-4 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => (
                  <tr
                    key={emp.device_user_id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    {/* Employee Info */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-900">{emp.employee_name}</p>
                        <p className="text-xs text-slate-400 font-mono">
                          ID: {emp.device_user_id} • {emp.branch}
                        </p>
                      </div>
                    </td>

                    {/* Daily Rate with Edit Button */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setRateTarget({
                            id: emp.device_user_id,
                            name: emp.employee_name,
                            rate: emp.daily_rate,
                          })
                          setNewRate(emp.daily_rate)
                          setRateModalOpen(true)
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 text-xs font-semibold text-slate-700 hover:text-blue-700 transition-colors group"
                        title="Click to edit daily rate"
                      >
                        <span>₱{emp.daily_rate.toFixed(2)}</span>
                        <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-blue-600" />
                      </button>
                    </td>

                    {/* Days Worked */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                        {emp.days_worked} days
                      </span>
                    </td>

                    {/* Regular Pay */}
                    <td className="px-4 py-3 text-right text-slate-700 font-medium">
                      {formatCurrency(emp.total_regular_pay)}
                      <p className="text-[11px] text-slate-400">{emp.total_regular_hours.toFixed(1)}h</p>
                    </td>

                    {/* OT Pay */}
                    <td className="px-4 py-3 text-right text-purple-700 font-medium">
                      {emp.total_overtime_pay > 0 ? (
                        <>
                          {formatCurrency(emp.total_overtime_pay)}
                          <p className="text-[11px] text-purple-400">+{emp.total_overtime_hours.toFixed(1)}h</p>
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Night Diff Pay */}
                    <td className="px-4 py-3 text-right text-indigo-700 font-medium">
                      {emp.total_night_diff_pay > 0 ? (
                        <>
                          {formatCurrency(emp.total_night_diff_pay)}
                          <p className="text-[11px] text-indigo-400">{emp.total_night_diff_hours.toFixed(1)}h</p>
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Holiday Pay */}
                    <td className="px-4 py-3 text-right text-amber-700 font-medium">
                      {emp.total_holiday_pay > 0 ? (
                        formatCurrency(emp.total_holiday_pay)
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Time Late (no monetary deduction) */}
                    <td className="px-4 py-3 text-center">
                      {emp.total_tardiness_minutes > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          {Math.floor(emp.total_tardiness_minutes / 60) > 0 ? `${Math.floor(emp.total_tardiness_minutes / 60)}h ` : ''}
                          {emp.total_tardiness_minutes % 60}m late
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Gross Salary */}
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100">
                        {formatCurrency(emp.gross_pay)}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedEmployee(emp)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
                      >
                        Breakdown
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Daily Rate Modal */}
      {rateModalOpen && rateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Update Daily Rate</h3>
              <button
                onClick={() => setRateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Adjust daily compensation for{' '}
              <span className="font-semibold text-slate-800">{rateTarget.name}</span> (ID: {rateTarget.id}).
              Hourly rate and DOLE multipliers will recalculate automatically.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Daily Rate (PHP ₱)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-slate-400 font-semibold">₱</span>
                <input
                  type="number"
                  step="0.01"
                  value={newRate}
                  onChange={(e) => setNewRate(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Hourly: ₱{(newRate / 8).toFixed(2)}/hr • Minute: ₱{(newRate / 480).toFixed(2)}/min
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRateModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingRate}
                onClick={handleSaveRate}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                {savingRate ? 'Saving...' : 'Save Rate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed DTR Breakdown Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedEmployee.employee_name} — Shift &amp; Pay Breakdown
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ID: {selectedEmployee.device_user_id} • Daily Rate: ₱{selectedEmployee.daily_rate.toFixed(2)} (₱
                  {selectedEmployee.hourly_rate.toFixed(2)}/hr)
                </p>
              </div>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Table */}
            <div className="p-5 overflow-y-auto flex-1">
              {selectedEmployee.records.length === 0 ? (
                <p className="text-center py-12 text-sm text-slate-400">
                  No attendance punches recorded in this period.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left font-semibold text-slate-600">
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Time In</th>
                      <th className="px-3 py-2.5">Time Out</th>
                      <th className="px-3 py-2.5 text-right">Hours</th>
                      <th className="px-3 py-2.5 text-right">OT</th>
                      <th className="px-3 py-2.5 text-right">Night</th>
                      <th className="px-3 py-2.5 text-center">Time Late</th>
                      <th className="px-3 py-2.5 text-right font-bold text-slate-900">Day Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedEmployee.records.map((rec) => (
                      <tr key={rec.work_date} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{rec.work_date}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700">
                            {rec.day_type_label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-emerald-700 font-medium">
                          {formatTime(rec.first_check_in)}
                        </td>
                        <td className="px-3 py-2.5 text-rose-700 font-medium">
                          {formatTime(rec.last_check_out)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium">{formatHours(rec.hours_worked)}</td>
                        <td className="px-3 py-2.5 text-right text-purple-700 font-semibold">
                          {rec.overtime_hours > 0 ? `+${rec.overtime_hours.toFixed(1)}h` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-indigo-700 font-semibold">
                          {rec.night_diff_hours > 0 ? `${rec.night_diff_hours.toFixed(1)}h` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center text-amber-700 font-semibold">
                          {rec.tardiness_minutes > 0 ? `${rec.tardiness_minutes}m` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                          {formatCurrency(rec.total_day_pay)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Summary */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                Period Gross Total ({selectedEmployee.days_worked} days):
              </span>
              <span className="text-base font-bold text-emerald-700">
                {formatCurrency(selectedEmployee.gross_pay)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
