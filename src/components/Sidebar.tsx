'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Fingerprint,
  Home,
  Clock,
  Users,
  FileText,
  Activity,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard', href: '/', icon: Home },
  { label: 'Attendance Logs', href: '/attendance', icon: Clock },
  { label: 'Employees', href: '/employees', icon: Users },
  { label: 'DTR Reports', href: '/reports', icon: FileText },
  { label: 'Sync Status', href: '/sync', icon: Activity },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
          <Fingerprint className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="text-base font-bold text-slate-900 tracking-tight">JAPA DTR</span>
          <p className="text-xs text-slate-400 leading-none mt-0.5">Enterprise Portal</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? 'text-blue-600' : 'text-slate-400'
                }`}
              />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* TA500 Bridge status */}
      <div className="px-4 py-4 border-t border-slate-200">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-50">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700 leading-none">TA500 Bridge</p>
            <p className="text-xs text-green-600 mt-0.5">Connected</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
