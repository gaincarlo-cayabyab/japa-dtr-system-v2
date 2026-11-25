import type { CSSProperties, ReactNode } from 'react'

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

interface ThemePalette {
  container: string
  topHairline: string
  glowPrimary: string
  glowSecondary: string
  iconBox: string
  eyebrowPill: string
  accentText: string
}

const THEME_PALETTES: Record<BannerTheme, ThemePalette> = {
  dashboard: {
    container:
      'bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 shadow-xl shadow-indigo-950/20 border border-indigo-400/20',
    topHairline: 'from-transparent via-blue-400/80 to-transparent',
    glowPrimary: 'bg-blue-500/25',
    glowSecondary: 'bg-violet-500/20',
    iconBox: 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 ring-1 ring-white/25',
    eyebrowPill: 'bg-blue-500/15 border-blue-400/30 text-blue-100',
    accentText: 'text-blue-300',
  },
  attendance: {
    container:
      'bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-900 shadow-xl shadow-teal-950/20 border border-emerald-400/20',
    topHairline: 'from-transparent via-emerald-400/80 to-transparent',
    glowPrimary: 'bg-emerald-500/25',
    glowSecondary: 'bg-cyan-500/20',
    iconBox: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 ring-1 ring-white/25',
    eyebrowPill: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100',
    accentText: 'text-emerald-300',
  },
  employees: {
    container:
      'bg-gradient-to-br from-slate-950 via-violet-950 to-purple-900 shadow-xl shadow-purple-950/20 border border-violet-400/20',
    topHairline: 'from-transparent via-violet-400/80 to-transparent',
    glowPrimary: 'bg-violet-500/25',
    glowSecondary: 'bg-fuchsia-500/20',
    iconBox: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/30 ring-1 ring-white/25',
    eyebrowPill: 'bg-violet-500/15 border-violet-400/30 text-violet-100',
    accentText: 'text-violet-300',
  },
  reports: {
    container:
      'bg-gradient-to-br from-slate-950 via-sky-950 to-cyan-900 shadow-xl shadow-sky-950/20 border border-sky-400/20',
    topHairline: 'from-transparent via-sky-400/80 to-transparent',
    glowPrimary: 'bg-sky-500/25',
    glowSecondary: 'bg-blue-500/20',
    iconBox: 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg shadow-sky-500/30 ring-1 ring-white/25',
    eyebrowPill: 'bg-sky-500/15 border-sky-400/30 text-sky-100',
    accentText: 'text-sky-300',
  },
  payroll: {
    container:
      'bg-gradient-to-br from-slate-950 via-stone-900 to-amber-950 shadow-xl shadow-amber-950/25 border border-amber-400/25',
    topHairline: 'from-transparent via-amber-400/85 to-transparent',
    glowPrimary: 'bg-amber-500/25',
    glowSecondary: 'bg-orange-500/20',
    iconBox: 'bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-amber-500/30 ring-1 ring-white/25',
    eyebrowPill: 'bg-amber-500/15 border-amber-400/30 text-amber-100',
    accentText: 'text-amber-300',
  },
  calendar: {
    container:
      'bg-gradient-to-br from-slate-950 via-rose-950 to-pink-900 shadow-xl shadow-rose-950/20 border border-rose-400/20',
    topHairline: 'from-transparent via-rose-400/80 to-transparent',
    glowPrimary: 'bg-rose-500/25',
    glowSecondary: 'bg-pink-500/20',
    iconBox: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30 ring-1 ring-white/25',
    eyebrowPill: 'bg-rose-500/15 border-rose-400/30 text-rose-100',
    accentText: 'text-rose-300',
  },
  sync: {
    container:
      'bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 shadow-xl shadow-cyan-950/25 border border-cyan-400/20',
    topHairline: 'from-transparent via-cyan-400/80 to-transparent',
    glowPrimary: 'bg-cyan-500/25',
    glowSecondary: 'bg-teal-500/20',
    iconBox: 'bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-lg shadow-cyan-500/30 ring-1 ring-white/25',
    eyebrowPill: 'bg-cyan-500/15 border-cyan-400/30 text-cyan-100',
    accentText: 'text-cyan-300',
  },
}

// Masks pattern cleanly toward the right edge so typography on the left stays razor-sharp
const RIGHT_FADE_MASK: CSSProperties = {
  maskImage: 'linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.45) 45%, transparent 78%)',
  WebkitMaskImage:
    'linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.45) 45%, transparent 78%)',
}

