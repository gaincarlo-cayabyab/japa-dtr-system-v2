// Philippine Official Public Holidays 2026
// Based on Republic Act 9492, Proclamations, and DOLE guidelines

export interface PhHoliday {
  date: string               // YYYY-MM-DD
  name: string
  type: 'regular' | 'special_non_working' | 'special_working'
  rateDescription: string    // Human-readable pay description
  rateMultiplier: number     // For informational display only
}

const PH_HOLIDAYS: PhHoliday[] = [
  // ── 2026 ──────────────────────────────────────────────────────────────────
  { date: '2026-01-01', name: "New Year's Day",                     type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-02-25', name: 'EDSA People Power Revolution',       type: 'special_non_working',  rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-04-02', name: 'Maundy Thursday',                    type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-04-03', name: 'Good Friday',                        type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-04-04', name: 'Black Saturday',                     type: 'special_non_working',  rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-04-05', name: 'Pangasinan Day (Founding Anniversary)', type: 'special_non_working', rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-04-09', name: 'Araw ng Kagitingan (Day of Valor)',  type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-05-01', name: 'Labor Day',                          type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-06-12', name: 'Independence Day',                   type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-08-21', name: 'Ninoy Aquino Day',                   type: 'special_non_working',  rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-08-31', name: 'National Heroes Day',                type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-11-01', name: "All Saints' Day",                    type: 'special_non_working',  rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-11-02', name: "All Souls' Day",                     type: 'special_non_working',  rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-11-13', name: 'Speaker Eugenio Perez Day',          type: 'special_non_working',  rateMultiplier: 1.3, rateDescription: 'Special Non-Working (+30%)' },
  { date: '2026-11-30', name: 'Bonifacio Day',                      type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-12-08', name: 'Feast of the Immaculate Conception', type: 'special_non_working',  rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-12-24', name: 'Christmas Eve',                      type: 'special_non_working',  rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-12-25', name: 'Christmas Day',                      type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-12-30', name: 'Rizal Day',                          type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-12-31', name: "New Year's Eve",                     type: 'special_non_working',  rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },

  // ── 2027 ──────────────────────────────────────────────────────────────────
  { date: '2027-01-01', name: "New Year's Day",                     type: 'regular',              rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
]

export function getHolidayForDate(dateStr: string): PhHoliday | null {
  return PH_HOLIDAYS.find((h) => h.date === dateStr) ?? null
}

export function getHolidayTypeBadge(type: PhHoliday['type']): {
  bg: string
  text: string
  border: string
  dot: string
  short: string
} {
  switch (type) {
    case 'regular':
      return {
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-200',
        dot: 'bg-red-500',
        short: 'Regular Holiday',
      }
    case 'special_non_working':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
        short: 'Special Non-Working',
      }
    case 'special_working':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        dot: 'bg-blue-500',
        short: 'Special Working',
      }
  }
}
