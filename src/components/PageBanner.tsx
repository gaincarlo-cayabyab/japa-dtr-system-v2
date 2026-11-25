import type { CSSProperties, ReactNode } from 'react'

export type BannerTheme =
  | 'dashboard'
  | 'attendance'
  | 'employees'
  | 'reports'
  | 'payroll'
  | 'calendar'
  | 'sync'
  | 'help'

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

interface LightThemePalette {
  container: string
  topBar: string
  glowPrimary: string
  glowSecondary: string
  iconBox: string
  eyebrowPill: string
  chipClass: string
  patternColor: string
}

const LIGHT_PALETTES: Record<BannerTheme, LightThemePalette> = {
  dashboard: {
    container:
      'bg-gradient-to-r from-white via-blue-50/85 to-indigo-100/75 border border-blue-200/80 shadow-sm shadow-blue-500/5',
    topBar: 'from-blue-600 via-indigo-500 to-violet-500',
    glowPrimary: 'bg-blue-400/20',
    glowSecondary: 'bg-indigo-300/20',
    iconBox: 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25',
    eyebrowPill: 'bg-blue-100/80 border-blue-200 text-blue-800',
    chipClass: 'bg-white/90 border-blue-200/75 text-slate-700',
    patternColor: '#3b82f6',
  },
  attendance: {
    container:
      'bg-gradient-to-r from-white via-emerald-50/85 to-teal-100/75 border border-emerald-200/80 shadow-sm shadow-emerald-500/5',
    topBar: 'from-emerald-500 via-teal-500 to-cyan-500',
    glowPrimary: 'bg-emerald-400/20',
    glowSecondary: 'bg-teal-300/20',
    iconBox: 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25',
    eyebrowPill: 'bg-emerald-100/80 border-emerald-200 text-emerald-800',
    chipClass: 'bg-white/90 border-emerald-200/75 text-slate-700',
    patternColor: '#10b981',
  },
  employees: {
    container:
      'bg-gradient-to-r from-white via-violet-50/85 to-purple-100/75 border border-violet-200/80 shadow-sm shadow-violet-500/5',
    topBar: 'from-violet-600 via-purple-500 to-fuchsia-500',
    glowPrimary: 'bg-violet-400/20',
    glowSecondary: 'bg-fuchsia-300/20',
    iconBox: 'bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/25',
    eyebrowPill: 'bg-violet-100/80 border-violet-200 text-violet-800',
    chipClass: 'bg-white/90 border-violet-200/75 text-slate-700',
    patternColor: '#8b5cf6',
  },
  reports: {
    container:
      'bg-gradient-to-r from-white via-sky-50/85 to-cyan-100/75 border border-sky-200/80 shadow-sm shadow-sky-500/5',
    topBar: 'from-sky-500 via-cyan-500 to-blue-600',
    glowPrimary: 'bg-sky-400/20',
    glowSecondary: 'bg-cyan-300/20',
    iconBox: 'bg-gradient-to-br from-sky-600 to-cyan-600 text-white shadow-md shadow-sky-500/25',
    eyebrowPill: 'bg-sky-100/80 border-sky-200 text-sky-800',
    chipClass: 'bg-white/90 border-sky-200/75 text-slate-700',
    patternColor: '#0284c7',
  },
  payroll: {
    container:
      'bg-gradient-to-r from-white via-amber-50/85 to-orange-100/75 border border-amber-200/80 shadow-sm shadow-amber-500/5',
    topBar: 'from-amber-500 via-orange-500 to-rose-500',
    glowPrimary: 'bg-amber-400/20',
    glowSecondary: 'bg-orange-300/20',
    iconBox: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/25',
    eyebrowPill: 'bg-amber-100/90 border-amber-200 text-amber-900',
    chipClass: 'bg-white/90 border-amber-200/75 text-slate-700',
    patternColor: '#d97706',
  },
  calendar: {
    container:
      'bg-gradient-to-r from-white via-rose-50/85 to-pink-100/75 border border-rose-200/80 shadow-sm shadow-rose-500/5',
    topBar: 'from-rose-500 via-pink-500 to-purple-500',
    glowPrimary: 'bg-rose-400/20',
    glowSecondary: 'bg-pink-300/20',
    iconBox: 'bg-gradient-to-br from-rose-600 to-pink-600 text-white shadow-md shadow-rose-500/25',
    eyebrowPill: 'bg-rose-100/80 border-rose-200 text-rose-800',
    chipClass: 'bg-white/90 border-rose-200/75 text-slate-700',
    patternColor: '#e11d48',
  },
  sync: {
    container:
      'bg-gradient-to-r from-white via-cyan-50/85 to-teal-100/75 border border-cyan-200/80 shadow-sm shadow-cyan-500/5',
    topBar: 'from-cyan-500 via-teal-500 to-emerald-500',
    glowPrimary: 'bg-cyan-400/20',
    glowSecondary: 'bg-teal-300/20',
    iconBox: 'bg-gradient-to-br from-cyan-600 to-teal-600 text-white shadow-md shadow-cyan-500/25',
    eyebrowPill: 'bg-cyan-100/80 border-cyan-200 text-cyan-900',
    chipClass: 'bg-white/90 border-cyan-200/75 text-slate-700',
    patternColor: '#0891b2',
  },
  help: {
    container:
      'bg-gradient-to-r from-white via-indigo-50/85 to-blue-100/75 border border-indigo-200/80 shadow-sm shadow-indigo-500/5',
    topBar: 'from-indigo-600 via-blue-500 to-purple-500',
    glowPrimary: 'bg-indigo-400/20',
    glowSecondary: 'bg-blue-300/20',
    iconBox: 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/25',
    eyebrowPill: 'bg-indigo-100/85 border-indigo-200 text-indigo-800',
    chipClass: 'bg-white/90 border-indigo-200/75 text-slate-700',
    patternColor: '#4f46e5',
  },
}

