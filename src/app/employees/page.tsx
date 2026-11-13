import { createClient } from '@/lib/supabase/server'
import type { Employee } from '@/types/database'
import { EmployeeManager } from './EmployeeManager'

export const dynamic = 'force-dynamic'

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .order('full_name')

  const unmappedCount = (employees ?? []).filter((e) =>
    e.full_name.includes('NN-')
  ).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Directory</h1>
          <p className="mt-1 text-sm text-gray-500">
            {(employees ?? []).length} employees registered
            {unmappedCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                {unmappedCount} unmapped
              </span>
            )}
          </p>
        </div>
      </div>

      {unmappedCount > 0 && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
          <span className="text-lg">⚠️</span>
          <span>
            <strong>{unmappedCount} employee(s)</strong> have unmapped device IDs (names starting with <code className="font-mono">NN-</code>). 
            Edit them to assign proper names.
          </span>
        </div>
      )}

      <EmployeeManager initialEmployees={(employees ?? []) as Employee[]} />
    </div>
  )
}
