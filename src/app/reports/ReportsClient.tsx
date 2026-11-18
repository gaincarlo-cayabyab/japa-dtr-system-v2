'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { DailyDtr } from '@/types/database'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { normalizeDtrRecord, CalculationMode } from '@/lib/payroll'
import {
  Clock,
  Download,
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
  Trash2,
  X,
  ShieldCheck,
  MessageSquarePlus,
  Sparkles,
  Table2,
  LayoutList,
  Star,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react'
import { getHolidayForDate, getHolidayTypeBadge } from '@/lib/holidays'

export interface EmployeeInfo {
  id: string
  device_user_id: string
  full_name: string
  branch: string
  position?: string | null
  department?: string | null
}

interface ReportsClientProps {
  initialData: DailyDtr[]
  branches: string[]
  employees?: EmployeeInfo[]
  initialUser?: { role: string; username: string; displayName?: string; canEdit?: boolean } | null
  initialCanEdit?: boolean
}

interface ShiftNote {
  device_user_id: string
  work_date: string
  ot_reason: string
  attendance_status?: 'present' | 'absent' | 'leave' | 'sick_leave'
  notes?: string
  created_by_username: string
  updated_at: string
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

// Get week range (Mon–Sun) for a given date string
function getWeekRange(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr}T12:00:00`)
  const start = startOfWeek(d, { weekStartsOn: 1 }) // Monday
  const end = endOfWeek(d, { weekStartsOn: 1 })     // Sunday
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  }
}

export function ReportsClient({
  initialData,
  branches,
  employees = [],
  initialUser = null,
  initialCanEdit = false,
}: ReportsClientProps) {
  const [data, setData] = useState<DailyDtr[]>(initialData)

  // Default to today's current date (not hardcoded Nov 2)
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const defaultMonth = todayStr.slice(0, 7)

  // View mode: 'daily' | 'weekly' | 'monthly'  — default: daily
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  // Display style: 'table' (default compact grid) | 'scroll' (cards)
  const [displayMode, setDisplayMode] = useState<'scroll' | 'table'>('table')

  const [monthFilter, setMonthFilter] = useState(defaultMonth)
  const [dateFilter, setDateFilter] = useState(todayStr)
  const [weekAnchor, setWeekAnchor] = useState(todayStr)
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Calculation Mode: 'exact' (Real-Time Raw) | 'normalized' (Standard Shift Policy)
  const [calcMode, setCalcMode] = useState<CalculationMode>('exact')

  // Restore saved calculation mode preference
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('japa_calculation_mode') as CalculationMode
      if (savedMode === 'exact' || savedMode === 'normalized') {
        setCalcMode(savedMode)
      }
    } catch {}
  }, [])

  const handleToggleCalcMode = (mode: CalculationMode) => {
    setCalcMode(mode)
    try {
      localStorage.setItem('japa_calculation_mode', mode)
    } catch {}
    setToast({
      message: mode === 'normalized'
        ? '✨ Corporate Standard Shift Policy activated.'
        : '⏱️ Exact Biometrics activated (raw unadjusted timekeeping).',
      type: 'success',
    })
  }

  // Active dataset transformed by calculation mode
  const effectiveData = useMemo(() => {
    if (calcMode === 'normalized') {
      return data.map(normalizeDtrRecord)
    }
    return data
  }, [data, calcMode])

  // Restore saved date from localStorage on mount so page refreshes/edits stay on user's chosen date
  useEffect(() => {
    try {
      const savedDate = localStorage.getItem('japa_dtr_selected_date')
      if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
        setDateFilter(savedDate)
        setWeekAnchor(savedDate)
        setMonthFilter(savedDate.slice(0, 7))
      }
    } catch {
      // ignore
    }
  }, [])

  // Background Auto-Refresh & Realtime Subscription for DTR Reports
  const fetchFreshDtr = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: freshDtr } = await supabase
        .from('daily_dtr')
        .select('*')
        .order('work_date', { ascending: false })
        .order('full_name')
      if (freshDtr) {
        setData(freshDtr as DailyDtr[])
      }
    } catch (e) {
      console.error('Error refreshing DTR reports:', e)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        fetchFreshDtr()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_notes' }, () => {
        fetchFreshDtr()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        fetchFreshDtr()
      })
      .subscribe()

    const interval = setInterval(fetchFreshDtr, 15000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchFreshDtr])

  // Sync date changes across views and persist to localStorage
  const handleDateChange = (val: string) => {
    setDateFilter(val)
    setWeekAnchor(val)
    if (val.length >= 7) setMonthFilter(val.slice(0, 7))
    try {
      localStorage.setItem('japa_dtr_selected_date', val)
    } catch {}
  }

  const handleWeekAnchorChange = (val: string) => {
    setWeekAnchor(val)
    const range = getWeekRange(val)
    setDateFilter(range.start)
    if (val.length >= 7) setMonthFilter(val.slice(0, 7))
    try {
      localStorage.setItem('japa_dtr_selected_date', range.start)
    } catch {}
  }

  const handleMonthChange = (val: string) => {
    setMonthFilter(val)
    const newDate = `${val}-01`
    setDateFilter(newDate)
    setWeekAnchor(newDate)
    try {
      localStorage.setItem('japa_dtr_selected_date', newDate)
    } catch {}
  }

  // Current logged in user check (IT Admin, JAPA Manager & 1-Hour Approved Editors)
  const [currentUser, setCurrentUser] = useState<{ role: string; username: string; displayName?: string; canEdit?: boolean } | null>(initialUser)
  const [hasEditGrant, setHasEditGrant] = useState(initialCanEdit)

  const refreshUserAccess = useCallback(async () => {
    try {
      const res = await fetch(`/api/auth/me?t=${Date.now()}`, { cache: 'no-store' })
      const d = await res.json()
      if (d.authenticated && d.user) {
        setCurrentUser(d.user)
        if (d.user.canEdit) setHasEditGrant(true)
      }
    } catch {}
  }, [])

  useEffect(() => {
    refreshUserAccess()
    const interval = setInterval(refreshUserAccess, 5000)
    return () => clearInterval(interval)
  }, [refreshUserAccess])

  // Listen for temporary 1-hour edit access changes
  useEffect(() => {
    const checkGrant = async () => {
      try {
        const res = await fetch(`/api/auth/edit-access?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (currentUser?.username && data.activeGrants?.[currentUser.username]?.active) {
            setHasEditGrant(true)
          } else if (currentUser?.role !== 'super_admin' && currentUser?.role !== 'manager' && currentUser?.username !== 'admin' && currentUser?.username !== 'japa_manager') {
            setHasEditGrant(false)
          }
        }
      } catch {}
    }

    checkGrant()
    const onAccessChanged = (e: any) => {
      const grants = e.detail?.activeGrants
      if (currentUser?.username && grants?.[currentUser.username]?.active) {
        setHasEditGrant(true)
      } else if (currentUser?.role !== 'super_admin' && currentUser?.role !== 'manager' && currentUser?.username !== 'admin' && currentUser?.username !== 'japa_manager') {
        setHasEditGrant(false)
      }
    }
    window.addEventListener('japa_edit_access_changed', onAccessChanged)
    const interval = setInterval(checkGrant, 5000)
    return () => {
      window.removeEventListener('japa_edit_access_changed', onAccessChanged)
      clearInterval(interval)
    }
  }, [currentUser])

  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'admin'
  const isManager = currentUser?.role === 'manager' || currentUser?.username === 'japa_manager'
  const canAddEditDelete = isSuperAdmin || isManager || hasEditGrant || Boolean(currentUser?.canEdit) || initialCanEdit

  // OT Reason Modal state
  const [shiftNotes, setShiftNotes] = useState<Record<string, ShiftNote>>({})
  const [otModalOpen, setOtModalOpen] = useState(false)
  const [otModalRow, setOtModalRow] = useState<DailyDtr | null>(null)
  const [otReasonInput, setOtReasonInput] = useState('')
  const [savingOtReason, setSavingOtReason] = useState(false)

  // Fetch shift notes for visible data & active dates
  const fetchShiftNotes = useCallback(async (datesList: string[]) => {
    if (datesList.length === 0) return
    try {
      const res = await fetch(`/api/attendance/ot-reason?dates=${datesList.join(',')}`)
      if (!res.ok) return
      const json = await res.json()
      const map: Record<string, ShiftNote> = {}
      ;(json.data ?? []).forEach((n: ShiftNote) => {
        map[`${n.device_user_id}_${n.work_date}`] = n
      })
      setShiftNotes((prev) => ({ ...prev, ...map }))
    } catch {
      // silent
    }
  }, [])

  // Edit Shift Modal State
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<DailyDtr | null>(null)
  const [editAttendanceStatus, setEditAttendanceStatus] = useState<'present' | 'absent' | 'leave' | 'sick_leave'>('present')
  const [editNotes, setEditNotes] = useState<string>('')
  const [editInTime, setEditInTime] = useState<string>('09:00')
  const [editOutTime, setEditOutTime] = useState<string>('18:00')
  const [hasInTime, setHasInTime] = useState(true)
  const [hasOutTime, setHasOutTime] = useState(true)
  const [savingShift, setSavingShift] = useState(false)
  const [deletingShift, setDeletingShift] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Auto-dismiss notification after 3 seconds
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      setToast(null)
    }, 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const filtered = useMemo(() => {
    const weekRange = viewMode === 'weekly' ? getWeekRange(weekAnchor) : null
    return effectiveData.filter((row) => {
      if (branchFilter && row.branch !== branchFilter) return false
      if (statusFilter !== 'all' && row.shift_status !== statusFilter) return false
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase()
        const matchName = row.full_name?.toLowerCase().includes(q)
        const matchId = String(row.device_user_id).includes(q)
        if (!matchName && !matchId) return false
      }
      if (viewMode === 'monthly') return row.work_date.startsWith(monthFilter)
      if (viewMode === 'weekly' && weekRange) return row.work_date >= weekRange.start && row.work_date <= weekRange.end
      return row.work_date === dateFilter
    })
  }, [effectiveData, viewMode, monthFilter, dateFilter, weekAnchor, branchFilter, statusFilter, searchQuery])

  // Summary statistics
  const uniqueEmployees = new Set(filtered.map((r) => r.employee_id)).size
  const totalRegularHours = filtered.reduce((acc, r) => acc + Math.min(8, Number(r.hours_worked || 0)), 0)
  const totalOvertimeHours = filtered.reduce((acc, r) => acc + Number(r.overtime_hours || 0), 0)
  const completedShifts = filtered.filter((r) => r.shift_status === 'Completed').length
  const onDutyShifts = filtered.filter((r) => r.shift_status === 'On Duty').length
  const incompleteShifts = filtered.filter((r) => r.shift_status === 'Incomplete').length

  // Dates range to display in the Daily Attendance Volume graph:
  // - Daily mode: 7 days of the active week (Monday to Sunday) containing dateFilter
  // - Weekly mode: 7 days of the active week (Monday to Sunday)
  // - Monthly mode: all days of the active month (1 - 30/31)
  const chartDates = useMemo(() => {
    if (viewMode === 'monthly') {
      const [year, month] = monthFilter.split('-').map(Number)
      const daysInMonth = new Date(year, month, 0).getDate()
      return Array.from({ length: daysInMonth }, (_, i) => {
        const dayStr = String(i + 1).padStart(2, '0')
        return `${monthFilter}-${dayStr}`
      })
    }
    // Daily or Weekly mode: 7 days of the week (Monday through Sunday)
    const anchorDate = viewMode === 'weekly' ? weekAnchor : dateFilter
    const weekRange = getWeekRange(anchorDate)
    const [startY, startM, startD] = weekRange.start.split('-').map(Number)
    const startUtc = new Date(Date.UTC(startY, startM - 1, startD, 12, 0, 0))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startUtc.getTime() + i * 24 * 60 * 60 * 1000)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    })
  }, [viewMode, monthFilter, weekAnchor, dateFilter])

  // Daily attendance chart data (with accurate turnout and interactive bars)
  const dailyAttendanceData = useMemo(() => {
    const totalStaffCount = employees && employees.length > 0 ? employees.length : 23
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return chartDates.map((dateStr) => {
      // Find all records for this date from the master dataset
      const dateRecords = effectiveData.filter((r) => {
        if (r.work_date !== dateStr) return false
        if (branchFilter && r.branch !== branchFilter) return false
        return true
      })

      // Count actual attendees: employee has time in, punches, or hours worked > 0
      const presentRecords = dateRecords.filter(
        (r) => Boolean(r.first_check_in || Number(r.hours_worked || 0) > 0 || Number(r.total_punches || 0) > 0)
      )

      const presentCount = presentRecords.length
      const otHours = presentRecords.reduce((acc, r) => acc + Number(r.overtime_hours || 0), 0)
      const completedCount = presentRecords.filter((r) => r.shift_status === 'Completed').length
      const onDutyCount = presentRecords.filter((r) => r.shift_status === 'On Duty').length

      const holiday = getHolidayForDate(dateStr)
      const [y, m, d] = dateStr.split('-').map(Number)
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
      const isSunday = dayOfWeek === 0

      return {
        date: dateStr,
        dayOfMonth: d,
        dayOfWeek,
        dayName: dayNames[dayOfWeek],
        isSunday,
        holiday,
        count: presentCount,
        presentCount,
        totalStaff: totalStaffCount,
        absentCount: Math.max(0, totalStaffCount - presentCount),
        otHours: Math.round(otHours * 10) / 10,
        completedCount,
        onDutyCount,
        isSelected: dateStr === dateFilter,
      }
    })
  }, [chartDates, effectiveData, branchFilter, employees, dateFilter])

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

  // Master list of all employees (sorted A to Z)
  const allEmployeesList = useMemo(() => {
    if (employees && employees.length > 0) {
      return [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name))
    }
    const map = new Map<string, EmployeeInfo>()
    effectiveData.forEach((r) => {
      if (!map.has(r.device_user_id)) {
        map.set(r.device_user_id, {
          id: r.employee_id,
          device_user_id: r.device_user_id,
          full_name: r.full_name,
          branch: r.branch,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [employees, effectiveData])

  // Daily Roster: All employees for dateFilter with Attendance / Absent / Leave status
  // When an employee has no punch / no data, status is 'None' (renders as '—')
  const dailyEmployees = useMemo(() => {
    const list = allEmployeesList.filter((emp) => {
      if (branchFilter && emp.branch !== branchFilter) return false
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase()
        if (!emp.full_name.toLowerCase().includes(q) && !emp.device_user_id.includes(q)) return false
      }
      return true
    })

    const [y, m, d] = dateFilter.split('-').map(Number)
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    const holiday = getHolidayForDate(dateFilter)

    const mapped = list.map((emp) => {
      const isMonFri = emp.full_name.includes('GAIN CARLO')
      const isRestDay = isMonFri ? (dayOfWeek === 0 || dayOfWeek === 6) : (dayOfWeek === 0)
      const rec = effectiveData.find(
        (r) => String(r.device_user_id) === String(emp.device_user_id) && r.work_date === dateFilter
      )
      const note = shiftNotes[`${emp.device_user_id}_${dateFilter}`]

      let computedStatus: 'Completed' | 'On Duty' | 'Incomplete' | 'Absent' | 'Leave' | 'Sick Leave' | 'Rest Day' | 'None' = 'None'

      if (note?.attendance_status === 'leave') {
        computedStatus = 'Leave'
      } else if (note?.attendance_status === 'sick_leave') {
        computedStatus = 'Sick Leave'
      } else if (note?.attendance_status === 'absent') {
        computedStatus = 'Absent'
      } else if (rec && (Number(rec.hours_worked || 0) > 0 || rec.first_check_in)) {
        computedStatus = rec.shift_status as any
      } else if (isRestDay) {
        computedStatus = 'Rest Day'
      } else {
        // No attendance data recorded yet -> display as '—'
        computedStatus = 'None'
      }

      return {
        emp,
        rec,
        note,
        computedStatus,
        isRestDay,
        holiday,
        isMonFri,
      }
    })

    const filteredByStatus = mapped.filter((item) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'Completed') return item.computedStatus === 'Completed'
      if (statusFilter === 'On Duty') return item.computedStatus === 'On Duty'
      if (statusFilter === 'Incomplete') return item.computedStatus === 'Incomplete'
      if (statusFilter === 'Absent') return item.computedStatus === 'Absent'
      if (statusFilter === 'Leave') return item.computedStatus === 'Leave' || item.computedStatus === 'Sick Leave'
      return true
    })

    const dagupan = filteredByStatus.filter((item) => item.emp.branch !== 'Manila')
    const manila = filteredByStatus.filter((item) => item.emp.branch === 'Manila')

    return { dagupanDaily: dagupan, manilaDaily: manila }
  }, [allEmployeesList, branchFilter, searchQuery, dateFilter, effectiveData, shiftNotes, statusFilter])

  // 7 Calendar days for the active week (Mon through Sun)
  const weekDays = useMemo(() => {
    const range = getWeekRange(weekAnchor)
    const [startY, startM, startD] = range.start.split('-').map(Number)
    const startDate = new Date(Date.UTC(startY, startM - 1, startD, 12, 0, 0))
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      const dateStr = `${y}-${m}-${day}`
      const holiday = getHolidayForDate(dateStr)
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const dayName = dayNames[d.getUTCDay()]
      return {
        dateStr,
        dayName,
        dayNum: day,
        label: `${dayName} ${m}/${day}`,
        holiday,
        isSunday: d.getUTCDay() === 0,
        isSaturday: d.getUTCDay() === 6,
      }
    })
  }, [weekAnchor])

  // Grouped employees for Weekly Matrix View (A to Z, split into Dagupan & Manila)
  const weeklyEmployees = useMemo(() => {
    if (viewMode !== 'weekly') return { dagupanWeekly: [], manilaWeekly: [] }

    const empMap = new Map<string, {
      id: string
      device_user_id: string
      full_name: string
      branch: string
      isMonFri: boolean
      records: Map<string, DailyDtr>
      daysWorked: number
      totalHours: number
      totalRegularHours: number
      totalOt: number
      completedCount: number
    }>()

    allEmployeesList.forEach((emp) => {
      if (branchFilter && emp.branch !== branchFilter) return
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase()
        if (!emp.full_name?.toLowerCase().includes(q) && !String(emp.device_user_id).includes(q)) return
      }

      const isMonFri = emp.full_name?.includes('GAIN CARLO')
      empMap.set(emp.device_user_id, {
        id: emp.id,
        device_user_id: emp.device_user_id,
        full_name: emp.full_name,
        branch: emp.branch,
        isMonFri,
        records: new Map(),
        daysWorked: 0,
        totalHours: 0,
        totalRegularHours: 0,
        totalOt: 0,
        completedCount: 0,
      })
    })

    filtered.forEach((r) => {
      const emp = empMap.get(r.device_user_id)
      if (emp) {
        emp.records.set(r.work_date, r)
        const hrs = Number(r.hours_worked || 0)
        const ot = Number(r.overtime_hours || 0)
        emp.totalHours += hrs
        emp.totalRegularHours += Math.min(8, hrs)
        emp.totalOt += ot
        if (hrs > 0 || r.first_check_in) emp.daysWorked += 1
        if (r.shift_status === 'Completed') emp.completedCount += 1
      }
    })

    const list = Array.from(empMap.values())
      .filter((e) => {
        if (statusFilter === 'Completed' && e.completedCount === 0) return false
        if (statusFilter === 'On Duty' && !Array.from(e.records.values()).some((r) => r.shift_status === 'On Duty')) return false
        if (statusFilter === 'Incomplete' && !Array.from(e.records.values()).some((r) => r.shift_status === 'Incomplete')) return false
        return true
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name))

    return {
      dagupanWeekly: list.filter((e) => e.branch !== 'Manila'),
      manilaWeekly: list.filter((e) => e.branch === 'Manila'),
    }
  }, [viewMode, allEmployeesList, filtered, branchFilter, searchQuery, statusFilter])

  // Grouped employees for Monthly Summary View (A to Z, split into Dagupan & Manila)
  const monthlyEmployees = useMemo(() => {
    if (viewMode !== 'monthly') return { dagupanMonthly: [], manilaMonthly: [] }

    const empMap = new Map<string, {
      id: string
      device_user_id: string
      full_name: string
      branch: string
      isMonFri: boolean
      daysWorked: number
      totalHours: number
      totalRegularHours: number
      totalOt: number
      completedCount: number
      incompleteCount: number
      shifts: DailyDtr[]
    }>()

    allEmployeesList.forEach((emp) => {
      if (branchFilter && emp.branch !== branchFilter) return
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase()
        if (!emp.full_name?.toLowerCase().includes(q) && !String(emp.device_user_id).includes(q)) return
      }

      const isMonFri = emp.full_name?.includes('GAIN CARLO')
      empMap.set(emp.device_user_id, {
        id: emp.id,
        device_user_id: emp.device_user_id,
        full_name: emp.full_name,
        branch: emp.branch,
        isMonFri,
        daysWorked: 0,
        totalHours: 0,
        totalRegularHours: 0,
        totalOt: 0,
        completedCount: 0,
        incompleteCount: 0,
        shifts: [],
      })
    })

    filtered.forEach((r) => {
      const emp = empMap.get(r.device_user_id)
      if (emp) {
        emp.shifts.push(r)
        const hrs = Number(r.hours_worked || 0)
        const ot = Number(r.overtime_hours || 0)
        emp.totalHours += hrs
        emp.totalRegularHours += Math.min(8, hrs)
        emp.totalOt += ot
        if (hrs > 0 || r.first_check_in) emp.daysWorked += 1
        if (r.shift_status === 'Completed') emp.completedCount += 1
        if (r.shift_status === 'Incomplete') emp.incompleteCount += 1
      }
    })

    const list = Array.from(empMap.values())
      .filter((e) => {
        if (statusFilter === 'Completed' && e.completedCount === 0) return false
        if (statusFilter === 'On Duty' && !e.shifts.some((r) => r.shift_status === 'On Duty')) return false
        if (statusFilter === 'Incomplete' && e.incompleteCount === 0) return false
        return true
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name))

    return {
      dagupanMonthly: list.filter((e) => e.branch !== 'Manila'),
      manilaMonthly: list.filter((e) => e.branch === 'Manila'),
    }
  }, [viewMode, allEmployeesList, filtered, branchFilter, searchQuery, statusFilter])

  // Fetch shift notes whenever date/view changes
  useEffect(() => {
    let datesToFetch: string[] = []
    if (viewMode === 'daily') {
      datesToFetch = [dateFilter]
    } else if (viewMode === 'weekly') {
      const range = getWeekRange(weekAnchor)
      const [startY, startM, startD] = range.start.split('-').map(Number)
      const startDate = new Date(Date.UTC(startY, startM - 1, startD, 12, 0, 0))
      datesToFetch = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      })
    } else {
      datesToFetch = Array.from(new Set(filtered.map((r) => r.work_date)))
    }
    if (datesToFetch.length > 0) {
      fetchShiftNotes(datesToFetch)
    }
  }, [viewMode, dateFilter, weekAnchor, filtered, fetchShiftNotes])

  // Open OT Reason Modal
  const openOtModal = (row: DailyDtr) => {
    setOtModalRow(row)
    const key = `${row.device_user_id}_${row.work_date}`
    setOtReasonInput(shiftNotes[key]?.ot_reason ?? '')
    setOtModalOpen(true)
  }

  // Save OT Reason
  const handleSaveOtReason = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otModalRow) return
    setSavingOtReason(true)
    try {
      const res = await fetch('/api/attendance/ot-reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_user_id: otModalRow.device_user_id,
          work_date: otModalRow.work_date,
          ot_reason: otReasonInput,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setShiftNotes((prev) => ({
        ...prev,
        [`${otModalRow.device_user_id}_${otModalRow.work_date}`]: json.data,
      }))
      setToast({ message: `OT reason saved for ${otModalRow.full_name}!`, type: 'success' })
      setOtModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving OT reason'
      setToast({ message: msg, type: 'error' })
    } finally {
      setSavingOtReason(false)
    }
  }

  const maxDailyCount = Math.max(
    employees && employees.length > 0 ? employees.length : 23,
    ...dailyAttendanceData.map((d) => d.count),
    1
  )

  // Open Edit Shift Modal with attendance status & notes
  const openEditShift = (row: DailyDtr, existingNote?: ShiftNote) => {
    setEditRow(row)
    const note = existingNote || shiftNotes[`${row.device_user_id}_${row.work_date}`]
    const defaultStatus = note?.attendance_status || (row.first_check_in ? 'present' : (note ? 'absent' : 'present'))
    setEditAttendanceStatus(defaultStatus)
    setEditNotes(note?.notes || note?.ot_reason || '')

    if (row.first_check_in) {
      setHasInTime(true)
      try {
        setEditInTime(format(new Date(row.first_check_in), 'HH:mm'))
      } catch {
        setEditInTime('09:00')
      }
    } else {
      setHasInTime(true)
      setEditInTime('09:00')
    }

    if (row.last_check_out) {
      setHasOutTime(true)
      try {
        setEditOutTime(format(new Date(row.last_check_out), 'HH:mm'))
      } catch {
        setEditOutTime('18:00')
      }
    } else {
      setHasOutTime(Boolean(row.last_check_out))
      setEditOutTime('18:00')
    }

    setEditModalOpen(true)
  }

  // Open edit for any employee on any date (even if absent / no punches recorded)
  const openEditForEmployee = (emp: { device_user_id: string; full_name: string; branch: string }, dateStr: string) => {
    const existingRec = data.find((r) => String(r.device_user_id) === String(emp.device_user_id) && r.work_date === dateStr)
    const note = shiftNotes[`${emp.device_user_id}_${dateStr}`]
    const row: DailyDtr = existingRec || {
      employee_id: emp.device_user_id,
      device_user_id: emp.device_user_id,
      full_name: emp.full_name,
      branch: emp.branch,
      work_date: dateStr,
      first_check_in: null,
      last_check_out: null,
      total_punches: 0,
      hours_worked: 0,
      overtime_hours: 0,
      shift_status: 'Incomplete',
    }
    openEditShift(row, note)
  }

  // Handle Save Shift (No Page Reload, Instant State Update)
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
          first_check_in: editAttendanceStatus === 'present' && hasInTime ? editInTime : null,
          last_check_out: editAttendanceStatus === 'present' && hasOutTime ? editOutTime : null,
          has_in_time: editAttendanceStatus === 'present' && hasInTime,
          has_out_time: editAttendanceStatus === 'present' && hasOutTime,
          attendance_status: editAttendanceStatus,
          notes: editNotes,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      // Update shift notes map locally
      const noteKey = `${editRow.device_user_id}_${editRow.work_date}`
      setShiftNotes((prev) => ({
        ...prev,
        [noteKey]: {
          device_user_id: editRow.device_user_id,
          work_date: editRow.work_date,
          ot_reason: editNotes,
          attendance_status: editAttendanceStatus,
          notes: editNotes,
          created_by_username: currentUser?.username || 'admin',
          updated_at: new Date().toISOString(),
        },
      }))

      // Update data rows locally without needing page reload
      setData((prev) => {
        const idx = prev.findIndex(
          (r) => String(r.device_user_id) === String(editRow.device_user_id) && r.work_date === editRow.work_date
        )
        if (json.updatedDtr) {
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = json.updatedDtr
            return next
          }
          return [...prev, json.updatedDtr]
        } else {
          // If updatedDtr is null (cleared punches / marked absent or leave), remove from data
          if (idx >= 0) {
            const next = [...prev]
            next.splice(idx, 1)
            return next
          }
        }
        return prev
      })

      // Background re-sync shift notes
      fetchShiftNotes([editRow.work_date])

      // Persist active date so the view remains on this exact date
      try {
        localStorage.setItem('japa_dtr_selected_date', editRow.work_date)
      } catch {}

      setToast({ message: `Updated shift for ${editRow.full_name} on ${editRow.work_date}!`, type: 'success' })
      setEditModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating shift'
      setToast({ message: msg, type: 'error' })
    } finally {
      setSavingShift(false)
    }
  }

  // Handle Delete Shift / Reset Punches
  const handleDeleteShift = async () => {
    if (!editRow) return
    if (!window.confirm(`Are you sure you want to delete all punches and records for ${editRow.full_name} on ${editRow.work_date}?`)) {
      return
    }
    setDeletingShift(true)
    try {
      const res = await fetch('/api/reports/shift', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_user_id: editRow.device_user_id,
          work_date: editRow.work_date,
          action: 'delete_all',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      // Remove from data and shiftNotes
      setData((prev) =>
        prev.filter(
          (r) => !(String(r.device_user_id) === String(editRow.device_user_id) && r.work_date === editRow.work_date)
        )
      )
      const noteKey = `${editRow.device_user_id}_${editRow.work_date}`
      setShiftNotes((prev) => {
        const next = { ...prev }
        delete next[noteKey]
        return next
      })

      setToast({ message: `Punches and records deleted for ${editRow.full_name} on ${editRow.work_date}!`, type: 'success' })
      setEditModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting shift'
      setToast({ message: msg, type: 'error' })
    } finally {
      setDeletingShift(false)
    }
  }

  function exportExcel() {
    let startDate = dateFilter
    let endDate = dateFilter
    if (viewMode === 'monthly') {
      startDate = `${monthFilter}-01`
      endDate = `${monthFilter}-31`
    } else if (viewMode === 'weekly') {
      const range = getWeekRange(weekAnchor)
      startDate = range.start
      endDate = range.end
    }

    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      calc_mode: calcMode,
    })
    if (branchFilter) params.append('branch', branchFilter)
    window.open(`/api/reports/excel?${params.toString()}`, '_blank')
  }

  function exportCSV() {
    let label = dateFilter
    if (viewMode === 'monthly') {
      label = monthFilter
    } else if (viewMode === 'weekly') {
      const range = getWeekRange(weekAnchor)
      label = `week_${range.start}_to_${range.end}`
    }

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
    a.download = `JAPA_DTR_${calcMode === 'normalized' ? 'Normalized' : 'Exact'}_${label}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ──────────────────────────────────────────────────────────────────────────
     RENDER HELPERS (DAILY, WEEKLY, MONTHLY TABLES & CARDS)
     ────────────────────────────────────────────────────────────────────────── */

  const renderDailyTable = (
    items: typeof dailyEmployees.dagupanDaily,
    title: string,
    bgHeader: string,
    textHeader: string,
    borderHeader: string
  ) => {
    return (
      <div>
        <div className={`px-4 py-2.5 border-b flex items-center justify-between ${bgHeader} ${borderHeader}`}>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black uppercase tracking-wider ${textHeader}`}>{title}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border text-slate-700">
              {items.length} Staff (A to Z)
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="px-3.5 py-2.5 text-left sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[190px]">
                  Employee Name
                </th>
                <th className="px-3 py-2.5 text-center border-r border-slate-100 min-w-[70px]">Date</th>
                <th className="px-3 py-2.5 text-center text-emerald-700 border-r border-slate-100 min-w-[85px]">Time In</th>
                <th className="px-3 py-2.5 text-center text-rose-700 border-r border-slate-100 min-w-[85px]">Time Out</th>
                <th className="px-3 py-2.5 text-center border-r border-slate-100 min-w-[65px]">Hours</th>
                <th className="px-3 py-2.5 text-center text-purple-700 border-r border-slate-100 min-w-[65px]">OT</th>
                <th className="px-3 py-2.5 text-center border-r border-slate-100 min-w-[110px]">Status</th>
                <th className="px-3.5 py-2.5 text-left text-amber-800 min-w-[160px]">Remarks / Reason</th>
                {canAddEditDelete && (
                  <th className="px-3 py-2.5 text-center text-blue-700 min-w-[100px]">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const gradient = getAvatarColor(item.emp.full_name)
                const initials = getInitials(item.emp.full_name)
                const ot = Number(item.rec?.overtime_hours || 0)
                const holiday = item.holiday
                const note = item.note

                return (
                  <tr
                    key={`${item.emp.device_user_id}-${dateFilter}-${idx}`}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      holiday ? 'bg-amber-50/15' : item.isRestDay ? 'bg-slate-50/40' : ''
                    }`}
                  >
                    {/* Name */}
                    <td className="px-3.5 py-2 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[10px] font-black flex-shrink-0`}>
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-xs truncate max-w-[150px]">{item.emp.full_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-slate-400 font-mono">#{item.emp.device_user_id}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${
                              item.isMonFri ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {item.isMonFri ? 'M–F' : 'M–S'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-3 py-2 text-center border-r border-slate-100">
                      <span className="font-bold text-slate-800 text-xs">{dateFilter.slice(5)}</span>
                    </td>

                    {/* Time In */}
                    <td className="px-3 py-2 text-center border-r border-slate-100">
                      {item.rec?.first_check_in ? (
                        <span className="font-mono font-bold text-emerald-700 text-xs">
                          {formatTime(item.rec.first_check_in)}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* Time Out */}
                    <td className="px-3 py-2 text-center border-r border-slate-100">
                      {item.rec?.last_check_out ? (
                        <span className="font-mono font-bold text-rose-700 text-xs">
                          {formatTime(item.rec.last_check_out)}
                        </span>
                      ) : item.rec?.first_check_in ? (
                        <span className="text-blue-500 font-semibold italic text-[11px]">On Duty…</span>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* Hours */}
                    <td className="px-3 py-2 text-center border-r border-slate-100">
                      {item.rec?.hours_worked && Number(item.rec.hours_worked) > 0 ? (
                        <span className="font-black text-slate-800 text-xs">
                          {formatHoursWorked(Number(item.rec.hours_worked))}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* OT */}
                    <td className="px-3 py-2 text-center border-r border-slate-100">
                      {ot > 0 ? (
                        <span className="text-purple-700 font-black text-xs">+{ot.toFixed(1)}h</span>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* Status Badge — Display '—' when no data recorded */}
                    <td className="px-3 py-2 text-center border-r border-slate-100">
                      {item.computedStatus === 'Completed' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Completed
                        </span>
                      )}
                      {item.computedStatus === 'On Duty' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping mr-1" />
                          On Duty
                        </span>
                      )}
                      {item.computedStatus === 'Incomplete' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Incomplete
                        </span>
                      )}
                      {item.computedStatus === 'Absent' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          ❌ Absent
                        </span>
                      )}
                      {item.computedStatus === 'Leave' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                          🌴 Vacation Leave
                        </span>
                      )}
                      {item.computedStatus === 'Sick Leave' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                          🩺 Sick Leave
                        </span>
                      )}
                      {item.computedStatus === 'Rest Day' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          Rest Day
                        </span>
                      )}
                      {item.computedStatus === 'None' && (
                        <span className="text-slate-300 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* Remarks / Reason */}
                    <td className="px-3.5 py-2">
                      {note?.notes || note?.ot_reason ? (
                        <span className="text-[11px] text-amber-800 font-semibold leading-relaxed">
                          💬 {note.notes || note.ot_reason}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300 italic">—</span>
                      )}
                    </td>

                    {/* Action Column for Authorized Editors */}
                    {canAddEditDelete && (
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => openEditForEmployee(item.emp, dateFilter)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[10px] font-bold transition-colors"
                          title="Edit shift or attendance status"
                        >
                          <Edit2 className="w-2.5 h-2.5" /> Edit Shift
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderDailyCards = (
    items: typeof dailyEmployees.dagupanDaily,
    title: string,
    bgHeader: string,
    textHeader: string,
    borderHeader: string
  ) => {
    return (
      <div className="space-y-3">
        <div className={`px-4 py-2.5 rounded-2xl border flex items-center justify-between ${bgHeader} ${borderHeader}`}>
          <span className={`text-xs font-black uppercase tracking-wider ${textHeader}`}>{title}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border text-slate-700">
            {items.length} Staff (A to Z)
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item, idx) => {
            const gradient = getAvatarColor(item.emp.full_name)
            const initials = getInitials(item.emp.full_name)
            const note = item.note

            return (
              <div
                key={`card-${item.emp.device_user_id}-${dateFilter}-${idx}`}
                className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-black shadow-xs flex-shrink-0`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-xs truncate">{item.emp.full_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">#{item.emp.device_user_id} · {item.emp.branch}</p>
                    </div>
                  </div>
                  <div>
                    {item.computedStatus === 'Completed' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Completed
                      </span>
                    )}
                    {item.computedStatus === 'On Duty' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        On Duty
                      </span>
                    )}
                    {item.computedStatus === 'Incomplete' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Incomplete
                      </span>
                    )}
                    {item.computedStatus === 'Absent' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        ❌ Absent
                      </span>
                    )}
                    {item.computedStatus === 'Leave' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                        🌴 VL
                      </span>
                    )}
                    {item.computedStatus === 'Sick Leave' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                        🩺 SL
                      </span>
                    )}
                    {item.computedStatus === 'Rest Day' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        Rest Day
                      </span>
                    )}
                    {item.computedStatus === 'None' && (
                      <span className="text-slate-300 font-mono text-xs">—</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 border-t border-slate-100">
                  <div className="p-1.5 rounded-lg bg-slate-50">
                    <p className="text-[9px] uppercase font-bold text-slate-400">Time In</p>
                    <p className="font-mono font-bold text-emerald-700 text-[11px] mt-0.5">
                      {item.rec?.first_check_in ? formatTime(item.rec.first_check_in) : '—'}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-slate-50">
                    <p className="text-[9px] uppercase font-bold text-slate-400">Time Out</p>
                    <p className="font-mono font-bold text-rose-700 text-[11px] mt-0.5">
                      {item.rec?.last_check_out ? formatTime(item.rec.last_check_out) : item.rec?.first_check_in ? 'On Duty' : '—'}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-emerald-50/70 border border-emerald-100">
                    <p className="text-[9px] uppercase font-bold text-emerald-700">Hours</p>
                    <p className="font-mono font-black text-emerald-900 text-[11px] mt-0.5">
                      {item.rec?.hours_worked && Number(item.rec.hours_worked) > 0 ? formatHoursWorked(Number(item.rec.hours_worked)) : '—'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[10px] text-amber-800 font-semibold truncate max-w-[170px]" title={note?.notes || note?.ot_reason}>
                    {note?.notes || note?.ot_reason ? `💬 ${note.notes || note.ot_reason}` : ''}
                  </span>
                  {canAddEditDelete && (
                    <button
                      type="button"
                      onClick={() => openEditForEmployee(item.emp, dateFilter)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-[10px] font-bold"
                    >
                      <Edit2 className="w-2.5 h-2.5" /> Edit
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderWeeklyTable = (
    items: typeof weeklyEmployees.dagupanWeekly,
    title: string,
    bgHeader: string,
    textHeader: string,
    borderHeader: string
  ) => {
    return (
      <div>
        <div className={`px-4 py-2.5 border-b flex items-center justify-between ${bgHeader} ${borderHeader}`}>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black uppercase tracking-wider ${textHeader}`}>{title}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border text-slate-700">
              {items.length} Staff (A to Z)
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200">
                <th className="px-3.5 py-3 text-left font-black text-slate-700 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 min-w-[200px]">
                  Employee Name
                </th>
                {weekDays.map((day) => (
                  <th
                    key={day.dateStr}
                    className={`px-2.5 py-2.5 text-center font-bold border-r border-slate-200 min-w-[125px] ${
                      day.isSunday ? 'bg-slate-100/70 text-slate-500' : 'text-slate-700'
                    } ${day.holiday ? 'bg-amber-50/80 text-amber-900' : ''}`}
                  >
                    <div className="text-[11px] font-black uppercase tracking-wider">{day.dayName}</div>
                    <div className="text-[11px] font-mono text-slate-500">{day.dayNum}</div>
                    {day.holiday && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200/90 text-amber-900 border border-amber-300">
                        🎌 {day.holiday.name.slice(0, 15)}
                      </span>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center font-black text-blue-700 border-r border-slate-200 min-w-[60px]">Days</th>
                <th className="px-3 py-2.5 text-center font-black text-slate-700 border-r border-slate-200 min-w-[65px]">Reg Hrs</th>
                <th className="px-3 py-2.5 text-center font-black text-purple-700 border-r border-slate-200 min-w-[65px]">OT Hrs</th>
                <th className="px-3 py-2.5 text-center font-black text-emerald-800 min-w-[75px]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((emp) => {
                const gradient = getAvatarColor(emp.full_name)
                const initials = getInitials(emp.full_name)
                return (
                  <tr key={emp.device_user_id} className="hover:bg-slate-50/70 transition-colors group">
                    {/* Sticky Employee Name Column */}
                    <td className="px-3.5 py-2.5 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[10px] font-black shadow-2xs flex-shrink-0`}>
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-xs truncate max-w-[140px] leading-tight">{emp.full_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-slate-400 font-mono">#{emp.device_user_id}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${emp.isMonFri ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                              {emp.isMonFri ? 'M–F' : 'M–S'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 7 Day Columns */}
                    {weekDays.map((day) => {
                      const rec = emp.records.get(day.dateStr)
                      const isRestDay = day.isSunday || (emp.isMonFri && day.isSaturday)
                      const noteKey = `${emp.device_user_id}_${day.dateStr}`
                      const note = shiftNotes[noteKey]

                      return (
                        <td
                          key={day.dateStr}
                          className={`px-2 py-2 text-center border-r border-slate-100 relative ${
                            day.isSunday ? 'bg-slate-50/50' : ''
                          } ${day.holiday ? 'bg-amber-50/20' : ''}`}
                        >
                          {rec && (Number(rec.hours_worked || 0) > 0 || rec.first_check_in) ? (
                            <div className="space-y-0.5">
                              <div className="font-mono text-[10px] font-bold text-slate-800 leading-tight">
                                <span className="text-emerald-700">{formatTime(rec.first_check_in).replace(':00', '')}</span>
                                <span className="text-slate-300 mx-0.5">–</span>
                                <span className="text-rose-700">{rec.last_check_out ? formatTime(rec.last_check_out).replace(':00', '') : '…'}</span>
                              </div>
                              <div className="flex items-center justify-center gap-1">
                                <span className="px-1.5 py-0.2 rounded font-bold text-[10px] bg-slate-100 text-slate-800">
                                  {formatHoursWorked(rec.hours_worked)}
                                </span>
                                {rec.overtime_hours > 0 && (
                                  <span className="px-1 py-0.2 rounded font-black text-[9px] bg-purple-100 text-purple-800 border border-purple-200">
                                    +{rec.overtime_hours.toFixed(1)}h
                                  </span>
                                )}
                                {canAddEditDelete && (
                                  <button
                                    type="button"
                                    onClick={() => openEditShift(rec, note)}
                                    className="p-0.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                                    title="Edit shift"
                                  >
                                    <Edit2 className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                              {(note?.notes || note?.ot_reason) && (
                                <p className="text-[9px] text-amber-700 font-semibold truncate max-w-[110px]" title={note.notes || note.ot_reason}>
                                  💬 {note.notes || note.ot_reason}
                                </p>
                              )}
                            </div>
                          ) : note?.attendance_status === 'leave' ? (
                            <div className="flex items-center justify-center gap-1">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200" title={note.notes}>
                                🌴 Leave
                              </span>
                              {canAddEditDelete && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="p-0.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                                  title="Edit status"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : note?.attendance_status === 'sick_leave' ? (
                            <div className="flex items-center justify-center gap-1">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-violet-800 bg-violet-50 border border-violet-200" title={note.notes}>
                                🩺 Sick
                              </span>
                              {canAddEditDelete && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="p-0.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                                  title="Edit status"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : note?.attendance_status === 'absent' ? (
                            <div className="flex items-center justify-center gap-1">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200" title={note.notes}>
                                ❌ Absent
                              </span>
                              {canAddEditDelete && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="p-0.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                                  title="Edit status"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : isRestDay ? (
                            <div className="flex items-center justify-center gap-1">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-400 bg-slate-100">
                                Rest Day
                              </span>
                              {canAddEditDelete && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="p-0.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                                  title="Log Rest Day Shift"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-300 font-mono text-xs">—</span>
                              {canAddEditDelete && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="p-0.5 rounded hover:bg-blue-100 text-slate-300 hover:text-blue-600 transition-colors"
                                  title="Add punch or mark absent/leave"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )
                    })}

                    {/* Weekly Totals */}
                    <td className="px-3 py-2.5 text-center border-r border-slate-100">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                        {emp.daysWorked}d
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center border-r border-slate-100 font-bold text-slate-700 text-xs">
                      {emp.totalRegularHours.toFixed(1)}h
                    </td>
                    <td className="px-3 py-2.5 text-center border-r border-slate-100 text-xs">
                      {emp.totalOt > 0 ? (
                        <span className="font-bold text-purple-700">+{emp.totalOt.toFixed(1)}h</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="px-2 py-1 rounded-xl font-black bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs">
                        {emp.totalHours.toFixed(1)}h
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderWeeklyCards = (
    items: typeof weeklyEmployees.dagupanWeekly,
    title: string,
    bgHeader: string,
    textHeader: string,
    borderHeader: string
  ) => {
    return (
      <div className="space-y-3">
        <div className={`px-4 py-2.5 rounded-2xl border flex items-center justify-between ${bgHeader} ${borderHeader}`}>
          <span className={`text-xs font-black uppercase tracking-wider ${textHeader}`}>{title}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border text-slate-700">
            {items.length} Staff (A to Z)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((emp) => {
            const gradient = getAvatarColor(emp.full_name)
            const initials = getInitials(emp.full_name)
            return (
              <div
                key={emp.device_user_id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-black shadow-xs flex-shrink-0`}>
                      {initials}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">{emp.full_name}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">#{emp.device_user_id} · {emp.branch}</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${
                      emp.isMonFri ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {emp.isMonFri ? 'Mon–Fri' : 'Mon–Sat'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Days</p>
                    <p className="font-black text-slate-800 text-xs mt-0.5">{emp.daysWorked}d</p>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Regular</p>
                    <p className="font-black text-slate-800 text-xs mt-0.5">{emp.totalRegularHours.toFixed(1)}h</p>
                  </div>
                  <div className="p-2 rounded-xl bg-purple-50/70 border border-purple-100">
                    <p className="text-[10px] uppercase font-bold text-purple-700">OT</p>
                    <p className="font-black text-purple-800 text-xs mt-0.5">
                      {emp.totalOt > 0 ? `+${emp.totalOt.toFixed(1)}h` : '0h'}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                    <p className="text-[10px] uppercase font-bold text-emerald-700">Total</p>
                    <p className="font-black text-emerald-800 text-xs mt-0.5">{emp.totalHours.toFixed(1)}h</p>
                  </div>
                </div>

                {/* 7 Days Mini Strip */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {weekDays.map((day) => {
                      const rec = emp.records.get(day.dateStr)
                      const isRestDay = day.isSunday || (emp.isMonFri && day.isSaturday)
                      const hrs = rec ? Number(rec.hours_worked || 0) : 0
                      const note = shiftNotes[`${emp.device_user_id}_${day.dateStr}`]
                      return (
                        <div
                          key={day.dateStr}
                          className={`p-1 rounded-lg border text-[10px] flex flex-col items-center justify-between min-h-[50px] ${
                            hrs > 0
                              ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                              : note?.attendance_status === 'leave'
                              ? 'bg-teal-50 border-teal-200 text-teal-800'
                              : note?.attendance_status === 'sick_leave'
                              ? 'bg-violet-50 border-violet-200 text-violet-800'
                              : note?.attendance_status === 'absent'
                              ? 'bg-rose-50 border-rose-200 text-rose-800'
                              : day.holiday
                              ? 'bg-amber-50 border-amber-200 text-amber-800'
                              : isRestDay
                              ? 'bg-slate-100 border-slate-200 text-slate-400'
                              : 'bg-slate-50 border-slate-100 text-slate-300'
                          }`}
                        >
                          <span className="font-bold text-[9px] uppercase">{day.dayName.slice(0, 2)}</span>
                          {hrs > 0 ? (
                            <span className="font-black text-[10px] text-blue-700">{hrs.toFixed(1)}h</span>
                          ) : note?.attendance_status === 'leave' ? (
                            <span className="text-[8px] font-bold text-teal-700">VL</span>
                          ) : note?.attendance_status === 'sick_leave' ? (
                            <span className="text-[8px] font-bold text-violet-700">SL</span>
                          ) : note?.attendance_status === 'absent' ? (
                            <span className="text-[8px] font-bold text-rose-700">Abs</span>
                          ) : day.holiday ? (
                            <span className="text-[8px] font-bold text-amber-700">Hol</span>
                          ) : isRestDay ? (
                            <span className="text-[8px] text-slate-400">Rest</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderMonthlyTable = (
    items: typeof monthlyEmployees.dagupanMonthly,
    title: string,
    bgHeader: string,
    textHeader: string,
    borderHeader: string
  ) => {
    return (
      <div>
        <div className={`px-4 py-2.5 border-b flex items-center justify-between ${bgHeader} ${borderHeader}`}>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black uppercase tracking-wider ${textHeader}`}>{title}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border text-slate-700">
              {items.length} Staff (A to Z)
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">Employee Name</th>
                <th className="px-3 py-3 text-center border-r border-slate-100">Branch</th>
                <th className="px-3 py-3 text-center border-r border-slate-100">Schedule</th>
                <th className="px-3 py-3 text-center border-r border-slate-100">Days Worked</th>
                <th className="px-3 py-3 text-right border-r border-slate-100">Reg Hours</th>
                <th className="px-3 py-3 text-right border-r border-slate-100">OT Hours</th>
                <th className="px-3 py-3 text-center border-r border-slate-100">Shifts Status</th>
                <th className="px-4 py-3 text-right font-black text-emerald-800">Monthly Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((emp) => {
                const gradient = getAvatarColor(emp.full_name)
                const initials = getInitials(emp.full_name)
                return (
                  <tr key={emp.device_user_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-black shadow-xs flex-shrink-0`}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-xs">{emp.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">#{emp.device_user_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center border-r border-slate-100 text-slate-600 font-medium">
                      {emp.branch}
                    </td>
                    <td className="px-3 py-3 text-center border-r border-slate-100">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${emp.isMonFri ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                        {emp.isMonFri ? 'Mon–Fri' : 'Mon–Sat'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center border-r border-slate-100">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        {emp.daysWorked} days
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right border-r border-slate-100 font-bold text-slate-700 text-xs">
                      {emp.totalRegularHours.toFixed(1)} hrs
                    </td>
                    <td className="px-3 py-3 text-right border-r border-slate-100 text-xs">
                      {emp.totalOt > 0 ? (
                        <span className="font-bold text-purple-700">+{emp.totalOt.toFixed(1)}h OT</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center border-r border-slate-100">
                      <span className="text-emerald-700 font-bold text-xs">{emp.completedCount} Complete</span>
                      {emp.incompleteCount > 0 && (
                        <span className="text-amber-600 font-bold text-xs ml-1.5">· {emp.incompleteCount} Incomplete</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100">
                        {emp.totalHours.toFixed(1)} hrs
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderMonthlyCards = (
    items: typeof monthlyEmployees.dagupanMonthly,
    title: string,
    bgHeader: string,
    textHeader: string,
    borderHeader: string
  ) => {
    return (
      <div className="space-y-3">
        <div className={`px-4 py-2.5 rounded-2xl border flex items-center justify-between ${bgHeader} ${borderHeader}`}>
          <span className={`text-xs font-black uppercase tracking-wider ${textHeader}`}>{title}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border text-slate-700">
            {items.length} Staff (A to Z)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((emp) => {
            const gradient = getAvatarColor(emp.full_name)
            const initials = getInitials(emp.full_name)
            return (
              <div
                key={emp.device_user_id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-black shadow-xs flex-shrink-0`}>
                      {initials}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">{emp.full_name}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">#{emp.device_user_id} · {emp.branch}</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${
                      emp.isMonFri ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {emp.isMonFri ? 'Mon–Fri' : 'Mon–Sat'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Days</p>
                    <p className="font-black text-slate-800 text-xs mt-0.5">{emp.daysWorked}d</p>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Regular</p>
                    <p className="font-black text-slate-800 text-xs mt-0.5">{emp.totalRegularHours.toFixed(1)}h</p>
                  </div>
                  <div className="p-2 rounded-xl bg-purple-50/70 border border-purple-100">
                    <p className="text-[10px] uppercase font-bold text-purple-700">OT</p>
                    <p className="font-black text-purple-800 text-xs mt-0.5">+{emp.totalOt.toFixed(1)}h</p>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                    <p className="text-[10px] uppercase font-bold text-emerald-700">Total</p>
                    <p className="font-black text-emerald-800 text-xs mt-0.5">{emp.totalHours.toFixed(1)}h</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const hasAnyDaily = dailyEmployees.dagupanDaily.length > 0 || dailyEmployees.manilaDaily.length > 0
  const hasAnyWeekly = weeklyEmployees.dagupanWeekly.length > 0 || weeklyEmployees.manilaWeekly.length > 0
  const hasAnyMonthly = monthlyEmployees.dagupanMonthly.length > 0 || monthlyEmployees.manilaMonthly.length > 0

  const activeDayHoliday = getHolidayForDate(dateFilter)
  const activeHolidayBadge = activeDayHoliday ? getHolidayTypeBadge(activeDayHoliday.type) : null

  return (
    <div className="space-y-6">
      {/* Toast Alert — Middle Top */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border text-sm font-semibold transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/20'
              : 'bg-rose-600 text-white border-rose-500 shadow-rose-900/20'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-100 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-100 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-3 text-white/80 hover:text-white font-black text-base leading-none"
          >
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
            <p className="text-xs text-slate-400 mt-0.5">Approved overtime hours</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Shifts</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{completedShifts}</p>
            <p className="text-xs text-slate-400 mt-0.5">{onDutyShifts} on duty · {incompleteShifts} incomplete</p>
          </div>
        </div>
      </div>

      {/* Holiday Banner Alert (if selected day is a holiday) */}
      {viewMode === 'daily' && activeDayHoliday && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between ${
          activeDayHoliday.scope === 'pangasinan'
            ? 'bg-purple-50 border-purple-200 text-purple-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-xl">{activeDayHoliday.scope === 'pangasinan' ? '📍' : '🎌'}</span>
            <div>
              <p className="font-black text-sm">{activeDayHoliday.name}</p>
              <p className="text-xs opacity-80 mt-0.5">{activeDayHoliday.rateDescription}</p>
            </div>
          </div>
          <Link
            href="/calendar"
            className="text-xs font-bold underline hover:no-underline flex items-center gap-1"
          >
            Open Calendar Details →
          </Link>
        </div>
      )}

      {/* Visual Charts Strip (Available across Daily, Weekly, and Monthly views) */}
      {dailyAttendanceData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      Daily Attendance Volume
                      <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {viewMode === 'monthly'
                          ? `Month of ${monthFilter}`
                          : `Week: ${dailyAttendanceData[0]?.date} → ${dailyAttendanceData[dailyAttendanceData.length - 1]?.date}`}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Actual attendee turnout vs total {employees?.length || 23} staff • Click any bar to inspect that day
                    </p>
                  </div>
                </div>

                {/* Quick Legend */}
                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" /> Present
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Holiday
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-purple-400 inline-block" /> Sunday
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm border-2 border-indigo-600 inline-block" /> Selected
                  </span>
                </div>
              </div>

              {/* Chart Grid */}
              <div className="h-44 flex items-end gap-1 sm:gap-2 pt-6 pb-2 px-1 border-b border-slate-100">
                {dailyAttendanceData.map((d) => {
                  const heightPct = Math.round((d.presentCount / maxDailyCount) * 100)
                  const barColor = d.holiday
                    ? 'bg-amber-400 hover:bg-amber-500'
                    : d.isSunday
                    ? 'bg-purple-300 hover:bg-purple-400'
                    : d.presentCount > 0
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-slate-200 hover:bg-slate-300'

                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => handleDateChange(d.date)}
                      title={`${d.date} (${d.dayName}): ${d.presentCount}/${d.totalStaff} present${d.holiday ? ` • ${d.holiday.name}` : ''}${d.isSunday ? ' • Sunday Rest Day' : ''}`}
                      className="flex-1 h-full flex flex-col justify-end items-center gap-1 group relative focus:outline-none"
                    >
                      {/* Floating Tooltip */}
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 bg-slate-900 text-white text-[10px] py-1 px-2 rounded-md shadow-lg whitespace-nowrap">
                        <p className="font-bold">{d.date} ({d.dayName})</p>
                        <p className="text-emerald-300">{d.presentCount} / {d.totalStaff} Present ({heightPct}%)</p>
                        {d.holiday && <p className="text-amber-300">⭐ {d.holiday.name}</p>}
                        {d.isSunday && <p className="text-purple-300">Rest Day (Flexible)</p>}
                        {d.otHours > 0 && <p className="text-purple-200">+{d.otHours}h OT</p>}
                      </div>

                      {/* Number count on top of bar if weekly / daily */}
                      {dailyAttendanceData.length <= 14 && (
                        <span className={`text-[10px] font-bold ${d.isSelected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-700'}`}>
                          {d.presentCount > 0 ? d.presentCount : '0'}
                        </span>
                      )}

                      {/* Bar Fill */}
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 ${barColor} ${
                            d.isSelected ? 'ring-2 ring-indigo-600 ring-offset-1 shadow-sm' : ''
                          }`}
                          style={{ height: `${Math.max(heightPct, 8)}%` }}
                        />
                      </div>

                      {/* Label underneath */}
                      <div className="flex flex-col items-center">
                        <span className={`text-[10px] font-bold font-mono ${
                          d.isSelected ? 'text-indigo-600 font-black' : 'text-slate-500 group-hover:text-slate-900'
                        }`}>
                          {dailyAttendanceData.length <= 14 ? `${d.dayName} ${d.dayOfMonth}` : d.dayOfMonth}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quick summary below chart */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-3">
              <span>
                Active Date: <strong className="text-slate-900">{dateFilter}</strong>
              </span>
              <span className="text-[11px] text-slate-400">
                Tip: Click any bar to jump to that shift
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <PieChart className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Shift Status Summary</h3>
              </div>
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

      {/* Calculation Mode Switcher (Exact Biometrics vs Standard Normalized) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">DTR Calculation Engine</span>
            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
              calcMode === 'normalized'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                : 'bg-blue-500/20 text-blue-300 border-blue-400/40'
            }`}>
              {calcMode === 'normalized' ? '✨ Standard Normalized (Clean Policy)' : '⏱️ Exact Biometrics (Raw Real-Time)'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {calcMode === 'normalized' ? (
              <span>
                <strong>Corporate Standard Shift Policy:</strong> Core working hours are standardized from 09:00 AM to 06:00 PM. Incorporates an authorized morning grace window (08:00–09:05 AM) and reconciles routine egress intervals (06:01–06:30 PM) to ensure equitable, audit-ready payroll. Authorized overtime beyond 06:30 PM is recognized in structured 30-minute intervals.
              </span>
            ) : (
              <span>
                <strong>Raw Biometric Timekeeping:</strong> Computes attendance and shift hours strictly from unadjusted physical time punches recorded by the FingerTec TA500 terminal for forensic timekeeping audits and biometric punch verification.
              </span>
            )}
          </p>
        </div>

        {/* Segmented Switcher Control */}
        <div className="flex items-center p-1 bg-slate-800/90 rounded-xl border border-slate-700/80 shadow-inner flex-shrink-0 self-start md:self-center">
          <button
            type="button"
            onClick={() => handleToggleCalcMode('exact')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              calcMode === 'exact'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Switch to Exact Biometrics: Shows raw hardware timestamps to the minute"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Exact Biometrics</span>
          </button>

          <button
            type="button"
            onClick={() => handleToggleCalcMode('normalized')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              calcMode === 'normalized'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Switch to Standard Normalized: 9:00 AM – 6:00 PM shift alignment with anti-overtime exaggeration buffer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Standard Normalized</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-400/20 text-emerald-200 uppercase font-extrabold ml-0.5">Policy</span>
          </button>
        </div>
      </div>

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

        {/* View Mode Toggle — Day / Week / Month */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">View Mode</label>
          <div className="flex border border-slate-200 rounded-xl overflow-hidden p-0.5 bg-slate-50 gap-0.5">
            {(['daily', 'weekly', 'monthly'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all capitalize ${
                  viewMode === mode ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === 'daily' ? 'Day' : mode === 'weekly' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </div>

        {/* Date / Week / Month Picker */}
        {viewMode === 'daily' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date</label>
              <button
                type="button"
                onClick={() => handleDateChange(todayStr)}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
              >
                Today ({todayStr.slice(5)})
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => handleDateChange(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'Nov 2 (W1)', date: '2026-11-02' },
                  { label: 'Nov 6', date: '2026-11-06' },
                  { label: 'Nov 9 (W2)', date: '2026-11-09' },
                  { label: 'Nov 13 (Perez Day)', date: '2026-11-13' },
                  { label: 'Nov 16', date: '2026-11-16' },
                ].map((p) => (
                  <button
                    key={p.date}
                    type="button"
                    onClick={() => handleDateChange(p.date)}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                      dateFilter === p.date
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'weekly' && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Week: {getWeekRange(weekAnchor).start} → {getWeekRange(weekAnchor).end}
            </label>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const prev = new Date(`${weekAnchor}T12:00:00`)
                    prev.setDate(prev.getDate() - 7)
                    handleWeekAnchorChange(format(prev, 'yyyy-MM-dd'))
                  }}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                  title="Previous Week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={weekAnchor}
                  onChange={(e) => handleWeekAnchorChange(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(`${weekAnchor}T12:00:00`)
                    next.setDate(next.getDate() + 7)
                    handleWeekAnchorChange(format(next, 'yyyy-MM-dd'))
                  }}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                  title="Next Week"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'Week 1 (Nov 2–8)', anchor: '2026-11-02' },
                  { label: 'Week 2 (Nov 9–15)', anchor: '2026-11-09' },
                  { label: 'Week 3 (Nov 16–22)', anchor: '2026-11-16' },
                ].map((p) => {
                  const isCurrent = getWeekRange(weekAnchor).start === getWeekRange(p.anchor).start
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleWeekAnchorChange(p.anchor)}
                      className={`px-2.5 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'monthly' && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Month</label>
            <div className="flex flex-col gap-1.5">
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => handleMonthChange('2026-11')}
                  className={`px-2.5 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                    monthFilter === '2026-11'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  November 2026
                </button>
              </div>
            </div>
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
            <option value="Absent">Absent</option>
            <option value="Leave">On Leave (VL/SL)</option>
          </select>
        </div>

        {/* Display Mode Toggle */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Display</label>
          <div className="flex border border-slate-200 rounded-xl overflow-hidden p-0.5 bg-slate-50 gap-0.5">
            <button
              onClick={() => setDisplayMode('table')}
              title="Excel-like compact table"
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${displayMode === 'table' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Table2 className="w-3.5 h-3.5" /> Table
            </button>
            <button
              onClick={() => setDisplayMode('scroll')}
              title="Card view"
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${displayMode === 'scroll' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <LayoutList className="w-3.5 h-3.5" /> Cards
            </button>
          </div>
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

      {/* DTR Records Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {viewMode === 'daily' ? (
          !hasAnyDaily ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Clock className="w-12 h-12 text-slate-300 mb-3" />
              <p className="font-bold text-slate-600">No employees found for selected filters.</p>
              <p className="text-xs text-slate-400 mt-1">Adjust search or branch filters to view daily roster.</p>
            </div>
          ) : displayMode === 'table' ? (
            <div className="space-y-0">
              {/* 1. Dagupan Main Table (A to Z) */}
              {renderDailyTable(
                dailyEmployees.dagupanDaily,
                '🏢 Dagupan Main Branch',
                'bg-blue-50/70',
                'text-blue-900',
                'border-blue-200'
              )}

              {/* 2. Manila Branch Table with Prominent Space */}
              {dailyEmployees.manilaDaily.length > 0 && (
                <div className="mt-8 pt-6 border-t-4 border-slate-300 bg-slate-50/30">
                  {renderDailyTable(
                    dailyEmployees.manilaDaily,
                    '📍 Manila Branch Staff',
                    'bg-amber-50/90',
                    'text-amber-950',
                    'border-amber-300'
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 space-y-8 bg-slate-50/40">
              {renderDailyCards(
                dailyEmployees.dagupanDaily,
                '🏢 Dagupan Main Branch',
                'bg-blue-50/70',
                'text-blue-900',
                'border-blue-200'
              )}

              {dailyEmployees.manilaDaily.length > 0 && (
                <div className="pt-8 border-t-4 border-slate-300">
                  {renderDailyCards(
                    dailyEmployees.manilaDaily,
                    '📍 Manila Branch Staff',
                    'bg-amber-50/90',
                    'text-amber-950',
                    'border-amber-300'
                  )}
                </div>
              )}
            </div>
          )
        ) : viewMode === 'weekly' ? (
          !hasAnyWeekly ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Calendar className="w-12 h-12 text-slate-300 mb-3" />
              <p className="font-bold text-slate-600">No weekly timesheet records found for selected filters.</p>
            </div>
          ) : displayMode === 'table' ? (
            <div className="space-y-0">
              {renderWeeklyTable(
                weeklyEmployees.dagupanWeekly,
                '🏢 Dagupan Main Branch',
                'bg-blue-50/70',
                'text-blue-900',
                'border-blue-200'
              )}

              {weeklyEmployees.manilaWeekly.length > 0 && (
                <div className="mt-8 pt-6 border-t-4 border-slate-300 bg-slate-50/30">
                  {renderWeeklyTable(
                    weeklyEmployees.manilaWeekly,
                    '📍 Manila Branch Staff',
                    'bg-amber-50/90',
                    'text-amber-950',
                    'border-amber-300'
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 space-y-8 bg-slate-50/40">
              {renderWeeklyCards(
                weeklyEmployees.dagupanWeekly,
                '🏢 Dagupan Main Branch',
                'bg-blue-50/70',
                'text-blue-900',
                'border-blue-200'
              )}

              {weeklyEmployees.manilaWeekly.length > 0 && (
                <div className="pt-8 border-t-4 border-slate-300">
                  {renderWeeklyCards(
                    weeklyEmployees.manilaWeekly,
                    '📍 Manila Branch Staff',
                    'bg-amber-50/90',
                    'text-amber-950',
                    'border-amber-300'
                  )}
                </div>
              )}
            </div>
          )
        ) : (
          !hasAnyMonthly ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FileSpreadsheet className="w-12 h-12 text-slate-300 mb-3" />
              <p className="font-bold text-slate-600">No monthly records found for selected filters.</p>
            </div>
          ) : displayMode === 'table' ? (
            <div className="space-y-0">
              {renderMonthlyTable(
                monthlyEmployees.dagupanMonthly,
                '🏢 Dagupan Main Branch',
                'bg-blue-50/70',
                'text-blue-900',
                'border-blue-200'
              )}

              {monthlyEmployees.manilaMonthly.length > 0 && (
                <div className="mt-8 pt-6 border-t-4 border-slate-300 bg-slate-50/30">
                  {renderMonthlyTable(
                    monthlyEmployees.manilaMonthly,
                    '📍 Manila Branch Staff',
                    'bg-amber-50/90',
                    'text-amber-950',
                    'border-amber-300'
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 space-y-8 bg-slate-50/40">
              {renderMonthlyCards(
                monthlyEmployees.dagupanMonthly,
                '🏢 Dagupan Main Branch',
                'bg-blue-50/70',
                'text-blue-900',
                'border-blue-200'
              )}

              {monthlyEmployees.manilaMonthly.length > 0 && (
                <div className="pt-8 border-t-4 border-slate-300">
                  {renderMonthlyCards(
                    monthlyEmployees.manilaMonthly,
                    '📍 Manila Branch Staff',
                    'bg-amber-50/90',
                    'text-amber-950',
                    'border-amber-300'
                  )}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* OT Reason Modal */}
      {otModalOpen && otModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <MessageSquarePlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Overtime Reason</h3>
                  <p className="text-xs text-slate-400">Document why overtime was required</p>
                </div>
              </div>
              <button onClick={() => setOtModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-100">
              <p className="text-sm font-bold text-slate-900">{otModalRow.full_name}</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {otModalRow.work_date} · +{Number(otModalRow.overtime_hours || 0).toFixed(1)}h OT
              </p>
            </div>

            <form onSubmit={handleSaveOtReason} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Overtime Reason / Description
                </label>
                <textarea
                  rows={4}
                  value={otReasonInput}
                  onChange={(e) => setOtReasonInput(e.target.value)}
                  placeholder="e.g. Finishing IPSJ project deliverable for client, rush order deadline…"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setOtModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOtReason}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {savingOtReason ? 'Saving…' : 'Save OT Reason'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Super Admin Edit Shift Modal */}
      {editModalOpen && editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-hidden">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 border border-slate-200/80 my-auto">
            {/* Fixed Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">Edit Shift / Attendance</h3>
                  <p className="text-[11px] text-slate-400">Super Admin Attendance Management</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-xl transition-colors"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Employee & Date Banner */}
            <div className="px-5 py-3 bg-blue-50/60 border-b border-blue-100/70 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-xs sm:text-sm font-bold text-slate-900">{editRow.full_name}</p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  ID: #{editRow.device_user_id} · Branch: {editRow.branch || 'JAPA Main'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
                  📅 {editRow.work_date}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveShift} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {/* Attendance Status Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Attendance Status
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { value: 'present', label: 'Present / Worked', icon: '💼', activeBg: 'bg-emerald-50 text-emerald-800 border-emerald-400 ring-2 ring-emerald-400/20' },
                    { value: 'absent', label: 'Absent', icon: '❌', activeBg: 'bg-rose-50 text-rose-800 border-rose-400 ring-2 ring-rose-400/20' },
                    { value: 'leave', label: 'Vacation Leave (VL)', icon: '🌴', activeBg: 'bg-teal-50 text-teal-800 border-teal-400 ring-2 ring-teal-400/20' },
                    { value: 'sick_leave', label: 'Sick Leave (SL)', icon: '🩺', activeBg: 'bg-violet-50 text-violet-800 border-violet-400 ring-2 ring-violet-400/20' },
                  ].map((s) => {
                    const isSelected = editAttendanceStatus === s.value
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => {
                          setEditAttendanceStatus(s.value as any)
                          if (s.value === 'present') {
                            setHasInTime(true)
                            if (!editInTime) setEditInTime('09:00')
                            if (!editOutTime) setEditOutTime('18:00')
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? s.activeBg
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-base">{s.icon}</span>
                        <span className="text-[11px] leading-tight">{s.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Present Mode: Punch Times */}
              {editAttendanceStatus === 'present' ? (
                <div className="space-y-3.5 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80">
                  {/* Time In */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        First Time In
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasInTime}
                          onChange={(e) => setHasInTime(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        {hasInTime ? 'Included' : 'Exclude'}
                      </label>
                    </div>
                    {hasInTime ? (
                      <div>
                        <input
                          type="time"
                          required
                          value={editInTime}
                          onChange={(e) => setEditInTime(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Presets:</span>
                          {[
                            { label: '8:00 AM', val: '08:00' },
                            { label: '8:30 AM', val: '08:30' },
                            { label: '9:00 AM', val: '09:00' },
                          ].map((preset) => (
                            <button
                              key={preset.val}
                              type="button"
                              onClick={() => {
                                setHasInTime(true)
                                setEditInTime(preset.val)
                              }}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-md border transition-all ${
                                editInTime === preset.val && hasInTime
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl border border-dashed border-slate-300 bg-white/70 flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">Time In excluded</span>
                        <button
                          type="button"
                          onClick={() => {
                            setHasInTime(true)
                            setEditInTime('09:00')
                          }}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                        >
                          + Set Time In (9:00 AM)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Time Out */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-rose-600" />
                        Last Time Out
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasOutTime}
                          onChange={(e) => setHasOutTime(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        {hasOutTime ? 'Included' : 'Not Clocked Out Yet'}
                      </label>
                    </div>
                    {hasOutTime ? (
                      <div>
                        <input
                          type="time"
                          required
                          value={editOutTime}
                          onChange={(e) => setEditOutTime(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        {/* 1-Click Time Out Presets */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Presets:</span>
                          {[
                            { label: '5:00 PM', val: '17:00' },
                            { label: '6:00 PM', val: '18:00' },
                            { label: '7:00 PM', val: '19:00' },
                            { label: '10:00 PM', val: '22:00' },
                            { label: '12:00 AM (Midnight)', val: '00:00' },
                            { label: '1:00 AM', val: '01:00' },
                          ].map((preset) => (
                            <button
                              key={preset.val}
                              type="button"
                              onClick={() => {
                                setHasOutTime(true)
                                setEditOutTime(preset.val)
                              }}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-md border transition-all ${
                                editOutTime === preset.val && hasOutTime
                                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1">
                          <Info className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span>Note: 00:00 = 12:00 AM (Midnight). Punches past midnight are credited to this shift automatically.</span>
                        </p>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl border border-dashed border-slate-300 bg-white/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <span className="text-xs text-slate-500 font-medium">Currently On Duty (No clock out recorded)</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Set Time Out:</span>
                          {[
                            { label: '5 PM', val: '17:00' },
                            { label: '6 PM', val: '18:00' },
                            { label: '7 PM', val: '19:00' },
                          ].map((p) => (
                            <button
                              key={p.val}
                              type="button"
                              onClick={() => {
                                setHasOutTime(true)
                                setEditOutTime(p.val)
                              }}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors shadow-2xs font-semibold"
                            >
                              + {p.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setHasOutTime(true)
                              setEditOutTime('18:00')
                            }}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                          >
                            + Custom
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
                  editAttendanceStatus === 'absent'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-800'
                    : editAttendanceStatus === 'leave'
                    ? 'bg-teal-50/70 border-teal-200 text-teal-800'
                    : 'bg-violet-50/70 border-violet-200 text-violet-800'
                }`}>
                  <p className="font-bold">
                    {editAttendanceStatus === 'absent' && '❌ Marked as Absent'}
                    {editAttendanceStatus === 'leave' && '🌴 Marked as Vacation Leave (VL)'}
                    {editAttendanceStatus === 'sick_leave' && '🩺 Marked as Sick Leave (SL)'}
                  </p>
                  <p className="text-[11px] mt-1 text-slate-600">
                    Biometric punch times are waived for this date. The status and remarks will be recorded in official DTR and shift reports.
                  </p>
                </div>
              )}

              {/* Remarks / Reason input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Remarks / Reason / Notes
                </label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder={
                    editAttendanceStatus === 'absent'
                      ? 'e.g. Unexcused absence, AWOL, Personal matter…'
                      : editAttendanceStatus === 'leave'
                      ? 'e.g. Approved VL, Vacation trip, Out of town…'
                      : editAttendanceStatus === 'sick_leave'
                      ? 'e.g. Medical certificate submitted, Severe cough and fever…'
                      : 'e.g. Manual override, biometric sensor failed, OT justification…'
                  }
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Fixed Footer (Always visible at bottom) */}
            <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <button
                type="button"
                onClick={handleDeleteShift}
                disabled={deletingShift || savingShift}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition-colors disabled:opacity-50"
                title="Delete all punches and records for this employee on this date"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingShift ? 'Deleting…' : 'Delete Shift'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingShift || deletingShift}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all active:scale-95"
                >
                  {savingShift ? 'Saving Changes…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
          </div>
        </div>
      )}
    </div>
  )
}
