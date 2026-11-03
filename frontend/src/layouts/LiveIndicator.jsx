import { CloudOff, RefreshCw, Wifi } from 'lucide-react'

import { Dropdown, DropdownItem, DropdownSeparator } from '../components/ui'
import { useLive } from '../context/LiveContext'
import { useProductStore } from '../context/ProductStore'
import { useToast } from '../context/ToastContext'
import { describeLiveChange } from '../utils/liveMessages'

/**
 * Honest sync state for the header, with the controls to act on it.
 *
 * The app keeps itself fresh in the background, so the user deserves to know
 * whether that is actually happening: "Live" means the stream is connected,
 * "Syncing" means a background revalidation is running, and "Reconnecting"
 * means the stream dropped and the fallback (focus / manual reconnect) is in
 * charge. Opening it shows what last arrived and offers a manual refresh.
 */

function clockTime(iso) {
  if (!iso) return 'Not yet'
  const date = new Date(iso)
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000))
  if (seconds < 45) return 'Just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function LiveIndicator() {
  const { status, retryInMs, lastChange, lastSyncedAt, refreshAll, reconnectNow } = useLive()
  const { syncing } = useProductStore()
  const toast = useToast()

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

  const changeLabel = describeLiveChange(lastChange)?.title ?? 'Nothing yet'

  const handleRefresh = () => {
    refreshAll('manual')
    toast.success('Revalidated everything from the server.')
  }

  return (
    <Dropdown
      width="w-[300px]"
      trigger={
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[11.5px] font-medium transition hover:bg-surface-2 ${tone}`}
          aria-label={`Live updates: ${label}. Open sync details`}
          aria-live="polite"
        >
          <Icon size={12} className={isBusy ? 'animate-spin' : undefined} aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
          <span className="sr-only sm:hidden">{label}</span>
        </button>
      }
    >
      <div className="px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink">Live updates</p>
          <span className={`inline-flex items-center gap-1 text-[11.5px] font-medium ${tone}`}>
            <Icon size={11} className={isBusy ? 'animate-spin' : undefined} aria-hidden="true" />
            {label}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-muted">
          {isDown
            ? retryInMs
              ? `Reconnecting in ${Math.max(1, Math.round(retryInMs / 1000))}s. Changes are safe on the server.`
              : 'The stream dropped. Reconnecting automatically.'
            : 'Changes from your other tabs and devices land here without a refresh.'}
        </p>
      </div>

      <DropdownSeparator />

      <dl className="space-y-1 px-2.5 py-1.5 text-[12.5px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Last change</dt>
          <dd className="truncate font-medium text-ink-soft">{changeLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Last full sync</dt>
          <dd className="font-medium text-ink-soft">{clockTime(lastSyncedAt)}</dd>
        </div>
      </dl>

      <DropdownSeparator />

      <DropdownItem icon={RefreshCw} onClick={handleRefresh}>
        Refresh every screen
      </DropdownItem>
      <DropdownItem icon={Wifi} onClick={reconnectNow}>
        Reconnect the stream
      </DropdownItem>
    </Dropdown>
  )
}

export default LiveIndicator
