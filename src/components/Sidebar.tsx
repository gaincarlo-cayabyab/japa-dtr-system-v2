'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Fingerprint,
  Home,
  Clock,
  Users,
  FileText,
  Activity,
  LogOut,
  Shield,
  User,
  Calculator,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard', href: '/', icon: Home },
  { label: 'Attendance Logs', href: '/attendance', icon: Clock },
  { label: 'Employees', href: '/employees', icon: Users },
  { label: 'DTR Reports', href: '/reports', icon: FileText },
  { label: 'Payroll & Salary', href: '/payroll', icon: Calculator },
  { label: 'Sync Status', href: '/sync', icon: Activity },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{
    displayName: string
    username: string
    role: string
  } | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  // Fetch current authenticated user
  useEffect(() => {
    if (pathname === '/login') return
    async function fetchMe() {
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()
        if (data.authenticated && data.user) {
          setCurrentUser(data.user)
        }
      } catch (err) {
        console.error('Error fetching user session:', err)
      }
    }
    fetchMe()
  }, [pathname])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch {
      router.push('/login')
    } finally {
      setLoggingOut(false)
    }
  }

  // Hide sidebar completely on login page
  if (pathname === '/login') {
    return null
  }

  return (
    <aside className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col flex-shrink-0 select-none">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-sm shadow-blue-500/20">
          <Fingerprint className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="text-base font-bold text-slate-900 tracking-tight">JAPA DTR</span>
          <p className="text-xs text-slate-400 leading-none mt-0.5">Enterprise Portal</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
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
      <div className="px-4 py-3 border-t border-slate-100">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-700 leading-none">TA500 Bridge</p>
            <p className="text-[10px] text-emerald-600 mt-0.5 font-medium">Online &amp; Active</p>
          </div>
        </div>
      </div>

      {/* Operator Session & Logout */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/50">
        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
              {currentUser ? currentUser.displayName.charAt(0) : <User className="w-4 h-4 text-slate-400" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate leading-tight">
                {currentUser?.displayName || 'Authorized User'}
              </p>
              <span className="text-[10px] text-slate-500 capitalize font-medium">
                {currentUser?.role?.replace('_', ' ') || 'Session Active'}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Log Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
