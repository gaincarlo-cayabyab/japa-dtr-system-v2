import type { ReactNode } from 'react'

export type BannerTheme =
  | 'dashboard'
  | 'attendance'
  | 'employees'
  | 'reports'
  | 'payroll'
  | 'calendar'
  | 'sync'

export type BannerPattern =
  | 'mesh'
  | 'waves'
  | 'dots'
  | 'diagonal'
  | 'rings'
  | 'grid'
  | 'circuit'

export interface BannerChip {
  icon?: ReactNode
  label: string
  tone?: string
}

interface PageBannerProps {
  theme: BannerTheme
  pattern?: BannerPattern
  eyebrow: string
  eyebrowIcon?: ReactNode
  icon?: ReactNode
  title: string
  description: string
  chips?: BannerChip[]
  actions?: ReactNode
  className?: string
}

const THEME_CLASSES: Record<
  BannerTheme,
  { container: string; glowA: string; glowB: string; eyebrowText: string; subText: string }
> = {
  dashboard: {
    container: 'bg-gradient-to-r from-blue-600 via-indigo-700 to-violet-900 shadow-indigo-900/15',
    glowA: 'bg-sky-300/20',
    glowB: 'bg-violet-400/20',
    eyebrowText: 'text-blue-50',
    subText: 'text-blue-100/95',
  },
  attendance: {
    container: 'bg-gradient-to-r from-emerald-600 via-teal-700 to-cyan-900 shadow-teal-900/15',
    glowA: 'bg-emerald-300/20',
    glowB: 'bg-cyan-300/20',
    eyebrowText: 'text-emerald-50',
    subText: 'text-emerald-100/95',
  },
  employees: {
    container: 'bg-gradient-to-r from-violet-600 via-purple-700 to-fuchsia-900 shadow-purple-900/15',
    glowA: 'bg-fuchsia-300/20',
    glowB: 'bg-indigo-300/20',
    eyebrowText: 'text-violet-50',
    subText: 'text-purple-100/95',
  },
  reports: {
    container: 'bg-gradient-to-r from-sky-600 via-cyan-700 to-blue-900 shadow-sky-900/15',
    glowA: 'bg-cyan-300/20',
    glowB: 'bg-blue-400/20',
    eyebrowText: 'text-sky-50',
    subText: 'text-sky-100/95',
  },
  payroll: {
    container: 'bg-gradient-to-r from-amber-500 via-orange-600 to-rose-800 shadow-orange-900/15',
    glowA: 'bg-yellow-200/25',
    glowB: 'bg-rose-300/20',
    eyebrowText: 'text-amber-50',
    subText: 'text-orange-50/95',
  },
  calendar: {
    container: 'bg-gradient-to-r from-rose-600 via-pink-700 to-purple-900 shadow-rose-900/15',
    glowA: 'bg-pink-300/25',
    glowB: 'bg-purple-300/20',
    eyebrowText: 'text-rose-50',
    subText: 'text-rose-100/95',
  },
  sync: {
    container: 'bg-gradient-to-r from-cyan-700 via-teal-800 to-slate-900 shadow-cyan-900/20',
    glowA: 'bg-cyan-300/20',
    glowB: 'bg-emerald-400/15',
    eyebrowText: 'text-cyan-50',
    subText: 'text-cyan-100/95',
  },
}

