import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { createLiveConnection } from '../services/liveService'
import { describeLiveChange, shouldAnnounceChange } from '../utils/liveMessages'

/**
 * Live-update provider.
 *
 * Owns the single change stream for the signed-in user and lets any screen ask
 * to be told when a resource changed:
 *
 *   useLiveResource('products', refresh)
 *   useLiveResource(['tasks', 'reminders'], refresh)
 *
 * Components revalidate from the API when their resource changes; events carry
 * no row data, so nothing can leak between accounts and cached pages cannot be
 * shown a payload they were not allowed to fetch.
 *
 * Freshness does not depend on the stream alone: returning to the tab, coming
 * back online, or reconnecting all trigger a resync, so a suspended or dropped
 * connection heals without the user reloading.
 */

const LiveContext = createContext(null)

export function LiveProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const toast = useToast()

  const [status, setStatus] = useState(isAuthenticated ? 'connecting' : 'signed-out')
  const [retryInMs, setRetryInMs] = useState(null)
  const [lastEventAt, setLastEventAt] = useState(null)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [lastChange, setLastChange] = useState(null)

  const handlersRef = useRef(new Map())
  const connectionRef = useRef(null)
  const lastVisibleAtRef = useRef(Date.now())

  /**
   * Calls every handler registered for the event's resource, plus wildcards.
   * A resync (reconnect, tab wake-up, manual refresh) reaches every handler —
   * it means "anything you show may have moved".
   */
  const dispatch = useCallback((event) => {
    const resource = event?.resource
    const targets = new Set()

    if (event?.type === 'resync') {
      for (const set of handlersRef.current.values()) {
        for (const handler of set) targets.add(handler)
      }
    } else {
      for (const handler of handlersRef.current.get(resource) ?? []) targets.add(handler)
      for (const handler of handlersRef.current.get('*') ?? []) targets.add(handler)
    }

    if (targets.size === 0) return

    for (const handler of targets) {
      try {
        handler(event)
      } catch (error) {
        console.error('[live] subscriber failed:', error)
      }
    }
  }, [])

  const handleEvent = useCallback(
    (event) => {
      setLastEventAt(new Date().toISOString())

      // Only real changes are worth showing; a resync is our own bookkeeping.
      if (event?.type === 'change') {
        setLastChange(event)

        // Background refreshes stay silent; a record disappearing in another
        // tab is surprising enough to explain.
        const visible = typeof document === 'undefined' || document.visibilityState === 'visible'
        if (shouldAnnounceChange(event, { visible })) {
          const summary = describeLiveChange(event)
          if (summary) {
            toast.warning(summary.message, { title: summary.title, duration: 6000 })
          }
        }
      }

      dispatch(event)
    },
    [dispatch, toast],
  )

  const refreshAll = useCallback(
    (reason = 'manual') => {
      setLastSyncedAt(new Date().toISOString())
      dispatch({ type: 'resync', resource: '*', reason })
    },
    [dispatch],
  )

  // One connection per signed-in session.
  useEffect(() => {
    if (!isAuthenticated) {
      setStatus('signed-out')
      return undefined
    }

    setStatus('connecting')
    const connection = createLiveConnection({
      onEvent: handleEvent,
      onStatus: ({ state, retryInMs: retry }) => {
        setStatus(state)
        setRetryInMs(typeof retry === 'number' ? retry : null)
      },
    })
    connectionRef.current = connection
    connection.start()

    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        lastVisibleAtRef.current = Date.now()
        return
      }

      const hiddenFor = Date.now() - lastVisibleAtRef.current
      // Coming back to a long-idle tab is the most common way to see stale
      // data: revalidate, and re-open a stream that did not survive the nap.
      if (hiddenFor > 15_000) {
        refreshAll('visible')
        connectionRef.current?.reconnectNow()
      }
    }

    const onOnline = () => {
      if (connectionRef.current) connectionRef.current.reconnectNow()
      refreshAll('online')
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      connection.stop()
      connectionRef.current = null
    }
  }, [isAuthenticated, handleEvent, refreshAll])

  /** Registers a handler for one resource (or an array of resources). */
  const subscribe = useCallback((resources, handler) => {
    const keys = Array.isArray(resources) ? resources : [resources]
    for (const key of keys) {
      let set = handlersRef.current.get(key)
      if (!set) {
        set = new Set()
        handlersRef.current.set(key, set)
      }
      set.add(handler)
    }

    return () => {
      for (const key of keys) {
        const set = handlersRef.current.get(key)
        if (!set) continue
        set.delete(handler)
        if (set.size === 0) handlersRef.current.delete(key)
      }
    }
  }, [])

  const reconnectNow = useCallback(() => {
    connectionRef.current?.reconnectNow()
    refreshAll('manual')
  }, [refreshAll])

  const value = useMemo(
    () => ({
      status,
      isLive: status === 'live',
      retryInMs,
      lastEventAt,
      lastSyncedAt,
      lastChange,
      subscribe,
      refreshAll,
      reconnectNow,
    }),
    [status, retryInMs, lastEventAt, lastSyncedAt, lastChange, subscribe, refreshAll, reconnectNow],
  )

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive() {
  const context = useContext(LiveContext)
  if (!context) throw new Error('useLive must be used inside <LiveProvider>')
  return context
}

export default LiveContext