function PatternOverlay({ pattern }: { pattern: BannerPattern }) {
  if (pattern === 'dots') {
    return (
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          ...RIGHT_FADE_MASK,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1.5px, transparent 1.5px)',
          backgroundSize: '18px 18px',
        }}
      />
    )
  }

  if (pattern === 'grid') {
    return (
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          ...RIGHT_FADE_MASK,
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.45) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
    )
  }

  if (pattern === 'diagonal') {
    return (
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          ...RIGHT_FADE_MASK,
          backgroundImage:
            'repeating-linear-gradient(-45deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 1px, transparent 1px, transparent 16px)',
        }}
      />
    )
  }

  if (pattern === 'waves') {
    return (
      <svg
        className="absolute right-0 bottom-0 top-0 w-2/3 h-full opacity-20 pointer-events-none"
        style={RIGHT_FADE_MASK}
        preserveAspectRatio="none"
        viewBox="0 0 600 220"
        aria-hidden="true"
      >
        <path
          d="M0,150 C140,85 280,195 430,115 C510,72 560,105 600,82 L600,220 L0,220 Z"
          fill="white"
          fillOpacity="0.35"
        />
        <path
          d="M0,185 C170,125 320,210 490,142 C540,122 575,135 600,118 L600,220 L0,220 Z"
          fill="white"
          fillOpacity="0.2"
        />
      </svg>
    )
  }

  if (pattern === 'rings') {
    return (
      <svg
        className="absolute -right-8 -top-10 w-80 h-80 opacity-20 pointer-events-none"
        style={RIGHT_FADE_MASK}
        viewBox="0 0 240 240"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="130" cy="120" r="44" stroke="white" strokeWidth="1.5" strokeDasharray="6 4" />
        <circle cx="130" cy="120" r="76" stroke="white" strokeWidth="1.5" />
        <circle cx="130" cy="120" r="108" stroke="white" strokeWidth="1" strokeDasharray="4 6" />
      </svg>
    )
  }

  if (pattern === 'circuit') {
    return (
      <svg
        className="absolute right-0 top-0 h-full w-96 opacity-25 pointer-events-none"
        style={RIGHT_FADE_MASK}
        viewBox="0 0 360 200"
        fill="none"
        aria-hidden="true"
      >
        <path d="M50 42 H165 L195 72 H325" stroke="white" strokeWidth="1.5" />
        <path d="M90 120 H215 L245 90 H345" stroke="white" strokeWidth="1.5" />
        <path d="M130 162 H255 L290 132 H350" stroke="white" strokeWidth="1.2" strokeDasharray="4 4" />
        <circle cx="165" cy="42" r="3.5" fill="white" />
        <circle cx="325" cy="72" r="4" fill="white" />
        <circle cx="215" cy="120" r="3.5" fill="white" />
        <circle cx="290" cy="132" r="3.5" fill="white" />
      </svg>
    )
  }

  // Default 'mesh'
  return (
    <div
      className="absolute inset-0 opacity-25 pointer-events-none"
      style={{
        ...RIGHT_FADE_MASK,
        backgroundImage:
          'radial-gradient(circle at 86% 24%, rgba(255,255,255,0.45) 0, transparent 34%), radial-gradient(circle at 72% 85%, rgba(255,255,255,0.22) 0, transparent 30%)',
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
  const palette = THEME_PALETTES[theme]

  return (
    <section
      className={`${palette.container} rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden ${className}`}
    >
      {/* Top Luminous Hairline Accent */}
      <div
        className={`absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r ${palette.topHairline} pointer-events-none`}
      />

      {/* Soft Right-Anchored Ambient Auras (Leaves text side deep & legible) */}
      <div
        className={`absolute -right-12 -top-14 w-80 h-80 rounded-full blur-3xl pointer-events-none ${palette.glowPrimary}`}
      />
      <div
        className={`absolute right-1/4 -bottom-16 w-72 h-72 rounded-full blur-3xl pointer-events-none ${palette.glowSecondary}`}
      />

      <PatternOverlay pattern={pattern} />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="max-w-3xl space-y-3.5">
          {/* Crisp Frosted Eyebrow Pill */}
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border backdrop-blur-md text-xs font-bold ${palette.eyebrowPill}`}
          >
            {eyebrowIcon}
            <span>{eyebrow}</span>
          </div>

          {/* Glossy Gradient Icon + Pure White Title */}
          <div className="flex items-start sm:items-center gap-3.5">
            {icon && (
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 ${palette.iconBox}`}
              >
                {icon}
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-white">
              {title}
            </h1>
          </div>

          <p className="text-xs sm:text-sm leading-relaxed max-w-2xl text-slate-200 font-medium">
            {description}
          </p>

          {/* High-Contrast Dark Frosted Status Chips */}
          {chips.length > 0 && (
            <div className="pt-1 flex flex-wrap gap-2 text-xs">
              {chips.map((chip, idx) => (
                <span
                  key={`${chip.label}-${idx}`}
                  className="px-3 py-1.5 rounded-xl bg-slate-950/50 border border-white/15 backdrop-blur-sm flex items-center gap-1.5 font-semibold text-slate-100 shadow-sm"
                >
                  {chip.icon}
                  <span>{chip.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right Actions */}
        {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
      </div>
    </section>
  )
}
