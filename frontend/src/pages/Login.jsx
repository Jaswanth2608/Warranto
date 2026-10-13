import { useCallback, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react'

import { Button, Field, Input } from '../components/ui'
import { GoogleAuthSection } from '../components/auth/GoogleSignIn'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useDocumentTitle } from '../hooks/useUi'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Login() {
  useDocumentTitle('Log in')
  const { login, loginWithGoogle } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  const update = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setFormError('')
  }

  const validate = () => {
    const nextErrors = {}
    if (!values.email.trim()) nextErrors.email = 'Email is required.'
    else if (!EMAIL_PATTERN.test(values.email.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!values.password) nextErrors.password = 'Password is required.'
    return nextErrors
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setFormError('')
    try {
      await login(values)
      toast.success('Welcome back to Warranto.')
      navigate(location.state?.from ?? '/dashboard', { replace: true })
    } catch (loginError) {
      setFormError(loginError.message || 'Could not sign you in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  /** Google hands back a signed ID token — the API verifies it and opens a session. */
  const handleGoogleCredential = useCallback(
    async (credential) => {
      setFormError('')
      setGoogleBusy(true)
      try {
        await loginWithGoogle(credential)
        toast.success('Signed in with Google.')
        navigate(location.state?.from ?? '/dashboard', { replace: true })
      } catch (googleError) {
        setFormError(googleError.message || 'Google sign-in did not complete. Please try again.')
      } finally {
        setGoogleBusy(false)
      }
    },
    [loginWithGoogle, navigate, location.state, toast],
  )

  const busy = submitting || googleBusy

  return (
    <div className="anim-slide-up">
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in to reach your products, bills and warranty deadlines.
        </p>
      </div>

      {formError ? (
        <div
          role="alert"
          className="mb-5 flex gap-2.5 rounded-[9px] border border-danger-500/40 bg-danger-50 px-3.5 py-3"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger-700" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-danger-700">{formError}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-busy={submitting}>
        <Field label="Email" htmlFor="login-email" required error={errors.email}>
          <div className="relative">
            <Mail
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={values.email}
              onChange={update('email')}
              error={Boolean(errors.email)}
              disabled={busy}
              className="pl-9"
            />
          </div>
        </Field>

        <Field label="Password" htmlFor="login-password" required error={errors.password}>
          <div className="relative">
            <Lock
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={values.password}
              onChange={update('password')}
              error={Boolean(errors.password)}
              disabled={busy}
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted transition hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={googleBusy}>
          Sign in
        </Button>
      </form>

      <GoogleAuthSection onCredential={handleGoogleCredential} disabled={busy} />

      <div className="mt-6 flex gap-2.5 rounded-[10px] border border-line bg-surface p-3.5">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand-400" aria-hidden="true" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          <span className="font-medium text-ink-soft">Your records stay private.</span> Only you can
          see the products, bills and warranties in your account.
        </p>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        New to Warranto?{' '}
        <Link to="/register" className="font-semibold text-brand-400 transition hover:text-brand-300">
          Create an account
        </Link>
      </p>
    </div>
  )
}

export default Login
