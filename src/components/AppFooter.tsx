'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ShieldCheck, Cpu, Code2, Radio } from 'lucide-react'

export function AppFooter() {
  const pathname = usePathname()

  if (pathname === '/login') {
    return null
  }

  return (
    <footer className="w-full bg-white border-t border-slate-200/90 mt-8 sm:mt-12 py-6 sm:py-7 px-3.5 sm:px-6 select-none">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Main Brand & Architect Row (No Duplicate Strings) */}
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-4 sm:gap-5 pb-5 border-b border-slate-100 text-center md:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3.5">
            <div className="relative w-12 h-12 rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white flex-shrink-0">
              <Image
                src="/japa-logo.jpg"
                alt="JAPA Logo"
                fill
                className="object-contain p-1"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="text-base font-black text-slate-900 tracking-tight">
                  JAPA GLOBAL TRADING
                </span>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  Enterprise Portal v5.0
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-lg">
                Real-time biometric timekeeping, DOLE-compliant payroll automation, and analytics across Dagupan &amp; Manila branches.
              </p>
            </div>
          </div>

          {/* Single Lead Developer & Maintainer Card */}
          <div className="inline-flex flex-wrap sm:flex-nowrap items-center justify-center gap-2.5 px-3.5 sm:px-4 py-2.5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md border border-indigo-800/50 max-w-full">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center flex-shrink-0">
              <Code2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold tracking-wider text-indigo-300 leading-none">
                Architected &amp; Maintained By
              </p>
              <p className="text-xs font-black text-white tracking-wide mt-1 leading-none">
                Gain Carlo Cayabyab
              </p>
            </div>
            <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30 ml-1">
              IT Admin
            </span>
          </div>
        </div>

        {/* Concise Infrastructure & Telemetry Strip */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/80">
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
              FingerTec TA500 (192.168.0.58:4370)
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-700 bg-cyan-50/70 px-2.5 py-1 rounded-lg border border-cyan-200/80">
              <Radio className="w-3.5 h-3.5 text-cyan-600" />
              Bridge v18.9 Iron Sentinel (3s Poll · 5-Min Audit)
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              15s Anti-Double Tap Guard
            </span>
          </div>

          <div className="text-[11px] text-slate-400 font-medium">
            Manila UTC+8 · © 2026 JAPA Global Trading. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  )
}