// Masks geometric motifs gently toward the right edge so text on the left stays over a clean white-tinted backdrop
const RIGHT_FADE_MASK: CSSProperties = {
  maskImage: 'linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.35) 45%, transparent 72%)',
  WebkitMaskImage:
    'linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.35) 45%, transparent 72%)',
}

function PatternOverlay({ pattern, color }: { pattern: BannerPattern; color: string }) {
  if (pattern === 'dots') {
    return (
      <div
        className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          ...RIGHT_FADE_MASK,
          backgroundImage: `radial-gradient(${color} 1.5px, transparent 1.5px)`,
          backgroundSize: '18px 18px',
        }}
      />
    )
  }

  if (pattern === 'grid') {
    return (
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          ...RIGHT_FADE_MASK,
          backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
          backgroundSize: '26px 26px',
        }}
      />
    )
  }

  if (pattern === 'diagonal') {
    return (
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          ...RIGHT_FADE_MASK,
          backgroundImage: `repeating-linear-gradient(-45deg, ${color} 0px, ${color} 1px, transparent 1px, transparent 16px)`,
        }}
      />
    )
  }

  if (pattern === 'waves') {
    return (
      <svg
        className="absolute right-0 bottom-0 top-0 w-2/3 h-full opacity-15 pointer-events-none"
        style={RIGHT_FADE_MASK}
        preserveAspectRatio="none"
        viewBox="0 0 600 220"
        aria-hidden="true"
      >
        <path
          d="M0,150 C140,85 280,195 430,115 C510,72 560,105 600,82 L600,220 L0,220 Z"
          fill={color}
          fillOpacity="0.4"
        />
        <path
          d="M0,185 C170,125 320,210 490,142 C540,122 575,135 600,118 L600,220 L0,220 Z"
          fill={color}
          fillOpacity="0.22"
        />
      </svg>
    )
  }

  if (pattern === 'rings') {
    return (
      <svg
        className="absolute -right-6 -top-8 w-72 h-72 opacity-20 pointer-events-none"
        style={RIGHT_FADE_MASK}
        viewBox="0 0 240 240"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="130" cy="120" r="42" stroke={color} strokeWidth="1.5" strokeDasharray="6 4" />
        <circle cx="130" cy="120" r="74" stroke={color} strokeWidth="1.5" />
        <circle cx="130" cy="120" r="106" stroke={color} strokeWidth="1" strokeDasharray="4 6" />
      </svg>
    )
  }

  if (pattern === 'circuit') {
    return (
      <svg
        className="absolute right-0 top-0 h-full w-96 opacity-20 pointer-events-none"
        style={RIGHT_FADE_MASK}
        viewBox="0 0 360 200"
        fill="none"
        aria-hidden="true"
      >
        <path d="M50 42 H165 L195 72 H325" stroke={color} strokeWidth="1.5" />
        <path d="M90 120 H215 L245 90 H345" stroke={color} strokeWidth="1.5" />
        <path d="M130 162 H255 L290 132 H350" stroke={color} strokeWidth="1.2" strokeDasharray="4 4" />
        <circle cx="165" cy="42" r="3.5" fill={color} />
        <circle cx="325" cy="72" r="4" fill={color} />
        <circle cx="215" cy="120" r="3.5" fill={color} />
        <circle cx="290" cy="132" r="3.5" fill={color} />
      </svg>
    )
  }

  // Default 'mesh'
  return (
    <div
      className="absolute inset-0 opacity-20 pointer-events-none"
      style={{
        ...RIGHT_FADE_MASK,
        backgroundImage: `radial-gradient(circle at 86% 24%, ${color} 0, transparent 34%), radial-gradient(circle at 72% 85%, ${color} 0, transparent 28%)`,
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
  const palette = LIGHT_PALETTES[theme]

  return (
    <section
      className={`${palette.container} rounded-3xl px-6 py-5 sm:px-7 sm:py-6 min-h-[156px] flex items-center relative overflow-hidden ${className}`}
    >
      {/* Top Signature Accent Strip */}
      <div
        className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${palette.topBar} pointer-events-none`}
      />

      {/* Soft Right-Anchored Pastel Glow Orbs */}
      <div
        className={`absolute -right-10 -top-12 w-72 h-72 rounded-full blur-3xl pointer-events-none ${palette.glowPrimary}`}
      />
      <div
        className={`absolute right-1/4 -bottom-16 w-64 h-64 rounded-full blur-3xl pointer-events-none ${palette.glowSecondary}`}
      />

      <PatternOverlay pattern={pattern} color={palette.patternColor} />

      <div className="relative z-10 w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2.5">
          {/* Eyebrow Tag */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border text-[11px] font-bold ${palette.eyebrowPill}`}
          >
            {eyebrowIcon}
            <span>{eyebrow}</span>
          </div>

          {/* Glossy Gradient Icon + High-Contrast Ink Title */}
          <div className="flex items-center gap-3">
            {icon && (
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 ${palette.iconBox}`}
              >
                {icon}
              </div>
            )}
            <h1 className="text-xl sm:text-2xl md:text-[26px] font-black tracking-tight text-slate-900 leading-tight">
              {title}
            </h1>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed max-w-2xl">
            {description}
          </p>

          {/* Clean Light Status Chips */}
          {chips.length > 0 && (
            <div className="pt-0.5 flex flex-wrap gap-2 text-xs">
              {chips.map((chip, idx) => (
                <span
                  key={`${chip.label}-${idx}`}
                  className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 font-semibold shadow-sm ${palette.chipClass}`}
                >
                  {chip.icon}
                  <span>{chip.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right Action Controls */}
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </section>
  )
}
