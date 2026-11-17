'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Employee } from '@/types/database'
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Briefcase,
  DollarSign,
  X,
  Sparkles,
  ShieldCheck,
} from 'lucide-react'

export type EmployeeWithRate = Employee & {
  daily_rate?: number
  hourly_rate?: number
  schedule_type?: 'mon_sat' | 'mon_fri'
}

interface EmployeeManagerProps {
  initialEmployees: EmployeeWithRate[]
}

type FormData = {
  device_user_id: string
  full_name: string
  branch: string
  position: string
  department: string
  daily_rate: number
  hourly_rate: number
  schedule_type: 'mon_sat' | 'mon_fri'
}

const DEFAULT_FORM: FormData = {
  device_user_id: '',
  full_name: '',
  branch: 'Dagupan Main',
  position: 'Staff',
  department: 'Operations',
  daily_rate: 550,
  hourly_rate: 68.75,
  schedule_type: 'mon_sat',
}

type Toast = { message: string; type: 'success' | 'error' }

// Vibrant avatar background colors
const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-purple-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-red-600',
  'from-cyan-500 to-blue-600',
]

function getAvatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

export function EmployeeManager({ initialEmployees }: EmployeeManagerProps) {
  const router = useRouter()
  const [employees, setEmployees] = useState<EmployeeWithRate[]>(initialEmployees)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<EmployeeWithRate | null>(null)
  const [form, setForm] = useState<FormData>(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'mon_sat' | 'mon_fri'>('all')

  // Auth & 1-Hour Temporary Edit Access
  const [currentUser, setCurrentUser] = useState<{ role: string; username: string } | null>(null)
  const [hasEditGrant, setHasEditGrant] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.user) setCurrentUser(d.user)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const checkGrant = async () => {
      try {
        const res = await fetch('/api/auth/edit-access')
        if (res.ok) {
          const data = await res.json()
          if (currentUser?.username && data.activeGrants?.[currentUser.username]?.active) {
            setHasEditGrant(true)
          } else {
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
      } else {
        setHasEditGrant(false)
      }
    }
    window.addEventListener('japa_edit_access_changed', onAccessChanged)
    const interval = setInterval(checkGrant, 10000)
    return () => {
      window.removeEventListener('japa_edit_access_changed', onAccessChanged)
      clearInterval(interval)
    }
  }, [currentUser])

  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'admin'
  const canAddEditDelete = isSuperAdmin || hasEditGrant
  const isDeeOrPearly = currentUser?.username === 'japa_dee' || currentUser?.username === 'japa_pearly'

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // Background Auto-Refresh & Realtime Subscription
  const fetchFreshEmployees = useCallback(async () => {
    try {
      const supabase = createClient()
      const [{ data: emps }, { data: comp }] = await Promise.all([
        supabase.from('employees').select('*').order('full_name'),
        supabase.from('employee_compensation').select('*'),
      ])

      if (emps) {
        const compMap = new Map<string, { daily_rate: number; hourly_rate: number; schedule_type: string }>()
        comp?.forEach((c) => {
          const daily = Number(c.daily_rate) || 550.0
          const hourly = c.hourly_rate ? Number(c.hourly_rate) : Math.round((daily / 8) * 100) / 100
          compMap.set(c.device_user_id, {
            daily_rate: daily,
            hourly_rate: hourly,
            schedule_type: c.schedule_type || 'mon_sat',
          })
        })

        const combined = emps.map((emp) => {
          const c = compMap.get(emp.device_user_id)
          return {
            ...emp,
            daily_rate: c?.daily_rate ?? 550.0,
            hourly_rate: c?.hourly_rate ?? 68.75,
            schedule_type: (c?.schedule_type as 'mon_sat' | 'mon_fri') ?? (emp.full_name.includes('GAIN CARLO') ? 'mon_fri' : 'mon_sat'),
          }
        })
        setEmployees(combined)
      }
    } catch (e) {
      console.error('Error refreshing employees:', e)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('employees-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        fetchFreshEmployees()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_compensation' }, () => {
        fetchFreshEmployees()
      })
      .subscribe()

    const interval = setInterval(fetchFreshEmployees, 15000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchFreshEmployees])

  // Sorted alphabetically from A to Z
  const sortedAndFiltered = useMemo(() => {
    return employees
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .filter((emp) => {
        if (scheduleFilter !== 'all' && (emp.schedule_type || 'mon_sat') !== scheduleFilter) {
          return false
        }
        if (search.trim() === '') return true
        const q = search.toLowerCase()
        return (
          emp.full_name.toLowerCase().includes(q) ||
          emp.device_user_id.toLowerCase().includes(q) ||
          (emp.position && emp.position.toLowerCase().includes(q))
        )
      })
  }, [employees, search, scheduleFilter])

  function openAdd() {
    setEditTarget(null)
    setForm(DEFAULT_FORM)
    setModalOpen(true)
  }

  function openEdit(emp: EmployeeWithRate) {
    setEditTarget(emp)
    const daily = emp.daily_rate ?? 550
    const hourly = emp.hourly_rate ?? Math.round((daily / 8) * 100) / 100
    setForm({
      device_user_id: emp.device_user_id,
      full_name: emp.full_name,
      branch: emp.branch,
      position: emp.position ?? 'Staff',
      department: emp.department ?? 'Operations',
      daily_rate: daily,
      hourly_rate: hourly,
      schedule_type: emp.schedule_type ?? (emp.full_name.includes('GAIN CARLO') ? 'mon_fri' : 'mon_sat'),
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditTarget(null)
    setForm(DEFAULT_FORM)
  }

  const handleDailyRateChange = (val: number) => {
    const daily = Number(val) || 0
    const hourly = Math.round((daily / 8) * 100) / 100
    setForm((f) => ({ ...f, daily_rate: daily, hourly_rate: hourly }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const supabase = createClient()

    try {
      if (!editTarget || editTarget.device_user_id !== form.device_user_id) {
        const { data: existing } = await supabase
          .from('employees')
          .select('id')
          .eq('device_user_id', form.device_user_id)
          .maybeSingle()
        if (existing) {
          setToast({ message: `Device User ID "${form.device_user_id}" is already in use.`, type: 'error' })
          setSubmitting(false)
          return
        }
      }

      const empPayload = {
        device_user_id: form.device_user_id,
        full_name: form.full_name,
        branch: form.branch,
        position: form.position || null,
        department: form.department || null,
      }

      if (editTarget) {
        const { error } = await supabase
          .from('employees')
          .update(empPayload)
          .eq('id', editTarget.id)
        if (error) throw error

        await supabase.from('employee_compensation').upsert({
          device_user_id: form.device_user_id,
          daily_rate: form.daily_rate,
          hourly_rate: form.hourly_rate,
          schedule_type: form.schedule_type,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_user_id' })

        setEmployees((prev) =>
          prev.map((e) =>
            e.id === editTarget.id
              ? {
                  ...e,
                  ...empPayload,
                  daily_rate: form.daily_rate,
                  hourly_rate: form.hourly_rate,
                  schedule_type: form.schedule_type,
                }
              : e
          )
        )
        setToast({ message: `Updated ${form.full_name} successfully!`, type: 'success' })
      } else {
        const { data, error } = await supabase
          .from('employees')
          .insert(empPayload)
          .select()
          .single()
        if (error) throw error

        await supabase.from('employee_compensation').upsert({
          device_user_id: form.device_user_id,
          daily_rate: form.daily_rate,
          hourly_rate: form.hourly_rate,
          schedule_type: form.schedule_type,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_user_id' })

        setEmployees((prev) => [
          ...prev,
          {
            ...data,
            daily_rate: form.daily_rate,
            hourly_rate: form.hourly_rate,
            schedule_type: form.schedule_type,
          },
        ])
        setToast({ message: `Added ${form.full_name} to employee directory!`, type: 'success' })
      }

      closeModal()
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setToast({ message, type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    try {
      const { error } = await supabase.from('employees').delete().eq('id', id)
      if (error) throw error
      setEmployees((prev) => prev.filter((e) => e.id !== id))
      setToast({ message: 'Employee removed.', type: 'success' })
      setDeleteConfirm(null)
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed.'
      setToast({ message, type: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification (Middle Top) */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-semibold transition-all animate-in fade-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-500/10'
              : 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-500/10'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by employee name, ID, or position..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filter & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setScheduleFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                scheduleFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({employees.length})
            </button>
            <button
              onClick={() => setScheduleFilter('mon_sat')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                scheduleFilter === 'mon_sat' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mon–Sat
            </button>
            <button
              onClick={() => setScheduleFilter('mon_fri')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                scheduleFilter === 'mon_fri' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mon–Fri
            </button>
          </div>

          {canAddEditDelete ? (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Add Employee
            </button>
          ) : isDeeOrPearly ? (
            <button
              onClick={async () => {
                await fetch('/api/auth/edit-access', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'request', targetUsername: currentUser?.username }),
                })
                setToast({ message: '1-Hour Edit Access request submitted to IT Administrator!', type: 'success' })
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-2xs"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Request Edit Access
            </button>
          ) : null}
        </div>
      </div>

      {/* Employee Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-900">Official Staff Roster (A to Z)</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">
              {sortedAndFiltered.length} Active Staff
            </span>
          </div>
          <span className="text-xs text-slate-400 font-medium">Sorted alphabetically by name</span>
        </div>

        {sortedAndFiltered.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Users className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-sm font-medium">No matching employees found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                  <th className="px-5 py-3.5">Employee Name</th>
                  <th className="px-4 py-3.5 text-center">ID / S#</th>
                  <th className="px-4 py-3.5">Branch</th>
                  <th className="px-4 py-3.5 text-right">Daily Rate</th>
                  <th className="px-4 py-3.5 text-right">Hourly Rate</th>
                  <th className="px-4 py-3.5 text-center">Work Schedule</th>
                  <th className="px-5 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedAndFiltered.map((emp) => {
                  const initials = emp.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                  const isSpecial = emp.schedule_type === 'mon_fri'

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name with Colorful Avatar */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${getAvatarGradient(
                              emp.full_name
                            )} text-white flex items-center justify-center text-xs font-bold shadow-xs flex-shrink-0`}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 leading-tight truncate">{emp.full_name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{emp.position || 'Staff'}</p>
                          </div>
                        </div>
                      </td>

                      {/* ID / S# */}
                      <td className="px-4 py-3.5 text-center font-mono text-xs font-bold text-slate-500">
                        #{emp.device_user_id}
                      </td>

                      {/* Branch */}
                      <td className="px-4 py-3.5 text-slate-600 font-medium text-xs">
                        {emp.branch}
                      </td>

                      {/* Daily Rate */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-bold text-slate-900">
                          ₱{(emp.daily_rate ?? 550).toFixed(2)}
                        </span>
                      </td>

                      {/* Hourly Rate */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 text-xs">
                          ₱{(emp.hourly_rate ?? (emp.daily_rate ? emp.daily_rate / 8 : 68.75)).toFixed(2)}/hr
                        </span>
                      </td>

                      {/* Work Schedule */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold ${
                            isSpecial
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          {isSpecial ? 'Mon–Fri (5 Days)' : 'Mon–Sat (6 Days)'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-center">
                        {canAddEditDelete ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openEdit(emp)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit Employee"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {deleteConfirm === emp.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(emp.id)}
                                  className="px-2 py-1 text-xs bg-rose-600 text-white rounded-lg font-bold"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(emp.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Delete Employee"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs" title="1-Hour Edit Access required to edit/delete staff">—</span>
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

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-5 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {editTarget ? 'Edit Employee Details' : 'Register New Employee'}
                </h3>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Device ID / S# <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={form.device_user_id}
                    onChange={(e) => setForm((f) => ({ ...f, device_user_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 25"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch</label>
                  <select
                    value={form.branch}
                    onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>Dagupan Main</option>
                    <option>Urdaneta</option>
                    <option>Alaminos</option>
                    <option>San Carlos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name (SURNAME, FIRSTNAME M.) <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. DELA CRUZ, JUAN P."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Position</label>
                  <input
                    type="text"
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Staff"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Operations"
                  />
                </div>
              </div>

              {/* Salary & Hourly Rate Auto Calculation */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Daily Salary Rate (PHP ₱)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₱</span>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={form.daily_rate}
                        onChange={(e) => handleDailyRateChange(Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 bg-white font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Hourly Rate (Auto = Rate / 8)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₱</span>
                      <input
                        readOnly
                        type="number"
                        step="0.01"
                        value={form.hourly_rate}
                        className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 bg-slate-100 font-bold text-blue-700 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Weekly Work Schedule
                  </label>
                  <select
                    value={form.schedule_type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        schedule_type: e.target.value as 'mon_sat' | 'mon_fri',
                      }))
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="mon_sat">Monday to Saturday (Sunday Rest Day) — Standard Staff</option>
                    <option value="mon_fri">Monday to Friday (Sat &amp; Sun Rest Days) — IT / Admin</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Saving...' : editTarget ? 'Save Changes' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
