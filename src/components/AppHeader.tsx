'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Clock,
  Radio,
  ShieldCheck,
  LogOut,
  Sparkles,
  Activity,
  Layers,
  HelpCircle,
} from 'lucide-react'

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{
    displayName: string
    username: string
    role: string
  } | null>(null)
  const [currentTime, setCurrentTime] = useState<string>('')
  const [currentDate, setCurrentDate] = useState<string>('')
  const [isLive, setIsLive] = useState(true)

  useEffect(() => {
    if (pathname === '/login') return

    // Fetch user
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setCurrentUser(data.user)
        }
      })
      .catch(() => {})

    // Live Clock (Manila UTC+8)
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Manila',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      )
      setCurrentDate(
        now.toLocaleDateString('en-US', {
          timeZone: 'Asia/Manila',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      )
    }

    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [pathname])

  if (pathname === '/login') {
    return null
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch {
      router.push('/login')
    }
  }

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-2.5 transition-all shadow-2xs">
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        {/* Left: JAPA Brand & Official Logo */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-8 h-8 rounded-xl overflow-hidden border border-slate-200/80 shadow-xs flex-shrink-0 bg-white">
              <Image
                src="/japa-logo.jpg"
                alt="JAPA Logo"
                fill
                className="object-contain p-0.5 group-hover:scale-105 transition-transform"
                priority
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-900 tracking-tight leading-none group-hover:text-blue-600 transition-colors">
                  JAPA
                </span>
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200/60 leading-none">
                  Global Trading
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">
                DTR & Biometric Management System
              </p>
            </div>
          </Link>
        </div>

        {/* Center/Right: Live Clock & Hardware Status */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Manila Time Clock */}
          {currentTime && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-700">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <div className="text-right">
                <p className="text-xs font-bold leading-none font-mono text-slate-800">{currentTime}</p>
                <p className="text-[10px] font-medium text-slate-400 leading-none mt-0.5">{currentDate}</p>
              </div>
            </div>
          )}

          {/* TA500 Telemetry Pill */}
          <Link
            href="/sync"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-colors shadow-2xs"
            title="TA500 Biometric Hardware Status"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="hidden sm:inline">TA500 Online</span>
            <span className="font-mono text-[11px] text-emerald-700 font-semibold">(192.168.0.58)</span>
          </Link>

          {/* User Session Profile & Quick Actions */}
          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="hidden lg:block text-right">
                <p className="text-xs font-bold text-slate-800 leading-tight">
                  {currentUser.displayName}
                </p>
                <p className="text-[10px] font-semibold text-indigo-600 leading-none mt-0.5">
                  {currentUser.role === 'super_admin' ? 'IT Administrator' : currentUser.role.toUpperCase()}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
