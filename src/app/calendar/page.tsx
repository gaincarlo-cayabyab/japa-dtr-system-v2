import { CalendarClient } from './CalendarClient'

export const metadata = {
  title: 'Calendar & Holidays - JAPA DTR Enterprise Portal',
  description: 'Philippine national and Pangasinan provincial calendar, legal holidays, and payroll cutoffs.',
}

export default function CalendarPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <CalendarClient />
    </div>
  )
}
