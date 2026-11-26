'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users,
  Clock,
  UserCheck,
  Radio,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  ArrowUpRight,
  Zap,
  Activity,
  ChevronRight,
  PieChart as PieChartIcon,
  Award,
  CalendarDays,
  Timer,
  Cpu,
  Table2,
} from 'lucide-react'
import Link from 'next/link'
import { PageBanner } from '@/components/PageBanner'
import { createClient } from '@/lib/supabase/client'
import {
  buildDashboardAnalytics,
  formatMinutesToClock,
  getManilaNowParts,
  getManilaTimeParts,
  type DashboardAnalyticsPayload,
  type DtrAnalyticsRow,
  type EmployeeAnalyticsRow,
  type PunchAnalyticsRow,
} from '@/lib/dashboardAnalytics'

interface DashboardClientProps {
  initialData: DashboardAnalyticsPayload
}

type TrendChartMode = 'headcount' | 'area' | 'hours'
type TrendRange = 7 | 14
type ReportTab = 'today' | 'leaders' | 'ledger'
type RosterFilter = 'all' | 'On Duty' | 'Completed' | 'Not Punched'

interface SvgPoint {
  x: number
  y: number
}

function buildMonotonicPath(points: SvgPoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const midX = ((prev.x + curr.x) / 2).toFixed(2)
    d += ` C ${midX} ${prev.y.toFixed(2)}, ${midX} ${curr.y.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`
  }
  return d
}

function buildAreaPath(points: SvgPoint[], baselineY: number): string {
  if (points.length === 0) return ''
  const line = buildMonotonicPath(points)
  const last = points[points.length - 1]
  const first = points[0]
  return `${line} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`
}

