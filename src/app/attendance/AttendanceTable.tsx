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
  Plus,
  Edit2,
  X,
  CheckCircle2,
  AlertCircle,
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

interface AttendanceTableProps {
  initialLogs: AttendanceLog[]
  employees: Employee[]
}

function formatPunchTime(ts: string) {
  try {
    const d = new Date(ts)
    const datePart = d.toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    const timePart = d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    return `${datePart} · ${timePart}`
  } catch {
    return ts
  }
}

// Helpers for Philippine timezone (Asia/Manila)
function getManilaDateStr(ts: string): string {
  try {
    const d = new Date(ts)
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return ts.slice(0, 10)
  }
}

function getOperationalDateStr(ts: string): string {
  try {
    const d = new Date(ts)
    // In Manila time (UTC+8), subtract 4 hours for 4:00 AM cutoff
    // (UTC + 8h - 4h = UTC + 4h)
    const shifted = new Date(d.getTime() + 4 * 60 * 60 * 1000)
    return shifted.toISOString().slice(0, 10)
  } catch {
    return ts.slice(0, 10)
  }
}

function getEmployeeName(deviceUserId: string, employees: Employee[]) {
  return employees.find((e) => e.device_user_id === deviceUserId)?.full_name ?? `ID #${deviceUserId}`
}

