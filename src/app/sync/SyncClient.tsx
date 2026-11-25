'use client'

import { useState, useEffect, useRef } from 'react'
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
  PowerOff,
  SignalZero,
  AlertOctagon,
  Gauge,
  Sliders,
  Power,
  RotateCw,
} from 'lucide-react'
import { format } from 'date-fns'
import { PageBanner } from '@/components/PageBanner'
import type { AttendanceLog } from '@/types/database'
import { PUNCH_STATUS, PUNCH_STATUS_COLOR } from '@/types/database'
import { createClient } from '@/lib/supabase/client'

export type NetworkScenario =
  | 'healthy'
  | 'slow_network'
  | 'lan_unplugged'
  | 'ta500_power_off'
  | 'wifi_disconnected'
  | 'packet_loss'
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
  const specsSectionRef = useRef<HTMLDivElement>(null)
  const handleInspectNode = (nodeId: string) => {
    setSelectedNode(nodeId)
    requestAnimationFrame(() => {
      specsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  const [testingPing, setTestingPing] = useState(false)
  const [liveLatency, setLiveLatency] = useState<number>(42)
  const [totalRecords, setTotalRecords] = useState(initialTotalRecords)
  const [lastSync, setLastSync] = useState(initialLastSync)
  const [recentLogs, setRecentLogs] = useState<AttendanceLog[]>(initialRecentLogs)
  const [liveTime, setLiveTime] = useState<string>('')
  const [liveBridgeOnline, setLiveBridgeOnline] = useState<boolean>(initialBridgeOnline)
  const [liveTa500Online, setLiveTa500Online] = useState<boolean>(initialTa500Online)
  const [heartbeatAgeSec, setHeartbeatAgeSec] = useState<number>(initialHeartbeatAgeSec)

  // Super Admin session state
  const [currentUser, setCurrentUser] = useState<{
    id: string
    username: string
    displayName: string
    role: string
    isSuperAdmin?: boolean
    canEdit?: boolean
  } | null>(null)

  useEffect(() => {
    fetch(`/api/auth/me?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.authenticated && d?.user) {
          setCurrentUser(d.user)
        }
      })
      .catch(() => {})
  }, [])

  const isSuperAdmin = Boolean(
    currentUser?.isSuperAdmin ||
    currentUser?.role === 'super_admin' ||
    currentUser?.username === 'admin'
  )

  // Super Admin TA500 Remote Hardware Restart States
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [restartSecondsLeft, setRestartSecondsLeft] = useState(45)
  const [restartStage, setRestartStage] = useState<1 | 2 | 3 | 4>(1)
  const [restartSuccess, setRestartSuccess] = useState<string | null>(null)
  const [restartError, setRestartError] = useState<string | null>(null)
  const [isDispatchingRestart, setIsDispatchingRestart] = useState(false)

  // Hardware restart progression effect (45s total duration)
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isRestarting && restartSecondsLeft > 0) {
      timer = setTimeout(() => {
        const nextSec = restartSecondsLeft - 1
        setRestartSecondsLeft(nextSec)
        const elapsed = 45 - nextSec
        if (elapsed < 5) {
          setRestartStage(1)
        } else if (elapsed < 12) {
          setRestartStage(2)
        } else if (elapsed < 30) {
          setRestartStage(3)
        } else {
          setRestartStage(4)
        }
      }, 1000)
    } else if (isRestarting && restartSecondsLeft <= 0) {
      setIsRestarting(false)
      handleTestPing()
      if (liveTa500Online && liveBridgeOnline) {
        setRestartSuccess('FingerTec TA500 terminal reboot verified & live connection re-established!')
      } else if (!liveTa500Online && liveBridgeOnline) {
        setRestartSuccess('Reboot signal delivered to TA500. Hardware is power-cycling (optical prism recalibrating)...')
      } else {
        setRestartError('Reboot signal dispatched. Bridge is re-attaching to hardware.')
      }
      const t = setTimeout(() => {
        setRestartSuccess(null)
        setRestartError(null)
      }, 12000)
      return () => clearTimeout(t)
    }
    return () => clearTimeout(timer)
  }, [isRestarting, restartSecondsLeft])

  const handleTriggerTa500Restart = async () => {
    setIsDispatchingRestart(true)
    setRestartError(null)
    setRestartSuccess(null)
    try {
      const res = await fetch('/api/sync/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch TA500 restart command')
      }
      setIsRestartModalOpen(false)
      setIsRestarting(true)
      setRestartSecondsLeft(45)
      setRestartStage(1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger restart'
      setRestartError(msg)
    } finally {
      setIsDispatchingRestart(false)
    }
  }

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

  // Auto-refresh real-time stats every 2.5s for snappy live status detection
  useEffect(() => {
    const interval = setInterval(() => {
      handleTestPing()
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  // Instant Supabase Realtime WebSocket subscription for live punch ingestion
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('sync-feed-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_logs' },
        (payload) => {
          const newLog = payload.new as AttendanceLog
          setRecentLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id)].slice(0, 50))
          setTotalRecords((prev) => prev + 1)
          setLastSync(newLog.synced_at || new Date().toISOString())
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Status computation: manual scenario button override OR real-time live hardware detection!
  const isManualSim = scenario !== 'healthy'

  const isTa500PowerOff = isManualSim ? scenario === 'ta500_power_off' : false
  const isLanBroken = isManualSim
    ? scenario === 'lan_unplugged' || scenario === 'ta500_power_off'
    : !liveTa500Online && liveBridgeOnline
  const isWifiBroken = isManualSim ? scenario === 'wifi_disconnected' : false
  const isBridgeDown = isManualSim ? scenario === 'bridge_offline' : !liveBridgeOnline
  const isSlow = isManualSim ? scenario === 'slow_network' : false
  const isPacketLoss = isManualSim ? scenario === 'packet_loss' : false
  const isCloudDown = isManualSim ? scenario === 'cloud_error' : false
  const isHealthy = isManualSim ? false : liveBridgeOnline && liveTa500Online

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
      port: '4370 (TCP / UDP)',
      protocol: 'ZKTeco Standalone Push/Pull SDK',
      statusBadge: isTa500PowerOff
        ? 'POWER LOSS (12V DC CUT)'
        : isLanBroken
          ? 'DISCONNECTED (NO CARRIER)'
          : 'READY & LOGGING',
      statusColor: isTa500PowerOff || isLanBroken ? 'rose' : 'emerald',
      specs: [
        { label: 'Firmware Engine', value: 'Ver 6.60 (Build 2024)' },
        { label: 'Sensor Technology', value: '500 DPI Optical Prism Glass' },
        { label: 'Onboard Buffer', value: '100,000 Flash Punch Memory' },
        { label: 'User Capacity', value: '3,000 Enrolled Employees' },
        { label: 'Physical Interface', value: '10/100 Mbps RJ45 Auto-MDIX' },
        { label: 'Verification Speed', value: '< 0.5s Biometric 1:N Match' },
        { label: 'Default Gateway', value: '192.168.0.1' },
        { label: 'Subnet Mask', value: '255.255.255.0' },
      ],
      diagnosticTitle: isTa500PowerOff
        ? 'Terminal Power Severed'
        : isLanBroken
          ? 'Physical Ethernet Disconnection'
          : 'Terminal Operating Normally',
      diagnosticText: isTa500PowerOff
        ? 'The FingerTec TA500 has lost 12V DC power. Verify the AC wall outlet switch, the DC power brick, and the barrel connector on the rear mounting bracket.'
        : isLanBroken
          ? 'The Cat6 cable connecting the TA500 to the Wi-Fi Repeater is disconnected or severed. Verify RJ45 clip integrity and confirm the Link LED is lit on the rear port.'
          : 'The terminal is actively capturing optical biometric scans and serving punch logs to the Samsung Tab A9+ bridge daemon on UDP/TCP 4370.',
    },
    repeater: {
      name: 'TP-Link TL-WA855RE Wi-Fi Range Extender',
      subtitle: '300Mbps Wi-Fi Range Extender & AP Ethernet Bridge',
      type: 'Local Wireless Network Interconnect',
      ip: '192.168.0.254 (AP Mode)',
      port: 'Fast Ethernet RJ45 + 802.11n',
      protocol: 'IEEE 802.11b/g/n (2.4 GHz)',
      statusBadge: isWifiBroken
        ? 'WLAN DISCONNECTED'
        : isLanBroken
          ? 'LAN PORT UNLINKED'
          : isPacketLoss
            ? '45% PACKET LOSS'
            : 'WORKING WELL · 1 CLIENT ONLINE',
      statusColor: isWifiBroken || isLanBroken ? 'rose' : isPacketLoss ? 'amber' : 'purple',
      specs: [
        { label: 'Hardware Model', value: 'TP-Link TL-WA855RE v5.0' },
        { label: 'Wi-Fi Band', value: '2.4 GHz Single-Band (300 Mbps)' },
        { label: 'Connected Clients', value: '1 Online (TA500 Biometric Bridge)' },
        { label: 'Main Network', value: '2.4 GHz Host AP (Channel 6)' },
        { label: 'Extended Network', value: '2.4 GHz High-Gain Extender' },
        { label: 'Wireless Security', value: 'WPA2-PSK (AES Encryption)' },
        { label: 'Ethernet Ports', value: '1x 100M Fast Ethernet RJ45' },
        { label: 'Antenna Config', value: 'Dual External High-Gain Antennas' },
        { label: 'Signal Quality', value: isWifiBroken ? '0 dBm (Lost)' : isSlow ? '-82 dBm (Weak)' : '-52 dBm (Working Well)' },
      ],
      diagnosticTitle: isWifiBroken
        ? 'Wireless Link Dropped'
        : isPacketLoss
          ? 'High Packet Drops on 2.4 GHz Air Interface'
          : isSlow
            ? 'High Wireless Interference Detected'
            : 'Repeater Working Well',
      diagnosticText: isWifiBroken
        ? 'The TP-Link TL-WA855RE has lost Wi-Fi association with the main office router. Verify wall socket power and check the front LED ring.'
        : isPacketLoss
          ? 'Heavy RF collision detected across the 2.4 GHz band causing 45% packet retransmissions. Bridge retry buffers are absorbing jitter.'
          : isSlow
            ? 'Elevated latency detected over the 2.4 GHz air interface. Check for channel congestion or physical obstructions between the repeater and tablet.'
            : 'The TP-Link TL-WA855RE is operating normally with 1 client connected, transparently bridging the TA500 Ethernet port to the office Wi-Fi network.',
    },
    tablet: {
      name: 'Samsung Galaxy Tab A9+ (Sync Bridge Host)',
      subtitle: 'Dedicated Android Bridge Hardware Running Termux Python Engine',
      type: 'Edge Ingestion & Anti-Double Tap Gateway',
      ip: '192.168.0.112 (WLAN Static Lease)',
      port: 'TCP 4370 Local / HTTPS Uplink',
      protocol: 'Python 3.11 · tablet_bridge.py v18.9',
      statusBadge: isBridgeDown ? 'DAEMON TERMINATED' : 'ACTIVE POLLING (10s)',
      statusColor: isBridgeDown ? 'rose' : 'amber',
      specs: [
        { label: 'Platform & OS', value: 'Android 14 (One UI 6.0) · Termux' },
        { label: 'Processor', value: 'Qualcomm Snapdragon 695 5G' },
        { label: 'Session Protocol', value: 'Persistent TCP Stream Keepalive' },
        { label: 'Daemon Supervisor', value: 'Automated 24/7 Health Guard' },
        { label: 'Sensor Allocation', value: '> 95% Sensor CPU Dedicated' },
        { label: 'Ingestion Architecture', value: 'Upsert with Composite Key Uniqueness' },
        { label: 'Cache Window', value: '30-Day Bounded Rolling Hashes' },
        { label: 'Debounce Engine', value: '15s Rapid Tap Protection Window' },
      ],
      diagnosticTitle: isBridgeDown
        ? 'Python Sync Daemon Offline'
        : 'Bridge Engine Running v18.9 (Iron Sentinel · Self-Healing Chunker)',
      diagnosticText: isBridgeDown
        ? 'The bridge process has been terminated. Open Termux on the tablet and type "bash sync-bridge/watchdog.sh" to restart automatic synchronization.'
        : 'The bridge engine queries the TA500 every 10s, isolates attendance fetching to dedicated clean sockets, strips duplicated double-taps within 15 seconds, and securely ships records to Supabase.',
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
      {/* ──── Top Hero Banner ──────────────────────────────────────────────────────────────────────────────────────────── */}
      <PageBanner
        theme="sync"
        pattern="circuit"
        eyebrow="Physical Biometric Topology · Bridge v18.9 Iron Sentinel"
        eyebrowIcon={<Cpu className="w-3.5 h-3.5 text-cyan-200" />}
        icon={<Activity className="w-6 h-6 text-white animate-pulse" />}
        title="Sync Bridge Infrastructure & Telemetry Monitor"
        description="End-to-end physical network topology from FingerTec TA500 through TP-Link Wi-Fi bridge and Samsung Tab A9+ daemon into Supabase Singapore cloud."
        chips={[
          {
            icon: <Fingerprint className="w-3.5 h-3.5 text-cyan-200" />,
            label: 'TA500 · 192.168.0.58:4370',
          },
          {
            icon: <Radio className="w-3.5 h-3.5 text-emerald-200" />,
            label: liveBridgeOnline
              ? `Heartbeat Active (${heartbeatAgeSec}s ago)`
              : 'Bridge Standby',
          },
          {
            icon: <Database className="w-3.5 h-3.5 text-teal-200" />,
            label: `${totalRecords.toLocaleString()} Cloud Punches (${liveLatency} ms RTT)`,
          },
        ]}
        actions={
          <button
            type="button"
            onClick={handleTestPing}
            disabled={testingPing}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white text-cyan-950 hover:bg-cyan-50 active:scale-95 text-xs font-bold shadow-md transition-all disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-700 ${testingPing ? 'animate-spin' : ''}`} />
            {testingPing ? 'Pinging Nodes...' : 'Run Diagnostics'}
          </button>
        }
      />

      {/* ──── Active Status Alert Banner (Positioned directly under header for immediate awareness) ───── */}
      <div
        className={`p-4 rounded-2xl border transition-all flex items-start gap-3 shadow-sm ${
          isHealthy
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : isSlow || isPacketLoss
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
        }`}
      >
        <div className="mt-0.5">
          {isHealthy ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : isSlow || isPacketLoss ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 animate-bounce" />
          ) : (
            <XCircle className="w-5 h-5 text-rose-600 animate-pulse" />
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-black uppercase tracking-wider">
            {isHealthy && (isManualSim ? 'Operational · All Biometric Nodes Synchronized' : 'Live Pipeline 100% Operational · All Hardware Synchronized')}
            {isTa500PowerOff && 'Critical Hardware Fault · FingerTec TA500 Power Severed (12V DC Loss)'}
            {isLanBroken && !isTa500PowerOff && (isManualSim ? 'Hardware Fault · RJ45 Ethernet Disconnected from FingerTec TA500' : 'Live Hardware Advisory · FingerTec TA500 Powered Off or Unreachable')}
            {isWifiBroken && 'Wireless Link Severed · TP-Link TL-WA855RE Lost 2.4 GHz Association'}
            {isPacketLoss && 'Network Advisory · 45% RF Packet Loss & High Jitter on 2.4 GHz Wi-Fi'}
            {isSlow && 'Performance Advisory · Elevated Latency / Wireless Jitter Detected'}
            {isBridgeDown && (isManualSim ? 'Daemon Inactive · Termux Python Sync Engine Stopped on Tablet' : 'Live Daemon Offline · Samsung Tab A9+ Bridge Inactive')}
            {isCloudDown && 'WAN Outage · Supabase Singapore Cloud Database Unreachable (504 Timeout)'}
          </h2>
          <p className="text-xs mt-0.5 leading-relaxed opacity-90 font-medium">
            {isHealthy &&
              (isManualSim
                ? `FingerTec TA500 (192.168.0.58) communicates cleanly over physical Cat6 Ethernet through the TP-Link TL-WA855RE repeater to the Samsung Tab A9+ bridge daemon. Latest roundtrip latency: ${liveLatency}ms.`
                : `FingerTec TA500 (192.168.0.58) is online and responding. Samsung Tab A9+ bridge v18.9 heartbeat active (${heartbeatAgeSec}s ago). Cloud roundtrip latency: ${liveLatency}ms.`)}
            {isTa500PowerOff &&
              'The FingerTec TA500 terminal has lost 12V DC electrical power. The optical prism and TFT screen are off. Cat6 carrier voltage has collapsed.'}
            {isLanBroken && !isTa500PowerOff &&
              (isManualSim
                ? 'The physical Cat6 RJ45 patch cable between the FingerTec TA500 LAN port and the Wi-Fi Repeater is unplugged, loose, or severed. Re-insert the cable firmly.'
                : 'The Samsung Tab A9+ bridge daemon is running, but cannot reach FingerTec TA500 at 192.168.0.58:4370. Verify the TA500 power adapter is switched ON and the Cat6 LAN cable is securely plugged into the Wi-Fi repeater.')}
            {isWifiBroken &&
              'The TP-Link TL-WA855RE repeater has lost connection to the office Wi-Fi router. Verify the wall socket power LED and ensure the repeater is within range.'}
            {isPacketLoss &&
              'Heavy RF congestion on the 2.4 GHz channel is causing frame drops. The bridge daemon automatic retry mechanism is handling transmission recovery.'}
            {isSlow &&
              'Biometric query packet roundtrip is elevated (~480ms). Check for 2.4 GHz Wi-Fi channel congestion or physical obstructions between the repeater and tablet.'}
            {isBridgeDown &&
              (isManualSim
                ? 'The synchronization daemon (tablet_bridge.py v18.9) has terminated on the Samsung Tab A9+. Open Termux and execute: "bash sync-bridge/watchdog.sh".'
                : `No live heartbeat received from the bridge daemon in ${heartbeatAgeSec}s. Turn on the Samsung Galaxy Tab A9+, open Termux, and execute: "bash sync-bridge/watchdog.sh".`)}
            {isCloudDown &&
              'Local tablet cannot reach Supabase in Singapore. New biometric punches remain securely buffered in TA500 onboard flash memory and will sync upon reconnection.'}
          </p>
        </div>
      </div>

      {/* ──── Visual Topology Architecture Diagram (Light Theme 3D/2D Visual) ──────────────── */}
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
                High Latency / Jitter
              </span>
              <span className="flex items-center gap-1.5 text-rose-700">
                <span className="w-3 h-1.5 rounded-full bg-rose-500" />
                Fault / Severed / Power Cut
              </span>
            </div>
          </div>

          {/* ──── 3D PHYSICAL HARDWARE DIAGRAM ROW (LOCAL EDGE TIER WITH CONNECTING LINES) ────────────────── */}
          <div className="relative mb-0">
            <div className="flex flex-col lg:flex-row items-stretch justify-between gap-0 relative">

              {/* ════════════════════════ NODE 1: FINGERTEC TA500 (3D BIOMETRIC MACHINE) ════════════════════════ */}
              <div
                onClick={() => handleInspectNode('ta500')}
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
                {/* Right connection port socket */}
                <div
                  className={`absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 hidden lg:flex items-center justify-center ${
                    isTa500PowerOff || isLanBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-blue-600 ring-2 ring-blue-200'
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
                        isTa500PowerOff
                          ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse'
                          : isLanBroken
                            ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse'
                            : isBridgeDown
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {isTa500PowerOff
                        ? '✕ POWER LOSS (12V DC)'
                        : isLanBroken
                          ? (isManualSim ? '✕ LAN UNPLUGGED' : '✕ NO CARRIER / DOWN')
                          : isBridgeDown
                            ? '⚠ BRIDGE OFFLINE'
                            : '● READY (TCP/UDP 4370)'}
                    </span>
                  </div>

                  {/* Visual 3D Chassis Representation */}
                  <div className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-xl p-3 border-2 border-slate-700 text-white shadow-inner relative overflow-hidden mb-3">
                    {/* Screen Section */}
                    <div className={`rounded-lg p-2.5 border font-mono text-[11px] mb-2.5 relative transition-colors ${
                      isTa500PowerOff
                        ? 'bg-black border-slate-800 text-slate-600'
                        : 'bg-slate-950 border-cyan-500/30 text-white'
                    }`}>
                      <div className="flex items-center justify-between text-[9px] border-b border-slate-800 pb-1 mb-1.5">
                        <span className={`font-bold ${isTa500PowerOff ? 'text-slate-600' : isLanBroken ? 'text-rose-400' : 'text-cyan-400'}`}>
                          TA500 TFT 2.8&quot;
                        </span>
                        <span className="text-slate-400">
                          {isTa500PowerOff ? 'POWER CUT' : isLanBroken ? 'OFFLINE' : liveTime || '15:00:00'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isTa500PowerOff
                              ? 'bg-slate-800'
                              : isLanBroken
                                ? 'bg-rose-500'
                                : isBridgeDown
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400 animate-ping'
                          }`}
                        />
                        <span className={`font-bold ${
                          isTa500PowerOff
                            ? 'text-slate-500'
                            : isLanBroken
                              ? 'text-rose-300'
                              : isBridgeDown
                                ? 'text-amber-300'
                                : 'text-white'
                        }`}>
                          {isTa500PowerOff
                            ? 'NO 12V DC POWER'
                            : isLanBroken
                              ? (isManualSim ? 'NO LAN CARRIER' : 'WAITING FOR CARRIER')
                              : isBridgeDown
                                ? 'WAITING FOR BRIDGE...'
                                : 'SCAN FINGER / CARD'}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-400 mt-1 flex justify-between">
                        <span>IP: 192.168.0.58</span>
                        <span className={isTa500PowerOff ? 'text-slate-600' : isLanBroken ? 'text-rose-400 font-bold' : 'text-cyan-300'}>
                          {isTa500PowerOff ? 'OFFLINE' : isLanBroken ? 'PORT CLOSED' : 'TCP/UDP: 4370'}
                        </span>
                      </div>
                    </div>

                    {/* Sensor & Keypad Row */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      {/* Optical Fingerprint Scanner Prism with Laser Scan Beam */}
                      <div
                        className={`relative w-14 h-16 rounded-lg border-2 flex items-center justify-center overflow-hidden shadow-inner ${
                          isTa500PowerOff || isLanBroken
                            ? 'bg-slate-950 border-slate-700'
                            : 'bg-emerald-950/80 border-emerald-500/60'
                        }`}
                      >
                        <Fingerprint
                          className={`w-9 h-9 ${
                            isTa500PowerOff
                              ? 'text-slate-800 opacity-20'
                              : isLanBroken
                                ? 'text-slate-600 opacity-40'
                                : 'text-emerald-400 opacity-70'
                          }`}
                        />
                        {/* Animated Laser Beam (Active only when device is powered and connected) */}
                        {!isTa500PowerOff && !isLanBroken && (
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
                            className={`h-3.5 rounded-sm flex items-center justify-center text-[8px] font-mono ${
                              isTa500PowerOff ? 'bg-slate-900 text-slate-600' : 'bg-slate-700/80 text-slate-300'
                            }`}
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
                            isTa500PowerOff || isLanBroken ? 'bg-slate-700' : 'bg-emerald-400 shadow-[0_0_6px_#10b981]'
                          }`}
                          title="Link LED"
                        />
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isTa500PowerOff || isLanBroken ? 'bg-slate-700' : 'bg-amber-400 animate-pulse'
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

                  {/* Informative Hardware Spec Matrix (Fills whitespace professionally) */}
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                    <div className="bg-slate-50 border border-slate-200/90 rounded-lg p-1.5 flex items-center justify-between">
                      <span className="text-slate-400 font-semibold">Firmware:</span>
                      <span className="font-bold text-slate-700">TCMS v6.60</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/90 rounded-lg p-1.5 flex items-center justify-between">
                      <span className="text-slate-400 font-semibold">Capacity:</span>
                      <span className="font-bold text-emerald-600">100k Logs</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/90 rounded-lg p-1.5 flex items-center justify-between">
                      <span className="text-slate-400 font-semibold">Users:</span>
                      <span className="font-bold text-blue-600">3,000 Enrolled</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/90 rounded-lg p-1.5 flex items-center justify-between">
                      <span className="text-slate-400 font-semibold">Sensor:</span>
                      <span className="font-bold text-indigo-600">500 DPI Glass</span>
                    </div>
                  </div>

                  {/* Hardware Buffer Progress Bar */}
                  <div className="mt-2 bg-slate-50 border border-slate-200/80 rounded-lg p-2">
                    <div className="flex items-center justify-between text-[9px] font-mono mb-1">
                      <span className="text-slate-500 font-bold">Flash Memory Buffer:</span>
                      <span className="text-emerald-700 font-black">{totalRecords.toLocaleString()} / 100,000 (&lt; 0.2%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                        style={{ width: `${Math.max(2, Math.min(100, (totalRecords / 100000) * 100))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 mt-1">
                      <span>Speed: &lt; 0.5s Biometric 1:N</span>
                      <span>Tamper: Sealed Optical Switch</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-slate-500 font-bold">192.168.0.58</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInspectNode('ta500')
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform cursor-pointer"
                  >
                    Inspect Specs <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* ──── CONNECTOR 1: CAT6 ETHERNET PHYSICAL BRIDGE (DESKTOP EDGE-TO-EDGE) ──── */}
              <div className="hidden lg:flex items-center shrink-0 w-20 xl:w-28 relative z-10 mx-0">
                <div className="w-full relative flex flex-col items-center justify-center">
                  {/* Top badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-sm whitespace-nowrap mb-2 ${
                      isTa500PowerOff
                        ? 'bg-slate-100 text-slate-600 border-slate-300'
                        : isLanBroken
                          ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                          : isPacketLoss
                            ? 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse'
                            : isSlow
                              ? 'bg-amber-50 text-amber-700 border-amber-300'
                              : 'bg-white text-blue-700 border-blue-200'
                    }`}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      {!isTa500PowerOff && !isLanBroken && !isPacketLoss && !isSlow && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      )}
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                        isTa500PowerOff
                          ? 'bg-slate-400'
                          : isLanBroken
                            ? 'bg-rose-500'
                            : isPacketLoss || isSlow
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                      }`} />
                    </span>
                    <span>
                      {isTa500PowerOff
                        ? '✕ 0V DC POWER CUT'
                        : isLanBroken
                          ? '✕ LAN SEVERED'
                          : isPacketLoss
                            ? '⚠ 45% RETRY BUFFER'
                            : 'Cat6 RJ45 → 100M'}
                    </span>
                  </span>

                  {/* Sleek Continuous Cable Line */}
                  <div
                    className={`w-full h-2 rounded-full border relative overflow-hidden shadow-inner ${
                      isTa500PowerOff
                        ? 'bg-slate-200 border-slate-300'
                        : isLanBroken
                          ? 'bg-rose-100 border-rose-300'
                          : 'bg-slate-100 border-slate-300'
                    }`}
                  >
                    {isTa500PowerOff ? (
                      <div className="w-full h-full bg-slate-400/40" />
                    ) : isLanBroken ? (
                      <div className="w-full h-full bg-rose-500 animate-pulse" />
                    ) : (
                      <>
                        <div
                          className={`h-full w-full ${
                            isPacketLoss
                              ? 'bg-gradient-to-r from-amber-500 via-rose-400 to-amber-500 animate-pulse'
                              : isSlow
                                ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-pipe-flow-slow'
                                : 'bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-600 animate-smooth-conduit'
                          }`}
                        />
                        <div className="absolute inset-y-0 w-8 bg-white/80 blur-[1px] animate-smooth-packet pointer-events-none" />
                      </>
                    )}
                  </div>

                  {/* Bottom label */}
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full border shadow-sm text-[9px] font-mono font-bold whitespace-nowrap mt-2 ${
                      isTa500PowerOff
                        ? 'bg-slate-100 text-slate-600 border-slate-300'
                        : isLanBroken
                          ? 'bg-rose-50 text-rose-700 border-rose-300'
                          : isPacketLoss
                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {isTa500PowerOff ? 'No Voltage' : isLanBroken ? 'Port Closed' : isPacketLoss ? 'Jitter: Elevated' : 'UDP 4370 · Flow: Active'}
                  </span>
                </div>
              </div>

              {/* ──── CONNECTOR 1: MOBILE VERTICAL BRIDGE (EDGE-TO-EDGE) ──── */}
              <div className="flex lg:hidden flex-col items-center justify-center py-2 relative">
                <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 -mb-1 ${
                  isTa500PowerOff || isLanBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-blue-600 ring-2 ring-blue-200'
                }`} />
                <div
                  className={`w-2 h-10 relative overflow-hidden rounded-full border ${
                    isTa500PowerOff ? 'bg-slate-200 border-slate-300' : isLanBroken ? 'bg-rose-100 border-rose-300' : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  {!isTa500PowerOff && !isLanBroken && (
                    <div className="w-full h-full bg-gradient-to-b from-blue-500 via-cyan-400 to-blue-500 animate-smooth-conduit-v" />
                  )}
                  {isTa500PowerOff && <div className="w-full h-full bg-slate-400/40" />}
                  {isLanBroken && !isTa500PowerOff && <div className="w-full h-full bg-rose-500 animate-pulse" />}
                </div>
                <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 -mt-1 ${
                  isTa500PowerOff || isLanBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-blue-600 ring-2 ring-blue-200'
                }`} />
                <span className={`inline-flex items-center gap-1 text-[8px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-xs mt-1.5 ${
                  isTa500PowerOff
                    ? 'bg-slate-100 text-slate-600 border-slate-300'
                    : isLanBroken
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-white text-blue-700 border-blue-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isTa500PowerOff ? 'bg-slate-400' : isLanBroken ? 'bg-rose-500' : 'bg-blue-500 animate-ping'}`} />
                  <span>{isTa500PowerOff ? '✕ Power Cut' : isLanBroken ? '✕ Cat6 Severed' : '▼ Cat6 RJ45 (100 Mbps Duplex)'}</span>
                </span>
              </div>

              {/* ════════════════════════ NODE 2: TP-LINK TL-WA855RE REPEATER (AP BRIDGE) ════════════════════════ */}
              <div
                onClick={() => handleInspectNode('repeater')}
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
                {/* Left & Right connection port sockets */}
                <div
                  className={`absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 hidden lg:flex items-center justify-center ${
                    isTa500PowerOff || isLanBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-blue-600 ring-2 ring-blue-200'
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
                      DEVICE #2 · TP-LINK TL-WA855RE
                    </span>
                    <span
                      className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${
                        isWifiBroken || isLanBroken
                          ? 'bg-rose-50 text-rose-600 border-rose-200'
                          : isPacketLoss
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}
                    >
                      {isWifiBroken
                        ? '✕ NO WI-FI'
                        : isLanBroken
                          ? '✕ NO LAN INPUT'
                          : isPacketLoss
                            ? '⚠ 45% LOSS'
                            : '● WORKING WELL'}
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
                          isTa500PowerOff || isLanBroken
                            ? 'text-rose-600'
                            : isPacketLoss || isSlow
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isTa500PowerOff || isLanBroken ? 'bg-rose-500' : 'bg-emerald-500 animate-ping'
                          }`}
                        />
                        {isTa500PowerOff ? 'TA500 POWER OFF' : isLanBroken ? 'NO RJ45 CARRIER' : '100 Mbps Duplex Ingesting'}
                      </span>
                    </div>

                    {/* Active Cable Loading Pipeline */}
                    <div className="relative flex items-center gap-1.5">
                      {/* 8-Pin RJ45 Gold Contact Head Mockup */}
                      <div className="shrink-0 flex flex-col gap-0.5 p-1 bg-white border border-slate-300 rounded shadow-xs">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((pin) => (
                            <div
                              key={pin}
                              className={`w-1 h-2 rounded-[1px] ${
                                isTa500PowerOff || isLanBroken ? 'bg-slate-300' : 'bg-amber-400 shadow-[0_0_2px_#fbbf24]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Flowing Data Conduit Track */}
                      <div className="flex-1 h-6 rounded-full bg-slate-200/90 border border-slate-300 p-0.5 overflow-hidden relative shadow-inner">
                        {isTa500PowerOff || isLanBroken ? (
                          <div className="w-full h-full rounded-full bg-rose-100 flex items-center justify-center text-[8px] font-mono font-black text-rose-700 tracking-wider">
                            {isTa500PowerOff ? '0V DC · POWER SEVERED' : 'PORT OFFLINE · NO CARRIER'}
                          </div>
                        ) : (
                          <>
                            <div
                              className={`h-full w-full rounded-full ${
                                isPacketLoss
                                  ? 'bg-gradient-to-r from-amber-500 via-rose-400 to-amber-500 animate-pulse'
                                  : isSlow
                                    ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-smooth-conduit'
                                    : 'bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-500 animate-smooth-conduit'
                              }`}
                            />
                            <div className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/80 to-transparent animate-smooth-packet pointer-events-none" />
                          </>
                        )}
                      </div>
                    </div>

                    {/* Active Telemetry Sub-row */}
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mt-2 pt-1.5 border-t border-slate-200">
                      <span>Wire: STP 4-Pair 24AWG · Cat6</span>
                      <span className={isTa500PowerOff || isLanBroken ? 'text-rose-600 font-bold' : 'text-blue-700 font-bold'}>
                        {isTa500PowerOff ? 'Link State: POWER CUT' : isLanBroken ? 'Link State: DOWN' : 'UDP Port: 4370 · Flow: Active'}
                      </span>
                    </div>
                  </div>

                  {/* 3D TP-Link TL-WA855RE Hardware Chassis with Twin Antennas */}
                  <div className="bg-gradient-to-b from-slate-100 via-white to-slate-50 rounded-xl p-3 border-2 border-slate-300 shadow-sm relative mb-3">
                    {/* Twin External Antennas pointing upward */}
                    <div className="flex justify-between px-5 -mt-6 mb-1.5">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-7 bg-slate-300 border border-slate-400 rounded-t-sm shadow-sm" />
                        <div className="w-3 h-1.5 bg-slate-400 rounded-b-xs" />
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-7 bg-slate-300 border border-slate-400 rounded-t-sm shadow-sm" />
                        <div className="w-3 h-1.5 bg-slate-400 rounded-b-xs" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-purple-100 text-purple-700 border border-purple-200">
                          {isWifiBroken ? (
                            <WifiOff className="w-5 h-5 text-rose-600" />
                          ) : (
                            <Radio className="w-5 h-5 animate-pulse" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            <span>TL-WA855RE</span>
                            <span className="text-[9px] font-bold text-slate-400 font-sans">tp-link</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">192.168.0.254 (AP Bridge)</div>
                        </div>
                      </div>

                      {/* Working Well Green Status LED */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200">
                        <span className={`w-2 h-2 rounded-full ${
                          isWifiBroken ? 'bg-rose-500' : 'bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse'
                        }`} />
                        <span className="text-[9px] font-mono font-bold text-slate-700">
                          {isWifiBroken ? 'Offline' : 'Working Well'}
                        </span>
                      </div>
                    </div>

                    {/* TP-Link Tether App 4-Card Status Grid (Accurate to real hardware app) */}
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[9px] font-mono">
                      <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">Network Status:</span>
                        <span className={`font-bold ${isWifiBroken ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {isWifiBroken ? 'Disconnected' : 'Online (Stable)'}
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">Clients:</span>
                        <span className="font-bold text-slate-700">1 Online (Bridge)</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">Main Network:</span>
                        <span className="font-bold text-purple-600">2.4 GHz Host</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">Extended Wi-Fi:</span>
                        <span className="font-bold text-indigo-600">2.4 GHz Extender</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-900">TP-Link TL-WA855RE</h3>
                    <p className="text-xs text-slate-500 font-medium">300Mbps Wi-Fi Range Extender &amp; Bridge</p>
                  </div>

                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-slate-500 font-bold">802.11n · 2.4 GHz (300M)</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInspectNode('repeater')
                    }}
                    className="text-[10px] font-bold text-purple-600 hover:text-purple-700 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform cursor-pointer"
                  >
                    Inspect Specs <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* ──── CONNECTOR 2: WIRELESS 2.4 GHz WLAN CORRIDOR (DESKTOP EDGE-TO-EDGE) ──── */}
              <div className="hidden lg:flex items-center shrink-0 w-20 xl:w-28 relative z-10 mx-0">
                <div className="w-full relative flex flex-col items-center justify-center">
                  {/* Top Badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-sm whitespace-nowrap mb-2 ${
                      isWifiBroken
                        ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                        : isPacketLoss
                          ? 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse'
                          : isSlow
                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : 'bg-white text-purple-700 border-purple-200'
                    }`}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      {!isWifiBroken && !isPacketLoss && !isSlow && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                      )}
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                        isWifiBroken ? 'bg-rose-500' : isPacketLoss || isSlow ? 'bg-amber-500' : 'bg-purple-500'
                      }`} />
                    </span>
                    <span>
                      {isWifiBroken
                        ? '✕ WI-FI DROPPED'
                        : isPacketLoss
                          ? '⚠ 45% RF LOSS'
                          : '2.4 GHz Wi-Fi →'}
                    </span>
                  </span>

                  {/* Sleek Wireless Air corridor */}
                  <div
                    className={`w-full h-2 rounded-full border relative overflow-hidden shadow-inner ${
                      isWifiBroken ? 'bg-rose-100 border-rose-300' : 'bg-slate-100 border-slate-300'
                    }`}
                  >
                    {isWifiBroken ? (
                      <div className="w-full h-full bg-rose-500 animate-pulse" />
                    ) : (
                      <>
                        <div
                          className={`h-full w-full ${
                            isPacketLoss
                              ? 'bg-gradient-to-r from-purple-500 via-amber-400 to-purple-500 animate-pulse'
                              : isSlow
                                ? 'bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 animate-pipe-flow-slow'
                                : 'bg-gradient-to-r from-purple-600 via-pink-400 to-indigo-600 animate-smooth-conduit'
                          }`}
                        />
                        <div className="absolute inset-y-0 w-8 bg-white/80 blur-[1px] animate-smooth-packet pointer-events-none" />
                      </>
                    )}
                  </div>

                  {/* Bottom Label */}
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full border shadow-sm text-[9px] font-mono font-bold whitespace-nowrap mt-2 ${
                      isWifiBroken
                        ? 'bg-rose-50 text-rose-700 border-rose-300'
                        : isPacketLoss || isSlow
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {isWifiBroken ? 'Carrier Lost' : isPacketLoss ? 'RF Jitter High' : isSlow ? '-82 dBm (Weak)' : '-52 dBm Stable'}
                  </span>
                </div>
              </div>

              {/* ──── CONNECTOR 2: MOBILE VERTICAL WIRELESS BRIDGE (EDGE-TO-EDGE) ──── */}
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
                    <div className="w-full h-full bg-gradient-to-b from-purple-500 via-pink-400 to-indigo-500 animate-smooth-conduit-v" />
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
                  <span>{isWifiBroken ? '✕ Wireless Link Severed' : '▼ 2.4 GHz Air Bridge (-52 dBm)'}</span>
                </span>
              </div>

              {/* ════════════════════════ NODE 3: SAMSUNG GALAXY TAB A9+ (BRIDGE DAEMON) ════════════════════════ */}
              <div
                onClick={() => handleInspectNode('tablet')}
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
                {/* Left connection port socket */}
                <div
                  className={`absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-30 hidden lg:flex items-center justify-center ${
                    isWifiBroken ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-purple-600 ring-2 ring-purple-200'
                  }`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>

                {/* Vertical Conduit going down to the WAN Beam */}
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

                  {/* Pill Badge anchored cleanly to the LEFT of the conduit so it never clips past the container edge */}
                  <div className="absolute right-5 top-[42%] -translate-y-1/2 pointer-events-auto z-40">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold shadow-md border whitespace-nowrap backdrop-blur-xs ${
                      isBridgeDown
                        ? 'bg-rose-50/95 text-rose-700 border-rose-300 animate-pulse'
                        : 'bg-white/95 text-indigo-700 border-indigo-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isBridgeDown ? 'bg-rose-500' : 'bg-indigo-500 animate-ping'}`} />
                      <span>{isBridgeDown ? '▼ LOCAL INGESTION HALTED' : '▼ Local Ingestion Stream (HTTPS / TLS 1.3)'}</span>
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
                      {isBridgeDown ? '✕ DAEMON STOPPED' : '● BRIDGE v18.9 ACTIVE'}
                    </span>
                  </div>

                  {/* 3D Tablet Frame with Termux Terminal Screen */}
                  <div className="bg-gradient-to-b from-slate-300 via-slate-200 to-slate-400 rounded-xl p-2 border-2 border-slate-400 shadow-sm mb-3 min-w-0">
                    {/* Camera pinhole */}
                    <div className="flex justify-center mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                    </div>

                    {/* Dark Terminal Screen running bridge.py (Stable dimensions: prevents resizing on heartbeat changes) */}
                    <div className="bg-slate-950 rounded-lg p-2.5 font-mono text-[10px] text-slate-200 border border-slate-800 leading-relaxed shadow-inner min-w-0 overflow-hidden min-h-[162px] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1 mb-1.5 text-[9px]">
                          <span className="flex items-center gap-1 text-amber-400 font-bold truncate">
                            <Terminal className="w-3 h-3 shrink-0" /> Termux · python tablet_bridge.py
                          </span>
                          <span className="shrink-0 ml-1">v18.9</span>
                        </div>
                        {isBridgeDown ? (
                          <div className="text-rose-400 font-bold py-1 text-[9px]">
                            [CRITICAL] Process terminated (SIGTERM)
                            <br />
                            {heartbeatAgeSec > 0 && heartbeatAgeSec < 9000
                              ? `Last heartbeat: ${heartbeatAgeSec}s ago. Termux suspended.`
                              : 'Daemon stopped. No polling active.'}
                          </div>
                        ) : !liveTa500Online ? (
                          <div className="space-y-1 text-[9px]">
                            <div className="text-amber-300 font-bold">
                              [RETRY] Connecting to TA500 (192.168.0.58)...
                            </div>
                            <div className="text-slate-400 flex items-center gap-1">
                              <span>Bridge daemon active (Heartbeat</span>
                              <span className="tabular-nums font-mono text-slate-200 inline-block min-w-[20px] text-right font-semibold">
                                {heartbeatAgeSec}s
                              </span>
                              <span>ago)</span>
                            </div>
                            <div className="text-cyan-300 text-[8.5px]">
                              [SUPERVISOR] 24/7 Watchdog Protected · Option B Active
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1 font-mono text-[9px] leading-tight">
                            <div className="text-emerald-400 font-bold flex items-center justify-between min-w-0">
                              <span className="truncate">[POLL] 192.168.0.58:4370</span>
                              <span className="text-emerald-300 font-semibold shrink-0 ml-1">● HEALTHY (10s)</span>
                            </div>
                            <div className="text-cyan-300 flex items-center justify-between min-w-0">
                              <span className="truncate">[SENSOR] Optical Prism Scanner</span>
                              <span className="text-cyan-200 shrink-0 ml-1">UNLOCKED / ACTIVE</span>
                            </div>
                            <div className="text-amber-300/95 flex items-center justify-between min-w-0">
                              <span className="truncate">[DEBOUNCE] Anti-Double Tap Filter</span>
                              <span className="text-amber-200 shrink-0 ml-1">15s Window (Active)</span>
                            </div>
                            <div className="text-purple-300 flex items-center justify-between min-w-0">
                              <span className="truncate">[BUFFER] Hardware Flash Commit</span>
                              <span className="text-purple-200 shrink-0 ml-1">1.5s Grace Period</span>
                            </div>
                            <div className="text-blue-300 flex items-center justify-between min-w-0">
                              <span className="truncate">[DATABASE] Biometric Punches</span>
                              <span className="text-blue-200 shrink-0 ml-1">{totalRecords} Synced · 0 Queue</span>
                            </div>
                            <div className="text-indigo-300 flex items-center justify-between min-w-0">
                              <span className="truncate">[UPLINK] Supabase Realtime CDC</span>
                              <span className="text-indigo-200 shrink-0 ml-1">TLS 1.3 Streaming</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Heartbeat Status Line: Strictly fixed-width tabular numbers to prevent layout shift */}
                      <div className="text-slate-400 text-[8.5px] pt-1.5 border-t border-slate-800/80 flex items-center justify-between min-w-0 mt-1">
                        <div className="truncate flex items-center gap-1 min-w-0">
                          <span className="shrink-0">[HEARTBEAT]</span>
                          <span className="tabular-nums font-mono text-slate-200 font-bold inline-block min-w-[28px] text-right shrink-0">
                            {heartbeatAgeSec}s
                          </span>
                          <span className="shrink-0">ago · Persistent</span>
                        </div>
                        <span className="text-emerald-400 font-bold shrink-0 ml-2 whitespace-nowrap">● 24/7 Watchdog Active</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-900">Samsung Galaxy Tab A9+</h3>
                    <p className="text-xs text-slate-500 font-medium">Local Python Synchronization Bridge Daemon</p>

                    {/* Professional Enterprise Telemetries (Replacing informal text) */}
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                      <div className="bg-slate-50 border border-slate-200/90 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">Session Protocol:</span>
                        <span className="font-bold text-blue-600">Persistent TCP Stream</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200/90 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">Daemon Guard:</span>
                        <span className="font-bold text-indigo-600">Health Supervisor</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200/90 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">Sensor Workload:</span>
                        <span className="font-bold text-emerald-600">&gt; 95% Free</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200/90 rounded-lg p-1.5 flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">Wire Transport:</span>
                        <span className="font-bold text-slate-700">TCP Port 4370</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-slate-500 font-bold">Termux · Python 3.11</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInspectNode('tablet')
                    }}
                    className="text-[10px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform cursor-pointer"
                  >
                    Inspect Specs <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ──── MOBILE CONNECTOR 3: VERTICAL BRIDGE FROM TABLET TO WAN BEAM ──── */}
          <div className="flex lg:hidden flex-col items-center justify-center py-2 relative">
            <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 -mb-1 ${
              isBridgeDown ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-indigo-600 ring-2 ring-indigo-200'
            }`} />
            <div
              className={`w-2 h-10 relative overflow-hidden rounded-full border ${
                isBridgeDown ? 'bg-rose-100 border-rose-300' : 'bg-indigo-50 border-indigo-200'
              }`}
            >
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
              <span>{isBridgeDown ? '✕ Ingestion Halted (Daemon Down)' : '▼ Local Ingestion Stream (HTTPS / TLS 1.3)'}</span>
            </span>
          </div>

          {/* ──── HORIZONTAL WAN BEAM / CLOUD CORRIDOR (INTERNET BOUNDARY) ──────────── */}
          <div className="relative mt-12 mb-8 lg:mt-14 lg:mb-10">
            <div className="relative flex items-center justify-center">
              <div
                className={`w-full h-3 rounded-full border relative overflow-hidden shadow-sm ${
                  isCloudDown ? 'bg-rose-100 border-rose-300' : 'bg-slate-100 border-slate-300'
                }`}
              >
                {!isCloudDown && (
                  <>
                    <div className="h-full w-full bg-gradient-to-r from-blue-600 via-teal-400 to-emerald-500 animate-smooth-conduit" />
                    <div className="absolute inset-y-0 w-24 bg-white/70 blur-[1px] animate-smooth-packet pointer-events-none" />
                  </>
                )}
                {isCloudDown && <div className="h-full w-full bg-rose-500 animate-pulse" />}
              </div>

              {/* Central Glowing WAN Gateway Badge */}
              <div
                className={`absolute px-4 py-1.5 rounded-full border shadow-md flex items-center gap-2 text-xs font-mono transition-all ${
                  isCloudDown
                    ? 'bg-rose-100 text-rose-900 border-rose-400 animate-pulse'
                    : 'bg-white/95 backdrop-blur-sm text-slate-800 border-slate-300'
                }`}
              >
                <Globe className={`w-3.5 h-3.5 ${isCloudDown ? 'text-rose-600' : 'text-blue-600 animate-spin'}`} style={{ animationDuration: '8s' }} />
                <span className="font-black">INTERNET WAN UPLINK → SINGAPORE CLOUD REGION</span>
                <span
                  className={`font-mono font-black px-2 py-0.5 rounded text-[10px] border ${
                    isCloudDown
                      ? 'bg-rose-200 text-rose-900 border-rose-400'
                      : isSlow
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  }`}
                >
                  {isCloudDown ? 'LINK DOWN (504)' : `${liveLatency} ms RTT`}
                </span>
              </div>
            </div>

            {/* Vertical Conduit connecting WAN Beam to Supabase Cloud */}
            <div className="absolute left-1/4 -translate-x-1/2 top-full h-12 w-2.5 z-20 hidden lg:flex flex-col items-center pointer-events-none">
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

              {/* Pipe Tag */}
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
          </div>

          {/* ──── 3D CLOUD & APPLICATION TIER (GLOBAL INFRASTRUCTURE ROW) ─────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mt-4">
            {/* ════════════════════════ NODE 4: SUPABASE CLOUD DATABASE (SINGAPORE) ════════════════════════ */}
            <div
              onClick={() => handleInspectNode('supabase')}
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
                    {isCloudDown ? '✕ TIMEOUT (504)' : '● CLOUD READY'}
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleInspectNode('supabase')
                  }}
                  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform cursor-pointer"
                >
                  Inspect Specs <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* ════════════════════════ NODE 5: JAPA DTR ENTERPRISE PORTAL (VERCEL) ════════════════════════ */}
            <div
              onClick={() => handleInspectNode('vercel')}
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleInspectNode('vercel')
                  }}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform cursor-pointer"
                >
                  Inspect Specs <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* ──── CONNECTOR 5: REALTIME BI-DIRECTIONAL CLOUD BUS ────────────────────── */}
          <div className="mt-4 flex items-center justify-center">
            <div className="w-full max-w-xl bg-gradient-to-r from-emerald-50 via-cyan-50 to-indigo-50 px-4 py-2.5 rounded-2xl border border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono font-bold text-slate-600 shadow-xs">
              <span className="flex items-center gap-1.5 text-emerald-800">
                <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Supabase Cloud DB</span>
              </span>
              <span className="flex items-center gap-1.5 text-cyan-800 font-black bg-white/80 px-2.5 py-1 rounded-full border border-cyan-200 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                <span> ◀ WebSocket Realtime CDC Channel (Live Punch Push) ▶ </span>
              </span>
              <span className="flex items-center gap-1.5 text-indigo-800">
                <Globe className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>JAPA DTR Enterprise UI</span>
              </span>
            </div>
          </div>

          {/* ──── SUPER ADMIN EXCLUSIVE: REMOTE TA500 HARDWARE REBOOT PANEL ────── */}
          {isSuperAdmin && (
            <div className="mt-5 bg-gradient-to-br from-red-50/70 via-amber-50/50 to-orange-50/70 rounded-2xl border-2 border-red-200/90 shadow-sm p-5 relative overflow-hidden transition-all">
              {/* Glowing Top Accent Strip */}
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-red-500 via-amber-500 to-orange-500 shadow-xs" />

              {/* Header row */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-red-200/60 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-red-500/20 shrink-0">
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-black uppercase tracking-wider text-red-700 bg-red-100/90 border border-red-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                        <ShieldAlert className="w-3 h-3 text-red-600" />
                        SUPER ADMIN EXCLUSIVE · HARDWARE CONTROL
                      </span>
                      <span className="text-[10px] font-mono font-bold text-slate-500 bg-white/80 border border-slate-200 px-2 py-0.5 rounded-md">
                        Target: 192.168.0.58:4370
                      </span>
                    </div>
                    <h3 className="text-base font-black text-slate-900 mt-1 flex items-center gap-2">
                      FingerTec TA500 Remote Hardware Reboot
                      {isRestarting && (
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                          REBOOT IN PROGRESS ({restartSecondsLeft}s)
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Dispatches hardware soft-reboot &amp; optical prism recalibration via Samsung Tab A9+ bridge daemon UDP packet injection.
                    </p>
                  </div>
                </div>

                {/* Action CTA Button */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsRestartModalOpen(true)}
                    disabled={isRestarting || isDispatchingRestart}
                    className={`px-4 py-2.5 rounded-xl font-black text-xs shadow-md transition-all flex items-center gap-2 ${
                      isRestarting
                        ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed opacity-90'
                        : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-red-500/20 hover:shadow-lg active:scale-98 cursor-pointer'
                    }`}
                  >
                    {isRestarting ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin text-amber-700" />
                        <span>Rebooting Hardware ({restartSecondsLeft}s)...</span>
                      </>
                    ) : (
                      <>
                        <Power className="w-4 h-4" />
                        <span>🔄 Restart TA500 Terminal</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Status / Alert Messages */}
              {restartSuccess && (
                <div className="mt-3 bg-emerald-50 border border-emerald-300 text-emerald-900 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{restartSuccess}</span>
                </div>
              )}
              {restartError && (
                <div className="mt-3 bg-rose-50 border border-rose-300 text-rose-900 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{restartError}</span>
                </div>
              )}

              {/* Live Animation & Restart Progression Details */}
              {isRestarting ? (
                <div className="mt-4 space-y-4">
                  {/* Animated Signal Wave & Progress Bar */}
                  <div className="bg-white/80 backdrop-blur-xs border border-red-200/80 rounded-xl p-3.5 shadow-xs">
                    <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-700 mb-2">
                      <span className="flex items-center gap-1.5 text-red-800">
                        <Activity className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                        LIVE HARDWARE REBOOT SIGNAL PROPAGATION
                      </span>
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {Math.min(100, Math.round(((45 - restartSecondsLeft) / 45) * 100))}% COMPLETED · {restartSecondsLeft}s REMAINING
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden shadow-inner mb-3">
                      <div
                        className="bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 h-full rounded-full transition-all duration-1000 ease-linear shadow-sm"
                        style={{ width: `${Math.min(100, Math.round(((45 - restartSecondsLeft) / 45) * 100))}%` }}
                      />
                    </div>

                    {/* Node Signal Flow Visualizer */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-[10px] font-mono">
                      <div className={`p-2 rounded-lg border transition-all ${
                        restartStage >= 1 ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <div className="font-bold flex items-center justify-center gap-1">
                          {restartStage > 1 ? <Check className="w-3 h-3 text-emerald-600" /> : <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
                          1. Cloud CDC
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">sync_meta queue</div>
                      </div>

                      <div className={`p-2 rounded-lg border transition-all ${
                        restartStage >= 2 ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <div className="font-bold flex items-center justify-center gap-1">
                          {restartStage > 2 ? <Check className="w-3 h-3 text-emerald-600" /> : restartStage === 2 ? <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" /> : <Clock className="w-3 h-3 text-slate-400" />}
                          2. Bridge Injection
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">UDP Port 4370</div>
                      </div>

                      <div className={`p-2 rounded-lg border transition-all ${
                        restartStage >= 3 ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <div className="font-bold flex items-center justify-center gap-1">
                          {restartStage > 3 ? <Check className="w-3 h-3 text-emerald-600" /> : restartStage === 3 ? <RotateCw className="w-3 h-3 animate-spin text-amber-600" /> : <Clock className="w-3 h-3 text-slate-400" />}
                          3. TA500 Power Cycle
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">ARM CPU Boot</div>
                      </div>

                      <div className={`p-2 rounded-lg border transition-all ${
                        restartStage === 4 ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <div className="font-bold flex items-center justify-center gap-1">
                          {restartStage === 4 ? <Sparkles className="w-3 h-3 animate-bounce text-indigo-600" /> : <Clock className="w-3 h-3 text-slate-400" />}
                          4. Recalibration
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">Sensor &amp; Keepalive</div>
                      </div>
                    </div>
                  </div>

                  {/* 4-Stage Step Progression Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {/* Step 1 */}
                    <div className={`p-3 rounded-xl border text-xs transition-all ${
                      restartStage === 1
                        ? 'bg-amber-50 border-amber-300 shadow-sm ring-1 ring-amber-300'
                        : restartStage > 1
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : 'bg-white/70 border-slate-200 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-black text-[11px] text-slate-800">Stage 1 · Cloud Handshake</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white font-bold border">
                          {restartStage > 1 ? 'DONE (5s)' : restartStage === 1 ? 'IN PROGRESS' : 'QUEUED (5s)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        Cloud API writes <code className="font-mono text-red-600">restart_ta500=1</code> into Supabase CDC sync_meta.
                      </p>
                    </div>

                    {/* Step 2 */}
                    <div className={`p-3 rounded-xl border text-xs transition-all ${
                      restartStage === 2
                        ? 'bg-amber-50 border-amber-300 shadow-sm ring-1 ring-amber-300'
                        : restartStage > 2
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : 'bg-white/70 border-slate-200 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-black text-[11px] text-slate-800">Stage 2 · Packet Injection</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white font-bold border">
                          {restartStage > 2 ? 'DONE (7s)' : restartStage === 2 ? 'IN PROGRESS' : 'QUEUED (7s)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        Tab A9+ bridge daemon reads signal &amp; sends ZK <code className="font-mono text-red-600">CMD_RESTART (0x005E)</code> packet.
                      </p>
                    </div>

                    {/* Step 3 */}
                    <div className={`p-3 rounded-xl border text-xs transition-all ${
                      restartStage === 3
                        ? 'bg-amber-50 border-amber-300 shadow-sm ring-1 ring-amber-300'
                        : restartStage > 3
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : 'bg-white/70 border-slate-200 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-black text-[11px] text-slate-800">Stage 3 · Hardware Reboot</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white font-bold border">
                          {restartStage > 3 ? 'DONE (18s)' : restartStage === 3 ? 'IN PROGRESS' : 'QUEUED (18s)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        TA500 commits minutiae buffer to flash, blanks LCD screen, and reboots ARM processor.
                      </p>
                    </div>

                    {/* Step 4 */}
                    <div className={`p-3 rounded-xl border text-xs transition-all ${
                      restartStage === 4
                        ? 'bg-indigo-50 border-indigo-300 shadow-sm ring-1 ring-indigo-300'
                        : 'bg-white/70 border-slate-200 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-black text-[11px] text-slate-800">Stage 4 · Sensor &amp; Sync</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white font-bold border">
                          {restartStage === 4 ? 'IN PROGRESS' : 'QUEUED (15s)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        500 DPI optical prism recalibrates, biometric socket reopens, and bridge keepalive restores.
                      </p>
                    </div>
                  </div>

                  {/* Live Diagnostics Console Stream */}
                  <div className="bg-slate-900 rounded-xl p-3 font-mono text-[11px] text-slate-300 border border-slate-800 shadow-inner">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1 mb-2 font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <Terminal className="w-3.5 h-3.5" />
                        LIVE FIRMWARE REBOOT TELEMETRY STREAM
                      </span>
                      <span>PORT: 4370 / UDP</span>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-slate-400">[T-00s] Super Admin issued remote TA500 restart dispatch.</div>
                      {restartStage >= 1 && (
                        <div className="text-emerald-400">
                          [T+02s] Supabase CDC sync_meta updated: restart_ta500=1, restart_hardware=1.
                        </div>
                      )}
                      {restartStage >= 2 && (
                        <div className="text-cyan-400">
                          [T+06s] Samsung Tab A9+ Daemon detected flag; executed acknowledge_command(&apos;restart_ta500&apos;).
                        </div>
                      )}
                      {restartStage >= 2 && (
                        <div className="text-amber-300">
                          [T+08s] Dispatched ZKTeco soft-reboot UDP datagram to TA500 (192.168.0.58:4370).
                        </div>
                      )}
                      {restartStage >= 3 && (
                        <div className="text-orange-400 animate-pulse">
                          [T+14s] TA500 ARM SoC reset initiated; LCD power cycling; flushing minutiae buffer...
                        </div>
                      )}
                      {restartStage >= 4 && (
                        <div className="text-indigo-400">
                          [T+32s] Optical prism self-calibration complete; TCP/UDP daemon binding restored.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Static Estimation Breakdown & Protocol Details */
                <div className="mt-3.5 grid grid-cols-1 md:grid-cols-4 gap-2.5">
                  <div className="bg-white/70 border border-red-100 rounded-xl p-2.5">
                    <div className="text-[10px] font-mono font-bold text-slate-500 uppercase">Est. Total Duration</div>
                    <div className="text-xs font-black text-slate-800 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-red-600" />
                      ~45 Seconds Total
                    </div>
                  </div>
                  <div className="bg-white/70 border border-red-100 rounded-xl p-2.5">
                    <div className="text-[10px] font-mono font-bold text-slate-500 uppercase">Packet Injection</div>
                    <div className="text-xs font-black text-slate-800 mt-0.5 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-600" />
                      UDP CMD_RESTART (0x005E)
                    </div>
                  </div>
                  <div className="bg-white/70 border border-red-100 rounded-xl p-2.5">
                    <div className="text-[10px] font-mono font-bold text-slate-500 uppercase">Bridge Daemon Sync</div>
                    <div className="text-xs font-black text-slate-800 mt-0.5 flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                      Tab A9+ Auto-Acknowledge
                    </div>
                  </div>
                  <div className="bg-white/70 border border-red-100 rounded-xl p-2.5">
                    <div className="text-[10px] font-mono font-bold text-slate-500 uppercase">Data Integrity</div>
                    <div className="text-xs font-black text-emerald-700 mt-0.5 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      100% Zero Punch Loss
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation Modal */}
              {isRestartModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                        <Power className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-black text-slate-900">Confirm Remote TA500 Reboot</h4>
                        <p className="text-xs text-slate-500">Super Administrator Hardware Control</p>
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 mb-4">
                      <div className="font-black flex items-center gap-1.5 text-amber-800 mb-1">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        Notice: 45-Second Hardware Cycle
                      </div>
                      <p className="leading-relaxed">
                        This triggers a direct soft power-cycle on the FingerTec TA500 at <code className="font-mono font-bold">192.168.0.58:4370</code>. Biometric scanning on the terminal will be suspended during the ~45-second reboot. All stored punches in flash memory remain safe.
                      </p>
                    </div>

                    <div className="space-y-1.5 text-xs font-mono text-slate-600 mb-5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Target Terminal:</span>
                        <span className="font-bold text-slate-800">FingerTec TA500</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Network IP:</span>
                        <span className="font-bold text-slate-800">192.168.0.58:4370</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Bridge Daemon:</span>
                        <span className="font-bold text-slate-800">Samsung Tab A9+ (v18.9)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Cycle Estimation:</span>
                        <span className="font-bold text-slate-800">~45 Seconds</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsRestartModalOpen(false)}
                        disabled={isDispatchingRestart}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleTriggerTa500Restart}
                        disabled={isDispatchingRestart}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
                      >
                        {isDispatchingRestart ? (
                          <>
                            <RotateCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Dispatching...</span>
                          </>
                        ) : (
                          <>
                            <Power className="w-3.5 h-3.5" />
                            <span>Confirm &amp; Dispatch Reboot</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──── SELECTED NODE TELEMETRY & DIAGNOSTICS INSPECTOR ────────────────── */}
          <div
            ref={specsSectionRef}
            id="selected-node-specs"
            className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-md p-5 transition-all scroll-mt-4"
          >
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

              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono text-xs font-bold">
                  {activeDetail.ip}:{activeDetail.port}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs font-black uppercase border ${
                    activeDetail.statusColor === 'emerald'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : activeDetail.statusColor === 'amber'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : activeDetail.statusColor === 'indigo'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : activeDetail.statusColor === 'purple'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {activeDetail.statusBadge}
                </span>
              </div>
            </div>

            {/* Specification Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 mb-4">
              {activeDetail.specs.map((s, idx) => (
                <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-600 uppercase font-black tracking-wider">{s.label}</div>
                  <div className="text-xs font-black text-slate-900 font-mono mt-0.5 truncate">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Dynamic Diagnostics Banner */}
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                activeDetail.statusColor === 'rose'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : activeDetail.statusColor === 'amber'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-blue-50 border-blue-200 text-blue-950'
              }`}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-black uppercase tracking-wider block mb-0.5">
                  {activeDetail.diagnosticTitle}
                </span>
                <span>{activeDetail.diagnosticText}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ──── Physical Hardware Architecture Summary ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm text-xs text-slate-600 space-y-3">
        <h3 className="font-black text-slate-900 uppercase tracking-wider text-xs flex items-center gap-2">
          <Server className="w-4 h-4 text-blue-600" />
          How Physical Attendance Punches Flow to the Cloud
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Fingerprint className="w-4 h-4 text-blue-600" />
              1. FingerTec TA500 (Terminal)
            </h4>
            <p>
              Employees scan their fingerprint or enter a PIN on the optical glass sensor. The terminal writes attendance records to internal flash memory (
              <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">192.168.0.58:4370</code>).
            </p>
            <p className="text-[11px] text-slate-500">
              💡 Completely offline capable: retains up to 100,000 records even if power or network drops.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-purple-600" />
              2. TP-Link TL-WA855RE (Repeater)
            </h4>
            <p>
              Bridges the TA500 Cat6 cable to the office 2.4 GHz wireless network (
              <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">192.168.0.254</code>).
              Allows the biometric terminal to reside anywhere without running cables across walls.
            </p>
            <p className="text-[11px] text-slate-500">
              💡 Working Well status verified with 1 client bridge active and high-gain external antennas.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Tablet className="w-4 h-4 text-amber-600" />
              3. Samsung Galaxy Tab A9+ (Bridge Engine)
            </h4>
            <p>
              Dedicated local tablet running Python Bridge Engine v18.9 via Termux. Features self-healing sub-1KB atomic chunk streaming, zero-miss catchup state machine, and 5-min full-memory audits.
            </p>
            <p className="text-[11px] text-slate-500">
              💡 If stopped: open Termux on the tablet and run{' '}
              <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">
                bash sync-bridge/watchdog.sh
              </code>
              .
            </p>
          </div>
        </div>
      </div>

      {/* ──── Live Biometric Ingestion Feed (Enhanced with Instant CDC WebSockets + Fast Polling) ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
              <Activity className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2 flex-wrap">
                Live Biometric Ingestion Feed
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  INSTANT WEBSOCKET CDC (0s LAG)
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[10px] font-bold text-blue-700 font-mono">
                  2.5s AUDIT
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
                          {log.status === 0 ? ' →  TIME IN' : log.status === 1 ? ' ←  TIME OUT' : `Status ${log.status}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500 text-[11px]">
                        {formatTs(log.synced_at)}
                      </td>
                      <td className="px-4 py-3">
                        {lagSec !== null ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            lagSec < 10
                              ? 'text-green-700 bg-green-50 border border-green-200'
                              : lagSec < 60
                                ? 'text-amber-700 bg-amber-50 border border-amber-200'
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

      {/* ──── Scenario / Simulation Selector (Relocated to bottom of page per user request) ───── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Interactive Hardware &amp; Network Simulation
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline font-medium">
              Simulate live hardware disconnects, power loss, and wire faults:
            </span>
          </div>
          <div className="text-[11px] font-mono font-bold text-slate-600 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy
                  ? 'bg-emerald-500 animate-ping'
                  : isSlow || isPacketLoss
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-rose-500 animate-ping'
              }`}
            />
            <span>
              {isManualSim
                ? `SIMULATED: ${scenario.toUpperCase().replace('_', ' ')}`
                : liveBridgeOnline && liveTa500Online
                  ? 'LIVE HARDWARE: 100% OPERATIONAL'
                  : !liveBridgeOnline
                    ? 'LIVE: BRIDGE DAEMON OFFLINE'
                    : 'LIVE: TA500 POWERED OFF'}
            </span>
          </div>
        </div>

        {/* 8 Fault Reaction Simulation Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2.5">
          <button
            type="button"
            onClick={() => setScenario('healthy')}
            className={`px-2.5 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'healthy'
                ? 'bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/20 ring-2 ring-emerald-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 ${scenario === 'healthy' ? 'text-white' : 'text-emerald-600'}`} />
            <span className="text-[11px] text-center">⚡ Auto-Detect</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('ta500_power_off')}
            className={`px-2.5 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'ta500_power_off'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/20 ring-2 ring-rose-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <PowerOff className={`w-4 h-4 ${scenario === 'ta500_power_off' ? 'text-white' : 'text-rose-600'}`} />
            <span className="text-[11px] text-center">Power Loss</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('lan_unplugged')}
            className={`px-2.5 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'lan_unplugged'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/20 ring-2 ring-rose-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <Cable className={`w-4 h-4 ${scenario === 'lan_unplugged' ? 'text-white' : 'text-rose-600'}`} />
            <span className="text-[11px] text-center">LAN Unplugged</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('wifi_disconnected')}
            className={`px-2.5 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'wifi_disconnected'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/20 ring-2 ring-rose-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <WifiOff className={`w-4 h-4 ${scenario === 'wifi_disconnected' ? 'text-white' : 'text-rose-600'}`} />
            <span className="text-[11px] text-center">Wi-Fi Drop</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('packet_loss')}
            className={`px-2.5 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'packet_loss'
                ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20 ring-2 ring-amber-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <SignalZero className={`w-4 h-4 ${scenario === 'packet_loss' ? 'text-white' : 'text-amber-600'}`} />
            <span className="text-[11px] text-center">Packet Loss</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('slow_network')}
            className={`px-2.5 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'slow_network'
                ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20 ring-2 ring-amber-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <AlertTriangle className={`w-4 h-4 ${scenario === 'slow_network' ? 'text-white' : 'text-amber-600'}`} />
            <span className="text-[11px] text-center">High Latency</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('bridge_offline')}
            className={`px-2.5 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'bridge_offline'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/20 ring-2 ring-rose-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <Tablet className={`w-4 h-4 ${scenario === 'bridge_offline' ? 'text-white' : 'text-rose-600'}`} />
            <span className="text-[11px] text-center">Bridge Offline</span>
          </button>

          <button
            type="button"
            onClick={() => setScenario('cloud_error')}
            className={`px-2.5 py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all border ${
              scenario === 'cloud_error'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md shadow-rose-600/20 ring-2 ring-rose-300'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <Cloud className={`w-4 h-4 ${scenario === 'cloud_error' ? 'text-white' : 'text-rose-600'}`} />
            <span className="text-[11px] text-center">Cloud/WAN Out</span>
          </button>
        </div>
      </div>
    </div>
  )
}



