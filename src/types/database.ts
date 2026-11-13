export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string
          device_user_id: string
          full_name: string
          branch: string
          position: string | null
          department: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          device_user_id: string
          full_name: string
          branch?: string
          position?: string | null
          department?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          device_user_id?: string
          full_name?: string
          branch?: string
          position?: string | null
          department?: string | null
          updated_at?: string
        }
      }
      attendance_logs: {
        Row: {
          id: string
          device_user_id: string
          punch_time: string
          status: number
          raw_status: number | null
          synced_at: string
          created_at: string
        }
        Insert: {
          id?: string
          device_user_id: string
          punch_time: string
          status?: number
          raw_status?: number | null
          synced_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          device_user_id?: string
          punch_time?: string
          status?: number
          raw_status?: number | null
          synced_at?: string
        }
      }
    }
    Views: {
      daily_dtr: {
        Row: {
          employee_id: string
          full_name: string
          device_user_id: string
          branch: string
          work_date: string
          first_check_in: string | null
          last_check_out: string | null
          total_punches: number
        }
      }
    }
    Functions: {}
    Enums: {}
  }
}

// Convenience types
export type Employee = Database['public']['Tables']['employees']['Row']
export type AttendanceLog = Database['public']['Tables']['attendance_logs']['Row']
export type DailyDtr = Database['public']['Views']['daily_dtr']['Row']

export const PUNCH_STATUS: Record<number, string> = {
  0: 'Check In',
  1: 'Check Out',
  2: 'Break Out',
  3: 'Break In',
  4: 'OT In',
  5: 'OT Out',
}

export const PUNCH_STATUS_COLOR: Record<number, string> = {
  0: 'bg-green-100 text-green-800',
  1: 'bg-red-100 text-red-800',
  2: 'bg-yellow-100 text-yellow-800',
  3: 'bg-blue-100 text-blue-800',
  4: 'bg-purple-100 text-purple-800',
  5: 'bg-orange-100 text-orange-800',
}