function PatternOverlay({ pattern }: { pattern: BannerPattern }) {
  if (pattern === 'dots') {
    return (
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.65) 1.5px, transparent 1.5px)',
          backgroundSize: '20px 20px',
        }}
      />
    )
  }

  if (pattern === 'grid') {
    return (
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
    )
  }

  if (pattern === 'diagonal') {
    return (
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 1px, transparent 1px, transparent 14px)',
        }}
      />
    )
  }

  if (pattern === 'waves') {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-15 pointer-events-none"
        preserveAspectRatio="none"
        viewBox="0 0 800 220"
        aria-hidden="true"
      >
        <path
          d="M0,160 C180,90 360,210 560,120 C670,70 740,110 800,85 L800,220 L0,220 Z"
          fill="white"
          fillOpacity="0.45"
        />
        <path
          d="M0,190 C220,130 420,220 640,145 C720,118 770,135 800,120 L800,220 L0,220 Z"
          fill="white"
          fillOpacity="0.25"
        />
      </svg>
    )
  }

  if (pattern === 'rings') {
    return (
      <svg
        className="absolute -right-12 -top-12 w-80 h-80 opacity-20 pointer-events-none"
        viewBox="0 0 240 240"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="120" cy="120" r="46" stroke="white" strokeWidth="1.5" strokeDasharray="6 4" />
        <circle cx="120" cy="120" r="78" stroke="white" strokeWidth="1.5" />
        <circle cx="120" cy="120" r="110" stroke="white" strokeWidth="1" strokeDasharray="4 6" />
      </svg>
    )
  }

  if (pattern === 'circuit') {
    return (
      <svg
        className="absolute right-0 top-0 h-full w-96 opacity-20 pointer-events-none"
        viewBox="0 0 360 200"
        fill="none"
        aria-hidden="true"
      >
        <path d="M40 40 H150 L180 70 H300" stroke="white" strokeWidth="1.5" />
        <path d="M90 120 H210 L240 90 H340" stroke="white" strokeWidth="1.5" />
        <path d="M120 165 H250 L285 135 H350" stroke="white" strokeWidth="1.2" strokeDasharray="4 4" />
        <circle cx="150" cy="40" r="4" fill="white" />
        <circle cx="300" cy="70" r="4.5" fill="white" />
        <circle cx="210" cy="120" r="4" fill="white" />
        <circle cx="285" cy="135" r="3.5" fill="white" />
      </svg>
    )
  }

  // Default 'mesh'
  return (
    <div
      className="absolute inset-0 opacity-20 pointer-events-none"
      style={{
        backgroundImage:
          'radial-gradient(circle at 82% 20%, rgba(255,255,255,0.45) 0, transparent 36%), radial-gradient(circle at 20% 90%, rgba(255,255,255,0.25) 0, transparent 32%)',
      }}
    />
  )
}

export function PageBanner({
  theme,
  pattern = 'mesh',
  eyebrow,
  eyebrowIcon,
  icon,
  title,
  description,
  chips = [],
  actions,
  className = '',
}: PageBannerProps) {
  const t = THEME_CLASSES[theme]

  return (
    <section
      className={`${t.container} rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden ${className}`}
    >
      {/* Decorative Glows & Motif Pattern */}
      <div className={`absolute -right-8 -top-10 w-72 h-72 rounded-full blur-3xl pointer-events-none ${t.glowA}`} />
      <div className={`absolute left-1/3 -bottom-16 w-64 h-64 rounded-full blur-3xl pointer-events-none ${t.glowB}`} />
      <PatternOverlay pattern={pattern} />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="max-w-3xl space-y-3">
          {/* Frosted Eyebrow Pill */}
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold ${t.eyebrowText}`}
          >
            {eyebrowIcon}
            <span>{eyebrow}</span>
          </div>

          {/* Icon + Hero Title */}
          <div className="flex items-start sm:items-center gap-3.5">
            {icon && (
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-inner shrink-0">
                {icon}
              </div>
            )}
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-white">
                {title}
              </h1>
            </div>
          </div>

          <p className={`text-xs sm:text-sm leading-relaxed max-w-2xl ${t.subText}`}>{description}</p>

          {/* Info / Policy Chips */}
          {chips.length > 0 && (
            <div className="pt-1 flex flex-wrap gap-2 text-xs">
              {chips.map((chip, idx) => (
                <span
                  key={`${chip.label}-${idx}`}
                  className={`px-3 py-1 rounded-lg bg-white/10 border border-white/15 backdrop-blur-xs flex items-center gap-1.5 font-semibold ${
                    chip.tone || 'text-white/95'
                  }`}
                >
                  {chip.icon}
                  <span>{chip.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right Actions / Quick Widgets */}
        {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
      </div>
    </section>
  )
}
