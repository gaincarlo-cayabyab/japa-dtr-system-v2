'use client'

import { useState, useEffect, useRef } from 'react'
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
  Bell,
  CheckCircle2,
  XCircle,
  AlertCircle,
  KeyRound,
  ShieldAlert,
  ChevronDown,
  X,
} from 'lucide-react'

interface PendingRequest {
  username: string
  displayName: string
  role: string
}

interface ActiveGrant {
  active: boolean
  remainingSec: number
}

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

  // Edit Access States
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [activeGrants, setActiveGrants] = useState<Record<string, ActiveGrant>>({})
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'admin'
  const isManager = currentUser?.role === 'manager' || currentUser?.username === 'japa_manager'
  // 1-Hour Edit Access Approvals are EXCLUSIVELY available to IT Administrator
  const canApprove = isSuperAdmin
  const isDeeOrPearly = currentUser?.username === 'japa_dee' || currentUser?.username === 'japa_pearly'

  // Fetch Edit Access Status
  const fetchEditAccess = async () => {
    try {
      const res = await fetch(`/api/auth/edit-access?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setPendingRequests(data.pendingRequests || [])
        setActiveGrants(data.activeGrants || {})
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('japa_edit_access_changed', {
              detail: {
                activeGrants: data.activeGrants,
                pendingRequests: data.pendingRequests,
              },
            })
          )
        }
      }
    } catch {
      // Ignore polling errors
    }
  }

  useEffect(() => {
    if (pathname === '/login') return

    // Fetch user
    const fetchUser = () => {
      fetch(`/api/auth/me?t=${Date.now()}`, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (data.authenticated && data.user) {
            setCurrentUser(data.user)
          }
        })
        .catch(() => {})
    }

    fetchUser()
    const userInterval = setInterval(fetchUser, 5000)

    // Manila Time Clock
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
    const clockTimer = setInterval(updateTime, 1000)

    // Initial edit access poll
    fetchEditAccess()
    const pollInterval = setInterval(fetchEditAccess, 4000)

    return () => {
      clearInterval(clockTimer)
      clearInterval(userInterval)
      clearInterval(pollInterval)
    }
  }, [pathname])

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowApprovalModal(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  // Request 1-Hour Edit Access (JAPA Dee / JAPA Pearly)
  const handleRequestEditAccess = async () => {
    if (!currentUser || isSubmittingRequest) return
    setIsSubmittingRequest(true)
    try {
      const res = await fetch('/api/auth/edit-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', targetUsername: currentUser.username }),
      })
      const data = await res.json()
      if (res.ok) {
        setToastMsg('1-Hour Edit Access request submitted to IT Administrator!')
        setTimeout(() => setToastMsg(null), 4000)
        fetchEditAccess()
      } else {
        alert(data.error || 'Failed to submit request')
      }
    } catch {
      alert('Network error requesting edit access')
    } finally {
      setIsSubmittingRequest(false)
    }
  }

  // IT Super Admin: Approve 1-Hour Edit Access
  const handleApprove = async (targetUsername: string) => {
    try {
      const res = await fetch('/api/auth/edit-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', targetUsername }),
      })
      if (res.ok) {
        setToastMsg(`Approved 1-Hour Edit Access for ${targetUsername}!`)
        setTimeout(() => setToastMsg(null), 4000)
        fetchEditAccess()
      }
    } catch {
      alert('Failed to approve request')
    }
  }

  // IT Super Admin: Decline or Revoke Edit Access
  const handleDeclineOrRevoke = async (targetUsername: string) => {
    try {
      const res = await fetch('/api/auth/edit-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline', targetUsername }),
      })
      if (res.ok) {
        setToastMsg(`Revoked edit access for ${targetUsername}.`)
        setTimeout(() => setToastMsg(null), 4000)
        fetchEditAccess()
      }
    } catch {
      alert('Failed to decline/revoke request')
    }
  }

  const myGrant = currentUser?.username ? activeGrants[currentUser.username] : null
  const isMyGrantActive = myGrant?.active && (myGrant.remainingSec || 0) > 0
  const isMyRequestPending = currentUser?.username
    ? pendingRequests.some((r) => r.username === currentUser.username)
    : false

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`
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
                DTR &amp; Biometric Management System
              </p>
            </div>
          </Link>
        </div>

        {/* Center/Right: Live Clock, Edit Access Controls, Hardware Status */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
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
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-colors shadow-2xs"
            title="TA500 Biometric Hardware Status"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="hidden sm:inline">TA500 Online</span>
            <span className="font-mono text-[11px] text-emerald-700 font-semibold">(192.168.0.58)</span>
          </Link>

          {/* ── 1-HOUR EDIT ACCESS CONTROLS ───────────────────────────────── */}
          {/* 1. For IT Admin & JAPA Manager: Pending Approval Bell & Panel */}
          {canApprove && (
            <div className="relative" ref={modalRef}>
              <button
                type="button"
                onClick={() => setShowApprovalModal(!showApprovalModal)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs border ${
                  pendingRequests.length > 0
                    ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white border-amber-400 animate-bounce'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                }`}
                title="Manage Temporary Edit Approvals"
              >
                <Bell className={`w-3.5 h-3.5 ${pendingRequests.length > 0 ? 'animate-pulse' : ''}`} />
                {pendingRequests.length > 0 ? (
                  <span>{pendingRequests.length} Edit Request{pendingRequests.length > 1 ? 's' : ''}</span>
                ) : (
                  <span className="hidden sm:inline">Edit Controls</span>
                )}
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>

              {/* Approval Modal Dropdown */}
              {showApprovalModal && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        1-Hour Edit Access Approvals
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowApprovalModal(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Pending Requests Section */}
                  <div className="py-3 space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Pending Requests ({pendingRequests.length})
                    </p>
                    {pendingRequests.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-1">No pending requests right now.</p>
                    ) : (
                      pendingRequests.map((req) => (
                        <div
                          key={req.username}
                          className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between gap-2"
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-900">{req.displayName}</p>
                            <p className="text-[10px] text-amber-700 font-medium">{req.role} · Requested 1h edit</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => handleApprove(req.username)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-2xs transition-all active:scale-95"
                            >
                              Approve (1h)
                            </button>
                            <button
                              onClick={() => handleDeclineOrRevoke(req.username)}
                              className="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 text-[11px] font-bold rounded-lg transition-all"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Active Grants Section */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Active 1-Hour Grants
                    </p>
                    {['japa_dee', 'japa_pearly'].map((u) => {
                      const grant = activeGrants[u]
                      const name = u === 'japa_dee' ? 'JAPA Dee (CEO)' : 'JAPA Pearly (Office Staff)'
                      if (!grant?.active) return null
                      return (
                        <div
                          key={u}
                          className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2"
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-900">{name}</p>
                            <p className="text-[10px] text-emerald-700 font-semibold font-mono">
                              Active · {formatRemaining(grant.remainingSec)} remaining
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeclineOrRevoke(u)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-bold rounded-lg border border-rose-200 transition-colors"
                          >
                            Revoke
                          </button>
                        </div>
                      )
                    })}
                    {!activeGrants['japa_dee']?.active && !activeGrants['japa_pearly']?.active && (
                      <p className="text-xs text-slate-400 italic py-0.5">No active temporary grants.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. For JAPA Dee / JAPA Pearly: Request or Active Status Pill */}
          {isDeeOrPearly && (
            <div>
              {isMyGrantActive ? (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-2xs"
                  title="Full Add, Edit & Delete Access Active"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                  <span>1h Edit Active</span>
                  <span className="font-mono text-[11px] text-emerald-600">
                    ({formatRemaining(myGrant!.remainingSec)})
                  </span>
                </span>
              ) : isMyRequestPending ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold animate-pulse">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pending IT Approval</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestEditAccess}
                  disabled={isSubmittingRequest}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
                  title="Request 1-Hour Add, Edit & Delete Permissions from IT Administrator"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isSubmittingRequest ? 'Requesting…' : 'Request 1h Edit Access'}</span>
                </button>
              )}
            </div>
          )}

          {/* User Session Profile & Logout */}
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

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}
    </header>
  )
}
