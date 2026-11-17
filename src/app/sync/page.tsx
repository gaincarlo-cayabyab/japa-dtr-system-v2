import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { PUNCH_STATUS, PUNCH_STATUS_COLOR } from '@/types/database'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function formatTs(ts: string | null | undefined) {
  if (!ts) return 'Never'
  try {
    return format(new Date(ts), 'MMM d, yyyy hh:mm aa')
  } catch {
    return ts
  }
}

export default async function SyncPage() {
  const supabase = await createClient()

  const [{ data: recentLogs }, { count: totalRecords }, { data: lastSyncRow }] = await Promise.all([
    supabase
      .from('attendance_logs')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(20),
    supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('attendance_logs')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const lastSync = lastSyncRow?.synced_at ?? null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sync Bridge Status</h1>
        <p className="mt-1 text-sm text-gray-500">
          FingerTec TA500 ↔ Supabase sync monitor
        </p>
      </div>

      {/* Status card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Device Connection
          </h2>
          <dl className="space-y-3">
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Device IP</dt>
              <dd className="font-mono font-medium text-gray-900">Auto-Detect / Dynamic (Port 4370)</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Port</dt>
              <dd className="font-mono font-medium text-gray-900">4370</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Protocol</dt>
              <dd className="font-medium text-gray-900">ZKTeco UDP</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Bridge Status</dt>
              <dd>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  Running
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Sync Statistics
          </h2>
          <dl className="space-y-3">
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Last Sync</dt>
              <dd className="font-medium text-gray-900">{formatTs(lastSync)}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Total Records Synced</dt>
              <dd className="font-bold text-gray-900 text-lg">{(totalRecords ?? 0).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Recent (last 20 shown)</dt>
              <dd className="font-medium text-gray-900">{recentLogs?.length ?? 0} records</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Instructions panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
          <span>🐍</span> Running the Python Sync Bridge Locally
        </h2>
        <ol className="text-sm text-blue-900 space-y-2 list-decimal list-inside">
          <li>
            Install dependencies:{' '}
            <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">
              pip install -r sync-bridge/requirements.txt
            </code>
          </li>
          <li>
            Copy the env template:{' '}
            <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">
              cp sync-bridge/.env.example sync-bridge/.env
            </code>{' '}
            and fill in your Supabase credentials.
          </li>
          <li>
            Ensure the TA500 device at{' '}
            <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">192.168.68.146:4370</code>{' '}
            is reachable on your local network.
          </li>
          <li>
            Run the bridge:{' '}
            <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">
              python sync-bridge/main.py
            </code>
          </li>
          <li>
            The bridge polls the device every 60 seconds and pushes new punch records to Supabase.
          </li>
        </ol>
        <div className="mt-3">
          <Link
            href="/sync-bridge/README.md"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2"
          >
            📄 View full setup guide (sync-bridge/README.md)
          </Link>
        </div>
      </div>

      {/* Recent sync activity */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">Recent Sync Activity</h2>
          <span className="text-xs text-gray-500">Last 20 records by synced_at</span>
        </div>

        {!recentLogs || recentLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No sync activity yet. Run the bridge to start syncing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Device ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Punch Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Synced At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {log.device_user_id}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {formatTs(log.punch_time)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          PUNCH_STATUS_COLOR[log.status] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {PUNCH_STATUS[log.status] ?? `Status ${log.status}`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
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
