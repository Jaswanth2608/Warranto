import { useEffect } from 'react'

/** Keeps background scrolling locked while an overlay is open. */
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [active])
}

/**
 * Sets the tab title while the page is mounted.
 * `exact: true` uses the string verbatim (the marketing page states the full
 * product name instead of a "Page · App" combination).
 */
export function useDocumentTitle(title, { exact = false } = {}) {
  useEffect(() => {
    const appName = import.meta.env.VITE_APP_NAME || 'Warranto'
    document.title = !title ? appName : exact ? title : `${title} · ${appName}`
    return () => {
      document.title = appName
    }
  }, [title, exact])
}

export default useBodyScrollLock
