'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Employee } from '@/types/database'
import { Badge } from '@/components/ui/Badge'

interface EmployeeManagerProps {
  initialEmployees: Employee[]
}

type FormData = {
  device_user_id: string
  full_name: string
  branch: string
  position: string
  department: string
}

const DEFAULT_FORM: FormData = {
  device_user_id: '',
  full_name: '',
  branch: 'Dagupan Main',
  position: '',
  department: '',
}

type Toast = { message: string; type: 'success' | 'error' }

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch {
    return ts
  }
}

export function EmployeeManager({ initialEmployees }: EmployeeManagerProps) {
  const router = useRouter()
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [form, setForm] = useState<FormData>(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // Real-time synchronization for new/updated employees
  useEffect(() => {
    const supabase = createClient()
    const refreshList = async () => {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false })
      if (data) setEmployees(data)
    }

    const channel = supabase
      .channel('employees-realtime-manager')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => {
          refreshList()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  function openAdd() {
    setEditTarget(null)
    setForm(DEFAULT_FORM)
    setModalOpen(true)
  }

  function openEdit(emp: Employee) {
    setEditTarget(emp)
    setForm({
      device_user_id: emp.device_user_id,
      full_name: emp.full_name,
      branch: emp.branch,
      position: emp.position ?? '',
      department: emp.department ?? '',
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditTarget(null)
    setForm(DEFAULT_FORM)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const supabase = createClient()

    try {
      // Check Device User ID uniqueness
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

      const payload = {
        device_user_id: form.device_user_id,
        full_name: form.full_name,
        branch: form.branch,
        position: form.position || null,
        department: form.department || null,
      }

      if (editTarget) {
        const { error } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', editTarget.id)
        if (error) throw error
        setEmployees((prev) =>
          prev.map((e) => (e.id === editTarget.id ? { ...e, ...payload } : e))
        )
        setToast({ message: 'Employee updated successfully.', type: 'success' })
      } else {
        const { data, error } = await supabase
          .from('employees')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        setEmployees((prev) => [data, ...prev])
        setToast({ message: 'Employee added successfully.', type: 'success' })
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
      setToast({ message: 'Employee deleted.', type: 'success' })
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed.'
      setToast({ message, type: 'error' })
    } finally {
      setDeleteConfirm(null)
    }
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-sm">No employees found. Add one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Full Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Device ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Branch</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Position</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created At</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {emp.full_name}
                        {emp.full_name.includes('NN-') && (
                          <Badge variant="warning">Unmapped</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {emp.device_user_id}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{emp.branch}</td>
                    <td className="px-4 py-3 text-gray-500">{emp.position ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(emp.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(emp)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                        >
                          Edit
                        </button>
                        {deleteConfirm === emp.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(emp.id)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(emp.id)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Employee button (bottom of table) */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
        >
          + Add Employee
        </button>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {editTarget ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device User ID <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={form.device_user_id}
                  onChange={(e) => setForm((f) => ({ ...f, device_user_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 1234"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Juan dela Cruz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <select
                  value={form.branch}
                  onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>Dagupan Main</option>
                  <option>Urdaneta</option>
                  <option>Alaminos</option>
                  <option>San Carlos</option>
                  <option>Lingayen</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                <input
                  type="text"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Cashier"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Operations"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
