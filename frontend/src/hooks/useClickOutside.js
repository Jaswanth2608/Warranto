import { useEffect, useRef } from 'react'

/** Fires when a pointer click happens outside the referenced element. */
export function useClickOutside(onOutside, enabled = true) {
  const ref = useRef(null)
  const handlerRef = useRef(onOutside)
  handlerRef.current = onOutside

  useEffect(() => {
    if (!enabled) return undefined
    const handleMouseDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        handlerRef.current?.(event)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('touchstart', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('touchstart', handleMouseDown)
    }
  }, [enabled])

  return ref
}

export default useClickOutside
