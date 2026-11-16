'use client'

import { useState, useMemo, useEffect } from 'react'
import type { DailyDtr } from '@/types/database'
import { format } from 'date-fns'
import {
  Clock,
  Download,
  Filter,
  Calendar,
  Users,
  Moon,
  Briefcase,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Search,
  CheckCircle2,
  AlertCircle,
  PieChart,
  Edit2,
  X,
  ShieldCheck,
} from 'lucide-react'

interface ReportsClientProps {
  initialData: DailyDtr[]
  branches: string[]
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i)
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
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
  const [data, setData] = useState<DailyDtr[]>(initialData)
  const currentMonth = format(new Date(), 'yyyy-MM')
  const [viewMode, setViewMode] = useState<'monthly' | 'daily'>('monthly')
  const [monthFilter, setMonthFilter] = useState(currentMonth)
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Current logged in user check
  const [currentUser, setCurrentUser] = useState<{ role: string; username: string } | null>(null)
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.user) setCurrentUser(d.user)
      })
      .catch(() => {})
  }, [])
  const isSuperAdmin = currentUser?.role === 'super_admin'

  // Edit Shift Modal State
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<DailyDtr | null>(null)
  const [editInTime, setEditInTime] = useState<string>('09:00')
  const [editOutTime, setEditOutTime] = useState<string>('18:00')
  const [hasInTime, setHasInTime] = useState(true)
  const [hasOutTime, setHasOutTime] = useState(true)
  const [savingShift, setSavingShift] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const filtered = useMemo(() => {
    return data.filter((row) => {
      if (branchFilter && row.branch !== branchFilter) return false
      if (statusFilter !== 'all' && row.shift_status !== statusFilter) return false
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase()
        const matchName = row.full_name?.toLowerCase().includes(q)
        const matchId = String(row.device_user_id).includes(q)
        if (!matchName && !matchId) return false
      }
      if (viewMode === 'monthly') {
        return row.work_date.startsWith(monthFilter)
      } else {
        return row.work_date === dateFilter
      }
    })
  }, [data, viewMode, monthFilter, dateFilter, branchFilter, statusFilter, searchQuery])

  // Summary statistics
  const uniqueEmployees = new Set(filtered.map((r) => r.employee_id)).size
  const totalRegularHours = filtered.reduce((acc, r) => acc + Math.min(8, Number(r.hours_worked || 0)), 0)
  const totalOvertimeHours = filtered.reduce((acc, r) => acc + Number(r.overtime_hours || 0), 0)
  const completedShifts = filtered.filter((r) => r.shift_status === 'Completed').length
  const onDutyShifts = filtered.filter((r) => r.shift_status === 'On Duty').length
  const incompleteShifts = filtered.filter((r) => r.shift_status === 'Incomplete').length

  // Daily attendance chart data (group by work_date)
  const dailyAttendanceData = useMemo(() => {
    const counts = new Map<string, { date: string; count: number; otHours: number }>()
    filtered.forEach((r) => {
      const prev = counts.get(r.work_date) || { date: r.work_date, count: 0, otHours: 0 }
      prev.count += 1
      prev.otHours += Number(r.overtime_hours || 0)
      counts.set(r.work_date, prev)
    })
    return Array.from(counts.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [filtered])

  // Top Overtime Staff
  const topOvertimeEmployees = useMemo(() => {
    const map = new Map<string, { name: string; regularHours: number; otHours: number }>()
    filtered.forEach((r) => {
      const key = String(r.device_user_id)
      const prev = map.get(key) || { name: r.full_name, regularHours: 0, otHours: 0 }
      prev.regularHours += Math.min(8, Number(r.hours_worked || 0))
      prev.otHours += Number(r.overtime_hours || 0)
      map.set(key, prev)
    })
    return Array.from(map.values())
      .filter((e) => e.otHours > 0)
      .sort((a, b) => b.otHours - a.otHours)
      .slice(0, 5)
  }, [filtered])

  const maxDailyCount = Math.max(...dailyAttendanceData.map((d) => d.count), 1)

  // Open Edit Shift Modal
  const openEditShift = (row: DailyDtr) => {
    setEditRow(row)
    if (row.first_check_in) {
      setHasInTime(true)
      setEditInTime(format(new Date(row.first_check_in), 'HH:mm'))
    } else {
      setHasInTime(false)
      setEditInTime('09:00')
    }

    if (row.last_check_out) {
      setHasOutTime(true)
      setEditOutTime(format(new Date(row.last_check_out), 'HH:mm'))
    } else {
      setHasOutTime(false)
      setEditOutTime('18:00')
    }

    setEditModalOpen(true)
  }

  // Handle Save Shift
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editRow) return
    setSavingShift(true)
    try {
      const res = await fetch('/api/reports/shift', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_user_id: editRow.device_user_id,
          work_date: editRow.work_date,
          first_check_in: hasInTime ? editInTime : null,
          last_check_out: hasOutTime ? editOutTime : null,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setToast({ message: `Updated DTR shift for ${editRow.full_name} on ${editRow.work_date}!`, type: 'success' })
      setEditModalOpen(false)

      // Refresh page data
      window.location.reload()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating shift'
      setToast({ message: msg, type: 'error' })
    } finally {
      setSavingShift(false)
    }
  }

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
    <div className="space-y-6">
      {/* Toast Alert */}
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
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-600 font-bold">
            ×
          </button>
        </div>
      )}

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Employees</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{uniqueEmployees}</p>
            <p className="text-xs text-slate-400 mt-0.5">{filtered.length} total shift records</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Regular Work Hours</p>
            <p className="text-2xl font-black text-emerald-700 mt-0.5">{totalRegularHours.toFixed(1)} hrs</p>
            <p className="text-xs text-slate-400 mt-0.5">Standard 8-hour workday</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Moon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overtime Recorded</p>
            <p className="text-2xl font-black text-purple-700 mt-0.5">{totalOvertimeHours.toFixed(1)} hrs</p>
            <p className="text-xs text-purple-500 font-semibold mt-0.5">DOLE +25% OT rate</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Shifts Completed</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">
              <span className="text-emerald-600">{completedShifts}</span>{' '}
              <span className="text-slate-300 text-lg font-normal">/</span>{' '}
              <span className="text-blue-600">{onDutyShifts} active</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{incompleteShifts} incomplete</p>
          </div>
        </div>
      </div>

      {/* Visual Analytics & Graphs Strip */}
      {dailyAttendanceData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Daily Attendance Volume Bar Chart */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Attendance Volume Trend</h3>
              </div>
              <span className="text-xs text-slate-400">Headcount per workday</span>
            </div>

            {/* Visual Bar Chart */}
            <div className="h-40 flex items-end gap-2 pt-4 px-2 border-b border-slate-100 overflow-x-auto">
              {dailyAttendanceData.map((d) => {
                const heightPercent = Math.max(12, Math.round((d.count / maxDailyCount) * 100))
                const dateLabel = d.date.slice(5) // MM-DD
                return (
                  <div key={d.date} className="flex-1 min-w-[28px] flex flex-col items-center gap-1 group">
                    <span className="text-[10px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.count}
                    </span>
                    <div
                      className="w-full bg-gradient-to-t from-blue-600 to-indigo-500 rounded-t-lg transition-all duration-300 group-hover:from-blue-500 group-hover:to-indigo-400"
                      style={{ height: `${heightPercent}%` }}
                    />
                    <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-700">
                      {dateLabel}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
              <span>Showing {dailyAttendanceData.length} active recording dates</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" /> Employees Present
              </span>
            </div>
          </div>

          {/* Shift Status Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <PieChart className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Shift Status Summary</h3>
              </div>

              {/* Progress Bars */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-emerald-700">Completed Shifts</span>
                    <span className="text-slate-700">{completedShifts} ({filtered.length > 0 ? Math.round((completedShifts / filtered.length) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${filtered.length > 0 ? (completedShifts / filtered.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-blue-700">Currently On Duty</span>
                    <span className="text-slate-700">{onDutyShifts} ({filtered.length > 0 ? Math.round((onDutyShifts / filtered.length) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${filtered.length > 0 ? (onDutyShifts / filtered.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-amber-700">Incomplete Punches</span>
                    <span className="text-slate-700">{incompleteShifts} ({filtered.length > 0 ? Math.round((incompleteShifts / filtered.length) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${filtered.length > 0 ? (incompleteShifts / filtered.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 mt-4 text-xs text-slate-500 flex items-center justify-between">
              <span>Overtime Total:</span>
              <span className="font-black text-purple-700">+{totalOvertimeHours.toFixed(1)} hrs</span>
            </div>
          </div>
        </div>
      )}

      {/* Top Overtime Staff Leaderboard Strip */}
      {topOvertimeEmployees.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-bold text-slate-900">Top Overtime Performers</h3>
            </div>
            <span className="text-xs text-slate-400">DOLE +25% premium work hours</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {topOvertimeEmployees.map((emp, idx) => {
              const maxOt = topOvertimeEmployees[0]?.otHours || 1
              const percent = Math.min(100, Math.round((emp.otHours / maxOt) * 100))
              return (
                <div key={emp.name} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="w-5 h-5 rounded-md bg-purple-100 text-purple-700 text-xs font-black flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-black text-purple-700">+{emp.otHours.toFixed(1)}h OT</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 truncate">{emp.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{emp.regularHours.toFixed(1)}h regular</p>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2.5">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-indigo-600 h-full rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Search Employee</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name or ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* View Mode Toggle */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">View Mode</label>
          <div className="flex border border-slate-200 rounded-xl overflow-hidden p-0.5 bg-slate-50">
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'monthly'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'daily'
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
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Month</label>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Branch</label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Shift Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel (.xlsx)
          </button>

          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* DTR Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Clock className="w-12 h-12 text-slate-300 mb-3" />
            <p className="font-bold text-slate-600">No smart DTR records found for selected filters.</p>
            <p className="text-xs text-slate-400 mt-1">Adjust month or date filters to view recorded shifts.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Employee Name</th>
                  <th className="px-4 py-3.5">Device ID</th>
                  <th className="px-4 py-3.5">Branch</th>
                  <th className="px-4 py-3.5">Work Date</th>
                  <th className="px-4 py-3.5">Time In</th>
                  <th className="px-4 py-3.5">Time Out</th>
                  <th className="px-4 py-3.5 text-right">Hours Worked</th>
                  <th className="px-4 py-3.5 text-right">Overtime</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  {isSuperAdmin && (
                    <th className="px-4 py-3.5 text-center">Admin Edit</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row, i) => {
                  const ot = Number(row.overtime_hours || 0)
                  const gradient = getAvatarColor(row.full_name)
                  const initials = getInitials(row.full_name)

                  return (
                    <tr
                      key={`${row.employee_id}-${row.work_date}-${i}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-black shadow-xs flex-shrink-0`}>
                            {initials}
                          </div>
                          <span className="font-bold text-slate-900">{row.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs font-bold bg-slate-50 text-slate-700">
                        #{row.device_user_id}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 font-medium">{row.branch || 'JAPA Main'}</td>
                      <td className="px-4 py-3.5 text-slate-800 font-bold">{row.work_date}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {formatTime(row.first_check_in)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {row.last_check_out ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100">
                            {formatTime(row.last_check_out)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Pending Out</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-black text-slate-900">
                        {formatHoursWorked(Number(row.hours_worked || 0))}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {ot > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                            +{ot.toFixed(1)}h OT
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                            row.shift_status === 'Completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : row.shift_status === 'On Duty'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {row.shift_status === 'On Duty' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping mr-1.5" />
                          )}
                          {row.shift_status}
                        </span>
                      </td>
                      {isSuperAdmin && (
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => openEditShift(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-xs font-bold transition-colors"
                            title="Edit this employee's shift punches"
                          >
                            <Edit2 className="w-3 h-3 text-slate-500" />
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Super Admin Edit Shift Modal */}
      {editModalOpen && editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-7 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Edit Employee Shift</h3>
                  <p className="text-xs text-slate-400">Super Admin DTR Reconciliation</p>
                </div>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-sm font-bold text-slate-900">{editRow.full_name}</p>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Device ID: #{editRow.device_user_id} · Work Date: {editRow.work_date}
              </p>
            </div>

            <form onSubmit={handleSaveShift} className="space-y-4">
              {/* Check In */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">First Time In</label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasInTime}
                      onChange={(e) => setHasInTime(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    Include
                  </label>
                </div>
                {hasInTime && (
                  <input
                    type="time"
                    required
                    value={editInTime}
                    onChange={(e) => setEditInTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              {/* Check Out */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Last Time Out</label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasOutTime}
                      onChange={(e) => setHasOutTime(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    Include
                  </label>
                </div>
                {hasOutTime && (
                  <div>
                    <input
                      type="time"
                      required
                      value={editOutTime}
                      onChange={(e) => setEditOutTime(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Times between 12:00 AM and 03:59 AM will be credited to this shift automatically.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingShift}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {savingShift ? 'Saving…' : 'Save Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
