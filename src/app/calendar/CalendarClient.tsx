'use client'

import { useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  Clock,
  Shield,
  FileText,
  DollarSign,
  MapPin,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { PageBanner } from '@/components/PageBanner'
import { PH_HOLIDAYS, getHolidayForDate, getHolidayTypeBadge, type PhHoliday } from '@/lib/holidays'

export function CalendarClient() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [filterType, setFilterType] = useState<'all' | 'regular' | 'special' | 'pangasinan' | 'payday'>('all')

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(monthStart)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }) // Monday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const calendarDays = useMemo(() => {
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [calendarStart, calendarEnd])

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd')
  const selectedHoliday = getHolidayForDate(selectedDateStr)
  const [selY, selM, selD] = selectedDateStr.split('-').map(Number)
  const selectedDayOfWeek = new Date(Date.UTC(selY, selM - 1, selD)).getUTCDay()
  const isSelectedSunday = selectedDayOfWeek === 0
  const isSelectedSaturday = selectedDayOfWeek === 6

  // Check if date is payday (15th or last day of month)
  const isPayday = (d: Date) => {
    const day = d.getDate()
    const lastDayOfMonth = endOfMonth(d).getDate()
    return day === 15 || day === lastDayOfMonth
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <PageBanner
        theme="calendar"
        pattern="grid"
        eyebrow="Location: Pangasinan, Philippines · Official 2026 Calendar"
        eyebrowIcon={<MapPin className="w-3.5 h-3.5 text-rose-600" />}
        icon={<CalendarIcon className="w-5 h-5 text-white" />}
        title="Philippine & Pangasinan Calendar"
        description="Official national holidays, Pangasinan provincial holidays, Sunday rest day rules (+30% pay, no late), and payroll cutoffs."
        chips={[
          {
            icon: <Shield className="w-3.5 h-3.5 text-rose-600" />,
            label: 'Regular 200% & Special +30%',
          },
          {
            icon: <Clock className="w-3.5 h-3.5 text-pink-600" />,
            label: 'Sunday Rest Day Policy',
          },
          {
            icon: <DollarSign className="w-3.5 h-3.5 text-amber-600" />,
            label: '15th & Month-End Paydays',
          },
        ]}
        actions={
          <Link
            href={`/reports?date=${selectedDateStr}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-500/20 transition-all active:scale-95"
          >
            <FileText className="w-4 h-4" />
            View DTR on {format(selectedDate, 'MMM d')}
          </Link>
        }
      />

      {/* Main Calendar Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-4">
          {/* Calendar Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCurrentDate(new Date())
                  setSelectedDate(new Date())
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                Today
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden p-0.5 bg-slate-50 gap-0.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'pangasinan', label: '📍 Pangasinan' },
                  { id: 'regular', label: 'Regular' },
                  { id: 'special', label: 'Special' },
                  { id: 'payday', label: '💰 Cutoffs' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilterType(f.id as any)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                      filterType === f.id
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
              <div
                key={day}
                className={`py-2 text-[11px] font-black uppercase tracking-wider ${
                  idx === 6 ? 'text-rose-600' : idx === 5 ? 'text-purple-600' : 'text-slate-500'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid Days */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const isCurrentMonth = isSameMonth(day, monthStart)
              const isSelected = isSameDay(day, selectedDate)
              const isToday = isSameDay(day, new Date())
              const holiday = getHolidayForDate(dateStr)
              const payday = isPayday(day)
              const isSunday = day.getDay() === 0
              const isSaturday = day.getDay() === 6

              let showPill = true
              if (filterType === 'pangasinan') showPill = holiday?.scope === 'pangasinan'
              if (filterType === 'regular') showPill = holiday?.type === 'regular'
              if (filterType === 'special') showPill = holiday?.type === 'special_non_working'
              if (filterType === 'payday') showPill = payday

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-[85px] sm:min-h-[96px] p-2 rounded-2xl border text-left flex flex-col justify-between transition-all relative ${
                    isSelected
                      ? 'ring-2 ring-blue-600 border-blue-600 bg-blue-50/40 shadow-xs'
                      : !isCurrentMonth
                      ? 'bg-slate-50/40 border-slate-100 opacity-40'
                      : isSunday
                      ? 'bg-rose-50/20 border-rose-100/60 hover:bg-rose-50/50'
                      : 'bg-white border-slate-200/80 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isSunday
                          ? 'text-rose-600'
                          : 'text-slate-800'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {holiday && (
                      <span className="text-[10px]" title={holiday.name}>
                        {holiday.scope === 'pangasinan' ? '📍' : '🎌'}
                      </span>
                    )}
                  </div>

                  {/* Badges / Events inside day cell */}
                  <div className="space-y-1 w-full mt-1">
                    {holiday && showPill && (
                      <div
                        className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold truncate leading-tight border ${
                          holiday.scope === 'pangasinan'
                            ? 'bg-purple-100 text-purple-900 border-purple-200'
                            : holiday.type === 'regular'
                            ? 'bg-rose-100 text-rose-900 border-rose-200'
                            : 'bg-amber-100 text-amber-900 border-amber-200'
                        }`}
                        title={holiday.name}
                      >
                        {holiday.name}
                      </div>
                    )}
                    {payday && showPill && (
                      <div className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 truncate">
                        💰 Cutoff Payday
                      </div>
                    )}
                    {isSunday && !holiday && isCurrentMonth && (
                      <div className="text-[9px] font-bold text-rose-500/80 px-1">
                        Rest Day (+30%)
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected Day Details Panel (1 Col) */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selected Date</p>
              <h3 className="text-xl font-black text-slate-900 mt-1">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </h3>
            </div>

            {/* Holiday Details */}
            {selectedHoliday ? (
              <div
                className={`p-4 rounded-2xl border space-y-2 ${
                  selectedHoliday.scope === 'pangasinan'
                    ? 'bg-purple-50/80 border-purple-200 text-purple-950'
                    : selectedHoliday.type === 'regular'
                    ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                    : 'bg-amber-50/80 border-amber-200 text-amber-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {selectedHoliday.scope === 'pangasinan' ? '📍' : '🎌'}
                  </span>
                  <div>
                    <p className="font-black text-sm">{selectedHoliday.name}</p>
                    <p className="text-[11px] font-bold opacity-80 capitalize">
                      {selectedHoliday.type.replace(/_/g, ' ')} · {selectedHoliday.scope === 'pangasinan' ? 'Pangasinan Local' : 'Nationwide'}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-black/10 text-xs font-medium space-y-1">
                  <p>
                    <strong>Pay Rate:</strong> {selectedHoliday.rateDescription}
                  </p>
                  {selectedHoliday.date === '2026-11-13' && (
                    <p className="text-[11px] text-purple-800 font-semibold bg-white/70 p-2 rounded-lg border border-purple-200">
                      ℹ️ <strong>Republic Act No. 6721</strong>: Commemorating the birth of House Speaker Eugenio Perez. It is a <strong>Special Non-Working Holiday</strong> in Pangasinan (+30% pay if worked, NOT double pay).
                    </p>
                  )}
                  {selectedHoliday.date === '2026-04-05' && (
                    <p className="text-[11px] text-purple-800 font-semibold bg-white/70 p-2 rounded-lg border border-purple-200">
                      ℹ️ <strong>Republic Act No. 11374</strong>: Agew na Pangasinan (Founding Anniversary). Special Working Holiday.
                    </p>
                  )}
                  {selectedHoliday.date === '2026-01-09' && (
                    <p className="text-[11px] text-purple-800 font-semibold bg-white/70 p-2 rounded-lg border border-purple-200">
                      ℹ️ <strong>Republic Act No. 7840</strong>: Lingayen Gulf Landing & Pangasinan Veterans Day (+30% pay if worked).
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
                <p className="font-bold text-slate-700">No Philippine public holiday on this date.</p>
                <p className="text-[11px] text-slate-400 mt-1">Normal office work schedule applies.</p>
              </div>
            )}

            {/* Rest Day Status */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Work Schedule Classification:</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isSelectedSunday
                      ? 'bg-rose-100 text-rose-800'
                      : isSelectedSaturday
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {isSelectedSunday ? 'Sunday Rest Day' : isSelectedSaturday ? 'Saturday (Gain Carlo Rest)' : 'Regular Workday'}
                </span>
              </div>
              {isSelectedSunday && (
                <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                  ⭐ <strong>Sunday Work Rules</strong>: Staff who work on Sunday receive <strong>+30% premium pay</strong> on their hours worked. <strong>No late deductions</strong> apply on Sunday since it is a rest day and hours are flexible.
                </div>
              )}
            </div>

            {/* Payroll Cutoff info */}
            {isPayday(selectedDate) && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                <p className="font-black flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  Official Payroll Cutoff Day
                </p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Bi-monthly salary cutoff and disbursement window.
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
            <Link
              href={`/reports?date=${selectedDateStr}`}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all active:scale-95"
            >
              <FileText className="w-4 h-4" />
              Open DTR Report for this Date
            </Link>
            <Link
              href="/payroll"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              <DollarSign className="w-4 h-4 text-slate-500" />
              View Payroll Sheet
            </Link>
          </div>
        </div>
      </div>

      {/* Pangasinan Holidays Reference Cards */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900">Official Pangasinan Provincial Holidays Reference</h3>
            <p className="text-xs text-slate-400">Mandated by Republic Acts for the province of Pangasinan</p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            3 Local Observances
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black text-purple-700">January 9</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Special Non-Working</span>
            </div>
            <h4 className="text-sm font-bold text-slate-900">Lingayen Gulf Landing & Veterans Day</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Commemorates the 1945 amphibious landing of Allied Forces led by Gen. Douglas MacArthur to liberate Luzon, and honors Pangasinan World War II veterans.
            </p>
            <p className="text-[11px] font-bold text-purple-800 pt-1">Pay Rule: +30% Premium if Worked</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black text-purple-700">April 5</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Special Working</span>
            </div>
            <h4 className="text-sm font-bold text-slate-900">Agew na Pangasinan (Pangasinan Day)</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Pursuant to <strong>Republic Act No. 11374</strong>, commemorating the founding anniversary of the province of Pangasinan. Special working day.
            </p>
            <p className="text-[11px] font-bold text-blue-800 pt-1">Pay Rule: Normal Daily Rate</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black text-purple-700">November 13</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Special Non-Working</span>
            </div>
            <h4 className="text-sm font-bold text-slate-900">Speaker Eugenio Perez Day</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Pursuant to <strong>Republic Act No. 6721</strong>, commemorating the birth of the first Pangasinense House Speaker. Special non-working holiday in Pangasinan.
            </p>
            <p className="text-[11px] font-bold text-amber-800 pt-1">Pay Rule: +30% Premium if Worked (Not Double Pay)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