export function AttendanceTable({ initialLogs, employees }: AttendanceTableProps) {
  const [logs, setLogs] = useState<AttendanceLog[]>(initialLogs)
  const [employeesList, setEmployeesList] = useState<Employee[]>(employees)
  const [isLive, setIsLive] = useState(false)

  // Current User & Super Admin check
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

  // Smart Clear modal state
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearMode, setClearMode] = useState<'all' | 'date' | 'employee' | 'date_employee'>('date')
  const [clearDate, setClearDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [clearEmpId, setClearEmpId] = useState('')
  const [isClearing, setIsClearing] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Add / Edit / Delete Modal State
  const [punchModalOpen, setPunchModalOpen] = useState(false)
  const [punchModalMode, setPunchModalMode] = useState<'add' | 'edit'>('add')
  const [targetPunchId, setTargetPunchId] = useState<string | null>(null)
  const [selectedEmpId, setSelectedEmpId] = useState<string>('1')
  const [punchDate, setPunchDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [punchTime, setPunchTime] = useState<string>('09:00')
  const [punchStatus, setPunchStatus] = useState<number>(0)
  const [savingPunch, setSavingPunch] = useState(false)

  // Delete single punch confirmation
  const [deleteTarget, setDeleteTarget] = useState<AttendanceLog | null>(null)
  const [isDeletingSingle, setIsDeletingSingle] = useState(false)

  // Filters
  const [dateFilter, setDateFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [nameSearch, setNameSearch] = useState('')
  const [page, setPage] = useState(0)

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text })
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Fetch Latest Logs
  const fetchLatest = async () => {
    const supabase = createClient()
    const [{ data: freshLogs }, { data: freshEmps }] = await Promise.all([
      supabase.from('attendance_logs').select('*').order('punch_time', { ascending: false }).limit(500),
      supabase.from('employees').select('*').order('full_name', { ascending: true }),
    ])
    if (freshLogs) setLogs(freshLogs)
    if (freshEmps) setEmployeesList(freshEmps)
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('attendance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        fetchLatest()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        fetchLatest()
      })
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    const interval = setInterval(fetchLatest, 15000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  // Smart Clear logs handler
  const handleClearAll = async () => {
    setIsClearing(true)
    try {
      const body: Record<string, string> = { mode: clearMode }
      if ((clearMode === 'date' || clearMode === 'date_employee') && clearDate) body.date = clearDate
      if ((clearMode === 'employee' || clearMode === 'date_employee') && clearEmpId) body.device_user_id = clearEmpId

      const res = await fetch('/api/attendance/clear', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to clear')
      // Refresh logs
      await fetchLatest()
      showToast(`Cleared ${json.deleted ?? 0} attendance record(s).`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      showToast(`Error: ${msg}`, 'error')
    } finally {
      setIsClearing(false)
      setShowClearModal(false)
    }
  }

  // Open Add Punch Modal
  const openAddModal = () => {
    setPunchModalMode('add')
    setTargetPunchId(null)
    setSelectedEmpId(employeesList[0]?.device_user_id || '1')
    setPunchDate('2026-11-02')
    setPunchTime('09:00')
    setPunchStatus(0)
    setPunchModalOpen(true)
  }

  // Open Edit Punch Modal
  const openEditModal = (log: AttendanceLog) => {
    setPunchModalMode('edit')
    setTargetPunchId(log.id)
    setSelectedEmpId(log.device_user_id)
    const pDate = new Date(log.punch_time)
    setPunchDate(format(pDate, 'yyyy-MM-dd'))
    setPunchTime(format(pDate, 'HH:mm'))
    setPunchStatus(log.status)
    setPunchModalOpen(true)
  }

  // Submit Add / Edit Punch
  const handleSavePunch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPunch(true)
    try {
      const fullIso = `${punchDate}T${punchTime}:00+08:00`
      if (punchModalMode === 'add') {
        const res = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_user_id: selectedEmpId,
            punch_time: fullIso,
            status: punchStatus,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        showToast('Attendance punch added successfully!')
      } else {
        const res = await fetch('/api/attendance', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: targetPunchId,
            device_user_id: selectedEmpId,
            punch_time: fullIso,
            status: punchStatus,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        showToast('Attendance punch updated successfully!')
      }
      setPunchModalOpen(false)
      fetchLatest()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving punch'
      showToast(msg, 'error')
    } finally {
      setSavingPunch(false)
    }
  }

  // Confirm Single Delete
  const handleDeleteSingle = async () => {
    if (!deleteTarget) return
    setIsDeletingSingle(true)
    try {
      const res = await fetch(`/api/attendance?id=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      showToast('Attendance record deleted.')
      setDeleteTarget(null)
      fetchLatest()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting punch'
      showToast(msg, 'error')
    } finally {
      setIsDeletingSingle(false)
    }
  }

  // Smart punch detection (Time In vs Time Out only — strictly no mid-shift)
  const smartRoles = useMemo(() => {
    const shiftMap = new Map<string, AttendanceLog[]>()

    for (const log of logs) {
      const opDate = getOperationalDateStr(log.punch_time)
      const key = `${log.device_user_id}_${opDate}`
      if (!shiftMap.has(key)) shiftMap.set(key, [])
      shiftMap.get(key)!.push(log)
    }

    const roleMap = new Map<string, { label: 'Time In' | 'Time Out'; badgeClass: string; icon: string }>()
    shiftMap.forEach((group) => {
      // Sort chronologically (earliest punch first)
      group.sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime())

      group.forEach((log, index) => {
        if (index === 0) {
          // The very first punch of the shift is always Time In
          roleMap.set(log.id, {
            label: 'Time In',
            badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            icon: '🟢',
          })
        } else {
          // Any subsequent punch for that shift is Time Out
          roleMap.set(log.id, {
            label: 'Time Out',
            badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
            icon: '🔴',
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
        const manilaDate = getManilaDateStr(log.punch_time)
        const opDate = getOperationalDateStr(log.punch_time)
        if (manilaDate !== dateFilter && opDate !== dateFilter) return false
      }
      if (employeeFilter && log.device_user_id !== employeeFilter) return false
      if (statusFilter !== 'all') {
        const role = smartRoles.get(log.id)
        if (statusFilter === 'in' && role?.label !== 'Time In') return false
        if (statusFilter === 'out' && role?.label !== 'Time Out') return false
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
  const uniqueEmpsCount = useMemo(() => {
    return new Set(logs.map((l) => l.device_user_id)).size
  }, [logs])

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Alert (Middle Top) */}
      {toastMessage && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-semibold transition-all animate-in fade-in slide-in-from-top-4 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-500/10'
              : 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-500/10'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-slate-600 font-bold">
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Attendance Logs Management</h1>
              <p className="text-xs text-slate-500">Live biometric punch records · Full Administrator Edit &amp; Add Controls</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isSuperAdmin && (
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Add Punch
            </button>
          )}

          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              isLive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isLive ? 'animate-pulse' : ''}`} />
            {isLive ? 'Live Sync' : 'Connecting…'}
          </span>

          {isSuperAdmin && (
            <button
              onClick={() => setShowClearModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors shadow-2xs"
              title="Clear all logs (Super Admin Only)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Stats summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Recorded Punches</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{logs.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Employees</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{uniqueEmpsCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtered View Count</p>
            <p className="text-xl font-black text-purple-700 mt-0.5">{filtered.length} entries</p>
          </div>
        </div>
      </div>

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
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Employee Dropdown */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Employee</label>
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Employees ({employeesList.length})</option>
            {[...employeesList]
              .sort((a, b) => a.full_name.localeCompare(b.full_name))
              .map((emp) => (
                <option key={emp.id} value={emp.device_user_id}>
                  {emp.full_name} (#{emp.device_user_id})
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
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Types</option>
            <option value="in">🟢 Time In</option>
            <option value="out">🔴 Time Out</option>
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
            Reset
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
            <p className="text-xs text-slate-400 mt-1">Adjust filters or click &ldquo;Add Punch&rdquo; to insert records manually.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-left">
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee Name</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">ID</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Punch Time</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Smart Type</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Raw Status</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                    {isSuperAdmin ? 'Admin Actions' : ''}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((log) => {
                  const empName = getEmployeeName(log.device_user_id, employeesList)
                  const role = smartRoles.get(log.id)
                  const gradient = getAvatarColor(empName)
                  const initials = getInitials(empName)

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-black shadow-xs flex-shrink-0`}>
                            {initials}
                          </div>
                          <span className="font-bold text-slate-900">{empName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">
                          #{log.device_user_id}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 font-semibold text-xs">
                        {formatPunchTime(log.punch_time)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {role ? (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${role.badgeClass}`}>
                            <span>{role.icon}</span>
                            {role.label}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-[11px] font-semibold text-slate-500">
                          {log.status === 0 ? 'Check In (0)' : log.status === 1 ? 'Check Out (1)' : `Status ${log.status}`}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {isSuperAdmin ? (
                          <div className="inline-flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditModal(log)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit this punch"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(log)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete this punch"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
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

      {/* Add / Edit Punch Modal */}
      {punchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-7 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {punchModalMode === 'add' ? 'Add Attendance Punch' : 'Edit Attendance Punch'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Administrator manual adjustment</p>
              </div>
              <button onClick={() => setPunchModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePunch} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Employee</label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[...employeesList]
                    .sort((a, b) => a.full_name.localeCompare(b.full_name))
                    .map((emp) => (
                      <option key={emp.id} value={emp.device_user_id}>
                        #{emp.device_user_id} — {emp.full_name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Punch Date</label>
                  <input
                    type="date"
                    required
                    value={punchDate}
                    onChange={(e) => setPunchDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Punch Time</label>
                  <input
                    type="time"
                    required
                    value={punchTime}
                    onChange={(e) => setPunchTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Punch Status</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPunchStatus(0)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      punchStatus === 0
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    🟢 Check In (0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPunchStatus(1)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      punchStatus === 1
                        ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    🔴 Check Out (1)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPunchModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPunch}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {savingPunch ? 'Saving…' : punchModalMode === 'add' ? 'Create Punch' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Single Punch Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Delete Punch?</h3>
                <p className="text-xs text-slate-400">This action removes this specific punch record.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
              Employee: <span className="font-bold text-slate-900">{getEmployeeName(deleteTarget.device_user_id, employeesList)}</span><br />
              Time: <span className="font-bold text-slate-900">{formatPunchTime(deleteTarget.punch_time)}</span>
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingSingle}
                onClick={handleDeleteSingle}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 disabled:opacity-50"
              >
                {isDeletingSingle ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Clear Logs Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-7 w-full max-w-lg border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Clear Attendance Logs</h3>
                <p className="text-xs text-slate-400">Super Admin · Select what to remove</p>
              </div>
              <button onClick={() => setShowClearModal(false)} className="ml-auto text-slate-400 hover:text-slate-600 p-1.5 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Selector */}
            <div className="mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Clear Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { mode: 'date', label: '📅 By Date', desc: 'Clear all employees on a specific day' },
                  { mode: 'employee', label: '👤 By Employee', desc: 'Clear all logs for one employee' },
                  { mode: 'date_employee', label: '🎯 Date + Employee', desc: 'Clear a specific employee on a specific day' },
                  { mode: 'all', label: '🗑️ Clear All', desc: 'Remove every log (irreversible)' },
                ] as const).map(({ mode, label, desc }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setClearMode(mode)}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      clearMode === mode
                        ? mode === 'all'
                          ? 'bg-rose-50 border-rose-300 shadow-xs'
                          : 'bg-blue-50 border-blue-300 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className={`text-xs font-black ${clearMode === mode ? (mode === 'all' ? 'text-rose-700' : 'text-blue-700') : 'text-slate-700'}`}>{label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Inputs */}
            <div className="space-y-3 mb-5">
              {(clearMode === 'date' || clearMode === 'date_employee') && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Date</label>
                  <input
                    type="date"
                    value={clearDate}
                    onChange={(e) => setClearDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              {(clearMode === 'employee' || clearMode === 'date_employee') && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Employee</label>
                  <select
                    value={clearEmpId}
                    onChange={(e) => setClearEmpId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Choose Employee —</option>
                    {[...employeesList].sort((a, b) => a.full_name.localeCompare(b.full_name)).map((emp) => (
                      <option key={emp.device_user_id} value={emp.device_user_id}>
                        {emp.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {clearMode === 'all' && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700 font-semibold leading-relaxed">
                    This will permanently delete <strong>ALL</strong> attendance logs from the database. This action cannot be undone.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={
                  isClearing ||
                  ((clearMode === 'date' || clearMode === 'date_employee') && !clearDate) ||
                  ((clearMode === 'employee' || clearMode === 'date_employee') && !clearEmpId)
                }
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 flex items-center gap-2 ${
                  clearMode === 'all'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isClearing ? 'Clearing…' : clearMode === 'all' ? 'Delete ALL Logs' : 'Confirm Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
