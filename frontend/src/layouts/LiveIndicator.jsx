import { CloudOff, RefreshCw, Wifi } from 'lucide-react'

import { useLive } from '../context/LiveContext'
import { useProductStore } from '../context/ProductStore'

/**
 * Honest sync state for the header.
 *
 * The app keeps itself fresh in the background, so the user deserves to know
 * whether that is actually happening: "Live" means the stream is connected,
 * "Syncing" means a background revalidation is running, and "Reconnecting"
 * means the stream dropped and the fallback (focus / reconnect) is in charge.
 */
export function LiveIndicator() {
  const { status } = useLive()
  const { syncing, lastSyncedAt } = useProductStore()

  if (status === 'signed-out' || status === 'unauthorized' || status === 'stopped') {
    return null
  }

  const isLive = status === 'live'
  const isBusy = syncing
  const isDown = status === 'offline' || status === 'reconnecting'

  const label = isBusy ? 'Syncing' : isDown ? 'Reconnecting' : isLive ? 'Live' : 'Connecting'
  const Icon = isBusy ? RefreshCw : isDown ? CloudOff : Wifi
  const tone = isBusy
    ? 'text-brand-400'
    : isDown
      ? 'text-warning-700'
      : isLive
        ? 'text-success-700'
        : 'text-muted'

  const detail = lastSyncedAt
    ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Waiting for the first sync'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[11.5px] font-medium ${tone}`}
      title={`${detail} · updates from your other tabs and devices arrive automatically`}
      aria-live="polite"
    >
      <Icon size={12} className={isBusy ? 'animate-spin' : undefined} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  )
}

export default LiveIndicator
