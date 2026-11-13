export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      attendance_logs: {
        Row: {
          created_at: string
          device_user_id: string
          id: string
          punch_time: string
          raw_status: number | null
          status: number
          synced_at: string
        }
        Insert: {
          created_at?: string
          device_user_id: string
          id?: string
          punch_time: string
          raw_status?: number | null
          status?: number
          synced_at?: string
        }
        Update: {
          created_at?: string
          device_user_id?: string
          id?: string
          punch_time?: string
          raw_status?: number | null
          status?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_device_user_id_fkey"
            columns: ["device_user_id"]
            isOneToOne: false
            referencedRelation: "daily_dtr"
            referencedColumns: ["device_user_id"]
          },
          {
            foreignKeyName: "attendance_logs_device_user_id_fkey"
            columns: ["device_user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["device_user_id"]
          },
        ]
      }
      employees: {
        Row: {
          branch: string
          created_at: string
          department: string | null
          device_user_id: string
          full_name: string
          id: string
          position: string | null
          updated_at: string
        }
        Insert: {
          branch?: string
          created_at?: string
          department?: string | null
          device_user_id: string
          full_name: string
          id?: string
          position?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string
          created_at?: string
          department?: string | null
          device_user_id?: string
          full_name?: string
          id?: string
          position?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      daily_dtr: {
        Row: {
          branch: string
          device_user_id: string
          employee_id: string
          first_check_in: string | null
          full_name: string
          last_check_out: string | null
          total_punches: number
          work_date: string
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
