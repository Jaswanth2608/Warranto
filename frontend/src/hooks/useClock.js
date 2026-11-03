import { useEffect, useState } from 'react'
import { toISODate } from '../utils/dates'

/**
 * The current local calendar day as YYYY-MM-DD.
 *
 * Warranty status is derived from dates, so a tab left open overnight would
 * otherwise keep yesterday's answer ("Expires in 1 day" when it now expires
 * today). Components that derive status read this value, so they re-render
 * exactly when the day changes — and again when the tab wakes up, because a
 * sleeping laptop can skip the midnight timer.
 */
export function useToday() {
  const [today, setToday] = useState(() => toISODate(new Date()))

  useEffect(() => {
    const check = () => {
      const next = toISODate(new Date())
      setToday((current) => (current === next ? current : next))
    }

    // 30 s granularity is cheap and catches a missed midnight timer.
    const timer = setInterval(check, 30_000)

    const onWake = () => check()
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [])

  return today
}

/**
 * A ticking `Date`, refreshed every `intervalMs`.
 * Used for second-level countdowns (time left on a warranty, service timers).
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    const onWake = () => setNow(new Date())
    document.addEventListener('visibilitychange', onWake)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [intervalMs])

  return now
}

export default useToday
