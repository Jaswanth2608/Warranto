import { useEffect, useRef } from 'react'
import { useLive } from '../context/LiveContext'

/**
 * Revalidates something when the live stream says it changed.
 *
 *   useLiveResource('products', refresh)
 *   useLiveResource(['tasks', 'reminders'], refresh)
 *
 * The handler is kept in a ref, so an inline arrow function does not churn the
 * subscription on every render. The returned cleanup runs on unmount.
 */
export function useLiveResource(resources, handler) {
  const { subscribe } = useLive()
  const handlerRef = useRef(handler)

  handlerRef.current = handler

  const key = Array.isArray(resources) ? resources.join('|') : String(resources)

  useEffect(() => {
    const keys = key.split('|')
    const listener = (event) => handlerRef.current?.(event)
    return subscribe(keys, listener)
  }, [subscribe, key])
}

export default useLiveResource
