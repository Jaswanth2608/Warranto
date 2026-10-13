import { useEffect, useRef, useState } from 'react'

import { authService } from '../../services/authService'

/**
 * "Continue with Google" using Google Identity Services (GIS).
 *
 * Security model: the browser only obtains a signed ID token from Google's
 * hosted library and hands it to the app's own API, which verifies it
 * server-side (see backend/lib/googleAuth.js). No client secret is involved and
 * no claim from the browser is trusted.
 *
 * Availability is graceful: the option is only shown when the server reports
 * Google sign-in configured (GET /api/auth/providers) AND this build has a
 * client id (VITE_GOOGLE_CLIENT_ID). Otherwise the UI renders nothing here and
 * email/password sign-in is unaffected.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()

let gisPromise = null
let providersPromise = null

/** Loads Google's hosted client library once per page. */
function loadGisScript() {
  if (gisPromise) return gisPromise

  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve()
      return
    }

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Google Identity Services failed to load.')))
      return
    }

    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => reject(new Error('Google Identity Services failed to load.')))
    document.head.appendChild(script)
  })

  return gisPromise
}

/**
 * null while the server answer is pending, then true/false.
 * Never throws: a failed request simply keeps the option hidden.
 */
export function useGoogleAvailability() {
  const [available, setAvailable] = useState(null)

  useEffect(() => {
    let active = true

    if (!providersPromise) {
      providersPromise = authService
        .providers()
        .then((res) => res.data?.providers ?? null)
        .catch(() => null)
    }

    providersPromise.then((providers) => {
      if (!active) return

      const serverReady = Boolean(providers?.google)
      if (serverReady && !CLIENT_ID) {
        console.warn(
          '[config] Google sign-in is enabled on the server but VITE_GOOGLE_CLIENT_ID is missing in this build, ' +
            'so the button stays hidden. Set it in frontend/.env (and on Vercel) and rebuild.',
        )
      }

      setAvailable(serverReady && Boolean(CLIENT_ID))
    })

    return () => {
      active = false
    }
  }, [])

  return available
}

/** Google's four-colour G, used for the loading and unavailable states. */
export function GoogleGIcon({ size = 18, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58z"
      />
    </svg>
  )
}

/**
 * @param {(credential: string) => void} onCredential receives Google's signed ID token
 * @param {boolean} disabled true while the page is submitting anything
 */
export function GoogleSignInButton({ onCredential, disabled = false, className = '' }) {
  const slot = useRef(null)
  const [width, setWidth] = useState(0)
  const [status, setStatus] = useState('loading')

  // Google's button is rendered at a fixed pixel width, so keep it in step with
  // the form column instead of letting it overflow on small screens.
  useEffect(() => {
    const element = slot.current
    if (!element) return

    const measure = () => {
      const available = element.parentElement?.offsetWidth || element.offsetWidth || 320
      const next = Math.max(200, Math.min(400, Math.floor(available)))
      setWidth((current) => (current === next ? current : next))
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (!CLIENT_ID || !width) return

    let cancelled = false
    setStatus('loading')

    loadGisScript()
      .then(() => {
        if (cancelled || !slot.current || !window.google?.accounts?.id) return

        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => {
            if (response?.credential) onCredential(response.credential)
          },
          // Modern FedCM-backed button rendering.
          use_fedcm_for_button: true,
        })

        slot.current.replaceChildren()
        window.google.accounts.id.renderButton(slot.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          logo_alignment: 'left',
          width,
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [width, onCredential])

  if (!CLIENT_ID) return null

  if (status === 'unavailable') {
    return (
      <p
        className={`rounded-[9px] border border-line bg-surface px-3.5 py-2.5 text-center text-[12.5px] text-muted ${className}`}
        role="status"
      >
        Google sign-in is unavailable right now. Use your email and password instead.
      </p>
    )
  }

  return (
    <div className={`relative flex w-full justify-center ${className}`}>
      <div ref={slot} className="flex w-full justify-center" />

      {status === 'loading' ? (
        <span
          className="flex h-10 w-full items-center justify-center gap-2.5 rounded-[9px] border border-line bg-surface text-[13.5px] font-medium text-muted"
          aria-hidden="true"
        >
          <GoogleGIcon size={17} />
          Continue with Google
          <span className="spinner spinner-brand" />
        </span>
      ) : null}

      {status === 'ready' && disabled ? (
        <span
          className="absolute inset-0 flex items-center justify-center gap-2.5 rounded-[9px] bg-canvas/75 text-[13.5px] font-medium text-muted backdrop-blur-[1px]"
          aria-hidden="true"
        >
          <GoogleGIcon size={17} />
          Continue with Google
          <span className="spinner spinner-brand" />
        </span>
      ) : null}
    </div>
  )
}

/**
 * Divider + Google button, identical on every auth screen.
 * Renders nothing at all when Google sign-in is not available, so the layout
 * collapses cleanly instead of leaving an empty gap.
 */
export function GoogleAuthSection({ onCredential, disabled = false }) {
  const available = useGoogleAvailability()

  if (!available) return null

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="mt-5">
        <GoogleSignInButton onCredential={onCredential} disabled={disabled} />
      </div>
    </div>
  )
}

export default GoogleSignInButton
