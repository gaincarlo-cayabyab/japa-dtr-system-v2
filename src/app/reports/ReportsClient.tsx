'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import type { DailyDtr } from '@/types/database'
import { format, startOfWeek, endOfWeek } from 'date-fns'
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
  X,
  ShieldCheck,
  MessageSquarePlus,
  Sparkles,
  Table2,
  LayoutList,
  Star,
  ChevronLeft,
  ChevronRight,
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

export function ReportsClient({ initialData, branches, employees = [] }: ReportsClientProps) {
  const [data, setData] = useState<DailyDtr[]>(initialData)

  // Smart initial date from actual attendance records (defaults to 2026-11-02 where active records exist)
  const defaultDate = useMemo(() => {
    if (initialData && initialData.length > 0) {
      const active = initialData.find((d) => d.work_date === '2026-11-02')
      if (active) return '2026-11-02'
      return initialData[0].work_date
    }
    return '2026-11-02'
  }, [initialData])

  const defaultMonth = defaultDate.slice(0, 7)

  // View mode: 'daily' | 'weekly' | 'monthly'  — default: daily
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  // Display style: 'table' (default compact grid) | 'scroll' (cards)
  const [displayMode, setDisplayMode] = useState<'scroll' | 'table'>('table')

  const [monthFilter, setMonthFilter] = useState(defaultMonth)
  const [dateFilter, setDateFilter] = useState(defaultDate)
  const [weekAnchor, setWeekAnchor] = useState(defaultDate)
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Sync date changes across views
  const handleDateChange = (val: string) => {
    setDateFilter(val)
    setWeekAnchor(val)
    if (val.length >= 7) setMonthFilter(val.slice(0, 7))
  }

  const handleWeekAnchorChange = (val: string) => {
    setWeekAnchor(val)
    const range = getWeekRange(val)
    setDateFilter(range.start)
    if (val.length >= 7) setMonthFilter(val.slice(0, 7))
  }

  const handleMonthChange = (val: string) => {
    setMonthFilter(val)
    const newDate = `${val}-02`
    setDateFilter(newDate)
    setWeekAnchor(newDate)
  }

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const filtered = useMemo(() => {
    const weekRange = viewMode === 'weekly' ? getWeekRange(weekAnchor) : null
    return data.filter((row) => {
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
  }, [data, viewMode, monthFilter, dateFilter, weekAnchor, branchFilter, statusFilter, searchQuery])

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

  // Master list of all employees (sorted A to Z)
  const allEmployeesList = useMemo(() => {
    if (employees && employees.length > 0) {
      return [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name))
    }
    const map = new Map<string, EmployeeInfo>()
    data.forEach((r) => {
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
  }, [employees, data])

  // Daily Roster: All employees for dateFilter with Attendance / Absent / Leave status
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
      const rec = data.find(
        (r) => String(r.device_user_id) === String(emp.device_user_id) && r.work_date === dateFilter
      )
      const note = shiftNotes[`${emp.device_user_id}_${dateFilter}`]

      let computedStatus: 'Completed' | 'On Duty' | 'Incomplete' | 'Absent' | 'Leave' | 'Sick Leave' | 'Rest Day' | 'Holiday' = 'Absent'

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
      } else if (holiday) {
        computedStatus = 'Holiday'
      } else {
        computedStatus = 'Absent'
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
  }, [allEmployeesList, branchFilter, searchQuery, dateFilter, data, shiftNotes, statusFilter])

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

    // 1. Seed from allEmployeesList so all employees are present in A-Z order
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

    // 2. Populate punches for the active week
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

  const maxDailyCount = Math.max(...dailyAttendanceData.map((d) => d.count), 1)

  // Open Edit Shift Modal with attendance status & notes
  const openEditShift = (row: DailyDtr, existingNote?: ShiftNote) => {
    setEditRow(row)
    const note = existingNote || shiftNotes[`${row.device_user_id}_${row.work_date}`]
    const defaultStatus = note?.attendance_status || (row.first_check_in ? 'present' : 'absent')
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
      setHasInTime(false)
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
      setHasOutTime(false)
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
          first_check_in: editAttendanceStatus === 'present' && hasInTime ? editInTime : null,
          last_check_out: editAttendanceStatus === 'present' && hasOutTime ? editOutTime : null,
          attendance_status: editAttendanceStatus,
          notes: editNotes,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setToast({ message: `Updated DTR for ${editRow.full_name} on ${editRow.work_date}!`, type: 'success' })
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
    a.download = `JAPA_DTR_Smart_${label}.csv`
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
                {isSuperAdmin && (
                  <th className="px-3 py-2.5 text-center text-blue-700 min-w-[100px]">Admin</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const gradient = getAvatarColor(item.emp.full_name)
                const initials = getInitials(item.emp.full_name)
                const ot = Number(item.rec?.overtime_hours || 0)
                const holiday = item.holiday
                const hBadge = holiday ? getHolidayTypeBadge(holiday.type) : null
                const note = item.note

                return (
                  <tr
                    key={`${item.emp.device_user_id}-${dateFilter}-${idx}`}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      holiday ? 'bg-amber-50/20' : item.isRestDay ? 'bg-slate-50/40' : ''
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
                      <div>
                        <span className="font-bold text-slate-800 text-xs">{dateFilter.slice(5)}</span>
                        {holiday && (
                          <span className={`block text-[9px] font-bold mt-0.5 ${hBadge?.text || 'text-amber-800'}`}>
                            🎌 Holiday
                          </span>
                        )}
                      </div>
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

                    {/* Status Badge */}
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
                      {item.computedStatus === 'Holiday' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          🎌 Holiday
                        </span>
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

                    {/* Super Admin Action */}
                    {isSuperAdmin && (
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
            const ot = Number(item.rec?.overtime_hours || 0)
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
                  {/* Status Badge */}
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
                    {item.computedStatus === 'Holiday' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        🎌 Holiday
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
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

                {/* Remarks & Edit button */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[10px] text-amber-800 font-semibold truncate max-w-[170px]" title={note?.notes || note?.ot_reason}>
                    {note?.notes || note?.ot_reason ? `💬 ${note.notes || note.ot_reason}` : ''}
                  </span>
                  {isSuperAdmin && (
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
                              </div>
                              {(note?.notes || note?.ot_reason) && (
                                <p className="text-[9px] text-amber-700 font-semibold truncate max-w-[110px]" title={note.notes || note.ot_reason}>
                                  💬 {note.notes || note.ot_reason}
                                </p>
                              )}
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openEditShift(rec, note)}
                                  className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 p-0.5 rounded hover:bg-blue-100 text-blue-600 transition-opacity"
                                  title="Edit shift"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : note?.attendance_status === 'leave' ? (
                            <div className="relative">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200" title={note.notes}>
                                🌴 Leave
                              </span>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="opacity-0 group-hover:opacity-100 absolute top-0 right-0 p-0.5 rounded hover:bg-blue-100 text-blue-600 transition-opacity"
                                  title="Edit status"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : note?.attendance_status === 'sick_leave' ? (
                            <div className="relative">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-violet-800 bg-violet-50 border border-violet-200" title={note.notes}>
                                🩺 Sick
                              </span>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="opacity-0 group-hover:opacity-100 absolute top-0 right-0 p-0.5 rounded hover:bg-blue-100 text-blue-600 transition-opacity"
                                  title="Edit status"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : note?.attendance_status === 'absent' ? (
                            <div className="relative">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200" title={note.notes}>
                                ❌ Absent
                              </span>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="opacity-0 group-hover:opacity-100 absolute top-0 right-0 p-0.5 rounded hover:bg-blue-100 text-blue-600 transition-opacity"
                                  title="Edit status"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : isRestDay ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-400 bg-slate-100">
                              Rest Day
                            </span>
                          ) : day.holiday ? (
                            <div className="relative">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200" title={day.holiday.name}>
                                🎌 Hol
                              </span>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="opacity-0 group-hover:opacity-100 absolute top-0 right-0 p-0.5 rounded hover:bg-blue-100 text-blue-600 transition-opacity"
                                  title="Edit status"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="relative">
                              <span className="text-slate-300 font-mono text-xs">—</span>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openEditForEmployee(emp, day.dateStr)}
                                  className="opacity-0 group-hover:opacity-100 absolute top-0 right-0 p-0.5 rounded hover:bg-blue-100 text-blue-600 transition-opacity"
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
                          title={`${day.dateStr}: ${
                            rec
                              ? `${formatTime(rec.first_check_in)} - ${formatTime(rec.last_check_out)} (${hrs.toFixed(1)}h)`
                              : note?.attendance_status === 'leave'
                              ? 'Vacation Leave'
                              : note?.attendance_status === 'sick_leave'
                              ? 'Sick Leave'
                              : note?.attendance_status === 'absent'
                              ? 'Absent'
                              : isRestDay
                              ? 'Rest Day'
                              : day.holiday
                              ? day.holiday.name
                              : 'No punch'
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

      {/* Visual Charts Strip (Monthly & Weekly only) */}
      {viewMode !== 'daily' && dailyAttendanceData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Daily Attendance Volume</h3>
              </div>
              <span className="text-xs text-slate-400">Punches per shift date</span>
            </div>
            <div className="h-40 flex items-end gap-1.5 pt-4">
              {dailyAttendanceData.map((d) => {
                const heightPct = Math.round((d.count / maxDailyCount) * 100)
                const holiday = getHolidayForDate(d.date)
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        holiday ? 'bg-amber-400 group-hover:bg-amber-500' : 'bg-blue-600 group-hover:bg-blue-700'
                      }`}
                      style={{ height: `${Math.max(heightPct, 6)}%` }}
                    />
                    <span className="text-[10px] text-slate-400 group-hover:text-slate-700 font-mono">
                      {d.date.slice(8)}
                    </span>
                  </div>
                )
              })}
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
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
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
                  { label: 'Nov 13 (Hol)', date: '2026-11-13' },
                  { label: 'Nov 16', date: '2026-11-16' },
                ].map((p) => (
                  <button
                    key={p.date}
                    type="button"
                    onClick={() => handleDateChange(p.date)}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                      dateFilter === p.date
                        ? 'bg-blue-600 text-white'
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
                  November 2026 (Active)
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
              {/* Dagupan Daily Cards */}
              {renderDailyCards(
                dailyEmployees.dagupanDaily,
                '🏢 Dagupan Main Branch',
                'bg-blue-50/70',
                'text-blue-900',
                'border-blue-200'
              )}

              {/* Manila Daily Cards */}
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
              {/* 1. Dagupan Main Weekly Table (A to Z) */}
              {renderWeeklyTable(
                weeklyEmployees.dagupanWeekly,
                '🏢 Dagupan Main Branch',
                'bg-blue-50/70',
                'text-blue-900',
                'border-blue-200'
              )}

              {/* 2. Manila Branch Weekly Table with Prominent Space */}
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
          /* Monthly Summary View */
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
                <p className="text-[11px] text-slate-400 mt-1">
                  This reason will be visible to JAPA Dee, JAPA Manager, and JAPA Pearly on the DTR Reports page.
                </p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 my-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Edit Shift / Attendance</h3>
                  <p className="text-xs text-slate-400">Super Admin Attendance Management</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Employee & Date Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{editRow.full_name}</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  ID: #{editRow.device_user_id} · Branch: {editRow.branch || 'JAPA Main'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                  📅 {editRow.work_date}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveShift} className="space-y-4">
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
                        onClick={() => setEditAttendanceStatus(s.value as any)}
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
                <div className="space-y-3 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80">
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
                        <p className="text-[10px] text-slate-400 mt-1">
                          Times past midnight (12:00 AM – 03:59 AM) are credited to this shift automatically.
                        </p>
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
                  Remarks / Reason / Diagnosis
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
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingShift}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all active:scale-95"
                >
                  {savingShift ? 'Saving Changes…' : 'Save Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
