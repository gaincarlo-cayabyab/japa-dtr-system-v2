'use client'

import { useState, useEffect } from 'react'
import {
  Fingerprint,
  Wifi,
  WifiOff,
  Cable,
  Radio,
  Tablet,
  Database,
  Cloud,
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  RefreshCw,
  Zap,
  Server,
  ShieldAlert,
  Terminal,
  Clock,
  ArrowRight,
  Info,
  Check,
} from 'lucide-react'
import { format } from 'date-fns'
import type { AttendanceLog } from '@/types/database'
import { PUNCH_STATUS, PUNCH_STATUS_COLOR } from '@/types/database'

export type NetworkScenario =
  | 'healthy'
  | 'slow_network'
  | 'lan_unplugged'
  | 'wifi_disconnected'
  | 'bridge_offline'
  | 'cloud_error'

interface SyncClientProps {
  initialTotalRecords: number
  initialLastSync: string | null
  initialRecentLogs: AttendanceLog[]
}

function formatTs(ts: string | null | undefined) {
  if (!ts) return 'Never'
  try {
    return format(new Date(ts), 'MMM d, yyyy  hh:mm:ss aa')
  } catch {
    return String(ts)
  }
}

export function SyncClient({
  initialTotalRecords,
  initialLastSync,
  initialRecentLogs,
}: SyncClientProps) {
  const [scenario, setScenario] = useState<NetworkScenario>('healthy')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [testingPing, setTestingPing] = useState(false)
  const [liveLatency, setLiveLatency] = useState<number>(45)
  const [totalRecords, setTotalRecords] = useState(initialTotalRecords)
  const [lastSync, setLastSync] = useState(initialLastSync)
  const [recentLogs, setRecentLogs] = useState<AttendanceLog[]>(initialRecentLogs)
  const [liveTime, setLiveTime] = useState<string>('')

  // Live clock
  useEffect(() => {
    const updateTime = () => setLiveTime(format(new Date(), 'hh:mm:ss aa'))
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Run live diagnostic ping
  const handleTestPing = async () => {
    setTestingPing(true)
    const t0 = Date.now()
    try {
      const res = await fetch('/api/sync/status')
      const json = await res.json()
      const measured = Date.now() - t0
      setLiveLatency(json.db_latency_ms || measured)
      if (json.total_records) setTotalRecords(json.total_records)
      if (json.last_sync) setLastSync(json.last_sync)
      if (json.recent_logs) setRecentLogs(json.recent_logs)
    } catch {
      setLiveLatency(Date.now() - t0)
    } finally {
      setTimeout(() => setTestingPing(false), 500)
    }
  }

  // Auto-refresh stats every 15s when in healthy scenario
  useEffect(() => {
    if (scenario !== 'healthy') return
    const interval = setInterval(() => {
      handleTestPing()
    }, 15000)
    return () => clearInterval(interval)
  }, [scenario])

  // Status computation based on scenario
  const isHealthy = scenario === 'healthy'
  const isSlow = scenario === 'slow_network'
  const isLanBroken = scenario === 'lan_unplugged'
  const isWifiBroken = scenario === 'wifi_disconnected'
  const isBridgeDown = scenario === 'bridge_offline'
  const isCloudDown = scenario === 'cloud_error'

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Top Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Sync Bridge Infrastructure & Telemetry Monitor
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Physical biometric network topology & real-time synchronization pipeline
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{liveTime || '00:00:00'}</span>
          </div>
          <button
            type="button"
            onClick={handleTestPing}
            disabled={testingPing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingPing ? 'animate-spin' : ''}`} />
            {testingPing ? 'Pinging Nodes...' : 'Run Diagnostics'}
          </button>
        </div>
      </div>

      {/* ── Scenario / Simulation Selector ─────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 rounded-2xl border border-slate-700 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/30 text-blue-300 border border-blue-400/30">
              Interactive Hardware & Network Diagnostics
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Select any state below to inspect visual wire & connectivity behavior:
            </span>
          </div>
          <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Active Pipeline: {scenario.toUpperCase()}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={() => setScenario('healthy')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
              scenario === 'healthy'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border-slate-700'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>🟢 All Healthy</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('slow_network')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
              scenario === 'slow_network'
                ? 'bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-600/30 ring-2 ring-amber-400/50'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border-slate-700'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-300" />
            <span>🟡 High Latency</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('lan_unplugged')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
              scenario === 'lan_unplugged'
                ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30 ring-2 ring-rose-400/50'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border-slate-700'
            }`}
          >
            <Cable className="w-4 h-4 text-rose-300" />
            <span>🔴 LAN Unplugged</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('wifi_disconnected')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
              scenario === 'wifi_disconnected'
                ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30 ring-2 ring-rose-400/50'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border-slate-700'
            }`}
          >
            <WifiOff className="w-4 h-4 text-rose-300" />
            <span>🔴 Wi-Fi Drop</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('bridge_offline')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
              scenario === 'bridge_offline'
                ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30 ring-2 ring-rose-400/50'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border-slate-700'
            }`}
          >
            <Tablet className="w-4 h-4 text-rose-300" />
            <span>🔴 Bridge Offline</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('cloud_error')}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
              scenario === 'cloud_error'
                ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30 ring-2 ring-rose-400/50'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border-slate-700'
            }`}
          >
            <Cloud className="w-4 h-4 text-rose-300" />
            <span>🔴 Cloud/WAN Out</span>
          </button>
        </div>
      </div>

      {/* ── Active Status Banner ─────────────────────────────────────── */}
      <div
        className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
          isHealthy
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            : isSlow
            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
            : 'bg-rose-50/80 border-rose-200 text-rose-900'
        }`}
      >
        <div className="mt-0.5">
          {isHealthy ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : isSlow ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 animate-bounce" />
          ) : (
            <XCircle className="w-5 h-5 text-rose-600 animate-pulse" />
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-black uppercase tracking-wider">
            {isHealthy && 'Operational · All Pipeline Stages Healthy & Synchronized'}
            {isSlow && 'Performance Alert · High Jitter / Slow Packet Propagation Detected'}
            {isLanBroken && 'Hardware Fault · RJ45 Ethernet Cable Disconnected from TA500 or Repeater'}
            {isWifiBroken && 'Wireless Link Severed · Wi-Fi Repeater / Extender Disconnected from Office WLAN'}
            {isBridgeDown && 'Software Inactive · Python Bridge Engine Terminated on Samsung Galaxy Tab A9+'}
            {isCloudDown && 'WAN Outage · Internet Uplink Down or Supabase Cloud Gateway Unreachable'}
          </h2>
          <p className="text-xs mt-0.5 leading-relaxed opacity-90">
            {isHealthy &&
              `FingerTec TA500 (192.168.0.58) communicates smoothly over Ethernet through the Wi-Fi Repeater to the Samsung Galaxy Tab A9+ bridge daemon. Latest round-trip latency: ${liveLatency}ms.`}
            {isSlow &&
              'Biometric punch requests are experiencing elevated roundtrip response times (~480ms). Check for Wi-Fi interference on 2.4 GHz channel or background downloading on the local network.'}
            {isLanBroken &&
              'The physical Cat6 RJ45 cable between the FingerTec TA500 LAN port and the Wi-Fi Repeater is unplugged, loose, or severed. Biometrics terminal cannot transmit raw punch logs.'}
            {isWifiBroken &&
              'The Wi-Fi repeater has lost wireless connection to the office Wi-Fi router (SSID: JAPA_OFFICE_WLAN). Check repeater power socket and Wi-Fi signal indicator.'}
            {isBridgeDown &&
              'The background synchronization daemon (bridge.py v15.2) has stopped on the Samsung Galaxy Tab A9+. Open Termux and run: python sync-bridge/bridge.py to revive automatic polling.'}
            {isCloudDown &&
              'Local tablet is unable to resolve or reach the Supabase Cloud database in Singapore. New biometric punches will buffer safely in TA500 onboard flash memory until internet connectivity resumes.'}
          </p>
        </div>
      </div>

      {/* ── Visual Topology Architecture Diagram (Animated) ─────────── */}
      <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-xl overflow-hidden relative">
        {/* Background circuit grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
            <div>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-blue-400">
                PHYSICAL & LOGICAL TOPOLOGY DIAGRAM
              </span>
              <h2 className="text-lg font-black text-white">
                Live Biometric Data Propagation Path
              </h2>
            </div>
            <div className="text-xs text-slate-400 font-mono flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-1 bg-emerald-400 rounded-full" /> Normal Wire Flow
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-1 bg-amber-400 rounded-full" /> Latency / Slow
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-1 bg-rose-500 rounded-full" /> Severed / Fault
              </span>
            </div>
          </div>

          {/* Node Cards and Connector Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 lg:gap-6 relative items-center">
            {/* ── NODE 1: TA500 Biometric Machine ─────────────────────── */}
            <div
              onClick={() => setSelectedNode('ta500')}
              className={`cursor-pointer rounded-2xl p-4 transition-all relative border ${
                isLanBroken
                  ? 'bg-rose-950/40 border-rose-500/80 shadow-lg shadow-rose-900/30'
                  : 'bg-slate-900/90 border-slate-700/80 hover:border-blue-500 shadow-md'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Fingerprint className="w-6 h-6" />
                </span>
                <span
                  className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${
                    isLanBroken
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  {isLanBroken ? 'NO CARRIER' : 'READY'}
                </span>
              </div>
              <h3 className="text-sm font-black text-white">FingerTec TA500</h3>
              <p className="text-[11px] text-slate-400 font-mono">192.168.0.58:4370</p>
              <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between items-center">
                <span>Port: RJ45 LAN</span>
                <span className="font-mono text-emerald-400">UDP/ZKTeco</span>
              </div>
              {/* Pulsing indicator */}
              <div className="absolute -top-1.5 -right-1.5">
                <span className="relative flex h-3 w-3">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isLanBroken ? 'bg-rose-400' : 'bg-emerald-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      isLanBroken ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                  />
                </span>
              </div>
            </div>

            {/* ── WIRE 1 / CONNECTOR: TA500 -> REPEATER ──────────────── */}
            <div className="hidden md:flex flex-col items-center justify-center relative px-1">
              <span className="text-[9px] font-mono font-bold uppercase text-slate-400 mb-1 flex items-center gap-1">
                <Cable className="w-3 h-3 text-blue-400" /> Cat6 Wire
              </span>
              <div className="w-full h-3 bg-slate-900 rounded-full relative overflow-hidden border border-slate-800">
                {isLanBroken ? (
                  <div className="w-full h-full bg-rose-500/30 flex items-center justify-center text-[8px] font-black text-rose-400">
                    SEVERED ✕
                  </div>
                ) : (
                  <div
                    className={`h-full w-full ${
                      isSlow
                        ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-flow-dash-slow'
                        : 'bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-500 animate-flow-dash'
                    }`}
                    style={{
                      backgroundSize: '24px 24px',
                      backgroundImage:
                        'linear-gradient(45deg, rgba(255, 255, 255, 0.4) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.4) 50%, rgba(255, 255, 255, 0.4) 75%, transparent 75%, transparent)',
                    }}
                  />
                )}
              </div>
              <span className="text-[9px] font-mono text-slate-500 mt-1">100 Mbps Duplex</span>
            </div>

            {/* ── NODE 2: Wi-Fi Repeater / Extender ─────────────────────── */}
            <div
              onClick={() => setSelectedNode('repeater')}
              className={`cursor-pointer rounded-2xl p-4 transition-all relative border ${
                isWifiBroken || isLanBroken
                  ? 'bg-rose-950/40 border-rose-500/80 shadow-lg shadow-rose-900/30'
                  : 'bg-slate-900/90 border-slate-700/80 hover:border-blue-500 shadow-md'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
                  <Radio className="w-6 h-6" />
                </span>
                <span
                  className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${
                    isWifiBroken
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  {isWifiBroken ? 'DISCONNECTED' : 'BRIDGE ON'}
                </span>
              </div>
              <h3 className="text-sm font-black text-white">Wi-Fi Repeater</h3>
              <p className="text-[11px] text-slate-400 font-mono">192.168.0.254 (AP Bridge)</p>
              <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between items-center">
                <span>LAN ➔ Wi-Fi</span>
                <span className="font-mono text-purple-400">2.4 GHz 802.11n</span>
              </div>
            </div>

            {/* ── WIRE 2 / CONNECTOR: REPEATER -> TABLET (WIFI WAVES) ── */}
            <div className="hidden md:flex flex-col items-center justify-center relative px-1">
              <span className="text-[9px] font-mono font-bold uppercase text-slate-400 mb-1 flex items-center gap-1">
                {isWifiBroken ? (
                  <WifiOff className="w-3 h-3 text-rose-400" />
                ) : (
                  <Wifi className="w-3 h-3 text-cyan-400 animate-pulse" />
                )}
                WLAN Waves
              </span>
              <div className="w-full h-3 bg-slate-900 rounded-full relative overflow-hidden border border-slate-800">
                {isWifiBroken ? (
                  <div className="w-full h-full bg-rose-500/30 flex items-center justify-center text-[8px] font-black text-rose-400">
                    NO SIGNAL ✕
                  </div>
                ) : (
                  <div
                    className={`h-full w-full ${
                      isSlow
                        ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-flow-dash-slow'
                        : 'bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 animate-flow-dash'
                    }`}
                    style={{
                      backgroundSize: '24px 24px',
                      backgroundImage:
                        'linear-gradient(45deg, rgba(255, 255, 255, 0.4) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.4) 50%, rgba(255, 255, 255, 0.4) 75%, transparent 75%, transparent)',
                    }}
                  />
                )}
              </div>
              <span className="text-[9px] font-mono text-slate-500 mt-1">
                {isSlow ? 'High Jitter (~480ms)' : '72 Mbps Wireless'}
              </span>
            </div>

            {/* ── NODE 3: Samsung Galaxy Tab A9+ (Local Bridge Engine) ─── */}
            <div
              onClick={() => setSelectedNode('tablet')}
              className={`cursor-pointer rounded-2xl p-4 transition-all relative border ${
                isBridgeDown
                  ? 'bg-rose-950/40 border-rose-500/80 shadow-lg shadow-rose-900/30'
                  : 'bg-slate-900/90 border-slate-700/80 hover:border-blue-500 shadow-md'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="p-2 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
                  <Tablet className="w-6 h-6" />
                </span>
                <span
                  className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${
                    isBridgeDown
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  {isBridgeDown ? 'STOPPED' : 'SYNC v15.2'}
                </span>
              </div>
              <h3 className="text-sm font-black text-white">Samsung Tab A9+</h3>
              <p className="text-[11px] text-slate-400 font-mono">Termux Python Daemon</p>
              <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between items-center">
                <span>Poll: 60s Cycle</span>
                <span className="font-mono text-amber-400">Anti-Double: 5m</span>
              </div>
            </div>
          </div>

          {/* Cloud Uplink Beam */}
          <div className="my-6 flex items-center justify-center">
            <div className="w-full border-t border-dashed border-slate-800 relative flex items-center justify-center">
              <span className="bg-slate-950 px-4 py-1 text-xs font-mono font-bold text-slate-400 flex items-center gap-2 border border-slate-800 rounded-full">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>INTERNET WAN UPLINK ➔ SINGAPORE CLOUD REGION</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              </span>
            </div>
          </div>

          {/* Lower Row: Cloud DB & Enterprise Portal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
            {/* ── NODE 4: Supabase Cloud Database ────────────────────── */}
            <div
              onClick={() => setSelectedNode('supabase')}
              className={`cursor-pointer rounded-2xl p-4 transition-all relative border ${
                isCloudDown
                  ? 'bg-rose-950/40 border-rose-500/80 shadow-lg shadow-rose-900/30'
                  : 'bg-slate-900/90 border-slate-700/80 hover:border-blue-500 shadow-md'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                    <Database className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-white">Supabase Cloud Database</h3>
                    <p className="text-[11px] text-slate-400 font-mono">PostgreSQL 15 (Singapore ap-southeast-1)</p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-full border ${
                    isCloudDown
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  {isCloudDown ? 'DISCONNECTED' : 'CLOUD READY'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 text-center">
                <div className="bg-slate-950/60 p-2 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-medium uppercase">Total Punches</div>
                  <div className="text-sm font-black text-white font-mono">{totalRecords.toLocaleString()}</div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-medium uppercase">Roundtrip Ping</div>
                  <div className={`text-sm font-black font-mono ${isSlow ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {isCloudDown ? 'Timeout' : `${liveLatency} ms`}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-medium uppercase">Live Channel</div>
                  <div className="text-sm font-black text-cyan-400 font-mono">WebSocket</div>
                </div>
              </div>
            </div>

            {/* ── NODE 5: JAPA DTR Enterprise Portal ─────────────────── */}
            <div
              onClick={() => setSelectedNode('vercel')}
              className="cursor-pointer rounded-2xl p-4 transition-all relative border bg-slate-900/90 border-slate-700/80 hover:border-blue-500 shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                    <Globe className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-white">JAPA DTR Enterprise Portal</h3>
                    <p className="text-[11px] text-slate-400 font-mono">Vercel Global Edge Network</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-full border bg-blue-500/20 text-blue-300 border-blue-500/40">
                  ONLINE · LIVE
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 text-center">
                <div className="bg-slate-950/60 p-2 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-medium uppercase">Active Portal</div>
                  <div className="text-sm font-black text-white">Production</div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-medium uppercase">SSL Security</div>
                  <div className="text-sm font-black text-emerald-400">TLS 1.3</div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-medium uppercase">Engine</div>
                  <div className="text-sm font-black text-blue-400">Next.js 14</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Troubleshooting & Component Details Inspector ─────────── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          <span>Hardware & Infrastructure Reference Guide</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Fingerprint className="w-4 h-4 text-blue-600" />
              1. FingerTec TA500 Biometric Terminal
            </h4>
            <p>
              Connected via physical RJ45 Ethernet to the Wi-Fi Repeater. Configured with static IP <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">192.168.0.58</code> on UDP Port <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">4370</code>.
            </p>
            <p className="text-[11px] text-slate-500">
              💡 If unreachable: check if the LAN cable link light is blinking on both the TA500 and the repeater.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-purple-600" />
              2. Wi-Fi Repeater (Ethernet Bridge)
            </h4>
            <p>
              Bridges the TA500 Ethernet cable to the office 2.4 GHz wireless network (<code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">192.168.0.254</code>). Allows the biometric terminal to reside anywhere without running cables across the office.
            </p>
            <p className="text-[11px] text-slate-500">
              💡 If disconnected: verify the power LED and ensure the repeater is within good range of the Wi-Fi router.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Tablet className="w-4 h-4 text-amber-600" />
              3. Samsung Galaxy Tab A9+ (Bridge Engine)
            </h4>
            <p>
              Dedicated local tablet running Python Bridge Engine v15.2 via Termux. Polls the TA500 every 60 seconds, enforces the 5-minute anti-double tap shield, and pushes clean punches to Supabase.
            </p>
            <p className="text-[11px] text-slate-500">
              💡 If stopped: open Termux on the tablet and type <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">python sync-bridge/bridge.py</code>.
            </p>
          </div>
        </div>
      </div>

      {/* ── Recent Synced Punches Table ────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-black text-slate-900 text-sm uppercase tracking-wider">
              Live Biometric Ingestion Feed (Supabase)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time audit log of hardware punches synchronized from the FingerTec TA500
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-slate-500">
              Total Recorded: <span className="text-blue-600 font-black">{totalRecords.toLocaleString()}</span>
            </span>
            <span className="text-xs font-mono text-slate-400">
              Last Sync: {lastSync ? formatTs(lastSync) : 'Never'}
            </span>
          </div>
        </div>

        {!recentLogs || recentLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            No biometric sync activity recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Device User ID</th>
                  <th className="px-4 py-3">Biometric Punch Time</th>
                  <th className="px-4 py-3">Punch Classification</th>
                  <th className="px-4 py-3">Cloud Ingestion Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-slate-800">
                      #{log.device_user_id}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 font-semibold">
                      {formatTs(log.punch_time)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          PUNCH_STATUS_COLOR[log.status] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {PUNCH_STATUS[log.status] ?? `Status ${log.status}`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-[11px]">
                      {formatTs(log.synced_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
