'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ShieldCheck,
  Cpu,
  Heart,
  Code2,
  Sparkles,
  ExternalLink,
  Layers,
  Fingerprint,
} from 'lucide-react'

export function AppFooter() {
  const pathname = usePathname()

  if (pathname === '/login') {
    return null
  }

  return (
    <footer className="w-full bg-white border-t border-slate-200 mt-12 py-8 px-4 sm:px-6 select-none transition-all">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Main Footer Row */}
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 pb-6 border-b border-slate-100 text-center md:text-left">
          {/* Brand & System Overview */}
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
              <div className="flex items-center justify-center md:justify-start gap-2">
                <span className="text-base font-black text-slate-900 tracking-tight">
                  JAPA GLOBAL TRADING
                </span>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  DTR Portal v2.5 — Bridge v16.4
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Official biometric timekeeping, shift compliance, and automated payroll management platform.
              </p>
            </div>
          </div>

          {/* IT Admin & Creator Badge (Prominently featured per user instruction) */}
          <div className="flex flex-col items-center md:items-end">
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white shadow-md border border-indigo-800/50">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                <Code2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-left">
                <p className="text-[10px] uppercase font-bold tracking-wider text-indigo-300">
                  Lead Architect &amp; System Developer
                </p>
                <p className="text-xs font-black text-white tracking-wide">
                  Gain Carlo Cayabyab
                </p>
              </div>
              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30 ml-1">
                IT Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1.5">
              Engineered &amp; Maintained by Gain Carlo Cayabyab
            </p>
          </div>
        </div>

        {/* Telemetry, Copyright, & Technical Credits */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-[11px]">
            <span className="flex items-center gap-1.5 font-semibold text-slate-600">
              <Cpu className="w-3.5 h-3.5 text-indigo-500" />
              FingerTec TA500 Biometric Terminal (192.168.0.58)
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">Bridge Engine v16.4 (Iron Sentinel)</span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1 text-emerald-600 font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              5-Min Anti-Double Tap Protected
            </span>
          </div>

          <div className="text-[11px] text-slate-400">
            © {new Date().getFullYear()} JAPA Global Trading. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  )
}
