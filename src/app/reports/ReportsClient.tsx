'use client'

import { useState, useMemo } from 'react'
import type { DailyDtr } from '@/types/database'
import { format } from 'date-fns'

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

function calcHours(checkin: string | null, checkout: string | null): string {
  if (!checkin || !checkout) return '—'
  try {
    const diff = new Date(checkout).getTime() - new Date(checkin).getTime()
    if (diff <= 0) return '—'
    const hrs = Math.floor(diff / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    return `${hrs}h ${mins}m`
  } catch {
    return '—'
  }
}

function calcHoursDecimal(checkin: string | null, checkout: string | null): number {
  if (!checkin || !checkout) return 0
  try {
    const diff = new Date(checkout).getTime() - new Date(checkin).getTime()
    return diff > 0 ? diff / 3600000 : 0
  } catch {
    return 0
  }
}

export function ReportsClient({ initialData, branches }: ReportsClientProps) {
  const currentMonth = format(new Date(), 'yyyy-MM')
  const [viewMode, setViewMode] = useState<'monthly' | 'daily'>('monthly')
  const [monthFilter, setMonthFilter] = useState(currentMonth)
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [branchFilter, setBranchFilter] = useState('')

  const filtered = useMemo(() => {
    return initialData.filter((row) => {
      if (branchFilter && row.branch !== branchFilter) return false
      if (viewMode === 'monthly') {
        return row.work_date.startsWith(monthFilter)
      } else {
        return row.work_date === dateFilter
      }
    })
  }, [initialData, viewMode, monthFilter, dateFilter, branchFilter])

  // Summary stats
  const uniqueEmployees = new Set(filtered.map((r) => r.employee_id)).size
  const hoursArr = filtered.map((r) => calcHoursDecimal(r.first_check_in, r.last_check_out)).filter((h) => h > 0)
  const avgHours = hoursArr.length
    ? (hoursArr.reduce((a, b) => a + b, 0) / hoursArr.length).toFixed(1)
    : '—'

  function exportCSV() {
    const label = viewMode === 'monthly' ? monthFilter : dateFilter
    const headers = [
      'Employee Name', 'Device ID', 'Branch', 'Work Date',
      'First Check-In', 'Last Check-Out', 'Total Punches', 'Hours Worked',
    ]
    const rows = filtered.map((r) => [
      `"${r.full_name}"`,
      r.device_user_id,
      `"${r.branch}"`,
      r.work_date,
      r.first_check_in ?? '',
      r.last_check_out ?? '',
      r.total_punches,
      calcHours(r.first_check_in, r.last_check_out),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `JAPA_DTR_${label}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-end">
        {/* View mode toggle */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">View Mode</label>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'monthly'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'daily'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Daily
            </button>
          </div>
        </div>

        {viewMode === 'monthly' ? (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Month</label>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Branch</label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <button
          onClick={exportCSV}
          className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 shadow-sm flex items-center gap-2"
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-sm">No DTR records found for selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Device ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Branch</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Work Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">First Check-In</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Last Check-Out</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Punches</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Hours Worked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row, i) => (
                  <tr key={`${row.employee_id}-${row.work_date}-${i}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.full_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.device_user_id}</td>
                    <td className="px-4 py-3 text-gray-700">{row.branch}</td>
                    <td className="px-4 py-3 text-gray-700">{row.work_date}</td>
                    <td className="px-4 py-3 text-gray-700">{formatTime(row.first_check_in)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatTime(row.last_check_out)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.total_punches}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {calcHours(row.first_check_in, row.last_check_out)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Summary row */}
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-200">
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-blue-800">
                    Summary — {uniqueEmployees} employee(s) · {filtered.length} record(s)
                  </td>
                  <td className="px-4 py-3 text-sm text-blue-700">Avg hours:</td>
                  <td />
                  <td className="px-4 py-3 text-right font-bold text-blue-800">{avgHours}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
