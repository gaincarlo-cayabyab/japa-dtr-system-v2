'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AttendanceLog, Employee } from '@/types/database'
import { PUNCH_STATUS, PUNCH_STATUS_COLOR } from '@/types/database'
import { format } from 'date-fns'
import {
  Clock,
  Search,
  Filter,
  Trash2,
  Radio,
  Calendar,
  Users,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react'

const PAGE_SIZE = 50

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

// Clear All Modal
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-md border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">Clear Attendance Logs</h3>
            <p className="text-xs text-slate-400">Permanently delete logs from database</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Are you sure you want to delete all attendance logs? This action will reset live logs from Supabase so you can perform fresh synchronizations.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md shadow-rose-600/20 transition-all disabled:opacity-50 flex items-center gap-2"
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
              'Confirm Delete'
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
    return format(new Date(ts), 'MMM d, yyyy · hh:mm aa')
  } catch {
    return ts
  }
}

function getEmployeeName(deviceUserId: string, employees: Employee[]) {
  return employees.find((e) => e.device_user_id === deviceUserId)?.full_name ?? `ID #${deviceUserId}`
}

export function AttendanceTable({ initialLogs, employees }: AttendanceTableProps) {
  const [logs, setLogs] = useState<AttendanceLog[]>(initialLogs)
  const [employeesList, setEmployeesList] = useState<Employee[]>(employees)
  const [isLive, setIsLive] = useState(false)

  // Clear modal state
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
      setClearMessage({ type: 'success', text: `✅ Successfully cleared ${json.deleted ?? 'all'} attendance records.` })
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
  const [dateFilter, setDateFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [nameSearch, setNameSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    const fetchLatest = async () => {
      const [{ data: freshLogs }, { data: freshEmps }] = await Promise.all([
        supabase.from('attendance_logs').select('*').order('punch_time', { ascending: false }).limit(300),
        supabase.from('employees').select('*').order('full_name', { ascending: true }),
      ])
      if (freshLogs) setLogs(freshLogs)
      if (freshEmps) setEmployeesList(freshEmps)
    }

    const channel = supabase
      .channel('attendance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const newLog = payload.new as AttendanceLog
          setLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id)])
        } else if (payload.eventType === 'DELETE') {
          setLogs([])
        } else {
          fetchLatest()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        fetchLatest()
      })
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    const interval = setInterval(fetchLatest, 12000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  // Smart punch detection (Time In vs Time Out with 4:00 AM cutoff)
  const smartRoles = useMemo(() => {
    const shiftMap = new Map<string, AttendanceLog[]>()
    const getOpDate = (ts: string) => {
      const d = new Date(ts)
      const shifted = new Date(d.getTime() - 4 * 60 * 60 * 1000)
      return shifted.toISOString().slice(0, 10)
    }

    for (const log of logs) {
      const opDate = getOpDate(log.punch_time)
      const key = `${log.device_user_id}_${opDate}`
      if (!shiftMap.has(key)) shiftMap.set(key, [])
      shiftMap.get(key)!.push(log)
    }

    const roleMap = new Map<string, { label: string; badgeClass: string; icon: string }>()
    shiftMap.forEach((group) => {
      group.sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime())
      const first = group[0]
      const last = group[group.length - 1]
      const diffMin = (new Date(last.punch_time).getTime() - new Date(first.punch_time).getTime()) / 60000

      group.forEach((log) => {
        if (log.id === first.id) {
          roleMap.set(log.id, {
            label: 'Time In',
            badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            icon: '🟢',
          })
        } else if (log.id === last.id && diffMin >= 3) {
          roleMap.set(log.id, {
            label: 'Time Out',
            badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
            icon: '🔴',
          })
        } else {
          roleMap.set(log.id, {
            label: 'Mid-Shift',
            badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
            icon: '🔵',
          })
        }
      })
    })

    return roleMap
  }, [logs])

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const empName = getEmployeeName(log.device_user_id, employeesList).toLowerCase()
      if (dateFilter) {
        const logDate = log.punch_time.slice(0, 10)
        if (logDate !== dateFilter) return false
      }
      if (employeeFilter && log.device_user_id !== employeeFilter) return false
      if (statusFilter !== 'all') {
        const role = smartRoles.get(log.id)
        if (statusFilter === 'in' && role?.label !== 'Time In') return false
        if (statusFilter === 'out' && role?.label !== 'Time Out') return false
        if (statusFilter === 'mid' && role?.label !== 'Mid-Shift') return false
      }
      if (nameSearch && !empName.includes(nameSearch.toLowerCase())) return false
      return true
    })
  }, [logs, dateFilter, employeeFilter, statusFilter, nameSearch, employeesList, smartRoles])

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => {
    setPage(0)
  }, [dateFilter, employeeFilter, statusFilter, nameSearch])

  // Count summaries
  const todayCount = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    return logs.filter((l) => l.punch_time.slice(0, 10) === todayStr).length
  }, [logs])

  const uniqueEmpsCount = useMemo(() => {
    return new Set(logs.map((l) => l.device_user_id)).size
  }, [logs])

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Clear Modal */}
      {showClearModal && (
        <ClearModal
          onConfirm={handleClearAll}
          onCancel={() => setShowClearModal(false)}
          isLoading={isClearing}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Attendance Logs</h1>
              <p className="text-xs text-slate-500">Live biometric punch records from FingerTec TA500</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              isLive
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isLive ? 'animate-pulse' : ''}`} />
            {isLive ? 'Live Sync Active' : 'Connecting…'}
          </span>

          <button
            onClick={() => setShowClearModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors shadow-2xs"
            title="Delete all attendance logs"
          >
            <Trash2 className="w-4 h-4" />
            Clear Logs
          </button>
        </div>
      </div>

      {/* Stats summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Stored Punches</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{logs.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Employees</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{uniqueEmpsCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today&apos;s Activity</p>
            <p className="text-xl font-black text-indigo-600 mt-0.5">{todayCount} punches</p>
          </div>
        </div>
      </div>

      {/* Clear notification toast */}
      {clearMessage && (
        <div
          className={`p-4 rounded-2xl text-sm font-semibold border flex items-center gap-2 ${
            clearMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {clearMessage.text}
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Search Employee</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name…"
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* Date Filter */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Employee Dropdown */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Employee</label>
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Employees ({employeesList.length})</option>
            {employeesList.map((emp) => (
              <option key={emp.id} value={emp.device_user_id}>
                {emp.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Punch Type */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Punch Type</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Types</option>
            <option value="in">Time In</option>
            <option value="out">Time Out</option>
            <option value="mid">Mid-Shift</option>
          </select>
        </div>

        {/* Reset Filter Button */}
        {(dateFilter || employeeFilter || statusFilter !== 'all' || nameSearch) && (
          <button
            onClick={() => {
              setDateFilter('')
              setEmployeeFilter('')
              setStatusFilter('all')
              setNameSearch('')
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Attendance Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <Clock className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-bold text-slate-600">No attendance logs found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or wait for the biometric bridge to sync.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-left">
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee Name</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Device ID</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Punch Time</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Smart Type</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Synced At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((log) => {
                  const empName = getEmployeeName(log.device_user_id, employeesList)
                  const role = smartRoles.get(log.id)
                  const gradient = getAvatarColor(empName)
                  const initials = getInitials(empName)

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-black shadow-xs flex-shrink-0`}>
                            {initials}
                          </div>
                          <span className="font-bold text-slate-900">{empName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                          #{log.device_user_id}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 font-medium">
                        {formatPunchTime(log.punch_time)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {role ? (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${role.badgeClass}`}>
                            <span>{role.icon}</span>
                            {role.label}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 text-xs font-mono">
                        {formatPunchTime(log.synced_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs font-medium text-slate-500">
              Showing <span className="font-bold text-slate-800">{page * PAGE_SIZE + 1}</span> to{' '}
              <span className="font-bold text-slate-800">{Math.min((page + 1) * PAGE_SIZE, filtered.length)}</span> of{' '}
              <span className="font-bold text-slate-800">{filtered.length}</span> logs
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <span className="text-xs font-bold text-slate-600 px-2">
                Page {page + 1} of {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
