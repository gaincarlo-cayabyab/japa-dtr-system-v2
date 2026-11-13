import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()

  const { device_user_id, full_name, branch, position, department } = body
  if (!device_user_id || !full_name) {
    return NextResponse.json({ error: 'device_user_id and full_name are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('employees')
    .insert({ device_user_id: String(device_user_id), full_name, branch: branch ?? 'Dagupan Main', position, department })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
