// Philippine Official Public Holidays & Pangasinan Provincial Holidays 2026
// Based on Proclamation No. 1006, Republic Act 6721, Republic Act 11374, Republic Act 7840, and DOLE Guidelines

export interface PhHoliday {
  date: string               // YYYY-MM-DD
  name: string
  type: 'regular' | 'special_non_working' | 'special_working'
  scope?: 'national' | 'pangasinan'
  rateDescription: string    // Human-readable pay description
  rateMultiplier: number     // Multiplier for work on this day (e.g. 2.0 = double pay, 1.3 = +30% premium)
}

export const PH_HOLIDAYS: PhHoliday[] = [
  // ── 2026 ──────────────────────────────────────────────────────────────────
  { date: '2026-01-01', name: "New Year's Day",                          type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-01-09', name: 'Lingayen Gulf Landing & Veterans Day',    type: 'special_non_working',  scope: 'pangasinan', rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked (Pangasinan Day)' },
  { date: '2026-02-17', name: 'Chinese New Year',                         type: 'special_non_working',  scope: 'national',   rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-02-25', name: 'EDSA People Power Revolution',            type: 'special_working',      scope: 'national',   rateMultiplier: 1.0, rateDescription: 'Special Working Day' },
  { date: '2026-04-02', name: 'Maundy Thursday',                         type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-04-03', name: 'Good Friday',                             type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-04-04', name: 'Black Saturday',                          type: 'special_non_working',  scope: 'national',   rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-04-05', name: 'Agew na Pangasinan (Pangasinan Day)',      type: 'special_working',      scope: 'pangasinan', rateMultiplier: 1.0, rateDescription: 'Special Working Holiday (RA 11374)' },
  { date: '2026-04-09', name: 'Araw ng Kagitingan (Day of Valor)',       type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-05-01', name: 'Labor Day',                               type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-06-12', name: 'Independence Day',                        type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-08-21', name: 'Ninoy Aquino Day',                        type: 'special_non_working',  scope: 'national',   rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-08-31', name: 'National Heroes Day',                     type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-11-01', name: "All Saints' Day",                         type: 'special_non_working',  scope: 'national',   rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-11-02', name: "All Souls' Day",                          type: 'special_non_working',  scope: 'national',   rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-11-13', name: 'Speaker Eugenio Perez Day (Pangasinan)',   type: 'special_non_working',  scope: 'pangasinan', rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked (RA 6721 - Not Double Pay)' },
  { date: '2026-11-30', name: 'Bonifacio Day',                           type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-12-08', name: 'Feast of the Immaculate Conception',      type: 'special_non_working',  scope: 'national',   rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-12-24', name: 'Christmas Eve',                           type: 'special_non_working',  scope: 'national',   rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },
  { date: '2026-12-25', name: 'Christmas Day',                           type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-12-30', name: 'Rizal Day',                               type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
  { date: '2026-12-31', name: "New Year's Eve",                          type: 'special_non_working',  scope: 'national',   rateMultiplier: 1.3, rateDescription: '+30% Premium if Worked' },

  // ── 2027 ──────────────────────────────────────────────────────────────────
  { date: '2027-01-01', name: "New Year's Day",                          type: 'regular',              scope: 'national',   rateMultiplier: 2.0, rateDescription: 'Double Pay (200%)' },
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
        short: 'Regular Holiday (Double Pay)',
      }
    case 'special_non_working':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
        short: 'Special Non-Working (+30%)',
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
