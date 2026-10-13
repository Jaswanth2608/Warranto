import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Check, Eye, EyeOff, Lock, Mail, User } from 'lucide-react'

import { Button, Field, Input } from '../components/ui'
import { GoogleAuthSection } from '../components/auth/GoogleSignIn'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useDocumentTitle } from '../hooks/useUi'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function passwordChecks(password) {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase & one lowercase letter', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'At least one number', met: /\d/.test(password) },
  ]
}

export function Register() {
  useDocumentTitle('Create account')
  const { register, loginWithGoogle } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agree: false,
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setFormError('')
  }

  const checks = passwordChecks(values.password)

  const validate = () => {
    const nextErrors = {}
    if (!values.fullName.trim()) nextErrors.fullName = 'Full name is required.'
    if (!values.email.trim()) nextErrors.email = 'Email is required.'
    else if (!EMAIL_PATTERN.test(values.email.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!values.password) nextErrors.password = 'Password is required.'
    else if (checks.some((check) => !check.met)) nextErrors.password = 'Password does not meet the requirements yet.'
    if (!values.confirmPassword) nextErrors.confirmPassword = 'Please confirm your password.'
    else if (values.confirmPassword !== values.password) nextErrors.confirmPassword = 'Passwords do not match.'
    if (!values.agree) nextErrors.agree = 'Please accept the terms to continue.'
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
      await register({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password,
      })
      toast.success('Your Warranto account is ready.')
      navigate('/dashboard', { replace: true })
    } catch (registerError) {
      setFormError(registerError.message || 'Could not create your account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Google registration and Google sign-in are the same server call: an unknown
   * verified email creates the account, a known one signs in.
   */
  const handleGoogleCredential = useCallback(
    async (credential) => {
      setFormError('')
      setGoogleBusy(true)
      try {
        await loginWithGoogle(credential)
        toast.success('Signed in with Google.')
        navigate('/dashboard', { replace: true })
      } catch (googleError) {
        setFormError(googleError.message || 'Google sign-in did not complete. Please try again.')
      } finally {
        setGoogleBusy(false)
      }
    },
    [loginWithGoogle, navigate, toast],
  )

  const busy = submitting || googleBusy

  return (
    <div className="anim-slide-up">
      <div className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Create your account</h1>
        <p className="mt-2 text-sm text-muted">
          Start tracking purchases, bills and warranties in one place.
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
        <Field label="Full Name" htmlFor="register-name" required error={errors.fullName}>
          <div className="relative">
            <User
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="register-name"
              autoComplete="name"
              placeholder="e.g. Jaswanth Kumar"
              value={values.fullName}
              onChange={update('fullName')}
              error={Boolean(errors.fullName)}
              disabled={busy}
              className="pl-9"
            />
          </div>
        </Field>

        <Field label="Email" htmlFor="register-email" required error={errors.email}>
          <div className="relative">
            <Mail
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="register-email"
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

        <Field label="Password" htmlFor="register-password" required error={errors.password}>
          <div className="relative">
            <Lock
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a password"
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
          <ul className="mt-2.5 space-y-1">
            {checks.map((check) => (
              <li
                key={check.label}
                className={`flex items-center gap-2 text-[12.5px] transition-colors ${
                  check.met ? 'text-success-700' : 'text-muted'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-inset ${
                    check.met ? 'bg-success-50 ring-success-500/30' : 'bg-canvas ring-line-strong'
                  }`}
                >
                  {check.met ? <Check size={10} strokeWidth={3} aria-hidden="true" /> : null}
                </span>
                {check.label}
              </li>
            ))}
          </ul>
        </Field>

        <Field
          label="Confirm Password"
          htmlFor="register-confirm"
          required
          error={errors.confirmPassword}
        >
          <div className="relative">
            <Lock
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="register-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={values.confirmPassword}
              onChange={update('confirmPassword')}
              error={Boolean(errors.confirmPassword)}
              disabled={busy}
              className="pl-9"
            />
          </div>
        </Field>

        <div>
          <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-soft">
            <input
              type="checkbox"
              checked={values.agree}
              onChange={update('agree')}
              disabled={busy}
              className="mt-0.5 h-4 w-4 rounded border-line-strong text-brand-400 focus:ring-brand-500/30"
            />
            <span>
              I agree to the{' '}
              <Link to="/terms" className="font-medium text-brand-400 hover:text-brand-300">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-medium text-brand-400 hover:text-brand-300">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.agree ? (
            <p className="mt-1.5 text-[12.5px] font-medium text-danger-700" role="alert">
              {errors.agree}
            </p>
          ) : null}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={googleBusy}>
          Create Account
        </Button>
      </form>

      <GoogleAuthSection onCredential={handleGoogleCredential} disabled={busy} />

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-400 transition hover:text-brand-300">
          Log in
        </Link>
      </p>
    </div>
  )
}

export default Register
