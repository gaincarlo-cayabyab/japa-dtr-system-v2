'use client'

import { useState, useMemo } from 'react'
import type { DailyDtr } from '@/types/database'
import { format } from 'date-fns'
import { Clock, Download, Filter, Calendar, Users, Moon, Briefcase, FileSpreadsheet } from 'lucide-react'

interface ReportsClientProps {
  initialData: DailyDtr[]
  branches: string[]
}

function formatTime(ts: string | null) {
  if (!ts) return '—'
  try {
    return format(new Date(ts), 'hh:mm aa')
  } catch {
    return ts
  }
}

function formatHoursWorked(hours: number): string {
  if (!hours || hours <= 0) return '—'
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function ReportsClient({ initialData, branches }: ReportsClientProps) {
  const currentMonth = format(new Date(), 'yyyy-MM')
  const [viewMode, setViewMode] = useState<'monthly' | 'daily'>('monthly')
  const [monthFilter, setMonthFilter] = useState(currentMonth)
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    return initialData.filter((row) => {
      if (branchFilter && row.branch !== branchFilter) return false
      if (statusFilter !== 'all' && row.shift_status !== statusFilter) return false
      if (viewMode === 'monthly') {
        return row.work_date.startsWith(monthFilter)
      } else {
        return row.work_date === dateFilter
      }
    })
  }, [initialData, viewMode, monthFilter, dateFilter, branchFilter, statusFilter])

  // Summary statistics
  const uniqueEmployees = new Set(filtered.map((r) => r.employee_id)).size
  const totalRegularHours = filtered.reduce((acc, r) => acc + Math.min(8, Number(r.hours_worked || 0)), 0)
  const totalOvertimeHours = filtered.reduce((acc, r) => acc + Number(r.overtime_hours || 0), 0)
  const completedShifts = filtered.filter((r) => r.shift_status === 'Completed').length
  const onDutyShifts = filtered.filter((r) => r.shift_status === 'On Duty').length

  function exportExcel() {
    const startDate = viewMode === 'monthly' ? `${monthFilter}-01` : dateFilter
    const endDate = viewMode === 'monthly' ? `${monthFilter}-31` : dateFilter
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    })
    if (branchFilter) params.append('branch', branchFilter)
    window.open(`/api/reports/excel?${params.toString()}`, '_blank')
  }

  function exportCSV() {
    const label = viewMode === 'monthly' ? monthFilter : dateFilter
    const headers = [
      'Employee Name',
      'Device ID',
      'Branch',
      'Work Date',
      'Time In',
      'Time Out',
      'Total Punches',
      'Hours Worked',
      'Overtime Hours',
      'Shift Status',
    ]
    const rows = filtered.map((r) => [
      `"${r.full_name}"`,
      r.device_user_id,
      `"${r.branch}"`,
      r.work_date,
      formatTime(r.first_check_in),
      formatTime(r.last_check_out),
      r.total_punches,
      r.hours_worked ?? 0,
      r.overtime_hours ?? 0,
      `"${r.shift_status}"`,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `JAPA_DTR_Smart_${label}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Active Employees</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{uniqueEmployees}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Regular Work Hours</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{totalRegularHours.toFixed(1)} hrs</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Moon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Overtime Recorded</p>
            <p className="text-xl font-bold text-purple-700 mt-0.5">{totalOvertimeHours.toFixed(1)} hrs</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Shifts (On Duty / Done)</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              <span className="text-blue-600">{onDutyShifts}</span> / <span className="text-emerald-600">{completedShifts}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 mb-6 flex flex-wrap gap-3 items-end">
        {/* View Mode Toggle */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">View Mode</label>
          <div className="flex border border-slate-200 rounded-xl overflow-hidden p-0.5 bg-slate-50">
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${viewMode === 'monthly'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${viewMode === 'daily'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              Daily
            </button>
          </div>
        </div>

        {viewMode === 'monthly' ? (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Month</label>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Branch</label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Shift Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="Completed">Completed</option>
            <option value="On Duty">On Duty (Working)</option>
            <option value="Incomplete">Incomplete</option>
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel (.xlsx)
          </button>

          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* DTR Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Clock className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-sm font-medium">No smart DTR records found for selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-left">
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Employee Name</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Device ID</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Branch</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Work Date</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Time In</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Time Out</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600 text-right">Hours Worked</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600 text-right">Overtime</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row, i) => {
                  const ot = Number(row.overtime_hours || 0)
                  return (
                    <tr
                      key={`${row.employee_id}-${row.work_date}-${i}`}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.full_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.device_user_id}</td>
                      <td className="px-4 py-3 text-slate-600">{row.branch}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{row.work_date}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {formatTime(row.first_check_in)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.last_check_out ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100">
                            {formatTime(row.last_check_out)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Pending Out</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {formatHoursWorked(Number(row.hours_worked || 0))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {ot > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                            +{ot.toFixed(1)}h OT
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${row.shift_status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.shift_status === 'On Duty'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                        >
                          {row.shift_status === 'On Duty' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping mr-1.5" />
                          )}
                          {row.shift_status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
