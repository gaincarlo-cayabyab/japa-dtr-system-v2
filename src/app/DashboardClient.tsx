'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Users, Clock, UserCheck, Calendar, Radio, RefreshCw, TrendingUp, LogIn, LogOut, Activity } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { PUNCH_STATUS, PUNCH_STATUS_COLOR } from '@/types/database'

function StatCard({
  title,
  value,
  icon: Icon,
  gradient,
  textColor,
  subtext,
}: {
  title: string
  value: number | string
  icon: React.ElementType
  gradient: string
  textColor: string
  subtext?: string
}) {
  return (
    <div className={`relative bg-white rounded-2xl border border-slate-200/80 p-5 overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 duration-200`} style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div className={`absolute inset-0 opacity-[0.04] bg-gradient-to-br ${gradient}`} />
      <div className="relative z-10 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <p className={`text-3xl font-black mt-1.5 ${textColor}`}>{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
        </div>
        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  )
}

interface DashboardClientProps {
  initialStats: {
    totalEmployees: number
    todayPunches: number
    presentCount: number
    monthRecords: number
  }
  initialRecentPunches: any[]
  todayISO: string
  monthISO: string
}

export function DashboardClient({
  initialStats,
  initialRecentPunches,
  todayISO,
  monthISO,
}: DashboardClientProps) {
  const [stats, setStats] = useState(initialStats)
  const [recentPunches, setRecentPunches] = useState(initialRecentPunches)
  const [isLive, setIsLive] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  const fetchFreshData = useCallback(async () => {
    setRefreshing(true)
    const supabase = createClient()
    try {
      const [
        { count: totalEmployees },
        { count: todayPunches },
        { count: monthRecords },
        { data: punches },
        { data: presentToday },
      ] = await Promise.all([
        supabase.from('employees').select('*', { count: 'exact', head: true }),
        supabase.from('attendance_logs').select('*', { count: 'exact', head: true }).gte('punch_time', todayISO),
        supabase.from('attendance_logs').select('*', { count: 'exact', head: true }).gte('punch_time', monthISO),
        supabase.from('attendance_logs').select('id, device_user_id, punch_time, status, employees(full_name)').order('punch_time', { ascending: false }).limit(15),
        supabase.from('attendance_logs').select('device_user_id').gte('punch_time', todayISO).eq('status', 0),
      ])

      const presentCount = new Set((presentToday ?? []).map((r) => r.device_user_id)).size
      setStats({ totalEmployees: totalEmployees ?? 0, todayPunches: todayPunches ?? 0, presentCount, monthRecords: monthRecords ?? 0 })
      if (punches) setRecentPunches(punches)
      setLastRefreshed(new Date())
    } catch (e) {
      console.error('Error fetching dashboard data:', e)
    } finally {
      setRefreshing(false)
    }
  }, [todayISO, monthISO])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          setStats((prev) => ({ ...prev, todayPunches: prev.todayPunches + 1 }))
          fetchFreshData()
        } else if (payload.eventType === 'DELETE') {
          setStats((prev) => ({ ...prev, todayPunches: 0, presentCount: 0 }))
          fetchFreshData()
        } else {
          fetchFreshData()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => fetchFreshData())
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'))

    const interval = setInterval(() => fetchFreshData(), 15000)
    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [fetchFreshData])

  // Smart punch role detection
  const smartRoles = useMemo(() => {
    const shiftMap = new Map<string, any[]>()
    const getOpDate = (ts: string) => {
      const d = new Date(ts)
      const shifted = new Date(d.getTime() - 4 * 60 * 60 * 1000)
      return shifted.toISOString().slice(0, 10)
    }
    for (const log of recentPunches || []) {
      const key = `${log.device_user_id}_${getOpDate(log.punch_time)}`
      if (!shiftMap.has(key)) shiftMap.set(key, [])
      shiftMap.get(key)!.push(log)
    }
    const roleMap = new Map<string, { label: string; color: string; icon: string }>()
    shiftMap.forEach((group) => {
      group.sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime())
      const first = group[0]
      const last = group[group.length - 1]
      const diffMin = (new Date(last.punch_time).getTime() - new Date(first.punch_time).getTime()) / 60000
      group.forEach((log) => {
        if (log.id === first.id) {
          roleMap.set(log.id, { label: 'Time In', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '🟢' })
        } else if (log.id === last.id && diffMin >= 3) {
          roleMap.set(log.id, { label: 'Time Out', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: '🔴' })
        } else {
          roleMap.set(log.id, { label: 'Mid-Shift', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: '🔵' })
        }
      })
    })
    return roleMap
  }, [recentPunches])

  const statCards = [
    { title: 'Total Employees', value: stats.totalEmployees, icon: Users, gradient: 'from-blue-500 to-indigo-600', textColor: 'text-blue-700', subtext: 'Registered in system' },
    { title: "Today's Punches", value: stats.todayPunches, icon: Clock, gradient: 'from-violet-500 to-purple-600', textColor: 'text-violet-700', subtext: format(new Date(), 'MMM d, yyyy') },
    { title: 'Present Today', value: stats.presentCount, icon: UserCheck, gradient: 'from-emerald-500 to-teal-600', textColor: 'text-emerald-700', subtext: 'Clocked in today' },
    { title: "This Month's Records", value: stats.monthRecords, icon: Calendar, gradient: 'from-orange-400 to-pink-500', textColor: 'text-orange-600', subtext: format(new Date(), 'MMMM yyyy') },
  ]

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>
          </div>
          <p className="text-slate-500 text-sm">{format(new Date(), "EEEE, MMMM d, yyyy '·' hh:mm a")}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchFreshData()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <span className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border ${
            isLive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <Radio className={`w-3.5 h-3.5 ${isLive ? 'animate-pulse' : ''}`} />
            {isLive ? 'Live — Real-Time' : 'Connecting…'}
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {statCards.map((s) => <StatCard key={s.title} {...s} />)}
      </div>

      {/* Recent Punches */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        {/* Table header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Punches</h2>
              <p className="text-xs text-slate-400">Live attendance — auto-updates every 15s</p>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Updated {format(lastRefreshed, 'h:mm:ss a')}
          </span>
        </div>

        {!recentPunches || recentPunches.length === 0 ? (
          <div className="px-6 py-20 flex flex-col items-center justify-center text-slate-400">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-semibold text-slate-500">No attendance records yet</p>
            <p className="text-sm text-slate-400 mt-1 text-center max-w-xs">Records will appear here once the TA500 bridge syncs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Punch Time</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentPunches.map((log, idx) => {
                  const employee = Array.isArray(log.employees) ? log.employees[0] : log.employees
                  const name = employee?.full_name ?? `Employee #${log.device_user_id}`
                  const role = smartRoles.get(log.id)
                  const initials = name.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()
                  const colors = ['from-blue-400 to-indigo-500', 'from-emerald-400 to-teal-500', 'from-violet-400 to-purple-500', 'from-orange-400 to-pink-500', 'from-rose-400 to-pink-500', 'from-teal-400 to-cyan-500']
                  const colorIdx = log.device_user_id % colors.length
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                            {initials}
                          </div>
                          <span className="font-semibold text-slate-900 text-sm">{name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">#{log.device_user_id}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 font-medium text-sm">
                        {format(new Date(log.punch_time), 'MMM d, yyyy · h:mm a')}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {role ? (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${role.color}`}>
                            <span>{role.icon}</span>
                            {role.label}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
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
