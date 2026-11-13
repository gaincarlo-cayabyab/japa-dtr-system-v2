import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: { id: string }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient()
  const { id } = params
  const body = await request.json()

  const { full_name, branch, position, department } = body

  const { data, error } = await supabase
    .from('employees')
    .update({ full_name, branch, position, department })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const supabase = await createClient()
  const { id } = params

  // Get employee's device_user_id first
  const { data: emp, error: empError } = await (supabase as any)
    .from('employees')
    .select('device_user_id')
    .eq('id', id)
    .single()

  if (empError || !emp) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  const employeeData = emp as { device_user_id: string }

  // Check for existing attendance logs before deleting
  const { count, error: checkError } = await (supabase as any)
    .from('attendance_logs')
    .select('*', { count: 'exact', head: true })
    .eq('device_user_id', employeeData.device_user_id)

  if (checkError) return NextResponse.json({ error: checkError.message }, { status: 500 })

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Cannot delete employee: existing attendance logs reference this employee.' },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
