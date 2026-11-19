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
      protocol: 'Python 3.11 · tablet_bridge.py v16.3',
      statusBadge: isBridgeDown ? 'DAEMON TERMINATED' : 'ACTIVE POLLING (8s)',
      statusColor: isBridgeDown ? 'rose' : 'amber',
      specs: [
        { label: 'Platform & OS', value: 'Android 14 (One UI 6.0) · Termux' },
        { label: 'Processor', value: 'Qualcomm Snapdragon 695 5G' },
        { label: 'Architecture', value: 'Dual-Socket Isolation (Heartbeat + Dedicated Fetch)' },
        { label: 'Maintenance Schedule', value: 'Option B Hourly Protected Rest (Termux Cron)' },
        { label: 'Ingestion Mode', value: 'Upsert with Composite Key Uniqueness' },
        { label: 'Cache Window', value: '30-Day Bounded Rolling Hashes' },
      ],
      diagnosticTitle: isBridgeDown
        ? 'Python Sync Daemon Offline'
        : 'Bridge Engine Running v16.3 (Single-Socket Safe Session + Hourly Maintenance)',
      diagnosticText: isBridgeDown
        ? 'The bridge process has been terminated. Open Termux on the tablet and type "bash sync-bridge/watchdog.sh" to restart automatic synchronization.'
        : 'The bridge engine queries the TA500 every 8s, isolates attendance fetching to dedicated clean sockets, strips duplicated double-taps within 5 minutes, and securely ships records to Supabase.',
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
      {/* â”€â”€ Top Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

      {/* â”€â”€ Scenario / Simulation Selector (Light Theme) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
            <span>ðŸŸ¡ High Latency</span>
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
            <span>ðŸ”´ LAN Unplugged</span>
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
            <span>ðŸ”´ Wi-Fi Drop</span>
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
            <span>ðŸ”´ Bridge Offline</span>
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
            <span>ðŸ”´ Cloud/WAN Out</span>
          </button>
        </div>
      </div>

      {/* â”€â”€ Active Status Alert Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                : `FingerTec TA500 (192.168.0.58) is online and responding. Samsung Tab A9+ bridge v16.3 heartbeat active (${heartbeatAgeSec}s ago). Cloud roundtrip latency: ${liveLatency}ms.`)}
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
                ? 'The synchronization daemon (tablet_bridge.py v16.3) has terminated on the Samsung Tab A9+. Open Termux and execute: "bash sync-bridge/watchdog.sh".'
                : `No live heartbeat received from the bridge daemon in ${heartbeatAgeSec}s. Turn on the Samsung Galaxy Tab A9+, open Termux, and execute: "bash sync-bridge/watchdog.sh".`)}
            {isCloudDown &&
              'Local tablet cannot reach Supabase in Singapore. New biometric punches remain securely buffered in TA500 onboard flash memory and will sync upon reconnection.'}
          </p>
        </div>
      </div>

      {/* â”€â”€ Visual Topology Architecture Diagram (Light Theme 3D/2D Visual) â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

          {/* â”€â”€ 3D PHYSICAL HARDWARE DIAGRAM ROW (LOCAL EDGE TIER WITH CONNECTING LINES) â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="relative mb-0">
            <div className="flex flex-col lg:flex-row items-stretch justify-between gap-0 relative">

              {/* â•â•â•â•â•â•â•â•â•â•â•â• NODE 1: FINGERTEC TA500 (3D BIOMETRIC MACHINE) â•â•â•â•â•â•â•â•â•â•â•â• */}
              <div
                onClick={() => setSelectedNode('ta500')}
                className={`group cursor-pointer rounded-2xl p-4 sm:p-5 transition-all duration-300 relative overflow-visible border-2 flex-1 min-w-0 flex flex-col justify-between ${
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
                {/* Right connection port socket (light theme, integrated terminal port) */}
                <div
                  className={`absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 hidden lg:flex items-center justify-center ${
                    isLanBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-blue-600 ring-2 ring-blue-200'
                  }`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>

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
                        ? '⚠ BRIDGE OFFLINE'
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

              {/* â”€â”€ CONNECTOR 1: CAT6 ETHERNET PHYSICAL BRIDGE (DESKTOP EDGE-TO-EDGE) â”€â”€ */}
              <div className="hidden lg:flex items-center shrink-0 w-16 xl:w-24 relative z-20 -mx-1">
                <div className="w-full relative flex flex-col items-center justify-center">
                  {/* Top badge */}
                  <span
                    className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-xs whitespace-nowrap mb-1.5 ${
                      isLanBroken
                        ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                        : isSlow
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-white text-blue-700 border-blue-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isLanBroken ? 'bg-rose-500' : 'bg-blue-500 animate-ping'}`} />
                    <span>{isLanBroken ? '✕ LAN SEVERED' : 'Cat6 RJ45 âž” 100M'}</span>
                  </span>

                  {/* Sleek Continuous Cable Line */}
                  <div
                    className={`w-full h-2 rounded-full border relative overflow-hidden shadow-inner ${
                      isLanBroken ? 'bg-rose-100 border-rose-300' : 'bg-slate-100 border-slate-300'
                    }`}
                  >
                    {isLanBroken ? (
                      <div className="w-full h-full bg-rose-500 animate-pulse" />
                    ) : (
                      <>
                        <div
                          className={`h-full w-full ${
                            isSlow
                              ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-pipe-flow-slow'
                              : 'bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-600 animate-smooth-conduit'
                          }`}
                        />
                        <div className="absolute inset-y-0 w-8 bg-white/80 blur-[1px] animate-smooth-packet pointer-events-none" />
                      </>
                    )}
                  </div>

                  {/* Bottom label */}
                  <span className="text-[8px] font-mono font-bold text-slate-500 whitespace-nowrap mt-1">
                    {isLanBroken ? 'Port Closed' : 'UDP 4370 · Flow: Active'}
                  </span>
                </div>
              </div>

              {/* â”€â”€ CONNECTOR 1: MOBILE VERTICAL BRIDGE (EDGE-TO-EDGE) â”€â”€ */}
              <div className="flex lg:hidden flex-col items-center justify-center py-2 relative">
                <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 -mb-1 ${
                  isLanBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-blue-600 ring-2 ring-blue-200'
                }`} />
                <div
                  className={`w-2 h-10 relative overflow-hidden rounded-full border ${
                    isLanBroken ? 'bg-rose-100 border-rose-300' : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  {!isLanBroken && (
                    <div className="w-full h-full bg-gradient-to-b from-blue-500 via-cyan-400 to-blue-500 animate-smooth-conduit-v" />
                  )}
                  {isLanBroken && <div className="w-full h-full bg-rose-500 animate-pulse" />}
                </div>
                <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 -mt-1 ${
                  isLanBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-blue-600 ring-2 ring-blue-200'
                }`} />
                <span className={`inline-flex items-center gap-1 text-[8px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-xs mt-1.5 ${
                  isLanBroken ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-blue-700 border-blue-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isLanBroken ? 'bg-rose-500' : 'bg-blue-500 animate-ping'}`} />
                  <span>{isLanBroken ? '✕ Cat6 Severed / TA500 Off' : '▼ Cat6 RJ45 (100 Mbps Duplex)'}</span>
                </span>
              </div>

              {/* â•â•â•â•â•â•â•â•â•â•â•â• NODE 2: WI-FI REPEATER (AP BRIDGE) â•â•â•â•â•â•â•â•â•â•â•â• */}
              <div
                onClick={() => setSelectedNode('repeater')}
                className={`group cursor-pointer rounded-2xl p-4 sm:p-5 transition-all duration-300 relative overflow-visible border-2 flex-1 min-w-0 flex flex-col justify-between ${
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
                {/* Left & Right connection port sockets (integrated hardware terminal ports) */}
                <div
                  className={`absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 hidden lg:flex items-center justify-center ${
                    isLanBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-blue-600 ring-2 ring-blue-200'
                  }`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
                <div
                  className={`absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 hidden lg:flex items-center justify-center ${
                    isWifiBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-purple-600 ring-2 ring-purple-200'
                  }`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>

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

                  {/* 3D Cat6 Cable Inflow Graphic with Smooth Luminous Loading Effect */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-3 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-2">
                      <span className="text-slate-800 flex items-center gap-1.5">
                        <Cable className="w-3.5 h-3.5 text-blue-600" />
                        <span>Cat6 RJ45 Input Cable</span>
                      </span>
                      <span
                        className={`text-[9px] font-mono font-black uppercase flex items-center gap-1.5 ${
                          isLanBroken
                            ? 'text-rose-600'
                            : isSlow
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isLanBroken ? 'bg-rose-500' : 'bg-emerald-500 animate-ping'
                          }`}
                        />
                        {isLanBroken ? 'TA500 OFFLINE / NO SIGNAL' : '100 Mbps Duplex Ingesting'}
                      </span>
                    </div>

                    {/* Active Cable Loading Pipeline - Silky smooth, no cuts or jumps */}
                    <div className="relative flex items-center gap-1.5">
                      {/* 8-Pin RJ45 Gold Contact Head Mockup */}
                      <div className="shrink-0 flex flex-col gap-0.5 p-1 bg-white border border-slate-300 rounded shadow-xs">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((pin) => (
                            <div
                              key={pin}
                              className={`w-1 h-2 rounded-[1px] ${
                                isLanBroken ? 'bg-slate-300' : 'bg-amber-400 shadow-[0_0_2px_#fbbf24]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Flowing Data Conduit Track - Smooth continuous gradient & slide */}
                      <div className="flex-1 h-6 rounded-full bg-slate-200/90 border border-slate-300 p-0.5 overflow-hidden relative shadow-inner">
                        {isLanBroken ? (
                          <div className="w-full h-full rounded-full bg-rose-100 flex items-center justify-center text-[8px] font-mono font-black text-rose-700 tracking-wider">
                            PORT OFFLINE · NO CARRIER / TA500 OFF
                          </div>
                        ) : (
                          <>
                            <div
                              className={`h-full w-full rounded-full ${
                                isSlow
                                  ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-smooth-conduit'
                                  : 'bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-500 animate-smooth-conduit'
                              }`}
                            />
                            {/* Smooth Traveling Light Packet */}
                            <div className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/80 to-transparent animate-smooth-packet pointer-events-none" />
                          </>
                        )}
                      </div>
                    </div>

                    {/* Active Telemetry Sub-row */}
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mt-2 pt-1.5 border-t border-slate-200">
                      <span>Wire: STP 4-Pair 24AWG · Cat6</span>
                      <span className={isLanBroken ? 'text-rose-600 font-bold' : 'text-blue-700 font-bold'}>
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

              {/* â”€â”€ CONNECTOR 2: WIRELESS 2.4 GHz WLAN CORRIDOR (DESKTOP EDGE-TO-EDGE) â”€â”€ */}
              <div className="hidden lg:flex items-center shrink-0 w-16 xl:w-24 relative z-20 -mx-1">
                <div className="w-full relative flex flex-col items-center justify-center">
                  {/* Top badge */}
                  <span
                    className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-xs whitespace-nowrap mb-1.5 ${
                      isWifiBroken
                        ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                        : isSlow
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-white text-purple-700 border-purple-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isWifiBroken ? 'bg-rose-500' : 'bg-purple-500 animate-ping'}`} />
                    <span>{isWifiBroken ? '✕ NO SIGNAL' : '2.4 GHz Wi-Fi âž”'}</span>
                  </span>

                  {/* Sleek Wireless Link Conduit */}
                  <div
                    className={`w-full h-2 rounded-full border relative overflow-hidden shadow-inner ${
                      isWifiBroken ? 'bg-rose-100 border-rose-300' : 'bg-purple-50 border-purple-200'
                    }`}
                  >
                    {isWifiBroken ? (
                      <div className="w-full h-full bg-rose-500 animate-pulse" />
                    ) : (
                      <>
                        <div
                          className={`h-full w-full ${
                            isSlow
                              ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-pipe-flow-slow'
                              : 'bg-gradient-to-r from-purple-600 via-indigo-400 to-purple-600 animate-smooth-conduit'
                          }`}
                        />
                        <div className="absolute inset-y-0 w-8 bg-white/80 blur-[1px] animate-smooth-packet pointer-events-none" />
                      </>
                    )}
                  </div>

                  {/* Bottom label */}
                  <span className="text-[8px] font-mono font-bold text-slate-500 whitespace-nowrap mt-1">
                    {isWifiBroken ? 'Disconnected' : isSlow ? '-82 dBm Jitter' : '-52 dBm Stable'}
                  </span>
                </div>
              </div>

              {/* â”€â”€ CONNECTOR 2: MOBILE VERTICAL BRIDGE (EDGE-TO-EDGE) â”€â”€ */}
              <div className="flex lg:hidden flex-col items-center justify-center py-2 relative">
                <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 -mb-1 ${
                  isWifiBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-purple-600 ring-2 ring-purple-200'
                }`} />
                <div
                  className={`w-2 h-10 relative overflow-hidden rounded-full border ${
                    isWifiBroken ? 'bg-rose-100 border-rose-300' : 'bg-purple-50 border-purple-200'
                  }`}
                >
                  {!isWifiBroken && (
                    <div className="w-full h-full bg-gradient-to-b from-purple-500 via-indigo-400 to-purple-500 animate-smooth-conduit-v" />
                  )}
                  {isWifiBroken && <div className="w-full h-full bg-rose-500 animate-pulse" />}
                </div>
                <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 -mt-1 ${
                  isWifiBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-purple-600 ring-2 ring-purple-200'
                }`} />
                <span className={`inline-flex items-center gap-1 text-[8px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-xs mt-1.5 ${
                  isWifiBroken ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-purple-700 border-purple-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isWifiBroken ? 'bg-rose-500' : 'bg-purple-500 animate-ping'}`} />
                  <span>{isWifiBroken ? '✕ Wi-Fi Dropped' : '▼ 2.4 GHz WLAN (-52 dBm)'}</span>
                </span>
              </div>

              {/* â•â•â•â•â•â•â•â•â•â•â•â• NODE 3: SAMSUNG GALAXY TAB A9+ (BRIDGE ENGINE) â•â•â•â•â•â•â•â•â•â•â•â• */}
              <div
                onClick={() => setSelectedNode('tablet')}
                className={`group cursor-pointer rounded-2xl p-4 sm:p-5 transition-all duration-300 relative overflow-visible border-2 flex-1 min-w-0 flex flex-col justify-between ${
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
                {/* Left connection port socket (integrated hardware terminal port) */}
                <div
                  className={`absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 hidden lg:flex items-center justify-center ${
                    isWifiBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-purple-600 ring-2 ring-purple-200'
                  }`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>

                {/* â”€â”€ VERTICAL CONDUIT: TABLET TO WAN UPLINK BEAM (SEAMLESS FLUSH DOCKING) â”€â”€ */}
                <div className="absolute left-1/2 -translate-x-1/2 top-full h-16 w-2.5 z-20 hidden lg:flex flex-col items-center pointer-events-none">
                  {/* Top connection socket touching Card 3 bottom */}
                  <div className={`absolute top-0 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 flex items-center justify-center ${
                    isBridgeDown ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-indigo-600 ring-2 ring-indigo-200'
                  }`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>

                  {/* Conduit Tube */}
                  <div className={`w-full h-full rounded-full border relative overflow-hidden shadow-xs ${
                    isBridgeDown ? 'bg-rose-100 border-rose-400' : 'bg-indigo-100 border-indigo-400'
                  }`}>
                    {!isBridgeDown && (
                      <div className="w-full h-full bg-gradient-to-b from-indigo-500 via-cyan-400 to-indigo-500 animate-smooth-conduit-v" />
                    )}
                    {isBridgeDown && <div className="w-full h-full bg-rose-500 animate-pulse" />}
                  </div>

                  {/* Bottom connection socket touching WAN beam top */}
                  <div className={`absolute bottom-0 translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 flex items-center justify-center ${
                    isBridgeDown ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-indigo-600 ring-2 ring-indigo-200'
                  }`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>

                  {/* Pill Badge anchored to the LEFT of the conduit so it NEVER clips */}
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-auto z-30">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold shadow-md border whitespace-nowrap ${
                      isBridgeDown
                        ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                        : 'bg-white text-indigo-700 border-indigo-200'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${isBridgeDown ? 'bg-rose-500' : 'bg-indigo-500 animate-ping'}`} />
                      <span>{isBridgeDown ? '▼ LOCAL INGESTION HALTED (DAEMON DOWN)' : '▼ Local Ingestion Stream (HTTPS / TLS 1.3)'}</span>
                    </span>
                  </div>
                </div>

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
                      {isBridgeDown ? '✕ DAEMON STOPPED' : '● BRIDGE v16.3 ACTIVE'}
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
                        <span>v16.3</span>
                      </div>
                      {isBridgeDown ? (
                        <div className="text-rose-400 font-bold py-1">
                          [CRITICAL] Process terminated (SIGTERM)
                          <br />
                          {heartbeatAgeSec > 0 && heartbeatAgeSec < 9000
                            ? `Last heartbeat: ${heartbeatAgeSec}s ago. Termux suspended.`
                            : 'Daemon stopped. No polling active.'}
                        </div>
                      ) : !liveTa500Online ? (
                        <div>
                          <div className="text-amber-300 font-bold">
                            [RETRY] Connecting to TA500 (192.168.0.58)...
                          </div>
                          <div className="text-slate-400 text-[9px]">
                            Bridge daemon active (Heartbeat {heartbeatAgeSec}s ago)
                          </div>
                          <div className="text-cyan-300 text-[9px]">
                            [SUPERVISOR] 24/7 Watchdog Protected · Option B Active
                          </div>
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

          {/* Mobile Vertical Connector - Tablet to WAN */}
          <div className="flex lg:hidden flex-col items-center justify-center py-2 relative">
            <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 -mb-1 ${
              isBridgeDown ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-indigo-600 ring-2 ring-indigo-200'
            }`} />
            <div className={`w-2 h-10 relative overflow-hidden rounded-full border ${
              isBridgeDown ? 'bg-rose-100 border-rose-300' : 'bg-indigo-50 border-indigo-200'
            }`}>
              {!isBridgeDown && (
                <div className="w-full h-full bg-gradient-to-b from-indigo-500 via-cyan-400 to-indigo-500 animate-smooth-conduit-v" />
              )}
              {isBridgeDown && <div className="w-full h-full bg-rose-500 animate-pulse" />}
            </div>
            <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 -mt-1 ${
              isBridgeDown ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-indigo-600 ring-2 ring-indigo-200'
            }`} />
            <span className={`inline-flex items-center gap-1 text-[8px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-xs mt-1.5 ${
              isBridgeDown ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-indigo-700 border-indigo-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isBridgeDown ? 'bg-rose-500' : 'bg-indigo-500 animate-ping'}`} />
              <span>{isBridgeDown ? '▼ Ingestion Halted (Daemon Down)' : '▼ Local Ingestion Stream (HTTPS / TLS 1.3)'}</span>
            </span>
          </div>

          {/* â”€â”€ CLOUD UPLINK BEAM (HIGH-SPEED WAN PIPELINE CONTINUOUS BUS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="relative lg:mt-16 mt-3 mb-0 z-10">
            <div className={`w-full h-5 rounded-full border-2 relative overflow-hidden flex items-center justify-center shadow-md ${
              isCloudDown ? 'bg-rose-100 border-rose-400' : 'bg-slate-100 border-slate-400'
            }`}>
              <div
                className={`w-full h-full ${
                  isCloudDown
                    ? 'bg-rose-300'
                    : isSlow
                    ? 'bg-gradient-to-r from-amber-400 via-amber-200 to-amber-400 animate-pipe-flow-slow'
                    : 'bg-gradient-to-r from-blue-500 via-indigo-500 via-purple-500 to-emerald-500 animate-smooth-conduit'
                }`}
              />
            </div>

            {/* Central WAN Pill Badge */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`px-4 py-1 rounded-full text-[11px] font-mono font-bold flex items-center gap-2 border-2 shadow-lg ${
                  isCloudDown
                    ? 'bg-rose-100 text-rose-900 border-rose-400 animate-pulse'
                    : 'bg-white text-slate-900 border-slate-300'
                }`}
              >
                <Globe className={`w-3.5 h-3.5 ${isCloudDown ? 'text-rose-600' : 'text-blue-600 animate-spin'}`} style={{ animationDuration: '8s' }} />
                <span className="font-black">INTERNET WAN UPLINK âž” SINGAPORE CLOUD REGION</span>
                <ArrowRight className="w-3 h-3 text-slate-400 hidden sm:inline" />
                <span
                  className={`font-mono font-black px-2 py-0.5 rounded text-[10px] border ${
                    isCloudDown
                      ? 'bg-rose-200 text-rose-900 border-rose-400'
                      : isSlow
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  }`}
                >
                  {isCloudDown ? 'LINK DOWN' : `${liveLatency} ms RTT`}
                </span>
              </div>
            </div>
          </div>

          {/* â”€â”€ CONNECTOR 4: BRANCHING DOWNWARD PIPELINES (SEAMLESSLY DOCKING TO CLOUD CARDS) â”€â”€ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative">
            {/* Col 1 vertical conduit down to Supabase */}
            <div className="flex flex-col items-center relative h-10 pointer-events-none">
              {/* Top socket touching WAN beam */}
              <div className={`absolute top-0 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 flex items-center justify-center ${
                isCloudDown ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-emerald-600 ring-2 ring-emerald-200'
              }`}>
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>

              {/* Pipe */}
              <div className={`w-2.5 h-full rounded-full border relative overflow-hidden shadow-xs ${
                isCloudDown ? 'bg-rose-100 border-rose-400' : 'bg-emerald-100 border-emerald-400'
              }`}>
                {!isCloudDown && (
                  <div className="w-full h-full bg-gradient-to-b from-teal-400 to-emerald-500 animate-smooth-conduit-v" />
                )}
                {isCloudDown && <div className="w-full h-full bg-rose-500 animate-pulse" />}
              </div>

              {/* Bottom socket touching Supabase */}
              <div className={`absolute bottom-0 translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 flex items-center justify-center ${
                isCloudDown ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-emerald-600 ring-2 ring-emerald-200'
              }`}>
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>

              {/* Badge */}
              <div className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-auto z-30">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold shadow-xs border ${
                  isCloudDown
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-white text-emerald-700 border-emerald-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isCloudDown ? 'bg-rose-500' : 'bg-emerald-500 animate-ping'}`} />
                  <span>{isCloudDown ? '✕ DB Link Down' : '▼ Postgres Wire Protocol (Port 5432)'}</span>
                </span>
              </div>
            </div>

            {/* Col 2 vertical conduit down to Vercel Portal */}
            <div className="flex flex-col items-center relative h-10 pointer-events-none">
              {/* Top socket touching WAN beam */}
              <div className="absolute top-0 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 flex items-center justify-center bg-indigo-600 ring-2 ring-indigo-200">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>

              {/* Pipe */}
              <div className="w-2.5 h-full rounded-full border border-indigo-400 bg-indigo-100 relative overflow-hidden shadow-xs">
                <div className="w-full h-full bg-gradient-to-b from-blue-400 to-indigo-500 animate-smooth-conduit-v" />
              </div>

              {/* Bottom socket touching Vercel */}
              <div className="absolute bottom-0 translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 flex items-center justify-center bg-indigo-600 ring-2 ring-indigo-200">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>

              {/* Badge */}
              <div className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-auto z-30">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold shadow-xs border bg-white text-indigo-700 border-indigo-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                  <span>▼ Vercel Global Edge SSR / API Route</span>
                </span>
              </div>
            </div>
          </div>

          {/* â”€â”€ 3D CLOUD & APPLICATION TIER (SUPABASE + VERCEL) â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* â•â•â•â•â•â•â•â•â•â•â•â• NODE 4: SUPABASE CLOUD DATABASE (3D CYLINDERS) â•â•â•â•â•â•â•â•â•â•â•â• */}
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

            {/* â•â•â•â•â•â•â•â•â•â•â•â• NODE 5: JAPA DTR ENTERPRISE PORTAL (VERCEL) â•â•â•â•â•â•â•â•â•â•â•â• */}
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

          {/* â”€â”€ CONNECTOR 5: REALTIME BI-DIRECTIONAL CLOUD BUS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="mt-4 flex items-center justify-center">
            <div className="w-full max-w-xl bg-gradient-to-r from-emerald-50 via-cyan-50 to-indigo-50 px-4 py-2.5 rounded-2xl border border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono font-bold text-slate-600 shadow-xs">
              <span className="flex items-center gap-1.5 text-emerald-800">
                <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Supabase Cloud DB</span>
              </span>
              <span className="flex items-center gap-1.5 text-cyan-800 font-black bg-white/80 px-2.5 py-1 rounded-full border border-cyan-200 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                <span>â—€ WebSocket Realtime CDC Channel (Live Punch Push) ▶</span>
              </span>
              <span className="flex items-center gap-1.5 text-indigo-800">
                <Globe className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>JAPA DTR Enterprise UI</span>
              </span>
            </div>
          </div>

          {/* â”€â”€ SELECTED NODE TELEMETRY & DIAGNOSTICS INSPECTOR â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

      {/* â”€â”€ Troubleshooting & Component Details Reference â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
              ðŸ’¡ If unreachable: check if the LAN cable link light is blinking on both the TA500 and the repeater.
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
              ðŸ’¡ If disconnected: verify the power LED and ensure the repeater is within good range of the Wi-Fi router.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Tablet className="w-4 h-4 text-amber-600" />
              3. Samsung Galaxy Tab A9+ (Bridge Engine)
            </h4>
            <p>
              Dedicated local tablet running Python Bridge Engine v16.3 via Termux. Features single-socket bulletproof session, graduated self-healing, and Option B hourly protected maintenance.
            </p>
            <p className="text-[11px] text-slate-500">
              ðŸ’¡ If stopped: open Termux on the tablet and run{' '}
              <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">
                bash sync-bridge/watchdog.sh
              </code>
              .
            </p>
          </div>
        </div>
      </div>

      {/* -- Live Biometric Ingestion Feed -- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
              <Activity className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                Live Biometric Ingestion Feed
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-[10px] font-bold text-green-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                  SUPABASE LIVE
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time audit log of biometric punches synced from FingerTec TA500 to Cloud
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <Database className="w-3 h-3 text-blue-500" />
              <span className="text-slate-500">Total:</span>
              <span className="text-blue-600 font-black">{totalRecords.toLocaleString()}</span>
              <span className="text-slate-400">punches</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="text-slate-500">Last:</span>
              <span className="text-slate-700 font-semibold">{lastSync ? formatTs(lastSync) : 'Never'}</span>
            </div>
          </div>
        </div>

        {!recentLogs || recentLogs.length === 0 ? (
          <div className="py-16 text-center">
            <Fingerprint className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-medium">No biometric sync activity recorded yet.</p>
            <p className="text-slate-300 text-xs mt-1">Punches will appear here as employees scan their fingerprints.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">
                  <th className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Fingerprint className="w-3 h-3" />
                      Employee ID
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Punch Time (PHT)
                    </div>
                  </th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Cloud className="w-3 h-3" />
                      Cloud Ingestion
                    </div>
                  </th>
                  <th className="px-4 py-3">Sync Lag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLogs.map((log, idx) => {
                  const punchDate = log.punch_time ? new Date(log.punch_time) : null
                  const syncDate = log.synced_at ? new Date(log.synced_at) : null
                  const lagSec = punchDate && syncDate
                    ? Math.round((syncDate.getTime() - punchDate.getTime()) / 1000)
                    : null
                  const isRecent = syncDate && (Date.now() - syncDate.getTime()) < 300000
                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors ${idx === 0 && isRecent ? 'bg-green-50/60 hover:bg-green-50' : 'hover:bg-slate-50/70'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {idx === 0 && isRecent && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                          )}
                          <span className="font-bold text-slate-800 font-mono">ID #{log.device_user_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-700">
                        {formatTs(log.punch_time)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                          log.status === 0
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : log.status === 1
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {log.status === 0 ? '→ TIME IN' : log.status === 1 ? '← TIME OUT' : `Status ${log.status}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500 text-[11px]">
                        {formatTs(log.synced_at)}
                      </td>
                      <td className="px-4 py-3">
                        {lagSec !== null ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            lagSec < 10 ? 'text-green-700 bg-green-50 border border-green-200'
                            : lagSec < 60 ? 'text-amber-700 bg-amber-50 border border-amber-200'
                            : 'text-slate-500 bg-slate-50 border border-slate-200'
                          }`}>
                            {lagSec < 60 ? `${lagSec}s` : `${Math.round(lagSec / 60)}m`}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[10px]">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
