'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Clock, UserCheck, Calendar, Radio, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { PUNCH_STATUS, PUNCH_STATUS_COLOR } from '@/types/database'

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: number | string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 transition-all hover:shadow-md">
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: number | string }) {
  const numericStatus = Number(status)
  const colorClass =
    PUNCH_STATUS_COLOR[numericStatus] ?? 'bg-slate-100 text-slate-600'
  const label = PUNCH_STATUS[numericStatus] ?? `Status ${status}`
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}
    >
      {label}
    </span>
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
        supabase
          .from('attendance_logs')
          .select('*', { count: 'exact', head: true })
          .gte('punch_time', todayISO),
        supabase
          .from('attendance_logs')
          .select('*', { count: 'exact', head: true })
          .gte('punch_time', monthISO),
        supabase
          .from('attendance_logs')
          .select('id, device_user_id, punch_time, status, employees(full_name)')
          .order('punch_time', { ascending: false })
          .limit(10),
        supabase
          .from('attendance_logs')
          .select('device_user_id')
          .gte('punch_time', todayISO)
          .eq('status', 0),
      ])

      const presentCount = new Set(
        (presentToday ?? []).map((r) => r.device_user_id)
      ).size

      setStats({
        totalEmployees: totalEmployees ?? 0,
        todayPunches: todayPunches ?? 0,
        presentCount,
        monthRecords: monthRecords ?? 0,
      })
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

    // Realtime channel for both logs and employees
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const newPunch = payload.new
            setRecentPunches((prev) => [newPunch, ...prev.slice(0, 9)])
            setStats((prev) => ({
              ...prev,
              todayPunches: prev.todayPunches + 1,
            }))
            fetchFreshData()
          } else if (payload.eventType === 'DELETE') {
            setRecentPunches([])
            setStats((prev) => ({
              ...prev,
              todayPunches: 0,
              presentCount: 0,
            }))
            fetchFreshData()
          } else {
            fetchFreshData()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => {
          fetchFreshData()
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    // Fallback polling every 10 seconds to guarantee fresh data
    const interval = setInterval(() => {
      fetchFreshData()
    }, 10000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchFreshData])

  const statCards = [
    {
      title: 'Total Employees',
      value: stats.totalEmployees,
      icon: Users,
      color: 'bg-blue-600',
    },
    {
      title: "Today's Punches",
      value: stats.todayPunches,
      icon: Clock,
      color: 'bg-indigo-500',
    },
    {
      title: 'Present Today',
      value: stats.presentCount,
      icon: UserCheck,
      color: 'bg-emerald-500',
    },
    {
      title: "This Month's Records",
      value: stats.monthRecords,
      icon: Calendar,
      color: 'bg-violet-500',
    },
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchFreshData()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-medium shadow-sm transition-all disabled:opacity-50"
            title="Force refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isLive
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            <Radio className={`w-3 h-3 ${isLive ? 'animate-pulse' : ''}`} />
            {isLive ? 'Live — Real-Time Synced' : 'Connecting to Live Feed…'}
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {statCards.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* Recent punches */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Punches</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live attendance logs updated in real-time
            </p>
          </div>
          <span className="text-xs text-slate-400">
            Last synced: {format(lastRefreshed, 'hh:mm:ss a')}
          </span>
        </div>

        {!recentPunches || recentPunches.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No attendance records yet</p>
            <p className="text-slate-400 text-sm mt-1">
              Records will appear here once the TA500 bridge syncs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Device User ID
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Punch Time
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentPunches.map((log) => {
                  const employee = Array.isArray(log.employees)
                    ? log.employees[0]
                    : log.employees
                  const name = employee?.full_name ?? `ID #${log.device_user_id}`
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {name}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                        {log.device_user_id}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {format(new Date(log.punch_time), 'MMM d, yyyy h:mm a')}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={log.status} />
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

