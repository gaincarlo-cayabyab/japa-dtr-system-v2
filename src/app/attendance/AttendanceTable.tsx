'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AttendanceLog, Employee } from '@/types/database'
import { PUNCH_STATUS, PUNCH_STATUS_COLOR } from '@/types/database'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/Badge'

const PAGE_SIZE = 50

// ── Clear All modal ────────────────────────────────────────────────────────────
function ClearModal({
  onConfirm,
  onCancel,
  isLoading,
}: {
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Clear All Attendance Logs</h3>
            <p className="text-sm text-gray-500">This cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-gray-700 mb-6">
          All attendance records will be permanently deleted from the cloud database and cleared from the TA500 biometric machine for a fresh test.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Clearing…
              </>
            ) : (
              '🗑️ Delete All'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

interface AttendanceTableProps {
  initialLogs: AttendanceLog[]
  employees: Employee[]
}

function formatPunchTime(ts: string) {
  try {
    return format(new Date(ts), 'MMM d, yyyy hh:mm aa')
  } catch {
    return ts
  }
}

function getEmployeeName(deviceUserId: string, employees: Employee[]) {
  return employees.find((e) => e.device_user_id === deviceUserId)?.full_name ?? deviceUserId
}

export function AttendanceTable({ initialLogs, employees }: AttendanceTableProps) {
  const [logs, setLogs] = useState<AttendanceLog[]>(initialLogs)
  const [employeesList, setEmployeesList] = useState<Employee[]>(employees)
  const [isLive, setIsLive] = useState(false)

  // Clear-all state
  const [showClearModal, setShowClearModal] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [clearMessage, setClearMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleClearAll = async () => {
    setIsClearing(true)
    try {
      const res = await fetch('/api/attendance/clear', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to clear')
      setLogs([])
      setClearMessage({ type: 'success', text: `✅ Cleared ${json.deleted ?? 'all'} attendance records.` })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setClearMessage({ type: 'error', text: `❌ Error: ${msg}` })
    } finally {
      setIsClearing(false)
      setShowClearModal(false)
      setTimeout(() => setClearMessage(null), 5000)
    }
  }

  // Filters
  const today = format(new Date(), 'yyyy-MM-dd')
  const [dateFilter, setDateFilter] = useState(today)
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [nameSearch, setNameSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const supabase = createClient()

    const fetchLatest = async () => {
      const [{ data: freshLogs }, { data: freshEmps }] = await Promise.all([
        supabase.from('attendance_logs').select('*').order('punch_time', { ascending: false }).limit(200),
        supabase.from('employees').select('*'),
      ])
      if (freshLogs) setLogs(freshLogs)
      if (freshEmps) setEmployeesList(freshEmps)
    }

    const channel = supabase
      .channel('attendance-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs' },
        () => {
          fetchLatest()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => {
          fetchLatest()
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    const interval = setInterval(fetchLatest, 20000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const empName = getEmployeeName(log.device_user_id, employeesList).toLowerCase()

      if (dateFilter) {
        const logDate = log.punch_time.slice(0, 10)
        if (logDate !== dateFilter) return false
      }
      if (employeeFilter && log.device_user_id !== employeeFilter) return false
      if (statusFilter !== 'all') {
        const statusNum = parseInt(statusFilter)
        if (log.status !== statusNum) return false
      }
      if (nameSearch && !empName.includes(nameSearch.toLowerCase())) return false

      return true
    })
  }, [logs, dateFilter, employeeFilter, statusFilter, nameSearch, employeesList])

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [dateFilter, employeeFilter, statusFilter, nameSearch])

  return (
    <div>
      {/* Clear All Modal */}
      {showClearModal && (
        <ClearModal
          onConfirm={handleClearAll}
          onCancel={() => setShowClearModal(false)}
          isLoading={isClearing}
        />
      )}

      {/* Toast notification */}
      {clearMessage && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            clearMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {clearMessage.text}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-end">
        {/* Live badge */}
        <div className="flex items-center gap-2 mr-auto">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isLive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {isLive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            )}
            {isLive ? 'Live' : 'Connecting…'}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Employee</label>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Employees</option>
              {employeesList.map((emp) => (
                <option key={emp.id} value={emp.device_user_id}>
                  {emp.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="0">Check In</option>
              <option value="1">Check Out</option>
              <option value="2">Break Out</option>
              <option value="3">Break In</option>
              <option value="4">OT In</option>
              <option value="5">OT Out</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Search Name</label>
            <input
              type="text"
              placeholder="Search…"
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Clear All button */}
          <div className="flex items-end">
            <button
              onClick={() => setShowClearModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors font-medium"
              title="Delete all attendance logs from cloud database"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear All Logs
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No attendance records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Device ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date &amp; Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Synced At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {getEmployeeName(log.device_user_id, employees)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {log.device_user_id}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatPunchTime(log.punch_time)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          PUNCH_STATUS_COLOR[log.status] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {PUNCH_STATUS[log.status] ?? `Status ${log.status}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatPunchTime(log.synced_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} records
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