function formatManilaClock(iso: string | null): string {
  const parts = getManilaTimeParts(iso)
  if (!parts) return '—'
  return formatMinutesToClock(parts.totalMinutes)
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [data, setData] = useState<DashboardAnalyticsPayload>(initialData)
  const [isLive, setIsLive] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [lastSyncClock, setLastSyncClock] = useState<string>('Live')

  // Interactive Chart States
  const [trendMode, setTrendMode] = useState<TrendChartMode>('headcount')
  const [trendRange, setTrendRange] = useState<TrendRange>(7)
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null)
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)
  const [hoveredDonutSlice, setHoveredDonutSlice] = useState<string | null>(null)

  // Interactive Report Explorer States
  const [reportTab, setReportTab] = useState<ReportTab>('today')
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')

  useEffect(() => {
    setMounted(true)
    setLastSyncClock(
      new Date().toLocaleTimeString('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    )
  }, [])

  const fetchFreshData = useCallback(async () => {
    setRefreshing(true)
    const supabase = createClient()
    try {
      const { todayDateStr, monthPrefix, todayStartISO } = getManilaNowParts()

      const [
        { data: employeesData },
        { count: allTimePunches },
        { data: todayPunchesData },
        { data: recentPunchesData },
        { data: dtrRecords },
        { data: metaRows },
      ] = await Promise.all([
        supabase
          .from('employees')
          .select('id, device_user_id, full_name, branch, department, position')
          .order('full_name'),
        supabase.from('attendance_logs').select('*', { count: 'exact', head: true }),
        supabase
          .from('attendance_logs')
          .select('id, device_user_id, punch_time, status')
          .gte('punch_time', todayStartISO),
        supabase
          .from('attendance_logs')
          .select('device_user_id, punch_time, status')
          .order('punch_time', { ascending: false })
          .limit(1500),
        supabase
          .from('daily_dtr')
          .select(
            'work_date, device_user_id, full_name, branch, first_check_in, last_check_out, total_punches, hours_worked, overtime_hours, shift_status'
          )
          .order('work_date', { ascending: false })
          .limit(1000),
        supabase
          .from('sync_meta')
          .select('key, value')
          .in('key', ['bridge_heartbeat', 'ta500_status', 'ta500_last_seen', 'ta500_records', 'bridge_version']),
      ])

      const metaMap: Record<string, number> = {}
      for (const row of metaRows ?? []) {
        const numVal = typeof row.value === 'number' ? row.value : Number(row.value)
        if (!isNaN(numVal)) metaMap[row.key] = numVal
      }
      const nowSec = Math.floor(Date.now() / 1000)
      const bridgeHeartbeat = metaMap['bridge_heartbeat'] || 0
      const ta500Status = metaMap['ta500_status'] || 0
      const ta500LastSeen = metaMap['ta500_last_seen'] || 0
      const ta500Records = metaMap['ta500_records'] || (allTimePunches ?? 0)
      const bridgeVersionNum = metaMap['bridge_version'] || 189
      const bridgeVersion =
        bridgeVersionNum >= 100 ? `v${(bridgeVersionNum / 10).toFixed(1)}` : `v${bridgeVersionNum}.0`
      const bridgeOnline = bridgeHeartbeat > 0 && nowSec - bridgeHeartbeat <= 60
      const effectiveLastSeen =
        ta500LastSeen > 0 ? ta500LastSeen : ta500Status === 1 ? bridgeHeartbeat : 0
      const ta500Online =
        bridgeOnline && ta500Status === 1 && effectiveLastSeen > 0 && nowSec - effectiveLastSeen <= 60
      const heartbeatAgeSec = bridgeHeartbeat > 0 ? Math.max(0, nowSec - bridgeHeartbeat) : 9999

      const fresh = buildDashboardAnalytics({
        employees: (employeesData ?? []) as EmployeeAnalyticsRow[],
        allTimePunches: allTimePunches ?? 0,
        todayPunches: (todayPunchesData ?? []) as PunchAnalyticsRow[],
        recentPunches: (recentPunchesData ?? []) as PunchAnalyticsRow[],
        dtrRecords: (dtrRecords ?? []) as DtrAnalyticsRow[],
        todayDateStr,
        monthPrefix,
        bridgeMeta: {
          bridgeOnline,
          ta500Online,
          bridgeVersion,
          heartbeatAgeSec,
          ta500Records,
        },
      })

      setData(fresh)
      setLastSyncClock(
        new Date().toLocaleTimeString('en-US', {
          timeZone: 'Asia/Manila',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      )
    } catch (e) {
      console.error('Error refreshing dashboard analytics:', e)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('dashboard-realtime-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        fetchFreshData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_dtr' }, () => {
        fetchFreshData()
      })
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'))

    const interval = setInterval(() => fetchFreshData(), 25000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchFreshData])

  const {
    stats,
    weeklyTrends,
    hourlyActivity,
    branchStats,
    shiftCompliance,
    punctuality,
    weekdayAverages,
    topEmployeesHours,
    todayRoster,
    bridgeMeta,
  } = data

  // Visible slice for the Trend Chart (7D or 14D)
  const visibleTrends = useMemo(() => {
    return weeklyTrends.slice(-trendRange)
  }, [weeklyTrends, trendRange])

  const trendStats = useMemo(() => {
    const maxPresent = Math.max(...visibleTrends.map((t) => t.present), stats.totalEmployees, 1)
    const maxHours = Math.max(...visibleTrends.map((t) => t.regularHours + t.overtime), 10)
    const avgPresent =
      visibleTrends.length > 0
        ? Math.round(
          (visibleTrends.reduce((a, t) => a + t.present, 0) / visibleTrends.length) * 10
        ) / 10
        : 0
    const peakDay = visibleTrends.reduce(
      (best, t) => (t.present > best.present ? t : best),
      visibleTrends[0] || { label: '—', present: 0 }
    )
    return { maxPresent, maxHours, avgPresent, peakDay }
  }, [visibleTrends, stats.totalEmployees])

  // SVG Area Chart Geometry for Mode 'area'
  const areaChartGeom = useMemo(() => {
    const width = 620
    const height = 210
    const padL = 36
    const padR = 18
    const padT = 18
    const padB = 26
    const innerW = width - padL - padR
    const innerH = height - padT - padB
    const n = visibleTrends.length
    const points = visibleTrends.map((t, idx) => {
      const x = n <= 1 ? padL + innerW / 2 : padL + (idx / (n - 1)) * innerW
      const y = padT + (1 - Math.min(Math.max(t.rate, 0), 100) / 100) * innerH
      return { x, y, item: t }
    })
    const linePath = buildMonotonicPath(points)
    const areaPath = buildAreaPath(points, padT + innerH)
    const target80Y = padT + (1 - 0.8) * innerH
    return { width, height, padL, padR, padT, padB, innerW, innerH, points, linePath, areaPath, target80Y }
  }, [visibleTrends])

  // Hourly Chart Slice (6 AM - 10 PM = 17 hours) + SVG Curve Geometry
  const workdayHours = useMemo(() => {
    return hourlyActivity.slice(6, 23)
  }, [hourlyActivity])

  const hourlyStats = useMemo(() => {
    const maxTotal = Math.max(...workdayHours.map((h) => h.total), 1)
    const morningRush = workdayHours
      .filter((h) => h.hour >= 6 && h.hour <= 11)
      .reduce((best, h) => (h.total > best.total ? h : best), workdayHours[0])
    const eveningRush = workdayHours
      .filter((h) => h.hour >= 16 && h.hour <= 22)
      .reduce((best, h) => (h.total > best.total ? h : best), workdayHours[workdayHours.length - 1])
    const overallPeak = workdayHours.reduce(
      (best, h) => (h.total > best.total ? h : best),
      workdayHours[0]
    )

    const width = 460
    const height = 148
    const padX = 12
    const padTop = 14
    const padBot = 24
    const innerW = width - padX * 2
    const innerH = height - padTop - padBot
    const n = workdayHours.length
    const pts = workdayHours.map((h, i) => ({
      x: n <= 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW,
      y: padTop + (1 - h.total / maxTotal) * innerH,
      data: h,
    }))
    const curvePath = buildMonotonicPath(pts)
    const areaPath = buildAreaPath(pts, padTop + innerH)

    return {
      maxTotal,
      morningRush,
      eveningRush,
      overallPeak,
      width,
      height,
      padTop,
      innerH,
      pts,
      curvePath,
      areaPath,
    }
  }, [workdayHours])

  // SVG Donut Geometry for Shift Compliance
  const donutSlices = useMemo(() => {
    const total = Math.max(shiftCompliance.total, 1)
    const radius = 52
    const circumference = 2 * Math.PI * radius
    const raw = [
      {
        key: 'completed',
        label: 'Completed Shifts (8h+)',
        value: shiftCompliance.completed,
        color: '#10b981',
        bgClass: 'bg-emerald-500',
        textClass: 'text-emerald-700',
      },
      {
        key: 'onDuty',
        label: 'On Duty / Active',
        value: shiftCompliance.onDuty,
        color: '#3b82f6',
        bgClass: 'bg-blue-500',
        textClass: 'text-blue-700',
      },
      {
        key: 'incomplete',
        label: 'Incomplete / Single Punch',
        value: shiftCompliance.incomplete,
        color: '#f59e0b',
        bgClass: 'bg-amber-500',
        textClass: 'text-amber-700',
      },
    ]

    let accumOffset = 0
    const segments = raw.map((item) => {
      const pct = shiftCompliance.total > 0 ? Math.round((item.value / total) * 100) : 0
      const segLen = (item.value / total) * circumference
      const dashOffset = -accumOffset
      accumOffset += segLen
      return {
        ...item,
        pct,
        segLen,
        dashOffset,
        circumference,
        radius,
      }
    })
    return segments
  }, [shiftCompliance])

  // Dynamic branch subtitle
  const branchSummaryText = useMemo(() => {
    if (branchStats.length === 0) return 'No branches found'
    return branchStats
      .map((b) => `${b.total} ${b.branch.replace(' Main', '')}`)
      .join(' · ')
  }, [branchStats])

  // Filtered Today Roster & Top Leaders for Report Explorer
  const filteredRoster = useMemo(() => {
    return todayRoster.filter((row) => {
      if (rosterFilter !== 'all' && row.status !== rosterFilter) return false
      if (branchFilter !== 'all' && row.branch !== branchFilter) return false
      return true
    })
  }, [todayRoster, rosterFilter, branchFilter])

  const filteredLeaders = useMemo(() => {
    return topEmployeesHours.filter((row) =>
      branchFilter === 'all' ? true : row.branch === branchFilter
    )
  }, [topEmployeesHours, branchFilter])

  const maxLeaderHours = useMemo(() => {
    return Math.max(...filteredLeaders.map((l) => l.totalHours), 1)
  }, [filteredLeaders])

  const bufferUsagePct = useMemo(() => {
    return Math.min(100, Math.max(0.2, Math.round((stats.allTimePunches / 100000) * 1000) / 10))
  }, [stats.allTimePunches])

  return (
    <div className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-5 sm:space-y-7">
      {/* ──── Light-Theme Hero Banner & Executive Controls ─────────────────────────────── */}
      <PageBanner
        theme="dashboard"
        pattern="mesh"
        eyebrow="Live Biometric Command Center · Manila Time (UTC+8)"
        eyebrowIcon={<BarChart3 className="w-3.5 h-3.5 text-blue-600" />}
        icon={<BarChart3 className="w-5 h-5 text-white" />}
        title="Operations & Attendance Command Center"
        description="Live workforce analytics, turnout curves, arrival punctuality timing, and daily DTR executive reports."
        chips={[
          {
            icon: <Users className="w-3.5 h-3.5 text-blue-600" />,
            label: `${stats.totalEmployees} Registered Staff`,
          },
          {
            icon: <UserCheck className="w-3.5 h-3.5 text-emerald-600" />,
            label: `${stats.todayPresent} Present Today (${stats.attendanceRate}%)`,
          },
          {
            icon: <Cpu className="w-3.5 h-3.5 text-indigo-600" />,
            label: `Bridge ${bridgeMeta.bridgeVersion} Iron Sentinel`,
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => fetchFreshData()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border shadow-sm ${isLive
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isLive ? 'animate-pulse text-emerald-600' : ''}`} />
              {isLive ? 'Live Telemetry' : 'Sync Active'}
            </span>
          </>
        }
      />

      {/* Quick Navigation Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <Link
          href="/reports"
          className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-sm transition-all group min-w-0"
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold text-slate-700 group-hover:text-blue-600 transition-colors truncate">
              Full DTR Reports
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
        </Link>

        <Link
          href="/attendance"
          className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl bg-white border border-slate-200/80 hover:border-indigo-400 hover:shadow-sm transition-all group min-w-0"
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold text-slate-700 group-hover:text-indigo-600 transition-colors truncate">
              Attendance Logs
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
        </Link>

        <Link
          href="/payroll"
          className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl bg-white border border-slate-200/80 hover:border-emerald-400 hover:shadow-sm transition-all group min-w-0"
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold text-slate-700 group-hover:text-emerald-600 transition-colors truncate">
              Payroll Export
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
        </Link>

        <Link
          href="/sync"
          className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl bg-white border border-slate-200/80 hover:border-purple-400 hover:shadow-sm transition-all group min-w-0"
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold flex-shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold text-slate-700 group-hover:text-purple-600 transition-colors truncate">
              Hardware Bridge
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
        </Link>
      </div>

      {/* ──── Executive KPI Strip (5 Cards) ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card 1: Registered Workforce */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate">Workforce</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">{stats.totalEmployees}</p>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 font-medium truncate">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <span className="truncate">{branchSummaryText}</span>
          </div>
        </div>

        {/* Card 2: Present Today */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate">Present Today</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2 mt-2">
            <p className="text-2xl sm:text-3xl font-black text-emerald-700">{stats.todayPresent}</p>
            <span className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 sm:px-2 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap">
              {stats.attendanceRate}% Rate
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(stats.attendanceRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Card 3: Monthly Hours Worked */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate">Monthly Hours</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-indigo-700 mt-2">
            {Math.round(stats.totalMonthHours).toLocaleString()}h
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 font-medium">
            <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] border border-amber-200 whitespace-nowrap">
              +{stats.totalMonthOvertime}h OT
            </span>
            <span className="text-slate-400 whitespace-nowrap">{stats.avgDailyHours}h avg/shift</span>
          </div>
        </div>

        {/* Card 4: On-Time Punctuality */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate">Punctuality</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
              <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2 mt-2">
            <p className="text-2xl sm:text-3xl font-black text-purple-700">{stats.punctualityRate}%</p>
            <span className="text-[10px] sm:text-[11px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 whitespace-nowrap">
              {stats.avgCheckInLabel} avg
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-purple-500 to-indigo-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(stats.punctualityRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Card 5: Biometric Punches */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs relative overflow-hidden col-span-2 md:col-span-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate">Total Punches</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">{stats.allTimePunches.toLocaleString()}</p>
          <div className="mt-2.5 flex items-center justify-between text-xs font-bold">
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {stats.todayPunches} today
            </span>
            <span className="text-slate-400 font-medium">{bridgeMeta.bridgeVersion}</span>
          </div>
        </div>
      </div>

      {/* ──── Visual Analytics Row 1: Interactive Multi-Mode Trend + Hourly Wave Curve ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Hero Chart 1 (7 cols): Multi-Mode Workday Analytics (Headcount Bars / Area Rate Curve / Regular vs OT Stacked) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Workforce Turnout &amp; Hours Trends</h2>
                  <p className="text-xs text-slate-400">
                    {trendMode === 'headcount' && 'Daily employee headcount against registered capacity'}
                    {trendMode === 'area' && 'Attendance percentage wave vs 80% target benchmark'}
                    {trendMode === 'hours' && 'Stacked breakdown of Regular Hours vs Overtime Hours'}
                  </p>
                </div>
              </div>

              {/* View Mode + 7D/14D Switchers */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setTrendMode('headcount')}
                    className={`px-2.5 py-1 rounded-md transition-all ${trendMode === 'headcount'
                        ? 'bg-white text-blue-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    Headcount
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendMode('area')}
                    className={`px-2.5 py-1 rounded-md transition-all ${trendMode === 'area'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    Rate Curve
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendMode('hours')}
                    className={`px-2.5 py-1 rounded-md transition-all ${trendMode === 'hours'
                        ? 'bg-white text-amber-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    Hours + OT
                  </button>
                </div>

                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setTrendRange(7)}
                    className={`px-2 py-1 rounded-md transition-all ${trendRange === 7 ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                  >
                    7D
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendRange(14)}
                    className={`px-2 py-1 rounded-md transition-all ${trendRange === 14 ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                  >
                    14D
                  </button>
                </div>
              </div>
            </div>

            {visibleTrends.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-slate-400">
                No workday DTR records available yet.
              </div>
            ) : trendMode === 'area' ? (
              /* MODE 2: SVG Smooth Area & Line Chart */
              <div className="pt-2">
                <div className="relative">
                  <svg
                    viewBox={`0 0 ${areaChartGeom.width} ${areaChartGeom.height}`}
                    className="w-full h-56 overflow-visible"
                    role="img"
                    aria-label="Attendance Rate Area Chart"
                  >
                    <defs>
                      <linearGradient id="attendanceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.02" />
                      </linearGradient>
                      <linearGradient id="attendanceStrokeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#7c3aed" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid Lines (0%, 25%, 50%, 75%, 100%) */}
                    {[0, 25, 50, 75, 100].map((pctTick) => {
                      const y = areaChartGeom.padT + (1 - pctTick / 100) * areaChartGeom.innerH
                      return (
                        <g key={pctTick}>
                          <line
                            x1={areaChartGeom.padL}
                            y1={y}
                            x2={areaChartGeom.width - areaChartGeom.padR}
                            y2={y}
                            stroke="#e2e8f0"
                            strokeWidth="1"
                          />
                          <text
                            x={areaChartGeom.padL - 6}
                            y={y + 3}
                            textAnchor="end"
                            className="fill-slate-400 text-[10px] font-mono font-semibold"
                          >
                            {pctTick}%
                          </text>
                        </g>
                      )
                    })}

                    {/* 80% Target Benchmark */}
                    <line
                      x1={areaChartGeom.padL}
                      y1={areaChartGeom.target80Y}
                      x2={areaChartGeom.width - areaChartGeom.padR}
                      y2={areaChartGeom.target80Y}
                      stroke="#10b981"
                      strokeWidth="1.2"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={areaChartGeom.width - areaChartGeom.padR}
                      y={areaChartGeom.target80Y - 4}
                      textAnchor="end"
                      className="fill-emerald-600 text-[9px] font-bold"
                    >
                      80% Target
                    </text>

                    {/* Area & Smooth Curve */}
                    <path d={areaChartGeom.areaPath} fill="url(#attendanceAreaGrad)" />
                    <path
                      d={areaChartGeom.linePath}
                      fill="none"
                      stroke="url(#attendanceStrokeGrad)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />

                    {/* Data Dots & Interactive Hit Columns */}
                    {areaChartGeom.points.map((pt, idx) => {
                      const isHovered = hoveredTrendIdx === idx
                      const isLatest = idx === areaChartGeom.points.length - 1
                      return (
                        <g
                          key={pt.item.date}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredTrendIdx(idx)}
                          onMouseLeave={() => setHoveredTrendIdx(null)}
                          onClick={() => setHoveredTrendIdx((prev) => (prev === idx ? null : idx))}
                        >
                          {(isHovered || isLatest) && (
                            <line
                              x1={pt.x}
                              y1={areaChartGeom.padT}
                              x2={pt.x}
                              y2={areaChartGeom.padT + areaChartGeom.innerH}
                              stroke="#6366f1"
                              strokeOpacity="0.25"
                              strokeWidth="1.5"
                              strokeDasharray="3 3"
                            />
                          )}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isHovered ? 6 : isLatest ? 5 : 3.5}
                            fill={isLatest ? '#7c3aed' : '#4f46e5'}
                            stroke="#ffffff"
                            strokeWidth="2"
                          />
                          <text
                            x={pt.x}
                            y={areaChartGeom.height - 6}
                            textAnchor="middle"
                            className={`text-[10px] font-bold ${isLatest ? 'fill-indigo-600' : 'fill-slate-500'
                              }`}
                          >
                            {trendRange === 14 ? pt.item.date.slice(8) : pt.item.shortDay}
                          </text>
                          <rect
                            x={pt.x - 18}
                            y={areaChartGeom.padT}
                            width="36"
                            height={areaChartGeom.innerH + 20}
                            fill="transparent"
                          />
                        </g>
                      )
                    })}
                  </svg>

                  {/* Dynamic Hover Readout Bar */}
                  {hoveredTrendIdx !== null && visibleTrends[hoveredTrendIdx] && (
                    <div className="mt-2 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] sm:text-xs flex flex-wrap items-center justify-between gap-1.5">
                      <span className="font-bold">{visibleTrends[hoveredTrendIdx].label}</span>
                      <span className="text-slate-300">
                        {visibleTrends[hoveredTrendIdx].present}/{stats.totalEmployees} Present (
                        <strong className="text-emerald-300">{visibleTrends[hoveredTrendIdx].rate}%</strong>) ·{' '}
                        {visibleTrends[hoveredTrendIdx].hours}h total ·{' '}
                        {visibleTrends[hoveredTrendIdx].overtime}h OT
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : trendMode === 'hours' ? (
              /* MODE 3: Stacked Regular + Overtime Hours Columns */
              <div className="pt-3 pb-1">
                <div className="h-52 flex items-end justify-between gap-1 sm:gap-2 px-1 sm:px-2 border-b border-slate-100 relative">
                  {visibleTrends.map((t, idx) => {
                    const regH = t.regularHours
                    const otH = t.overtime
                    const totalH = regH + otH
                    const totalPct = Math.max(Math.round((totalH / trendStats.maxHours) * 100), 6)
                    const otSharePct = totalH > 0 ? Math.round((otH / totalH) * 100) : 0
                    const isHovered = hoveredTrendIdx === idx
                    const isToday = idx === visibleTrends.length - 1

                    return (
                      <div
                        key={t.date}
                        className="flex-1 min-w-0 flex flex-col items-center h-full justify-end group relative cursor-pointer"
                        onMouseEnter={() => setHoveredTrendIdx(idx)}
                        onMouseLeave={() => setHoveredTrendIdx(null)}
                        onClick={() => setHoveredTrendIdx((prev) => (prev === idx ? null : idx))}
                      >
                        {isHovered && (
                          <div className="hidden sm:block absolute -top-16 z-30 bg-slate-900 text-white text-xs rounded-xl py-1.5 px-3 shadow-lg whitespace-nowrap pointer-events-none">
                            <p className="font-bold">{t.label}</p>
                            <p className="text-[11px] text-slate-300">
                              Reg: {regH}h · <span className="text-amber-300 font-bold">OT: {otH}h</span> · Total: {totalH}h
                            </p>
                          </div>
                        )}
                        <span className="text-[9px] sm:text-[10px] font-bold text-slate-600 mb-1 truncate max-w-full">
                          {Math.round(totalH)}h
                        </span>
                        <div
                          className={`w-full ${trendRange === 14 ? 'max-w-[26px]' : 'max-w-[42px]'} rounded-t-lg sm:rounded-t-xl overflow-hidden flex flex-col justify-end transition-all duration-300 shadow-2xs ${isToday ? 'ring-2 ring-amber-400/50' : ''
                            }`}
                          style={{ height: `${totalPct}%` }}
                        >
                          {otSharePct > 0 && (
                            <div
                              className="w-full bg-gradient-to-t from-amber-500 to-orange-400"
                              style={{ height: `${Math.max(otSharePct, 12)}%` }}
                            />
                          )}
                          <div className="w-full flex-1 bg-gradient-to-t from-indigo-600 to-blue-500 group-hover:from-indigo-700 group-hover:to-blue-600" />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between gap-1 sm:gap-2 px-1 sm:px-2 mt-2">
                  {visibleTrends.map((t, idx) => {
                    const isToday = idx === visibleTrends.length - 1
                    return (
                      <div key={t.date} className="flex-1 min-w-0 text-center">
                        <p className={`text-[10px] sm:text-[11px] font-bold truncate ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}>
                          {trendRange === 14 ? t.date.slice(8) : t.shortDay}
                        </p>
                        <p className="text-[8px] sm:text-[9px] text-amber-600 font-semibold mt-0.5 truncate">
                          {t.overtime > 0 ? `+${t.overtime}h` : '—'}
                        </p>
                      </div>
                    )
                  })}
                </div>
                {hoveredTrendIdx !== null && visibleTrends[hoveredTrendIdx] && (
                  <div className="mt-2 sm:hidden px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] flex flex-wrap items-center justify-between gap-1">
                    <span className="font-bold">{visibleTrends[hoveredTrendIdx].label}</span>
                    <span className="text-slate-300">
                      Reg: {visibleTrends[hoveredTrendIdx].regularHours}h · <strong className="text-amber-300">OT: {visibleTrends[hoveredTrendIdx].overtime}h</strong> · Total: {visibleTrends[hoveredTrendIdx].regularHours + visibleTrends[hoveredTrendIdx].overtime}h
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* MODE 1: Headcount Turnout Columns with Capacity Track + Average Line */
              <div className="pt-3 pb-1">
                <div className="h-52 flex items-end justify-between gap-1 sm:gap-2 px-1 sm:px-2 border-b border-slate-100 relative">
                  {/* Average Turnout Dashed Benchmark Line */}
                  {trendStats.avgPresent > 0 && (
                    <div
                      className="absolute left-2 right-2 border-t border-dashed border-emerald-400 pointer-events-none z-10 flex justify-end"
                      style={{
                        bottom: `${Math.min(
                          95,
                          Math.round((trendStats.avgPresent / trendStats.maxPresent) * 100)
                        )}%`,
                      }}
                    >
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded -mt-2.5 border border-emerald-200">
                        Avg {trendStats.avgPresent}
                      </span>
                    </div>
                  )}

                  {visibleTrends.map((t, idx) => {
                    const heightPercent = Math.max(
                      Math.round((t.present / trendStats.maxPresent) * 100),
                      8
                    )
                    const isToday = idx === visibleTrends.length - 1
                    const isHovered = hoveredTrendIdx === idx

                    return (
                      <div
                        key={t.date}
                        className="flex-1 min-w-0 flex flex-col items-center h-full justify-end group relative cursor-pointer"
                        onMouseEnter={() => setHoveredTrendIdx(idx)}
                        onMouseLeave={() => setHoveredTrendIdx(null)}
                        onClick={() => setHoveredTrendIdx((prev) => (prev === idx ? null : idx))}
                      >
                        {isHovered && (
                          <div className="hidden sm:block absolute -top-16 z-30 bg-slate-900 text-white text-xs rounded-xl py-1.5 px-3 shadow-lg whitespace-nowrap pointer-events-none">
                            <p className="font-bold">{t.label}</p>
                            <p className="text-[11px] text-slate-300">
                              {t.present} Present ({t.rate}%) · {t.hours}h · {t.completed} Completed
                            </p>
                          </div>
                        )}

                        <span
                          className={`text-[10px] sm:text-[11px] font-bold mb-1 transition-colors ${isToday ? 'text-indigo-600' : 'text-slate-600 group-hover:text-slate-900'
                            }`}
                        >
                          {t.present}
                        </span>

                        {/* Full-Height Light Capacity Backdrop + Foreground Present Bar */}
                        <div
                          className={`w-full ${trendRange === 14 ? 'max-w-[26px]' : 'max-w-[42px]'
                            } h-[88%] rounded-t-lg sm:rounded-t-xl bg-slate-100/80 flex items-end overflow-hidden`}
                        >
                          <div
                            className={`w-full rounded-t-lg sm:rounded-t-xl transition-all duration-300 ${isToday
                                ? 'bg-gradient-to-t from-indigo-600 to-purple-500 shadow-md shadow-indigo-500/20'
                                : 'bg-gradient-to-t from-blue-500 to-indigo-400 group-hover:from-blue-600 group-hover:to-indigo-500'
                              }`}
                            style={{ height: `${heightPercent}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-between gap-1 sm:gap-2 px-1 sm:px-2 mt-2">
                  {visibleTrends.map((t, idx) => {
                    const isToday = idx === visibleTrends.length - 1
                    return (
                      <div key={t.date} className="flex-1 min-w-0 text-center">
                        <p className={`text-[10px] sm:text-[11px] font-bold truncate ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}>
                          {trendRange === 14 ? t.date.slice(8) : t.shortDay}
                        </p>
                        <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">
                          {t.hours > 0 ? `${t.hours}h` : '—'}
                        </p>
                      </div>
                    )
                  })}
                </div>
                {hoveredTrendIdx !== null && visibleTrends[hoveredTrendIdx] && (
                  <div className="mt-2 sm:hidden px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] flex flex-wrap items-center justify-between gap-1">
                    <span className="font-bold">{visibleTrends[hoveredTrendIdx].label}</span>
                    <span className="text-slate-300">
                      {visibleTrends[hoveredTrendIdx].present} Present ({visibleTrends[hoveredTrendIdx].rate}%) · {visibleTrends[hoveredTrendIdx].hours}h
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              {trendMode === 'hours' ? (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                    <span>Regular Hours</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                    <span>Overtime Hours</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-blue-500 to-indigo-500 inline-block" />
                    <span>Workdays ({visibleTrends.length}d)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-indigo-600 to-purple-500 inline-block" />
                    <span className="font-bold text-slate-700">Latest Day</span>
                  </span>
                </>
              )}
            </div>
            <span className="text-[11px] text-slate-500 font-semibold">
              Peak: {trendStats.peakDay.present} employees ({trendStats.peakDay.label})
            </span>
          </div>
        </div>

        {/* Hero Chart 2 (5 cols): Workday Hourly Pulse (SVG Density Curve + Dual Check-In/Out Columns) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Biometric Traffic Curve</h2>
                  <p className="text-xs text-slate-400">6 AM – 10 PM hourly arrival &amp; departure waves</p>
                </div>
              </div>
              {hourlyStats.overallPeak && (
                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-lg border border-purple-200">
                  Peak: {hourlyStats.overallPeak.label}
                </span>
              )}
            </div>

            {/* SVG Smooth Density Wave + Histogram Overlay */}
            <div className="relative pt-1">
              <svg
                viewBox={`0 0 ${hourlyStats.width} ${hourlyStats.height}`}
                className="w-full h-40 overflow-visible"
                role="img"
                aria-label="Hourly Biometric Punch Distribution"
              >
                <defs>
                  <linearGradient id="hourlyWaveFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9333ea" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#9333ea" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Baseline */}
                <line
                  x1="10"
                  y1={hourlyStats.padTop + hourlyStats.innerH}
                  x2={hourlyStats.width - 10}
                  y2={hourlyStats.padTop + hourlyStats.innerH}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />

                {/* Smooth Wave Area */}
                <path d={hourlyStats.areaPath} fill="url(#hourlyWaveFill)" />
                <path
                  d={hourlyStats.curvePath}
                  fill="none"
                  stroke="#7e22ce"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />

                {/* Interactive Hour Columns & Nodes */}
                {hourlyStats.pts.map((pt) => {
                  const h = pt.data
                  const isHov = hoveredHour === h.hour
                  const barH = Math.max((h.total / hourlyStats.maxTotal) * hourlyStats.innerH, h.total > 0 ? 4 : 1)
                  const barTop = hourlyStats.padTop + hourlyStats.innerH - barH
                  const showTick = h.hour % 2 === 0

                  return (
                    <g
                      key={h.hour}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredHour(h.hour)}
                      onMouseLeave={() => setHoveredHour(null)}
                      onClick={() => setHoveredHour((prev) => (prev === h.hour ? null : h.hour))}
                    >
                      <rect
                        x={pt.x - 6}
                        y={barTop}
                        width="12"
                        height={barH}
                        rx="3"
                        fill={isHov ? '#6d28d9' : h.isPeak ? '#8b5cf6' : '#cbd5e1'}
                        fillOpacity={isHov ? 0.85 : h.isPeak ? 0.55 : 0.45}
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isHov ? 4.5 : h.isPeak ? 3.5 : 2}
                        fill={h.isPeak ? '#7e22ce' : '#64748b'}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      {showTick && (
                        <text
                          x={pt.x}
                          y={hourlyStats.height - 6}
                          textAnchor="middle"
                          className="fill-slate-400 text-[9.5px] font-semibold"
                        >
                          {h.shortLabel}
                        </text>
                      )}
                      <rect
                        x={pt.x - 13}
                        y="0"
                        width="26"
                        height={hourlyStats.height}
                        fill="transparent"
                      />
                    </g>
                  )
                })}
              </svg>

              {/* Hovered Hour Detail Strip or Peak Summary Pills */}
              {hoveredHour !== null ? (
                (() => {
                  const slot = workdayHours.find((w) => w.hour === hoveredHour)
                  if (!slot) return null
                  return (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs flex items-center justify-between">
                      <span className="font-bold">{slot.label} Window</span>
                      <span className="text-slate-300">
                        <strong className="text-white">{slot.total}</strong> punches ({slot.checkIns} in ·{' '}
                        {slot.checkOuts} out)
                      </span>
                    </div>
                  )
                })()
              ) : (
                <div className="grid grid-cols-2 gap-2.5 mt-2">
                  <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100">
                    <p className="text-[10px] font-bold uppercase text-blue-600">Morning Inflow Peak</p>
                    <p className="text-sm font-black text-slate-900 mt-0.5">
                      {hourlyStats.morningRush?.label || '8:00 AM'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {hourlyStats.morningRush?.total || 0} logged scans
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-100">
                    <p className="text-[10px] font-bold uppercase text-purple-600">Evening Egress Peak</p>
                    <p className="text-sm font-black text-slate-900 mt-0.5">
                      {hourlyStats.eveningRush?.label || '6:00 PM'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {hourlyStats.eveningRush?.total || 0} logged scans
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Based on last {hourlyActivity.reduce((a, b) => a + b.total, 0).toLocaleString()} scans</span>
            <span className="font-semibold text-purple-700">Manila Time (UTC+8)</span>
          </div>
        </div>
      </div>

      {/* ──── Visual Analytics Row 2: Donut Chart · Punctuality Gauge · Branch Radials & Weekday Heatmap ──── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Card A: Shift Outcomes Multi-Segment SVG Donut Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <PieChartIcon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Shift Outcome Mix</h3>
              </div>
              <span className="text-[11px] font-bold text-slate-400">{shiftCompliance.total} logs</span>
            </div>

            <div className="flex items-center justify-center my-2 relative">
              <svg viewBox="0 0 140 140" className="w-36 h-36 -rotate-90" role="img" aria-label="Shift Outcome Donut Chart">
                <circle cx="70" cy="70" r="52" fill="none" stroke="#f1f5f9" strokeWidth="16" />
                {shiftCompliance.total > 0 &&
                  donutSlices.map((slice) => {
                    const isHov = hoveredDonutSlice === slice.key
                    return (
                      <circle
                        key={slice.key}
                        cx="70"
                        cy="70"
                        r={slice.radius}
                        fill="none"
                        stroke={slice.color}
                        strokeWidth={isHov ? 19 : 16}
                        strokeDasharray={`${slice.segLen} ${slice.circumference}`}
                        strokeDashoffset={slice.dashOffset}
                        className="transition-all duration-300 cursor-pointer"
                        onMouseEnter={() => setHoveredDonutSlice(slice.key)}
                        onMouseLeave={() => setHoveredDonutSlice(null)}
                      />
                    )
                  })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-900">
                  {hoveredDonutSlice
                    ? `${donutSlices.find((s) => s.key === hoveredDonutSlice)?.pct ?? 0}%`
                    : `${shiftCompliance.completionRate}%`}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {hoveredDonutSlice || 'Completed'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-2">
            {donutSlices.map((slice) => (
              <div
                key={slice.key}
                className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                onMouseEnter={() => setHoveredDonutSlice(slice.key)}
                onMouseLeave={() => setHoveredDonutSlice(null)}
              >
                <span className="flex items-center gap-2 text-slate-600 font-medium">
                  <span className={`w-2.5 h-2.5 rounded-full ${slice.bgClass}`} />
                  {slice.label}
                </span>
                <span className={`font-extrabold ${slice.textClass}`}>
                  {slice.value} <span className="text-slate-400 font-semibold">({slice.pct}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card B: Arrival Punctuality 100% Segmented Strip & Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Arrival Punctuality Timing</h3>
              </div>
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                9:00 AM Target
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-3">
              <div>
                <p className="text-2xl font-black text-slate-900">{punctuality.punctualityRate}%</p>
                <p className="text-[11px] text-slate-400">
                  On-time / early arrivals ({punctuality.totalTracked} shifts)
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-indigo-700">{punctuality.avgCheckInLabel}</p>
                <p className="text-[10px] text-slate-400 font-medium">Mean Check-In</p>
              </div>
            </div>

            {/* 100% Proportional Segmented Ribbon */}
            <div className="w-full h-4 rounded-full bg-slate-100 overflow-hidden flex gap-0.5 mb-4 p-0.5 border border-slate-200/70">
              {punctuality.early.pct > 0 && (
                <div
                  className="h-full bg-emerald-500 rounded-l-full"
                  style={{ width: `${punctuality.early.pct}%` }}
                  title={`Early (<8:30 AM): ${punctuality.early.count}`}
                />
              )}
              {punctuality.onTime.pct > 0 && (
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${punctuality.onTime.pct}%` }}
                  title={`On Time (8:30-9:05 AM): ${punctuality.onTime.count}`}
                />
              )}
              {punctuality.graceLate.pct > 0 && (
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${punctuality.graceLate.pct}%` }}
                  title={`Slight Delay (9:06-9:30 AM): ${punctuality.graceLate.count}`}
                />
              )}
              {punctuality.late.pct > 0 && (
                <div
                  className="h-full bg-rose-500 rounded-r-full"
                  style={{ width: `${punctuality.late.pct}%` }}
                  title={`Late (>9:30 AM): ${punctuality.late.count}`}
                />
              )}
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                { label: 'Early Bird (< 8:30 AM)', item: punctuality.early, bar: 'bg-emerald-500', text: 'text-emerald-700' },
                { label: 'On Time (8:30 – 9:05 AM)', item: punctuality.onTime, bar: 'bg-blue-500', text: 'text-blue-700' },
                { label: 'Mild Late (9:06 – 9:30 AM)', item: punctuality.graceLate, bar: 'bg-amber-400', text: 'text-amber-700' },
                { label: 'Tardy (> 9:30 AM)', item: punctuality.late, bar: 'bg-rose-500', text: 'text-rose-700' },
              ].map((tier) => (
                <div key={tier.label}>
                  <div className="flex justify-between font-bold mb-1">
                    <span className="text-slate-600">{tier.label}</span>
                    <span className={tier.text}>
                      {tier.item.count} ({tier.item.pct}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${tier.bar}`}
                      style={{ width: `${tier.item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-2.5 border-t border-slate-100 flex justify-between text-[11px] text-slate-400">
            <span>Month window: {data.monthPrefix}</span>
            <Link href="/reports" className="text-indigo-600 font-bold hover:underline">
              Inspect tardiness →
            </Link>
          </div>
        </div>

        {/* Card C: Branch Radial Rings + Mon–Sat Weekday Performance */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Branch &amp; Weekday Pattern</h3>
              </div>
              <span className="text-[11px] font-bold text-slate-400">Today + Avg</span>
            </div>

            {/* Branch SVG Radial Progress Rings */}
            <div className="space-y-2.5 mb-4">
              {branchStats.map((b, bIdx) => {
                const r = 20
                const c = 2 * Math.PI * r
                const offset = c - (Math.min(b.rate, 100) / 100) * c
                const strokeColor = bIdx === 0 ? '#2563eb' : '#7c3aed'

                return (
                  <div
                    key={b.branch}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                      <svg viewBox="0 0 48 48" className="w-12 h-12 -rotate-90">
                        <circle cx="24" cy="24" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4.5" />
                        <circle
                          cx="24"
                          cy="24"
                          r={r}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="4.5"
                          strokeLinecap="round"
                          strokeDasharray={c}
                          strokeDashoffset={offset}
                        />
                      </svg>
                      <span className="absolute text-[10px] font-black text-slate-800">{b.rate}%</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 truncate">{b.branch}</span>
                        <span className="text-xs font-extrabold text-blue-700">
                          {b.present}/{b.total}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {b.monthHours.toLocaleString()}h logged · {b.monthOvertime}h OT · {b.punctualityRate}% on-time
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Mon - Sat Weekday Average Mini Bars */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Weekday Average Turnout (Mon–Sat)
              </p>
              <div className="grid grid-cols-6 gap-1.5 items-end h-20 pt-2">
                {weekdayAverages.map((wd) => (
                  <div key={wd.dayLabel} className="flex flex-col items-center h-full justify-end">
                    <span className="text-[9px] font-bold text-slate-600 mb-1">
                      {wd.avgRate > 0 ? `${wd.avgRate}%` : '—'}
                    </span>
                    <div className="w-full h-11 bg-slate-100 rounded-md flex items-end overflow-hidden">
                      <div
                        className="w-full bg-gradient-to-t from-blue-500 to-cyan-400 rounded-md transition-all"
                        style={{ height: `${Math.max(wd.avgRate, wd.avgRate > 0 ? 12 : 0)}%` }}
                        title={`${wd.dayLabel}: Avg ${wd.avgPresent} staff · ${wd.avgHoursPerShift}h/shift`}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 mt-1">{wd.dayLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ──── Detailed Reports Explorer + Live Biometric Infrastructure ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left (8 cols): Interactive Multi-Report Table Card */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
                  <Table2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Executive DTR Reports Explorer</h2>
                  <p className="text-xs text-slate-400">
                    Real-time roster snapshot, hours &amp; OT leaders, and 14-day attendance ledger
                  </p>
                </div>
              </div>

              {/* Report Tab Switcher */}
              <div className="w-full sm:w-auto max-w-full overflow-x-auto flex sm:inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setReportTab('today')}
                  className={`inline-flex flex-1 sm:flex-none justify-center whitespace-nowrap items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all ${reportTab === 'today'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Today Roster
                </button>
                <button
                  type="button"
                  onClick={() => setReportTab('leaders')}
                  className={`inline-flex flex-1 sm:flex-none justify-center whitespace-nowrap items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all ${reportTab === 'leaders'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  Hours &amp; OT
                </button>
                <button
                  type="button"
                  onClick={() => setReportTab('ledger')}
                  className={`inline-flex flex-1 sm:flex-none justify-center whitespace-nowrap items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all ${reportTab === 'ledger'
                      ? 'bg-white text-purple-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  14-Day Ledger
                </button>
              </div>
            </div>

            {/* Filter Strip for Today Roster & Leaders */}
            {reportTab !== 'ledger' && (
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  {reportTab === 'today' &&
                    (['all', 'On Duty', 'Completed', 'Not Punched'] as RosterFilter[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setRosterFilter(st)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${rosterFilter === st
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                      >
                        {st === 'all' ? `All (${todayRoster.length})` : st}
                      </button>
                    ))}
                  {reportTab === 'leaders' && (
                    <span className="text-xs font-semibold text-slate-500">
                      Showing monthly totals ({data.monthPrefix}) ranked by total worked hours
                    </span>
                  )}
                </div>

                <select
                  aria-label="Filter by branch"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="w-full sm:w-auto text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 sm:py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Branches</option>
                  {branchStats.map((b) => (
                    <option key={b.branch} value={b.branch}>
                      {b.branch} ({b.total})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* TAB 1: TODAY LIVE ROSTER */}
            {reportTab === 'today' && (
              <div className="overflow-x-auto max-h-80 overflow-y-auto pr-1">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Employee</th>
                      <th className="py-2.5 px-2">Branch</th>
                      <th className="py-2.5 px-2">Check-In</th>
                      <th className="py-2.5 px-2">Check-Out</th>
                      <th className="py-2.5 px-2 text-right">Hours</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRoster.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No employees match the current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRoster.map((row) => (
                        <tr key={row.deviceUserId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                                {getInitials(row.name)}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 truncate">{row.name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-slate-500 font-medium whitespace-nowrap">
                            {row.branch.replace(' Main', '')}
                          </td>
                          <td className="py-2 px-2 font-mono font-semibold whitespace-nowrap">
                            <span className={row.isLate ? 'text-rose-600' : 'text-slate-700'}>
                              {formatManilaClock(row.firstCheckIn)}
                            </span>
                            {row.isLate && (
                              <span className="ml-1 text-[9px] font-sans font-bold text-rose-600 bg-rose-50 px-1 py-0.2 rounded">
                                Late
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 font-mono text-slate-600 whitespace-nowrap">
                            {formatManilaClock(row.lastCheckOut)}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-slate-800 whitespace-nowrap">
                            {row.hoursWorked > 0 ? `${row.hoursWorked}h` : '—'}
                            {row.overtimeHours > 0 && (
                              <span className="ml-1 text-[10px] text-amber-600">+{row.overtimeHours}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.status === 'Completed'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : row.status === 'On Duty'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : row.status === 'Incomplete'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 2: MONTHLY HOURS & OVERTIME LEADERS */}
            {reportTab === 'leaders' && (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {filteredLeaders.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">No monthly hours tracked yet.</p>
                ) : (
                  filteredLeaders.slice(0, 12).map((emp, idx) => {
                    const regPct = Math.round((emp.regularHours / maxLeaderHours) * 100)
                    const otPct = Math.round((emp.overtimeHours / maxLeaderHours) * 100)
                    return (
                      <div
                        key={emp.deviceUserId}
                        className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-100 hover:border-slate-200 transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 font-black text-[10px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-900 truncate">{emp.name}</span>
                            <span className="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              {emp.branch.replace(' Main', '')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 text-[11px] font-bold">
                            <span className="text-slate-500">{emp.shifts} shifts</span>
                            <span className="text-indigo-700">{emp.regularHours}h reg</span>
                            {emp.overtimeHours > 0 && (
                              <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                +{emp.overtimeHours}h OT
                              </span>
                            )}
                            <span className="text-slate-900 font-black">{emp.totalHours}h</span>
                          </div>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200/70 overflow-hidden flex">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600"
                            style={{ width: `${Math.max(regPct, 2)}%` }}
                          />
                          {otPct > 0 && (
                            <div
                              className="h-full bg-amber-400"
                              style={{ width: `${Math.max(otPct, 2)}%` }}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* TAB 3: 14-DAY ATTENDANCE SUMMARY LEDGER */}
            {reportTab === 'ledger' && (
              <div className="overflow-x-auto max-h-80 overflow-y-auto pr-1">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Work Date</th>
                      <th className="py-2.5 px-2 text-right">Turnout</th>
                      <th className="py-2.5 px-2 text-right">Rate</th>
                      <th className="py-2.5 px-2 text-right">Completed</th>
                      <th className="py-2.5 px-2 text-right">Avg Check-In</th>
                      <th className="py-2.5 px-2 text-right">Regular</th>
                      <th className="py-2.5 px-3 text-right">Overtime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...weeklyTrends].reverse().map((row) => (
                      <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-bold text-slate-800 whitespace-nowrap">
                          {row.label}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-slate-700">
                          {row.present} / {stats.totalEmployees}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.rate >= 80
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : row.rate >= 60
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                          >
                            {row.rate}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-emerald-700 font-bold">
                          {row.completed}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600">
                          {formatMinutesToClock(row.avgCheckInMin)}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-indigo-700">
                          {row.regularHours}h
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-amber-600">
                          {row.overtime > 0 ? `+${row.overtime}h` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-400">
              Today snapshot: {stats.todayCompleted} completed · {stats.todayOnDuty} on duty ·{' '}
              {stats.todayAbsent} unpunched
            </span>
            <div className="flex items-center gap-3">
              <Link
                href="/payroll"
                className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center gap-1"
              >
                Open Payroll
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/reports"
                className="font-bold text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
              >
                Export Full DTR
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right (4 cols): Biometric Infrastructure & Bridge v18.9 Health Card */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                  <Cpu className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Biometric Infrastructure</h3>
              </div>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${bridgeMeta.bridgeOnline && bridgeMeta.ta500Online
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${bridgeMeta.bridgeOnline && bridgeMeta.ta500Online
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-amber-500'
                    }`}
                />
                {bridgeMeta.bridgeOnline && bridgeMeta.ta500Online ? 'Online' : 'Standby'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Hardware link &amp; cloud sync health</p>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">TA500 Terminal</span>
                <span
                  className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded border ${bridgeMeta.ta500Online
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : 'text-slate-600 bg-slate-100 border-slate-200'
                    }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${bridgeMeta.ta500Online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                      }`}
                  />
                  192.168.0.58:4370
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">Sync Engine</span>
                <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {bridgeMeta.bridgeVersion} Iron Sentinel
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">Heartbeat</span>
                <span className="font-bold text-slate-800">
                  {bridgeMeta.heartbeatAgeSec < 9000
                    ? `${bridgeMeta.heartbeatAgeSec}s ago`
                    : 'Waiting signal'}
                </span>
              </div>

              {/* Flash Memory Buffer Progress */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-slate-600 font-medium">Cloud &amp; Flash Sync</span>
                  <span className="font-black text-slate-800">
                    {stats.allTimePunches.toLocaleString()} / 100k
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                    style={{ width: `${Math.max(bufferUsagePct, 2)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>{bufferUsagePct}% TA500 capacity used</span>
                  <span className="font-semibold text-emerald-700">Zero-miss</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {mounted ? `Refreshed ${lastSyncClock}` : 'Synced Manila UTC+8'}
            </span>
            <Link
              href="/sync"
              className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline"
            >
              Inspect Bridge
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
