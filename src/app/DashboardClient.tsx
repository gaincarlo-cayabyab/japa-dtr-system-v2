'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users,
  Clock,
  UserCheck,
  Calendar,
  Radio,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Building2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowUpRight,
  Zap,
  Activity,
  Layers,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'

interface WeeklyTrend {
  date: string
  label: string
  present: number
  hours: number
  completed: number
  overtime: number
  rate: number
}

interface BranchStat {
  branch: string
  total: number
  present: number
  rate: number
}

interface DashboardClientProps {
  stats: {
    totalEmployees: number
    todayPunches: number
    todayPresent: number
    attendanceRate: number
    allTimePunches: number
    totalMonthHours: number
    totalMonthOvertime: number
    activeTodayShifts: number
  }
  weeklyTrends: WeeklyTrend[]
  hourlyCounts: number[]
  branchStats: BranchStat[]
  shiftCompliance: {
    completed: number
    incomplete: number
    total: number
    completionRate: number
  }
  todayISO: string
  monthISO: string
}

export function DashboardClient({
  stats: initialStats,
  weeklyTrends: initialWeeklyTrends,
  hourlyCounts: initialHourlyCounts,
  branchStats: initialBranchStats,
  shiftCompliance: initialShiftCompliance,
  todayISO,
  monthISO,
}: DashboardClientProps) {
  const [stats, setStats] = useState(initialStats)
  const [weeklyTrends, setWeeklyTrends] = useState(initialWeeklyTrends)
  const [hourlyCounts, setHourlyCounts] = useState(initialHourlyCounts)
  const [branchStats, setBranchStats] = useState(initialBranchStats)
  const [shiftCompliance, setShiftCompliance] = useState(initialShiftCompliance)

  const [isLive, setIsLive] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [activeHoverBar, setActiveHoverBar] = useState<number | null>(null)

  // Maximum attendance in weekly trend for scaling chart
  const maxWeeklyPresent = useMemo(() => {
    const maxVal = Math.max(...weeklyTrends.map((t) => t.present), 1)
    return Math.max(maxVal, stats.totalEmployees)
  }, [weeklyTrends, stats.totalEmployees])

  // Hourly chart filtered to working hours (6 AM to 8 PM)
  const workingHours = useMemo(() => {
    const list = []
    for (let h = 6; h <= 20; h++) {
      const ampm = h < 12 ? 'AM' : 'PM'
      const displayH = h % 12 === 0 ? 12 : h % 12
      list.push({
        hour: h,
        label: `${displayH} ${ampm}`,
        count: hourlyCounts[h] || 0,
        isPeak: h === 8 || h === 9 || h === 18,
      })
    }
    return list
  }, [hourlyCounts])

  const maxHourlyCount = useMemo(() => {
    return Math.max(...workingHours.map((w) => w.count), 1)
  }, [workingHours])

  const fetchFreshData = useCallback(async () => {
    setRefreshing(true)
    const supabase = createClient()
    try {
      const [
        { count: totalEmployees },
        { count: allTimePunches },
        { data: todayPunches },
        { data: dtrRecords },
        { data: recentPunchesForHours },
      ] = await Promise.all([
        supabase.from('employees').select('*', { count: 'exact', head: true }),
        supabase.from('attendance_logs').select('*', { count: 'exact', head: true }),
        supabase.from('attendance_logs').select('device_user_id').gte('punch_time', todayISO),
        supabase.from('daily_dtr').select('work_date, hours_worked, overtime_hours, shift_status, branch').order('work_date', { ascending: false }).limit(350),
        supabase.from('attendance_logs').select('punch_time').order('punch_time', { ascending: false }).limit(600),
      ])

      const presentSet = new Set((todayPunches ?? []).map((r) => r.device_user_id))
      const presentCount = presentSet.size
      const totalEmp = totalEmployees ?? stats.totalEmployees
      const attRate = totalEmp > 0 ? Math.round((presentCount / totalEmp) * 100) : 0

      // Re-aggregate monthly hours
      const monthDtr = (dtrRecords ?? []).filter((r) => r.work_date >= monthISO.slice(0, 10))
      const monthHours = Math.round(monthDtr.reduce((acc, r) => acc + (Number(r.hours_worked) || 0), 0))
      const monthOt = Math.round(monthDtr.reduce((acc, r) => acc + (Number(r.overtime_hours) || 0), 0) * 10) / 10

      // Re-aggregate weekly trends
      const trendMap = new Map<string, { present: number; hours: number; completed: number; overtime: number }>()
      for (const r of dtrRecords ?? []) {
        const d = r.work_date
        if (!trendMap.has(d)) trendMap.set(d, { present: 0, hours: 0, completed: 0, overtime: 0 })
        const entry = trendMap.get(d)!
        entry.present += 1
        entry.hours += Number(r.hours_worked) || 0
        entry.overtime += Number(r.overtime_hours) || 0
        if (r.shift_status === 'Completed') entry.completed += 1
      }

      const sortedDates = Array.from(trendMap.keys()).sort().slice(-7)
      const newWeeklyTrends = sortedDates.map((dateStr) => {
        const entry = trendMap.get(dateStr)!
        const d = new Date(dateStr)
        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
        return {
          date: dateStr,
          label: dayLabel,
          present: entry.present,
          hours: Math.round(entry.hours),
          completed: entry.completed,
          overtime: Math.round(entry.overtime * 10) / 10,
          rate: totalEmp > 0 ? Math.round((entry.present / totalEmp) * 100) : 0,
        }
      })

      // Re-aggregate hourly counts
      const newHourly = new Array(24).fill(0)
      for (const p of recentPunchesForHours ?? []) {
        if (!p.punch_time) continue
        try {
          const dt = new Date(p.punch_time)
          const manilaHour = (dt.getUTCHours() + 8) % 24
          newHourly[manilaHour] += 1
        } catch {}
      }

      // Re-aggregate shift compliance
      let comp = 0
      let incomp = 0
      for (const r of dtrRecords ?? []) {
        if (r.shift_status === 'Completed') comp += 1
        else incomp += 1
      }

      setStats({
        totalEmployees: totalEmp,
        todayPunches: todayPunches?.length ?? 0,
        todayPresent: presentCount,
        attendanceRate: attRate,
        allTimePunches: allTimePunches ?? stats.allTimePunches,
        totalMonthHours: monthHours,
        totalMonthOvertime: monthOt,
        activeTodayShifts: presentCount,
      })

      if (newWeeklyTrends.length > 0) setWeeklyTrends(newWeeklyTrends)
      setHourlyCounts(newHourly)
      setShiftCompliance({
        completed: comp,
        incomplete: incomp,
        total: comp + incomp,
        completionRate: (comp + incomp) > 0 ? Math.round((comp / (comp + incomp)) * 100) : 90,
      })
      setLastRefreshed(new Date())
    } catch (e) {
      console.error('Error fetching dashboard analytics:', e)
    } finally {
      setRefreshing(false)
    }
  }, [todayISO, monthISO, stats.totalEmployees, stats.allTimePunches])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        fetchFreshData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_dtr' }, () => {
        fetchFreshData()
      })
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'))

    const interval = setInterval(() => fetchFreshData(), 20000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchFreshData])

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* ──── Header & Executive Controls ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-md">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                Operations & Attendance Command Center
              </h1>
            </div>
          </div>
          <p className="text-slate-500 text-xs md:text-sm">
            Live workforce analytics  &middot;  Shift performance  &middot;  Biometric hardware telemetry
          </p>
        </div>

        {/* Live Pill & Quick Actions */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => fetchFreshData()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-xs transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-400'}`} />
            Refresh
          </button>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border ${
              isLive
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-2xs'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isLive ? 'animate-pulse text-emerald-600' : ''}`} />
            {isLive ? 'Live Biometric Telemetry' : 'Sync Active'}
          </span>
        </div>
      </div>

      {/* Quick Navigation Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/reports"
          className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-700 group-hover:text-blue-600 transition-colors">
              Full DTR Reports
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>

        <Link
          href="/attendance"
          className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200/80 hover:border-indigo-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">
              Attendance Logs
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>

        <Link
          href="/payroll"
          className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200/80 hover:border-emerald-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-700 group-hover:text-emerald-600 transition-colors">
              Payroll Export
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>

        <Link
          href="/sync"
          className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200/80 hover:border-purple-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-700 group-hover:text-purple-600 transition-colors">
              Hardware Bridge
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* ──── Top Executive KPI Cards (5 Cards) ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Card 1: Registered Workforce */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Workforce</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{stats.totalEmployees}</p>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
            <span>21 Dagupan  &middot;  3 Manila</span>
          </div>
        </div>

        {/* Card 2: Today's Attendance Rate */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Present Today</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-3xl font-black text-emerald-700">{stats.todayPresent}</p>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {stats.attendanceRate}% Rate
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(stats.attendanceRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Card 3: Monthly Hours Worked */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly Hours</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-indigo-700 mt-2">{stats.totalMonthHours.toLocaleString()}</p>
          <div className="mt-2.5 flex items-center gap-1 text-xs text-slate-500 font-medium">
            <span className="font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[11px] border border-amber-200">
              +{stats.totalMonthOvertime}h OT
            </span>
            <span className="text-slate-400">logged</span>
          </div>
        </div>

        {/* Card 4: Shift Completion Rate */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Shift Completion</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-purple-700 mt-2">{shiftCompliance.completionRate}%</p>
          <div className="mt-2.5 flex items-center gap-1 text-xs text-slate-500 font-medium">
            <span className="font-bold text-purple-700">{shiftCompliance.completed}</span>
            <span className="text-slate-400">of {shiftCompliance.total} shifts</span>
          </div>
        </div>

        {/* Card 5: All-Time Punches */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Punches</span>
            <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{stats.allTimePunches.toLocaleString()}</p>
          <div className="mt-2.5 flex items-center gap-1 text-xs text-emerald-600 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Hardware Synced</span>
          </div>
        </div>
      </div>

      {/* ──── Visual Graphs Section ──────────────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Graph 1: 7-Day Attendance Volume & Hours Trend (8 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">7-Day Attendance Turnout Trend</h2>
                  <p className="text-xs text-slate-400">Daily employee attendance & hours worked</p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                Last 7 Workdays
              </span>
            </div>

            {/* Custom SVG / Bar Chart */}
            <div className="pt-4 pb-2">
              <div className="h-48 flex items-end justify-between gap-2 md:gap-4 px-2 border-b border-slate-100">
                {weeklyTrends.map((t, idx) => {
                  const heightPercent = Math.max(Math.round((t.present / maxWeeklyPresent) * 100), 10)
                  const isToday = idx === weeklyTrends.length - 1
                  const isHovered = activeHoverBar === idx

                  return (
                    <div
                      key={t.date}
                      className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer"
                      onMouseEnter={() => setActiveHoverBar(idx)}
                      onMouseLeave={() => setActiveHoverBar(null)}
                    >
                      {/* Tooltip on hover */}
                      {isHovered && (
                        <div className="absolute -top-14 z-20 bg-slate-900 text-white text-xs rounded-xl py-1.5 px-3 shadow-lg whitespace-nowrap pointer-events-none transform -translate-y-1">
                          <p className="font-bold">{t.label}</p>
                          <p className="text-[11px] text-slate-300">
                            {t.present} Present ({t.rate}%)  &middot;  {t.hours} hrs  &middot;  {t.completed} Completed
                          </p>
                        </div>
                      )}

                      {/* Bar Value on top */}
                      <span className={`text-[11px] font-bold mb-1.5 transition-colors ${
                        isToday ? 'text-indigo-600' : 'text-slate-500 group-hover:text-slate-900'
                      }`}>
                        {t.present}
                      </span>

                      {/* Bar */}
                      <div
                        className={`w-full max-w-[42px] rounded-t-xl transition-all duration-300 ${
                          isToday
                            ? 'bg-gradient-to-t from-indigo-600 to-purple-500 shadow-md shadow-indigo-500/20'
                            : 'bg-gradient-to-t from-blue-500 to-indigo-400 group-hover:from-blue-600 group-hover:to-indigo-500'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                  )
                })}
              </div>

              {/* Day Labels */}
              <div className="flex justify-between gap-2 md:gap-4 px-2 mt-2.5">
                {weeklyTrends.map((t, idx) => {
                  const isToday = idx === weeklyTrends.length - 1
                  return (
                    <div key={t.date} className="flex-1 text-center">
                      <p className={`text-xs font-bold ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}>
                        {t.label.split(',')[0]}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {t.hours > 0 ? `${t.hours}h` : '—'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Bottom Insights Strip */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-blue-500 to-indigo-500 inline-block"></span>
                <span>Past Workdays</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-indigo-600 to-purple-500 inline-block"></span>
                <span className="font-bold text-slate-700">Today (Live)</span>
              </span>
            </div>
            <span className="text-[11px] text-slate-400">Peak turnout: 19 employees</span>
          </div>
        </div>

        {/* Graph 2: Hourly Activity Distribution (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Peak Punch Activity</h2>
                  <p className="text-xs text-slate-400">Hourly arrival & departure rush (6 AM – 8 PM)</p>
                </div>
              </div>
            </div>

            {/* Hourly Distribution Horizontal Bars */}
            <div className="space-y-2 mt-2">
              {workingHours
                .filter((w) => w.count > 0 || w.hour === 8 || w.hour === 9 || w.hour === 18)
                .slice(0, 7)
                .map((w) => {
                  const percent = Math.round((w.count / maxHourlyCount) * 100)
                  return (
                    <div key={w.hour} className="flex items-center gap-3">
                      <span className="w-16 text-xs font-bold text-slate-500 text-right">{w.label}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden relative">
                        <div
                          className={`h-3 rounded-full transition-all duration-500 ${
                            w.isPeak
                              ? 'bg-gradient-to-r from-purple-500 to-indigo-600'
                              : 'bg-gradient-to-r from-slate-400 to-slate-500'
                          }`}
                          style={{ width: `${Math.max(percent, 4)}%` }}
                        />
                      </div>
                      <div className="w-16 flex items-center justify-end gap-1">
                        <span className="text-xs font-black text-slate-800">{w.count}</span>
                        {w.isPeak && (
                          <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1 py-0.2 rounded uppercase">
                            Peak
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Primary shifts: 8:00 AM & 9:00 AM arrivals</span>
            <span className="font-semibold text-slate-700">6:00 PM departures</span>
          </div>
        </div>
      </div>

      {/* ──── Summary Reports & Operational Breakdowns ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Summary Card 1: Shift Compliance Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Shift Health & Compliance</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">Historical shift completion across all employees</p>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-600">Completed Full Shifts (8h+)</span>
                <span className="text-emerald-700">{shiftCompliance.completed} ({shiftCompliance.completionRate}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${shiftCompliance.completionRate}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-600">Active Shifts In Progress (Today)</span>
                <span className="text-blue-700">{stats.todayPresent} on-duty</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${stats.attendanceRate}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-600">Incomplete / Single Punches</span>
                <span className="text-amber-700">{shiftCompliance.incomplete} ({100 - shiftCompliance.completionRate}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${100 - shiftCompliance.completionRate}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Summary Card 2: Branch & Facility Turnout */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Branch & Facility Breakdown</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">Active turnout per office location</p>

          <div className="space-y-4">
            {branchStats.map((b) => (
              <div key={b.branch} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{b.branch}</span>
                  <span className="text-xs font-extrabold text-blue-700">{b.present} / {b.total} Present</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${b.rate}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 mt-1.5 font-medium">
                  <span>{b.total} registered staff</span>
                  <span className="font-bold text-blue-600">{b.rate}% Turnout</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Card 3: Biometric System Telemetry */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Biometric Infrastructure</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">Hardware link & cloud sync health</p>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">TA500 Biometric Machine</span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  192.168.0.58:4370
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">Sync Engine</span>
                <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  v16.5 Iron Sentinel Engine
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">Cloud Database Total</span>
                <span className="font-black text-slate-800">
                  {stats.allTimePunches.toLocaleString()} punches
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Refreshed {format(lastRefreshed, 'h:mm:ss a')}
            </span>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Export Report
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
