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
  ShieldCheck,
  Lock,
  Sparkles,
  Cpu,
  HardDrive,
  Layers,
  ChevronRight,
  Eye,
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
  initialBridgeOnline?: boolean
  initialTa500Online?: boolean
  initialHeartbeatAgeSec?: number
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
  initialBridgeOnline = true,
  initialTa500Online = true,
  initialHeartbeatAgeSec = 0,
}: SyncClientProps) {
  const [scenario, setScenario] = useState<NetworkScenario>('healthy')
  const [selectedNode, setSelectedNode] = useState<string>('ta500')
  const [testingPing, setTestingPing] = useState(false)
  const [liveLatency, setLiveLatency] = useState<number>(42)
  const [totalRecords, setTotalRecords] = useState(initialTotalRecords)
  const [lastSync, setLastSync] = useState(initialLastSync)
  const [recentLogs, setRecentLogs] = useState<AttendanceLog[]>(initialRecentLogs)
  const [liveTime, setLiveTime] = useState<string>('')
  const [liveBridgeOnline, setLiveBridgeOnline] = useState<boolean>(initialBridgeOnline)
  const [liveTa500Online, setLiveTa500Online] = useState<boolean>(initialTa500Online)
  const [heartbeatAgeSec, setHeartbeatAgeSec] = useState<number>(initialHeartbeatAgeSec)

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
      if (json.bridge_online !== undefined) setLiveBridgeOnline(json.bridge_online)
      if (json.ta500_online !== undefined) setLiveTa500Online(json.ta500_online)
      if (json.heartbeat_age_sec !== undefined) setHeartbeatAgeSec(json.heartbeat_age_sec)
    } catch {
      setLiveLatency(Date.now() - t0)
    } finally {
      setTimeout(() => setTestingPing(false), 500)
    }
  }

  // Trigger immediate live ping on mount
  useEffect(() => {
    handleTestPing()
  }, [])

  // Auto-refresh real-time stats every 5s for snappy live status detection
  useEffect(() => {
    const interval = setInterval(() => {
      handleTestPing()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Status computation: manual scenario button override OR real-time live hardware detection!
  const isManualSim = scenario !== 'healthy'

  const isBridgeDown = isManualSim ? scenario === 'bridge_offline' : !liveBridgeOnline
  const isLanBroken = isManualSim ? scenario === 'lan_unplugged' : (!liveTa500Online && liveBridgeOnline)
  const isWifiBroken = isManualSim ? scenario === 'wifi_disconnected' : false
  const isSlow = isManualSim ? scenario === 'slow_network' : false
  const isCloudDown = isManualSim ? scenario === 'cloud_error' : false
  const isHealthy = isManualSim ? false : (liveBridgeOnline && liveTa500Online)

  // Selected node detailed specs metadata
  const nodeDetails: Record<
    string,
    {
      name: string
      subtitle: string
      type: string
      ip: string
      port: string
      protocol: string
      statusBadge: string
      statusColor: string
      specs: { label: string; value: string }[]
      diagnosticTitle: string
      diagnosticText: string
    }
  > = {
    ta500: {
      name: 'FingerTec TA500 Biometric Terminal',
      subtitle: 'Hardware Optical Time Attendance Terminal (Stand-Alone)',
      type: 'Physical Edge Biometric Sensor',
      ip: '192.168.0.58 (Static)',
      port: '4370 (UDP)',
      protocol: 'ZKTeco Standalone Push/Pull SDK',
      statusBadge: isLanBroken ? 'DISCONNECTED (NO CARRIER)' : 'READY & LOGGING',
      statusColor: isLanBroken ? 'rose' : 'emerald',
      specs: [
        { label: 'Firmware Engine', value: 'Ver 6.60 (Build 2024)' },
        { label: 'Sensor Technology', value: '500 DPI Optical Prism Sensor' },
        { label: 'Onboard Buffer', value: '100,000 Flash Punch Memory' },
        { label: 'Physical Interface', value: '10/100 Mbps RJ45 Auto-MDIX' },
        { label: 'Default Gateway', value: '192.168.0.1' },
        { label: 'Subnet Mask', value: '255.255.255.0' },
      ],
      diagnosticTitle: isLanBroken
        ? 'Physical Ethernet Disconnection'
        : 'Terminal Operating Normally',
      diagnosticText: isLanBroken
        ? 'The Cat6 cable connecting the TA500 to the Wi-Fi Repeater is disconnected or severed. Verify RJ45 clip integrity and confirm the Link LED is lit on the rear port.'
        : 'The terminal is actively capturing optical biometric scans and serving punch logs to the Samsung Tab A9+ bridge daemon on UDP 4370.',
    },
    repeater: {
      name: 'Wi-Fi Repeater & AP Ethernet Bridge',
      subtitle: 'Wireless-to-Ethernet Transparent Layer 2 Bridge',
      type: 'Local Wireless Network Interconnect',
      ip: '192.168.0.254 (AP Mode)',
      port: 'Bridge Layer 2 (802.11n)',
      protocol: 'IEEE 802.11b/g/n (2.4 GHz)',
      statusBadge: isWifiBroken
        ? 'WLAN DISCONNECTED'
        : isLanBroken
        ? 'LAN PORT UNLINKED'
        : 'BRIDGE OPERATIONAL',
      statusColor: isWifiBroken || isLanBroken ? 'rose' : 'purple',
      specs: [
        { label: 'Wi-Fi Band', value: '2.4 GHz Single-Band (Channel 6)' },
        { label: 'Wireless Security', value: 'WPA2-PSK (AES)' },
        { label: 'Ethernet Ports', value: '1x 100M Fast Ethernet RJ45' },
        { label: 'Antenna Config', value: 'Dual 2x2 MIMO 5dBi Omni' },
        { label: 'Bridge Mode', value: 'Client Infrastructure AP' },
        { label: 'Signal Quality', value: isWifiBroken ? '0 dBm (Lost)' : isSlow ? '-82 dBm (Weak)' : '-52 dBm (Strong)' },
      ],
      diagnosticTitle: isWifiBroken
        ? 'Wireless Link Dropped'
        : isSlow
        ? 'High Wireless Interference Detected'
        : 'Repeater Bridge Active',
      diagnosticText: isWifiBroken
        ? 'The repeater has lost Wi-Fi association with the office router. Re-seat the wall plug power adapter and check the WPS / Wi-Fi indicator LED.'
        : isSlow
        ? 'Elevated latency detected over the 2.4 GHz air interface. Check for channel congestion or physical obstructions between the repeater and tablet.'
        : 'The repeater transparently bridges the TA500 Ethernet port to the office Wi-Fi network without requiring physical Ethernet cabling through walls.',
    },
    tablet: {
      name: 'Samsung Galaxy Tab A9+ (Sync Bridge Host)',
      subtitle: 'Dedicated Android Bridge Hardware Running Termux Python Engine',
      type: 'Edge Ingestion & Anti-Double Tap Gateway',
      ip: '192.168.0.112 (WLAN Static Lease)',
      port: 'Loopback / HTTPS Uplink',
      protocol: 'Python 3.11 · bridge.py v15.3',
      statusBadge: isBridgeDown ? 'DAEMON TERMINATED' : 'ACTIVE POLLING (60s)',
      statusColor: isBridgeDown ? 'rose' : 'amber',
      specs: [
        { label: 'Platform & OS', value: 'Android 14 (One UI 6.0) · Termux' },
        { label: 'Processor', value: 'Qualcomm Snapdragon 695 5G' },
        { label: 'Polling Cadence', value: 'Every 60 seconds (Non-blocking)' },
        { label: 'Anti-Double Window', value: '5-Minute Debounce Filter' },
        { label: 'Ingestion Mode', value: 'Upsert with Composite Key Uniqueness' },
        { label: 'Failover Buffer', value: 'SQLite Local Shadow Queue' },
      ],
      diagnosticTitle: isBridgeDown
        ? 'Python Sync Daemon Offline'
        : 'Bridge Engine Running v15.3 (60s Direct Audit + 10m Rejuvenation)',
      diagnosticText: isBridgeDown
        ? 'The bridge process has been terminated. Open Termux on the tablet and type "python sync-bridge/bridge.py" to restart automatic synchronization.'
        : 'The bridge engine queries the TA500 every 60s, strips duplicated double-taps within 5 minutes, normalizes punch direction, and securely ships records to Supabase.',
    },
    supabase: {
      name: 'Supabase Cloud Database (Singapore)',
      subtitle: 'Managed PostgreSQL 15 Enterprise Cluster',
      type: 'Production Relational Cloud Database',
      ip: 'aws-0-ap-southeast-1.pooler.supabase.com',
      port: '5432 / 6543 (SSL Enforced)',
      protocol: 'PostgreSQL Wire Protocol + Realtime WS',
      statusBadge: isCloudDown ? 'GATEWAY TIMEOUT (504)' : 'CONNECTED · SYNCHRONIZED',
      statusColor: isCloudDown ? 'rose' : 'emerald',
      specs: [
        { label: 'Cloud Region', value: 'AWS Singapore (ap-southeast-1)' },
        { label: 'Database Engine', value: 'PostgreSQL 15.6 with pgvector' },
        { label: 'Total Punches Stored', value: `${totalRecords.toLocaleString()} Verified Records` },
        { label: 'Roundtrip Latency', value: isCloudDown ? 'Timeout' : `${liveLatency} ms` },
        { label: 'Replication Stream', value: 'Supabase Realtime (CDC WebSockets)' },
        { label: 'Row Level Security', value: 'Enabled with Service Role Bypass' },
      ],
      diagnosticTitle: isCloudDown
        ? 'Cloud Database Uplink Failure'
        : 'Database Healthy & Ingesting',
      diagnosticText: isCloudDown
        ? 'Internet uplink to Singapore cloud region is severed. All physical biometric punches remain preserved inside the TA500 hardware buffer and will backfill once online.'
        : 'The Supabase database cluster is receiving real-time biometric streams and instantly notifying connected browser clients via WebSocket subscriptions.',
    },
    vercel: {
      name: 'JAPA DTR Enterprise Portal (Vercel Edge)',
      subtitle: 'Next.js 14 Production Web Application',
      type: 'Global Edge Application Tier',
      ip: 'japa-dtr-system.vercel.app',
      port: '443 (HTTPS / TLS 1.3)',
      protocol: 'HTTP/2 + Edge Middleware',
      statusBadge: 'ONLINE · PRODUCTION',
      statusColor: 'indigo',
      specs: [
        { label: 'Edge Platform', value: 'Vercel Global Edge Network' },
        { label: 'Framework Engine', value: 'Next.js 14.2 (App Router)' },
        { label: 'Lead Architect', value: 'Gain Carlo Cayabyab' },
        { label: 'Security Transport', value: 'TLS 1.3 / HSTS 31536000' },
        { label: 'Calculation Policy', value: 'Dual Mode: Exact vs Standard Normalized' },
        { label: 'Build Status', value: 'Production Deployed (Clean)' },
      ],
      diagnosticTitle: 'Web Portal Operational',
      diagnosticText:
        'The web application delivers real-time attendance dashboards, biometric punch audits, DOLE-compliant payroll calculations, and Excel exports to authorized administrators.',
    },
  }

  const activeDetail = nodeDetails[selectedNode] || nodeDetails.ta500

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
                Sync Bridge Infrastructure &amp; Telemetry Monitor
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Physical biometric network topology &amp; real-time synchronization pipeline
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

      {/* ── Scenario / Simulation Selector (Light Theme) ────────────── */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Interactive Hardware &amp; Network Simulation
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline font-medium">
              Click any state below to simulate live hardware and wire fault reactions:
            </span>
          </div>
          <div className="text-[11px] font-mono font-bold text-slate-600 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy
                  ? 'bg-emerald-500 animate-ping'
                  : isSlow
                  ? 'bg-amber-500 animate-ping'
                  : 'bg-rose-500 animate-ping'
              }`}
            />
            <span>
              {isManualSim
                ? `SIMULATED: ${scenario.toUpperCase()}`
                : liveBridgeOnline && liveTa500Online
                ? 'LIVE HARDWARE: 100% OPERATIONAL'
                : !liveBridgeOnline
                ? 'LIVE: BRIDGE DAEMON OFFLINE'
                : 'LIVE: TA500 POWERED OFF'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          <button
            type="button"
            onClick={() => setScenario('healthy')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'healthy'
                ? 'bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/20 ring-2 ring-emerald-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 ${scenario === 'healthy' ? 'text-white' : 'text-emerald-600'}`} />
            <span>⚡ Live Auto-Detect</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('slow_network')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'slow_network'
                ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20 ring-2 ring-amber-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <AlertTriangle className={`w-4 h-4 ${scenario === 'slow_network' ? 'text-white' : 'text-amber-600'}`} />
            <span>🟡 High Latency</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('lan_unplugged')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'lan_unplugged'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/20 ring-2 ring-rose-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <Cable className={`w-4 h-4 ${scenario === 'lan_unplugged' ? 'text-white' : 'text-rose-600'}`} />
            <span>🔴 LAN Unplugged</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('wifi_disconnected')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'wifi_disconnected'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/20 ring-2 ring-rose-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <WifiOff className={`w-4 h-4 ${scenario === 'wifi_disconnected' ? 'text-white' : 'text-rose-600'}`} />
            <span>🔴 Wi-Fi Drop</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('bridge_offline')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'bridge_offline'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/20 ring-2 ring-rose-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <Tablet className={`w-4 h-4 ${scenario === 'bridge_offline' ? 'text-white' : 'text-rose-600'}`} />
            <span>🔴 Bridge Offline</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('cloud_error')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'cloud_error'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/20 ring-2 ring-rose-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <Cloud className={`w-4 h-4 ${scenario === 'cloud_error' ? 'text-white' : 'text-rose-600'}`} />
            <span>🔴 Cloud/WAN Out</span>
          </button>
        </div>
      </div>

      {/* ── Active Status Alert Banner ─────────────────────────────────── */}
      <div
        className={`p-4 rounded-2xl border transition-all flex items-start gap-3 shadow-sm ${
          isHealthy
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : isSlow
            ? 'bg-amber-50 border-amber-200 text-amber-950'
            : 'bg-rose-50 border-rose-200 text-rose-950'
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
            {isHealthy && (isManualSim ? 'Operational · All Biometric Nodes Synchronized' : 'Live Pipeline 100% Operational · All Hardware Synchronized')}
            {isSlow && 'Performance Advisory · Elevated Latency / Wireless Jitter Detected'}
            {isLanBroken && (isManualSim ? 'Hardware Fault · RJ45 Ethernet Disconnected from FingerTec TA500' : 'Live Hardware Advisory · FingerTec TA500 Powered Off or Unreachable')}
            {isWifiBroken && 'Wireless Link Severed · Wi-Fi Repeater Lost 2.4 GHz Association'}
            {isBridgeDown && (isManualSim ? 'Daemon Inactive · Termux Python Sync Engine Stopped on Tablet' : 'Live Daemon Offline · Samsung Tab A9+ Bridge Inactive')}
            {isCloudDown && 'WAN Outage · Supabase Singapore Cloud Database Unreachable'}
          </h2>
          <p className="text-xs mt-0.5 leading-relaxed opacity-90 font-medium">
            {isHealthy &&
              (isManualSim
                ? `FingerTec TA500 (192.168.0.58) communicates cleanly over physical Cat6 Ethernet through the Wi-Fi Repeater to the Samsung Tab A9+ bridge daemon. Latest roundtrip latency: ${liveLatency}ms.`
                : `FingerTec TA500 (192.168.0.58) is online and responding. Samsung Tab A9+ bridge v15.3 heartbeat active (${heartbeatAgeSec}s ago). Cloud roundtrip latency: ${liveLatency}ms.`)}
            {isSlow &&
              'Biometric query packet roundtrip is elevated (~480ms). Check for 2.4 GHz Wi-Fi channel congestion or physical obstructions between the repeater and tablet.'}
            {isLanBroken &&
              (isManualSim
                ? 'The physical Cat6 RJ45 patch cable between the FingerTec TA500 LAN port and the Wi-Fi Repeater is unplugged, loose, or severed. Re-insert the cable firmly.'
                : 'The Samsung Tab A9+ bridge daemon is running, but cannot reach FingerTec TA500 at 192.168.0.58:4370. Verify the TA500 power adapter is switched ON and the Cat6 LAN cable is securely plugged into the Wi-Fi repeater.')}
            {isWifiBroken &&
              'The Wi-Fi Repeater has lost connection to the office Wi-Fi router. Verify the wall socket power LED and ensure the repeater is within range.'}
            {isBridgeDown &&
              (isManualSim
                ? 'The synchronization daemon (bridge.py v15.3) has terminated on the Samsung Tab A9+. Open Termux and execute: "python sync-bridge/tablet_bridge.py".'
                : `No live heartbeat received from the bridge daemon in ${heartbeatAgeSec}s. Turn on the Samsung Galaxy Tab A9+, open Termux, and execute: "python sync-bridge/tablet_bridge.py".`)}
            {isCloudDown &&
              'Local tablet cannot reach Supabase in Singapore. New biometric punches remain securely buffered in TA500 onboard flash memory and will sync upon reconnection.'}
          </p>
        </div>
      </div>

      {/* ── Visual Topology Architecture Diagram (Light Theme 3D/2D Visual) ──────── */}
      <div
        className="rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden relative"
        style={{
          background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 45%, #f1f5f9 100%)',
        }}
      >
        {/* Subtle technical grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle, #cbd5e1 1px, transparent 1px), linear-gradient(to right, #f1f5f9 1px, transparent 1px)',
            backgroundSize: '24px 24px, 48px 48px',
          }}
        />

        {/* Top vibrant gradient accent line */}
        <div
          className="h-1.5 w-full"
          style={{
            background: 'linear-gradient(90deg, #2563eb, #8b5cf6, #06b6d4, #10b981, #f59e0b, #3b82f6)',
          }}
        />

        <div className="relative z-10 p-5 sm:p-7">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                Physical Hardware &amp; Logical Topology
              </span>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Live Biometric Data Propagation Path
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Click any device below to inspect live hardware specs, network ports &amp; diagnostic telemetry
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <span className="w-3 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Normal Wire Flow
              </span>
              <span className="flex items-center gap-1.5 text-amber-700">
                <span className="w-3 h-1.5 rounded-full bg-amber-500" />
                High Latency
              </span>
              <span className="flex items-center gap-1.5 text-rose-700">
                <span className="w-3 h-1.5 rounded-full bg-rose-500" />
                Fault / Severed
              </span>
            </div>
          </div>

          {/* ── 3D PHYSICAL HARDWARE DIAGRAM ROW (LOCAL EDGE TIER WITH CONNECTING LINES) ───────── */}
          <div className="relative mb-0">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-0 relative">

              {/* ════════════ NODE 1: FINGERTEC TA500 (3D BIOMETRIC MACHINE) ════════════ */}
              <div
                onClick={() => setSelectedNode('ta500')}
                className={`group cursor-pointer rounded-2xl p-4 sm:p-5 transition-all duration-300 relative overflow-hidden border-2 flex-1 min-w-0 flex flex-col justify-between ${
                  selectedNode === 'ta500'
                    ? 'ring-2 ring-blue-500 shadow-xl border-blue-400 bg-white'
                    : 'bg-white/95 hover:bg-white hover:shadow-lg border-slate-200/90'
                }`}
                style={{
                  boxShadow:
                    selectedNode === 'ta500'
                      ? '0 12px 30px -5px rgba(37,99,235,0.20), 0 4px 10px rgba(0,0,0,0.05)'
                      : '0 8px 24px -5px rgba(0,0,0,0.06)',
                }}
              >
                {/* Right Docking Collar (Continuous Physical Attachment) */}
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-slate-800 rounded-r border-y border-r border-slate-600 z-30 hidden lg:block" />

                {/* 3D Hardware Device Casing Mockup */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      DEVICE #1 · BIOMETRIC TERMINAL
                    </span>
                    <span
                      className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${
                        isLanBroken
                          ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse'
                          : isBridgeDown
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {isLanBroken
                        ? (isManualSim ? '✕ LAN UNPLUGGED' : '✕ POWER OFF / NO LINK')
                        : isBridgeDown
                        ? '⚠️ BRIDGE OFFLINE'
                        : '● READY (UDP 4370)'}
                    </span>
                  </div>

                  {/* Visual 3D Chassis Representation */}
                  <div className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-xl p-3 border-2 border-slate-700 text-white shadow-inner relative overflow-hidden mb-3">
                    {/* Screen Section */}
                    <div className="bg-slate-950 rounded-lg p-2.5 border border-cyan-500/30 font-mono text-[11px] mb-2.5 relative">
                      <div className="flex items-center justify-between text-[9px] text-cyan-400 border-b border-slate-800 pb-1 mb-1.5">
                        <span className={`font-bold ${isLanBroken ? 'text-rose-400' : 'text-cyan-400'}`}>TA500 TFT 2.8&quot;</span>
                        <span className="text-slate-400">{isLanBroken ? 'OFFLINE' : liveTime || '15:00:00'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isLanBroken
                              ? 'bg-rose-500'
                              : isBridgeDown
                              ? 'bg-amber-400'
                              : 'bg-emerald-400 animate-ping'
                          }`}
                        />
                        <span className={`font-bold ${isLanBroken ? 'text-rose-300' : isBridgeDown ? 'text-amber-300' : 'text-white'}`}>
                          {isLanBroken
                            ? (isManualSim ? 'NO LAN CARRIER' : 'DEVICE POWERED OFF')
                            : isBridgeDown
                            ? 'WAITING FOR BRIDGE...'
                            : 'SCAN FINGER / CARD'}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-400 mt-1 flex justify-between">
                        <span>IP: 192.168.0.58</span>
                        <span className={isLanBroken ? 'text-rose-400 font-bold' : 'text-cyan-300'}>
                          {isLanBroken ? 'PORT CLOSED' : 'UDP: 4370'}
                        </span>
                      </div>
                    </div>

                    {/* Sensor & Keypad Row */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      {/* Optical Fingerprint Scanner Prism with Laser Scan Beam */}
                      <div
                        className={`relative w-14 h-16 rounded-lg border-2 flex items-center justify-center overflow-hidden shadow-inner ${
                          isLanBroken
                            ? 'bg-slate-950 border-slate-700'
                            : 'bg-emerald-950/80 border-emerald-500/60'
                        }`}
                      >
                        <Fingerprint
                          className={`w-9 h-9 ${
                            isLanBroken ? 'text-slate-600 opacity-40' : 'text-emerald-400 opacity-70'
                          }`}
                        />
                        {/* Animated Laser Beam (Active only when device is alive) */}
                        {!isLanBroken && (
                          <div
                            className="absolute left-0 right-0 h-0.5 bg-emerald-300 shadow-[0_0_8px_#34d399] animate-laser-scan"
                          />
                        )}
                      </div>

                      {/* Silicone Keypad Matrix Representation */}
                      <div className="grid grid-cols-3 gap-1 flex-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
                          <div
                            key={k}
                            className="h-3.5 bg-slate-700/80 rounded-sm flex items-center justify-center text-[8px] font-mono text-slate-300"
                          >
                            {k}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* RJ45 Port Cutaway on Bottom Left */}
                    <div className="mt-2.5 pt-2 border-t border-slate-700/80 flex items-center justify-between text-[9px] font-mono">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Cable className="w-3 h-3 text-blue-400" />
                        RJ45 LAN Socket
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">LEDs:</span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isLanBroken ? 'bg-slate-700' : 'bg-emerald-400 shadow-[0_0_6px_#10b981]'
                          }`}
                          title="Link LED"
                        />
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isLanBroken ? 'bg-slate-700' : 'bg-amber-400 animate-pulse'
                          }`}
                          title="Activity LED"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-900">FingerTec TA500</h3>
                    <p className="text-xs text-slate-500 font-medium">Stand-alone Biometric Timekeeper</p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-slate-500 font-bold">192.168.0.58</span>
                  <span className="text-[10px] font-bold text-blue-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                    Inspect Specs <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>

              {/* ── CONNECTOR 1: CAT6 ETHERNET PHYSICAL BRIDGE (DESKTOP EDGE-TO-EDGE) ── */}
              <div className="hidden lg:flex items-center shrink-0 w-16 xl:w-24 relative z-20">
                <div className="w-full h-4 relative flex items-center justify-center">
                  <div
                    className={`w-full h-full ${
                      isLanBroken
                        ? 'bg-rose-100 border-rose-300'
                        : 'bg-slate-900 border-slate-700 shadow-sm'
                    } border-y relative overflow-hidden`}
                  >
                    {isLanBroken ? (
                      <div className="w-full h-full bg-rose-500/20 flex items-center justify-center text-[7px] font-black text-rose-600 tracking-wider">
                        {isManualSim ? 'SEVERED' : 'POWER OFF'}
                      </div>
                    ) : (
                      <>
                        <div
                          className={`h-full w-full ${
                            isSlow
                              ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-pipe-flow-slow'
                              : 'bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-400 animate-pipe-flow'
                          }`}
                          style={{
                            backgroundImage:
                              'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.7) 0, rgba(255, 255, 255, 0.7) 8px, transparent 8px, transparent 16px)',
                          }}
                        />
                        <div className="absolute top-0 bottom-0 w-8 bg-white/80 blur-[2px] animate-packet-pulse pointer-events-none" />
                      </>
                    )}
                  </div>

                  <div className="absolute -top-6 flex flex-col items-center pointer-events-none">
                    <span
                      className={`text-[8px] font-mono font-black uppercase px-2 py-0.5 rounded-full border shadow-xs whitespace-nowrap ${
                        isLanBroken
                          ? 'bg-rose-100 text-rose-700 border-rose-300 animate-pulse'
                          : isSlow
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-blue-600 text-white border-blue-700'
                      }`}
                    >
                      {isLanBroken ? '✕ UNPLUGGED' : 'Cat6 RJ45 ➔ 100 Mbps'}
                    </span>
                  </div>
                  <div className="absolute -bottom-5 flex flex-col items-center pointer-events-none">
                    <span className="text-[8px] font-mono font-bold text-slate-500 whitespace-nowrap">
                      Port 4370 UDP
                    </span>
                  </div>
                </div>
              </div>

              {/* ── CONNECTOR 1: MOBILE VERTICAL BRIDGE (EDGE-TO-EDGE) ── */}
              <div className="flex lg:hidden flex-col items-center justify-center py-1">
                <div className="w-5 h-1.5 bg-slate-800 rounded-b border-x border-b border-slate-600" />
                <div
                  className={`w-3.5 h-8 relative overflow-hidden border-x ${
                    isLanBroken
                      ? 'bg-rose-100 border-rose-300'
                      : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  {!isLanBroken && (
                    <div
                      className="w-full h-full bg-gradient-to-b from-blue-500 to-cyan-400 animate-pipe-flow-v"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(45deg, rgba(255,255,255,0.7) 0, rgba(255,255,255,0.7) 8px, transparent 8px, transparent 16px)',
                      }}
                    />
                  )}
                </div>
                <div className="w-5 h-1.5 bg-slate-800 rounded-t border-x border-t border-slate-600" />
                <span className="text-[8px] font-mono font-bold px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200 mt-1 shadow-xs">
                  {isLanBroken ? '✕ Cat6 Cable Severed' : '▼ Cat6 RJ45 (100 Mbps)'}
                </span>
              </div>

              {/* ════════════ NODE 2: WI-FI REPEATER (AP BRIDGE) ════════════ */}
              <div
                onClick={() => setSelectedNode('repeater')}
                className={`group cursor-pointer rounded-2xl p-4 sm:p-5 transition-all duration-300 relative overflow-hidden border-2 flex-1 min-w-0 flex flex-col justify-between ${
                  selectedNode === 'repeater'
                    ? 'ring-2 ring-purple-500 shadow-xl border-purple-400 bg-white'
                    : 'bg-white/95 hover:bg-white hover:shadow-lg border-slate-200/90'
                }`}
                style={{
                  boxShadow:
                    selectedNode === 'repeater'
                      ? '0 12px 30px -5px rgba(139,92,246,0.20), 0 4px 10px rgba(0,0,0,0.05)'
                      : '0 8px 24px -5px rgba(0,0,0,0.06)',
                }}
              >
                {/* Left & Right Docking Collars (Continuous Physical Attachment) */}
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-slate-800 rounded-l border-y border-l border-slate-600 z-30 hidden lg:block" />
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-purple-900 rounded-r border-y border-r border-purple-600 z-30 hidden lg:block" />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      DEVICE #2 · ETHERNET &amp; WI-FI REPEATER
                    </span>
                    <span
                      className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${
                        isWifiBroken || isLanBroken
                          ? 'bg-rose-50 text-rose-600 border-rose-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}
                    >
                      {isWifiBroken
                        ? '✕ NO WI-FI'
                        : isLanBroken
                        ? '✕ NO LAN INPUT'
                        : '● BRIDGE ON (AP)'}
                    </span>
                  </div>

                  {/* 3D Cat6 Cable Inflow Graphic with Luminous Animated Loading Effect */}
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-700/80 mb-3 shadow-inner relative overflow-hidden">
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-2">
                      <span className="text-cyan-400 flex items-center gap-1.5">
                        <Cable className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                        <span>Cat6 RJ45 Input Cable</span>
                      </span>
                      <span
                        className={`text-[9px] font-mono font-black uppercase flex items-center gap-1.5 ${
                          isLanBroken
                            ? 'text-rose-400'
                            : isSlow
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isLanBroken ? 'bg-rose-500' : 'bg-emerald-400 animate-ping'
                          }`}
                        />
                        {isLanBroken ? 'NO INCOMING SIGNAL' : '100 Mbps Duplex Ingesting'}
                      </span>
                    </div>

                    {/* Active Cyber Cable Loading Pipeline */}
                    <div className="relative flex items-center gap-1">
                      {/* 8-Pin RJ45 Gold Contact Head Mockup */}
                      <div className="shrink-0 flex flex-col gap-0.5 p-1 bg-slate-900 border border-slate-700 rounded shadow-xs">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((pin) => (
                            <div
                              key={pin}
                              className={`w-1 h-2 rounded-[1px] ${
                                isLanBroken ? 'bg-slate-700' : 'bg-amber-400 shadow-[0_0_3px_#fbbf24]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Flowing Data Conduit Track */}
                      <div className="flex-1 h-5 rounded-full bg-slate-900 border border-cyan-500/40 p-0.5 overflow-hidden relative shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                        {isLanBroken ? (
                          <div className="w-full h-full rounded-full bg-rose-950/60 flex items-center justify-center text-[8px] font-mono font-black text-rose-400 tracking-wider">
                            PORT OFFLINE · NO CARRIER
                          </div>
                        ) : (
                          <>
                            <div
                              className={`h-full w-full rounded-full ${
                                isSlow
                                  ? 'bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 animate-pipe-flow-slow'
                                  : 'bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-400 animate-pipe-flow'
                              }`}
                              style={{
                                backgroundImage:
                                  'repeating-linear-gradient(45deg, rgba(255,255,255,0.75) 0, rgba(255,255,255,0.75) 10px, transparent 10px, transparent 20px)',
                              }}
                            />
                            {/* Luminous Traveling Light Packet */}
                            <div className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white to-transparent opacity-90 animate-packet-pulse pointer-events-none" />
                            {/* Continuous Glass Shimmer */}
                            <div className="absolute inset-0 w-full h-full shimmer-line pointer-events-none" />
                          </>
                        )}
                      </div>
                    </div>

                    {/* Active Telemetry Sub-row */}
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80">
                      <span>Wire: STP 4-Pair 24AWG</span>
                      <span className={isLanBroken ? 'text-rose-400 font-bold' : 'text-cyan-300 font-bold'}>
                        {isLanBroken ? 'Link State: DOWN' : 'UDP Port: 4370 · Flow: Active'}
                      </span>
                    </div>
                  </div>

                  {/* 3D Repeater Hardware Chassis with Twin Antennas */}
                  <div className="bg-gradient-to-b from-slate-100 to-white rounded-xl p-3 border-2 border-slate-300 shadow-sm relative">
                    {/* Twin Antennas */}
                    <div className="flex justify-between px-4 -mt-6 mb-1">
                      <div className="w-1.5 h-6 bg-slate-400 rounded-t-sm shadow" />
                      <div className="w-1.5 h-6 bg-slate-400 rounded-t-sm shadow" />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-purple-100 text-purple-700 border border-purple-200">
                          {isWifiBroken ? (
                            <WifiOff className="w-5 h-5 text-rose-600" />
                          ) : (
                            <Radio className="w-5 h-5 animate-pulse" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-black text-slate-800">AP Bridge Unit</div>
                          <div className="text-[10px] text-slate-500 font-mono">192.168.0.254</div>
                        </div>
                      </div>

                      {/* Signal LED Meter */}
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[9px] font-mono text-slate-500 font-bold">2.4 GHz</span>
                        <div className="flex items-end gap-0.5 h-4">
                          <span
                            className={`w-1 rounded-sm ${
                              isWifiBroken
                                ? 'h-1.5 bg-slate-300'
                                : 'h-1.5 bg-emerald-500'
                            }`}
                          />
                          <span
                            className={`w-1 rounded-sm ${
                              isWifiBroken
                                ? 'h-2 bg-slate-300'
                                : isSlow
                                ? 'h-2 bg-amber-400'
                                : 'h-2 bg-emerald-500'
                            }`}
                          />
                          <span
                            className={`w-1 rounded-sm ${
                              isWifiBroken || isSlow
                                ? 'h-3 bg-slate-300'
                                : 'h-3 bg-emerald-500'
                            }`}
                          />
                          <span
                            className={`w-1 rounded-sm ${
                              isWifiBroken || isSlow
                                ? 'h-4 bg-slate-300'
                                : 'h-4 bg-emerald-500'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <h3 className="text-sm font-black text-slate-900">Wi-Fi Repeater</h3>
                    <p className="text-xs text-slate-500 font-medium">Physical LAN to Wireless AP Bridge</p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-slate-500 font-bold">802.11n · 2.4 GHz</span>
                  <span className="text-[10px] font-bold text-purple-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                    Inspect Specs <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>

              {/* ── CONNECTOR 2: WIRELESS 2.4 GHz WLAN CORRIDOR (DESKTOP EDGE-TO-EDGE) ── */}
              <div className="hidden lg:flex items-center shrink-0 w-16 xl:w-24 relative z-20">
                <div className="w-full h-4 relative flex items-center justify-center">
                  <div
                    className={`w-full h-full ${
                      isWifiBroken
                        ? 'bg-rose-100 border-rose-300'
                        : 'bg-purple-950 border-purple-800 shadow-sm'
                    } border-y relative overflow-hidden`}
                  >
                    {isWifiBroken ? (
                      <div className="w-full h-full bg-rose-500/20 flex items-center justify-center text-[7px] font-black text-rose-600 tracking-wider">
                        DROPPED
                      </div>
                    ) : (
                      <>
                        <div
                          className={`h-full w-full ${
                            isSlow
                              ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-pipe-flow-slow'
                              : 'bg-gradient-to-r from-purple-600 via-indigo-500 to-cyan-400 animate-pipe-flow'
                          }`}
                          style={{
                            backgroundImage:
                              'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.7) 0, rgba(255, 255, 255, 0.7) 8px, transparent 8px, transparent 16px)',
                          }}
                        />
                        <div className="absolute top-0 bottom-0 w-8 bg-white/80 blur-[2px] animate-packet-pulse pointer-events-none" />
                      </>
                    )}
                  </div>

                  <div className="absolute -top-6 flex flex-col items-center pointer-events-none">
                    <span
                      className={`text-[8px] font-mono font-black uppercase px-2 py-0.5 rounded-full border shadow-xs whitespace-nowrap ${
                        isWifiBroken
                          ? 'bg-rose-100 text-rose-700 border-rose-300 animate-pulse'
                          : isSlow
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-purple-600 text-white border-purple-700'
                      }`}
                    >
                      {isWifiBroken ? '✕ NO SIGNAL' : '2.4 GHz Wi-Fi ➔'}
                    </span>
                  </div>
                  <div className="absolute -bottom-5 flex flex-col items-center pointer-events-none">
                    <span className="text-[8px] font-mono font-bold text-slate-500 whitespace-nowrap">
                      {isWifiBroken ? 'Disconnected' : isSlow ? '-82 dBm Jitter' : '-52 dBm Stable'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── CONNECTOR 2: MOBILE VERTICAL BRIDGE (EDGE-TO-EDGE) ── */}
              <div className="flex lg:hidden flex-col items-center justify-center py-1">
                <div className="w-5 h-1.5 bg-purple-900 rounded-b border-x border-b border-purple-700" />
                <div
                  className={`w-3.5 h-8 relative overflow-hidden border-x ${
                    isWifiBroken
                      ? 'bg-rose-100 border-rose-300'
                      : 'bg-purple-950 border-purple-800'
                  }`}
                >
                  {!isWifiBroken && (
                    <div
                      className="w-full h-full bg-gradient-to-b from-purple-500 to-amber-400 animate-pipe-flow-v"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(45deg, rgba(255,255,255,0.7) 0, rgba(255,255,255,0.7) 8px, transparent 8px, transparent 16px)',
                      }}
                    />
                  )}
                </div>
                <div className="w-5 h-1.5 bg-purple-900 rounded-t border-x border-t border-purple-700" />
                <span className="text-[8px] font-mono font-bold px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200 mt-1 shadow-xs">
                  {isWifiBroken ? '✕ Wi-Fi Link Dropped' : '▼ 2.4 GHz WLAN (-52 dBm)'}
                </span>
              </div>

              {/* ════════════ NODE 3: SAMSUNG GALAXY TAB A9+ (BRIDGE ENGINE) ════════════ */}
              <div
                onClick={() => setSelectedNode('tablet')}
                className={`group cursor-pointer rounded-2xl p-4 sm:p-5 transition-all duration-300 relative overflow-hidden border-2 flex-1 min-w-0 flex flex-col justify-between ${
                  selectedNode === 'tablet'
                    ? 'ring-2 ring-amber-500 shadow-xl border-amber-400 bg-white'
                    : 'bg-white/95 hover:bg-white hover:shadow-lg border-slate-200/90'
                }`}
                style={{
                  boxShadow:
                    selectedNode === 'tablet'
                      ? '0 12px 30px -5px rgba(245,158,11,0.20), 0 4px 10px rgba(0,0,0,0.05)'
                      : '0 8px 24px -5px rgba(0,0,0,0.06)',
                }}
              >
                {/* Left & Bottom Docking Collars (Continuous Physical Attachment) */}
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-amber-900 rounded-l border-y border-l border-amber-600 z-30 hidden lg:block" />
                <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-slate-800 rounded-b border-x border-b border-slate-600 z-30 hidden lg:block" />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      DEVICE #3 · LOCAL BRIDGE HOST
                    </span>
                    <span
                      className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${
                        isBridgeDown
                          ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {isBridgeDown ? '✕ DAEMON STOPPED' : '● BRIDGE v15.3 ACTIVE'}
                    </span>
                  </div>

                  {/* 3D Tablet Frame with Termux Terminal Screen */}
                  <div className="bg-gradient-to-b from-slate-300 via-slate-200 to-slate-400 rounded-xl p-2 border-2 border-slate-400 shadow-sm mb-3">
                    {/* Camera pinhole */}
                    <div className="flex justify-center mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                    </div>

                    {/* Dark Terminal Screen running bridge.py */}
                    <div className="bg-slate-950 rounded-lg p-2.5 font-mono text-[10px] text-slate-200 border border-slate-800 leading-relaxed shadow-inner">
                      <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1 mb-1.5 text-[9px]">
                        <span className="flex items-center gap-1 text-amber-400 font-bold">
                          <Terminal className="w-3 h-3" /> Termux · python tablet_bridge.py
                        </span>
                        <span>v15.3</span>
                      </div>
                      {isBridgeDown ? (
                        <div className="text-rose-400 font-bold py-1">
                          [CRITICAL] Process terminated (SIGTERM)
                          <br />
                          {heartbeatAgeSec > 0 && heartbeatAgeSec < 9000
                            ? `Last heartbeat: ${heartbeatAgeSec}s ago. Termux suspended.`
                            : 'Daemon stopped. No polling active.'}
                        </div>
                      ) : (
                        <div>
                          <div className="text-emerald-400">
                            [INFO] Polling 192.168.0.58:4370... OK
                          </div>
                          <div className="text-cyan-300">
                            [AUDIT] 60s Direct Flash Check Active
                          </div>
                          <div className="text-slate-400 text-[9px]">
                            [HEARTBEAT] {heartbeatAgeSec}s ago · 10m Rejuvenation Active
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-900">Samsung Galaxy Tab A9+</h3>
                    <p className="text-xs text-slate-500 font-medium">Local Python Synchronization Bridge Daemon</p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-slate-500 font-bold">Termux · Python 3.11</span>
                  <span className="text-[10px] font-bold text-amber-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                    Inspect Specs <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── CONNECTOR 3: VERTICAL WAN UPLINK PIPE (DIRECT ATTACHMENT FROM TABLET TO WAN BEAM) ── */}
          <div className="hidden lg:grid grid-cols-3 relative">
            <div />
            <div />
            {/* Directly beneath Column 3 (Samsung Tab A9+) */}
            <div className="flex flex-col items-center relative">
              <div className="w-3.5 h-10 relative flex items-center justify-center">
                <div className="w-full h-full bg-slate-900 border-x border-slate-700 relative overflow-hidden shadow-sm">
                  <div
                    className={`w-full h-full ${
                      isBridgeDown
                        ? 'bg-rose-500'
                        : isCloudDown
                        ? 'bg-slate-500'
                        : isSlow
                        ? 'bg-gradient-to-b from-amber-500 via-amber-300 to-amber-500 animate-pipe-flow-v-slow'
                        : 'bg-gradient-to-b from-amber-500 via-blue-500 to-indigo-600 animate-pipe-flow-v'
                    }`}
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgba(255,255,255,0.7) 0, rgba(255,255,255,0.7) 8px, transparent 8px, transparent 16px)',
                    }}
                  />
                  {!isBridgeDown && (
                    <div className="absolute inset-x-0 h-6 bg-white/80 blur-[2px] animate-packet-pulse-v pointer-events-none" />
                  )}
                </div>

                {/* Attached side badge */}
                <div className="absolute left-5 whitespace-nowrap pointer-events-none z-10">
                  <span
                    className={`text-[8px] font-mono font-bold px-2 py-0.5 rounded-full border shadow-xs ${
                      isBridgeDown
                        ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                        : 'bg-slate-900 text-white border-slate-700'
                    }`}
                  >
                    ▼ Local Ingestion Stream (HTTPS / TLS 1.3)
                  </span>
                </div>
              </div>
              {/* Docking collar touching WAN top border */}
              <div className="w-6 h-2 bg-slate-800 border-x border-t border-slate-600 rounded-t shrink-0" />
            </div>
          </div>

          {/* Mobile Vertical Connector */}
          <div className="flex lg:hidden flex-col items-center justify-center py-1">
            <div className="w-5 h-1.5 bg-amber-900 rounded-b border-x border-b border-amber-700" />
            <div className="w-3.5 h-8 bg-slate-900 border-x border-slate-700 overflow-hidden relative">
              <div
                className="w-full h-full bg-gradient-to-b from-amber-500 to-indigo-600 animate-pipe-flow-v"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(255,255,255,0.7) 0, rgba(255,255,255,0.7) 8px, transparent 8px, transparent 16px)',
                }}
              />
            </div>
            <div className="w-5 h-1.5 bg-slate-800 rounded-t border-x border-t border-slate-600" />
            <span className="text-[8px] font-mono font-bold px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full border border-slate-300 mt-1 shadow-xs">
              ▼ Local Ingestion Stream (HTTPS / TLS 1.3)
            </span>
          </div>

          {/* ── CLOUD UPLINK BEAM (HIGH-SPEED WAN PIPELINE CONTINUOUS BUS) ─────────────── */}
          <div className="relative my-0 z-10">
            <div className="w-full h-3.5 bg-slate-900 rounded-full border border-slate-700 shadow-md relative overflow-hidden flex items-center justify-center">
              <div
                className={`w-full h-full ${
                  isCloudDown
                    ? 'bg-rose-900'
                    : isSlow
                    ? 'bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 animate-pipe-flow-slow'
                    : 'bg-gradient-to-r from-emerald-500 via-cyan-400 via-indigo-500 to-purple-600 animate-pipe-flow'
                }`}
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0, rgba(255,255,255,0.6) 8px, transparent 8px, transparent 16px)',
                }}
              />
            </div>

            {/* Central WAN Pill Badge */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`px-3 sm:px-4 py-1 rounded-full text-[11px] font-mono font-bold flex items-center gap-2 border shadow-lg ${
                  isCloudDown
                    ? 'bg-rose-900 text-white border-rose-700 animate-pulse'
                    : 'bg-slate-950 text-cyan-300 border-cyan-500/60'
                }`}
              >
                <Globe className={`w-3.5 h-3.5 ${isCloudDown ? 'text-rose-400' : 'text-cyan-400 animate-spin'}`} style={{ animationDuration: '8s' }} />
                <span>INTERNET WAN UPLINK ➔ SINGAPORE CLOUD REGION</span>
                <ArrowRight className="w-3 h-3 text-slate-400 hidden sm:inline" />
                <span
                  className={`font-mono font-black px-2 py-0.5 rounded text-[10px] ${
                    isCloudDown
                      ? 'bg-rose-800 text-white'
                      : isSlow
                      ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                  }`}
                >
                  {isCloudDown ? 'LINK DOWN' : `${liveLatency} ms RTT`}
                </span>
              </div>
            </div>
          </div>

          {/* ── CONNECTOR 4: BRANCHING DOWNWARD PIPELINES (SEAMLESSLY DOCKING TO CLOUD CARDS) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative">
            {/* Col 1 vertical conduit down to Supabase */}
            <div className="flex flex-col items-center">
              <div className="w-6 h-2 bg-slate-800 border-x border-b border-slate-600 rounded-b shrink-0" />
              <div className="w-3.5 h-8 relative flex items-center justify-center">
                <div className="w-full h-full bg-slate-900 border-x border-slate-700 relative overflow-hidden shadow-sm">
                  <div
                    className={`w-full h-full ${
                      isCloudDown
                        ? 'bg-rose-500'
                        : 'bg-gradient-to-b from-cyan-400 to-emerald-500 animate-pipe-flow-v'
                    }`}
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgba(255,255,255,0.7) 0, rgba(255,255,255,0.7) 8px, transparent 8px, transparent 16px)',
                    }}
                  />
                  {!isCloudDown && (
                    <div className="absolute inset-x-0 h-4 bg-white/80 blur-[2px] animate-packet-pulse-v pointer-events-none" />
                  )}
                </div>
                {/* Side badge */}
                <div className="absolute left-5 whitespace-nowrap pointer-events-none z-10">
                  <span className="text-[8px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300 shadow-xs">
                    ▼ Postgres Wire Protocol (Port 5432)
                  </span>
                </div>
              </div>
              <div className="w-6 h-2 bg-slate-800 border-x border-t border-slate-600 rounded-t shrink-0" />
            </div>

            {/* Col 2 vertical conduit down to Vercel Portal */}
            <div className="flex flex-col items-center">
              <div className="w-6 h-2 bg-slate-800 border-x border-b border-slate-600 rounded-b shrink-0" />
              <div className="w-3.5 h-8 relative flex items-center justify-center">
                <div className="w-full h-full bg-slate-900 border-x border-slate-700 relative overflow-hidden shadow-sm">
                  <div
                    className="w-full h-full bg-gradient-to-b from-cyan-400 to-indigo-600 animate-pipe-flow-v"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgba(255,255,255,0.7) 0, rgba(255,255,255,0.7) 8px, transparent 8px, transparent 16px)',
                    }}
                  />
                  <div className="absolute inset-x-0 h-4 bg-white/80 blur-[2px] animate-packet-pulse-v pointer-events-none" />
                </div>
                {/* Side badge */}
                <div className="absolute left-5 whitespace-nowrap pointer-events-none z-10">
                  <span className="text-[8px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-300 shadow-xs">
                    ▼ Vercel Global Edge SSR / API Route
                  </span>
                </div>
              </div>
              <div className="w-6 h-2 bg-slate-800 border-x border-t border-slate-600 rounded-t shrink-0" />
            </div>
          </div>

          {/* ── 3D CLOUD & APPLICATION TIER (SUPABASE + VERCEL) ───────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* ════════════ NODE 4: SUPABASE CLOUD DATABASE (3D CYLINDERS) ════════════ */}
            <div
              onClick={() => setSelectedNode('supabase')}
              className={`group cursor-pointer rounded-2xl p-4 sm:p-5 transition-all duration-300 relative overflow-hidden border-2 flex flex-col justify-between ${
                selectedNode === 'supabase'
                  ? 'ring-2 ring-emerald-500 shadow-xl border-emerald-400 bg-white'
                  : 'bg-white/95 hover:bg-white hover:shadow-lg border-slate-200/90'
              }`}
              style={{
                boxShadow:
                  selectedNode === 'supabase'
                    ? '0 12px 30px -5px rgba(16,185,129,0.20), 0 4px 10px rgba(0,0,0,0.05)'
                    : '0 8px 24px -5px rgba(0,0,0,0.06)',
              }}
            >
              {/* Top Docking Collar (Continuous Physical Attachment from WAN) */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-2 bg-slate-800 rounded-t border-x border-t border-slate-600 z-10 hidden md:block" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                      <Database className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Supabase Cloud Database</h3>
                      <p className="text-[11px] text-slate-500 font-mono">PostgreSQL 15 · Singapore</p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-full border ${
                      isCloudDown
                        ? 'bg-rose-50 text-rose-600 border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {isCloudDown ? '✕ TIMEOUT' : '● CLOUD READY'}
                  </span>
                </div>

                {/* 3D Isometric Storage Rings Representation */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-3 flex items-center justify-around">
                  <div className="flex flex-col items-center">
                    <div className="relative w-12 h-10 flex flex-col items-center justify-center">
                      <div className="w-10 h-3 rounded-full bg-emerald-500/80 border border-emerald-400 shadow-sm" />
                      <div className="w-10 h-3 rounded-full bg-emerald-600/80 border border-emerald-500 shadow-sm -mt-1" />
                      <div className="w-10 h-3 rounded-full bg-emerald-700/80 border border-emerald-600 shadow-sm -mt-1" />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-slate-500 mt-1">Postgres 15</span>
                  </div>

                  <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Total Punches</div>
                    <div className="text-base font-black text-slate-900 font-mono">
                      {totalRecords.toLocaleString()}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Ping RTT</div>
                    <div
                      className={`text-base font-black font-mono ${
                        isCloudDown
                          ? 'text-rose-600'
                          : isSlow
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {isCloudDown ? 'Timeout' : `${liveLatency} ms`}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[11px] font-mono text-slate-500 font-bold">WebSocket Realtime CDC</span>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                  Inspect Specs <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* ════════════ NODE 5: JAPA DTR ENTERPRISE PORTAL (VERCEL) ════════════ */}
            <div
              onClick={() => setSelectedNode('vercel')}
              className={`group cursor-pointer rounded-2xl p-4 sm:p-5 transition-all duration-300 relative overflow-hidden border-2 flex flex-col justify-between ${
                selectedNode === 'vercel'
                  ? 'ring-2 ring-indigo-500 shadow-xl border-indigo-400 bg-white'
                  : 'bg-white/95 hover:bg-white hover:shadow-lg border-slate-200/90'
              }`}
              style={{
                boxShadow:
                  selectedNode === 'vercel'
                    ? '0 12px 30px -5px rgba(99,102,241,0.20), 0 4px 10px rgba(0,0,0,0.05)'
                    : '0 8px 24px -5px rgba(0,0,0,0.06)',
              }}
            >
              {/* Top Docking Collar (Continuous Physical Attachment from WAN) */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-2 bg-slate-800 rounded-t border-x border-t border-slate-600 z-10 hidden md:block" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200">
                      <Globe className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">JAPA DTR Enterprise Portal</h3>
                      <p className="text-[11px] text-slate-500 font-mono">Vercel Global Edge Network</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">
                    ● ONLINE · LIVE
                  </span>
                </div>

                {/* 3D Edge Server Card Metrics */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-3 flex items-center justify-around">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                      ▲
                    </div>
                    <span className="text-[9px] font-mono font-bold text-slate-500 mt-1">Vercel Edge</span>
                  </div>

                  <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Security</div>
                    <div className="text-sm font-black text-emerald-700 font-mono flex items-center gap-1 justify-center">
                      <Lock className="w-3 h-3 text-emerald-600" /> TLS 1.3
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Framework</div>
                    <div className="text-sm font-black text-indigo-700 font-mono">Next.js 14</div>
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[11px] font-mono text-slate-500 font-bold">Edge SSR + API Routes</span>
                <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                  Inspect Specs <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>

          {/* ── CONNECTOR 5: REALTIME BI-DIRECTIONAL CLOUD BUS ─────────── */}
          <div className="mt-4 flex items-center justify-center">
            <div className="w-full max-w-xl bg-gradient-to-r from-emerald-50 via-cyan-50 to-indigo-50 px-4 py-2.5 rounded-2xl border border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono font-bold text-slate-600 shadow-xs">
              <span className="flex items-center gap-1.5 text-emerald-800">
                <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Supabase Cloud DB</span>
              </span>
              <span className="flex items-center gap-1.5 text-cyan-800 font-black bg-white/80 px-2.5 py-1 rounded-full border border-cyan-200 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                <span>◀ WebSocket Realtime CDC Channel (Live Punch Push) ▶</span>
              </span>
              <span className="flex items-center gap-1.5 text-indigo-800">
                <Globe className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>JAPA DTR Enterprise UI</span>
              </span>
            </div>
          </div>

          {/* ── SELECTED NODE TELEMETRY & DIAGNOSTICS INSPECTOR ───────── */}
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-md p-5 transition-all">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3.5 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    Selected Node Inspector
                  </span>
                  <h3 className="text-base font-black text-slate-900">{activeDetail.name}</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{activeDetail.subtitle}</p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono font-bold px-3 py-1 rounded-xl border ${
                    activeDetail.statusColor === 'emerald'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : activeDetail.statusColor === 'amber'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : activeDetail.statusColor === 'purple'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : activeDetail.statusColor === 'indigo'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {activeDetail.statusBadge}
                </span>
              </div>
            </div>

            {/* Technical Specifications Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
              {activeDetail.specs.map((s, idx) => (
                <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    {s.label}
                  </div>
                  <div className="text-xs font-black text-slate-800 font-mono mt-0.5 truncate">
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Diagnostic Action Box */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-black text-blue-900">{activeDetail.diagnosticTitle}: </span>
                <span className="text-blue-950 font-medium">{activeDetail.diagnosticText}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Troubleshooting & Component Details Reference ─────────── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          <span>Hardware &amp; Infrastructure Reference Guide</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Fingerprint className="w-4 h-4 text-blue-600" />
              1. FingerTec TA500 Biometric Terminal
            </h4>
            <p>
              Connected via physical RJ45 Ethernet to the Wi-Fi Repeater. Configured with static IP{' '}
              <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">192.168.0.58</code> on
              UDP Port <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">4370</code>.
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
              Bridges the TA500 Ethernet cable to the office 2.4 GHz wireless network (
              <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">192.168.0.254</code>).
              Allows the biometric terminal to reside anywhere without running cables across the office.
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
              Dedicated local tablet running Python Bridge Engine v15.3 via Termux. Features dual-mode 60s direct flash audit + 10m proactive socket rejuvenation to ensure continuous 24/7 reliability.
            </p>
            <p className="text-[11px] text-slate-500">
              💡 If stopped: open Termux on the tablet and type{' '}
              <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">
                python sync-bridge/bridge.py
              </code>
              .
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
                    <td className="px-4 py-2.5 font-bold text-slate-800">#{log.device_user_id}</td>
                    <td className="px-4 py-2.5 text-slate-700 font-semibold">{formatTs(log.punch_time)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          PUNCH_STATUS_COLOR[log.status] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {PUNCH_STATUS[log.status] ?? `Status ${log.status}`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-[11px]">{formatTs(log.synced_at)}</td>
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
