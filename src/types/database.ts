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
          hours_worked: number
          overtime_hours: number
          shift_status: 'Completed' | 'On Duty' | 'Incomplete'
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

export type EmployeeCompensation = {
  id: string
  device_user_id: string
  daily_rate: number
  hourly_rate?: number
  monthly_rate: number | null
  schedule_type?: 'mon_sat' | 'mon_fri'
  employment_type: 'regular' | 'probationary' | 'contractual'
  overtime_eligible: boolean
  night_diff_eligible: boolean
  effectivity_date: string
  created_at: string
  updated_at: string
}

export type PayrollSettings = {
  id: string
  fiscal_year: number
  work_hours_per_day: number
  grace_period_minutes: number
  night_diff_start: string
  night_diff_end: string
  regular_holiday_dates: string[]
  special_holiday_dates: string[]
  created_at: string
  updated_at: string
}

export type DayType =
  | 'regular'
  | 'rest_day'
  | 'special_holiday'
  | 'special_holiday_rest'
  | 'regular_holiday'
  | 'regular_holiday_rest'

export interface DailyPayrollRecord {
  work_date: string
  day_type: DayType
  day_type_label: string
  first_check_in: string | null
  last_check_out: string | null
  total_punches: number
  hours_worked: number
  regular_hours: number
  overtime_hours: number
  night_diff_hours: number
  shift_status: 'Completed' | 'On Duty' | 'Incomplete'
  daily_rate: number
  hourly_rate: number
  regular_pay: number
  overtime_pay: number
  night_diff_pay: number
  holiday_premium_pay: number
  tardiness_minutes: number
  tardiness_deduction: number
  total_day_pay: number
}

export interface EmployeePayrollSummary {
  device_user_id: string
  employee_name: string
  branch: string
  position: string | null
  daily_rate: number
  hourly_rate: number
  schedule_type?: 'mon_sat' | 'mon_fri'
  days_worked: number
  total_regular_hours: number
  total_overtime_hours: number
  total_night_diff_hours: number
  total_regular_pay: number
  total_overtime_pay: number
  total_night_diff_pay: number
  total_holiday_pay: number
  total_tardiness_minutes: number
  total_tardiness_deduction: number
  gross_pay: number
  records: DailyPayrollRecord[]
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
