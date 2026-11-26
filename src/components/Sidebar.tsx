'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home,
  Clock,
  Users,
  FileText,
  Activity,
  LogOut,
  User,
  Calculator,
  BookOpen,
  CalendarDays,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react'

interface NavItemConfig {
  label: string
  href: string
  icon: React.ElementType
  idleIconWrap: string
  idleHoverBg: string
  activeBg: string
  activeAccentBar: string
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: Home,
    idleIconWrap: 'bg-blue-100/80 text-blue-600 group-hover:bg-blue-500 group-hover:text-white',
    idleHoverBg: 'hover:bg-blue-50/70 hover:text-blue-900',
    activeBg: 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20',
    activeAccentBar: 'bg-blue-200',
  },
  {
    label: 'Attendance Logs',
    href: '/attendance',
    icon: Clock,
    idleIconWrap: 'bg-emerald-100/80 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white',
    idleHoverBg: 'hover:bg-emerald-50/70 hover:text-emerald-900',
    activeBg: 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-md shadow-teal-500/20',
    activeAccentBar: 'bg-emerald-200',
  },
  {
    label: 'Employees',
    href: '/employees',
    icon: Users,
    idleIconWrap: 'bg-violet-100/80 text-violet-600 group-hover:bg-violet-500 group-hover:text-white',
    idleHoverBg: 'hover:bg-violet-50/70 hover:text-violet-900',
    activeBg: 'bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-500/20',
    activeAccentBar: 'bg-violet-200',
  },
  {
    label: 'DTR Reports',
    href: '/reports',
    icon: FileText,
    idleIconWrap: 'bg-sky-100/80 text-sky-600 group-hover:bg-sky-500 group-hover:text-white',
    idleHoverBg: 'hover:bg-sky-50/70 hover:text-sky-900',
    activeBg: 'bg-gradient-to-r from-sky-600 via-cyan-600 to-blue-600 text-white shadow-md shadow-sky-500/20',
    activeAccentBar: 'bg-sky-200',
  },
  {
    label: 'Payroll & Salary',
    href: '/payroll',
    icon: Calculator,
    idleIconWrap: 'bg-amber-100/90 text-amber-600 group-hover:bg-amber-500 group-hover:text-white',
    idleHoverBg: 'hover:bg-amber-50/70 hover:text-amber-900',
    activeBg: 'bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white shadow-md shadow-orange-500/20',
    activeAccentBar: 'bg-amber-200',
  },
  {
    label: 'Calendar',
    href: '/calendar',
    icon: CalendarDays,
    idleIconWrap: 'bg-rose-100/80 text-rose-600 group-hover:bg-rose-500 group-hover:text-white',
    idleHoverBg: 'hover:bg-rose-50/70 hover:text-rose-900',
    activeBg: 'bg-gradient-to-r from-rose-600 via-pink-600 to-purple-600 text-white shadow-md shadow-rose-500/20',
    activeAccentBar: 'bg-rose-200',
  },
  {
    label: 'Sync Status',
    href: '/sync',
    icon: Activity,
    idleIconWrap: 'bg-cyan-100/80 text-cyan-700 group-hover:bg-cyan-600 group-hover:text-white',
    idleHoverBg: 'hover:bg-cyan-50/70 hover:text-cyan-950',
    activeBg: 'bg-gradient-to-r from-cyan-700 via-teal-700 to-slate-800 text-white shadow-md shadow-cyan-500/20',
    activeAccentBar: 'bg-cyan-200',
  },
  {
    label: 'Help & Formulas',
    href: '/help',
    icon: BookOpen,
    idleIconWrap: 'bg-indigo-100/80 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white',
    idleHoverBg: 'hover:bg-indigo-50/70 hover:text-indigo-900',
    activeBg: 'bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white shadow-md shadow-indigo-500/20',
    activeAccentBar: 'bg-indigo-200',
  },
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setMounted(true)
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setPendingHref(null)
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    const handleOpen = () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      setMobileOpen(true)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('japa-open-sidebar', handleOpen)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('japa-open-sidebar', handleOpen)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

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
    setMobileOpen(false)
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

  const handleNavClick = (href: string, isMobileDrawer: boolean) => {
    if (!isMobileDrawer) return
    const isSamePage = href === '/' ? pathname === '/' : pathname.startsWith(href)
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (isSamePage) {
      setMobileOpen(false)
      return
    }
    setPendingHref(href)
    closeTimerRef.current = window.setTimeout(() => {
      setMobileOpen(false)
      closeTimerRef.current = null
    }, 160)
  }

  if (pathname === '/login') {
    return null
  }

  const renderSidebarInner = (isMobileDrawer: boolean) => (
    <>
      {/* Subtle Top Multi-Color Brand Accent Line */}
      <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-purple-600 to-emerald-500 flex-shrink-0" />

      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200/80 bg-gradient-to-r from-slate-50/70 to-indigo-50/30 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-indigo-200/80 shadow-sm flex-shrink-0 bg-white">
            <Image
              src="/japa-logo.jpg"
              alt="JAPA Logo"
              fill
              className="object-contain p-0.5"
              priority
            />
          </div>
          <div className="min-w-0">
            <span className="text-base font-black text-slate-900 tracking-tight block leading-none">
              JAPA DTR
            </span>
            <p className="text-[11px] font-semibold text-indigo-600 leading-none mt-1">
              Enterprise Portal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            v5.0
          </span>
          {isMobileDrawer && (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer touch-manipulation"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Section Caption */}
      <div className="px-4 pt-4 pb-1 flex-shrink-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Navigation Workspace
        </p>
      </div>

      {/* Colorful Navigation Items */}
      <nav className="flex-1 min-h-0 px-3 py-2 space-y-1.5 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon, idleIconWrap, idleHoverBg, activeBg, activeAccentBar }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const isPending = pendingHref === href

          return (
            <Link
              key={href}
              href={href}
              onClick={() => handleNavClick(href, isMobileDrawer)}
              className={`group flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-2xl text-[13px] transition-all duration-150 cursor-pointer touch-manipulation pointer-events-auto ${
                isActive
                  ? `${activeBg} font-bold`
                  : isPending
                  ? 'bg-indigo-50 text-indigo-900 font-bold'
                  : `text-slate-700 font-semibold ${idleHoverBg}`
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
                    isActive
                      ? 'bg-white/20 text-white shadow-inner'
                      : idleIconWrap
                  }`}
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                </span>
                <span className="truncate">{label}</span>
              </div>

              {isActive ? (
                <span className={`w-1.5 h-5 rounded-full ${activeAccentBar} flex-shrink-0`} />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* TA500 Bridge Live Pill */}
      <div className="px-3.5 py-2.5 border-t border-slate-100 flex-shrink-0">
        <Link
          href="/sync"
          onClick={() => handleNavClick('/sync', isMobileDrawer)}
          className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50/80 border border-emerald-200/80 hover:border-emerald-300 transition-colors group cursor-pointer touch-manipulation pointer-events-auto"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 leading-none truncate">
                TA500 Bridge
              </p>
              <p className="text-[10px] text-emerald-700 mt-1 font-semibold leading-none">
                Online · Active Sync
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-emerald-200 shadow-sm flex-shrink-0">
            v18.9
          </span>
        </Link>
      </div>

      {/* Operator Session & Logout */}
      <div className="p-3 border-t border-slate-200/80 bg-slate-50/70 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-xs font-black text-white shadow-sm flex-shrink-0">
              {currentUser ? currentUser.displayName.charAt(0).toUpperCase() : <User className="w-4 h-4 text-white" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                {currentUser?.displayName || 'Authorized User'}
              </p>
              <span className="text-[10px] text-indigo-600 capitalize font-semibold block leading-tight mt-0.5">
                {currentUser?.role?.replace('_', ' ') || 'Session Active'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Log Out"
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 flex-shrink-0 cursor-pointer touch-manipulation"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop Static Sidebar */}
      <aside className="hidden lg:flex w-64 h-screen bg-gradient-to-b from-white via-white to-slate-50/90 border-r border-slate-200/90 flex-col flex-shrink-0 select-none">
        {renderSidebarInner(false)}
      </aside>

      {/* Mobile Slide-Over Drawer (Rendered via Portal on document.body to avoid any overflow/stacking traps) */}
      {mounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`fixed inset-0 z-[9999] flex lg:hidden transition-opacity duration-200 ${
              mobileOpen ? 'opacity-100 pointer-events-auto visible' : 'opacity-0 pointer-events-none invisible'
            }`}
            aria-hidden={!mobileOpen}
          >
            {/* Backdrop strictly below drawer panel (z-0 vs z-10) */}
            <div
              className={`absolute inset-0 z-0 bg-slate-900/55 ${
                mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />

            <aside
              className={`relative z-10 w-72 max-w-[85vw] h-[100dvh] bg-white bg-gradient-to-b from-white via-white to-slate-50/90 border-r border-slate-200/90 shadow-2xl flex flex-col flex-shrink-0 select-none touch-manipulation transition-transform duration-200 ease-out ${
                mobileOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
              }`}
            >
              {renderSidebarInner(true)}
            </aside>
          </div>,
          document.body
        )}
    </>
  )
}
