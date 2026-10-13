import { useState } from 'react'
import { CalendarDays, ShieldCheck } from 'lucide-react'

import { Button, Card, CardHeader, Field, Input, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useProductStore } from '../context/ProductStore'
import { useToast } from '../context/ToastContext'
import { useDocumentTitle } from '../hooks/useUi'
import { formatDateLong } from '../utils/dates'
import { getInitials } from '../utils/format'
import { getWarrantyStats } from '../utils/selectors'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Profile() {
  useDocumentTitle('Profile')
  const { user, updateProfile, changePassword } = useAuth()
  const { products } = useProductStore()
  const toast = useToast()

  const [profile, setProfile] = useState({
    fullName: user?.fullName ?? '',
    email: user?.email ?? '',
  })
  const [profileErrors, setProfileErrors] = useState({})
  const [savingProfile, setSavingProfile] = useState(false)

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [savingPassword, setSavingPassword] = useState(false)

  const stats = getWarrantyStats(products)

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    const errors = {}
    if (!profile.fullName.trim()) errors.fullName = 'Full name is required.'
    if (!profile.email.trim()) errors.email = 'Email is required.'
    else if (!EMAIL_PATTERN.test(profile.email.trim())) errors.email = 'Enter a valid email address.'
    setProfileErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSavingProfile(true)
    try {
      await updateProfile({ fullName: profile.fullName.trim(), email: profile.email.trim() })
      toast.success('Your profile has been updated.')
    } catch (saveError) {
      toast.error(saveError.message || 'Could not update your profile. Please try again.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    const errors = {}
    if (!passwords.current) errors.current = 'Enter your current password.'
    if (!passwords.next) errors.next = 'Enter a new password.'
    else if (passwords.next.length < 8) errors.next = 'Use at least 8 characters.'
    if (passwords.confirm !== passwords.next) errors.confirm = 'Passwords do not match.'
    setPasswordErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSavingPassword(true)
    try {
      await changePassword({ currentPassword: passwords.current, newPassword: passwords.next })
      setPasswords({ current: '', next: '', confirm: '' })
      toast.success('Your password has been changed.')
    } catch (saveError) {
      toast.error(saveError.message || 'Could not change your password. Please try again.')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Manage your account details and password." />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Identity card */}
        <Card className="h-fit p-6 lg:sticky lg:top-24">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/15 text-[22px] font-semibold text-brand-400 ring-1 ring-inset ring-brand-500/25">
              {getInitials(user?.fullName ?? '')}
            </span>
            <h2 className="mt-4 text-[17px] font-semibold text-ink">{user?.fullName}</h2>
            <p className="mt-1 text-[13.5px] text-muted">{user?.email}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-canvas px-2.5 py-1 text-[12.5px] text-muted ring-1 ring-line">
              <CalendarDays size={13} aria-hidden="true" />
              Member since {formatDateLong(user?.memberSince)}
            </p>
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-2 border-t border-line pt-5 text-center">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted">Products</dt>
              <dd className="mt-1 text-[18px] font-semibold text-ink">{stats.total}</dd>
            </div>
            <div className="border-x border-line">
              <dt className="text-[11px] uppercase tracking-wide text-muted">Bills</dt>
              <dd className="mt-1 text-[18px] font-semibold text-ink">{stats.withBill}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted">Active</dt>
              <dd className="mt-1 text-[18px] font-semibold text-ink">{stats.active}</dd>
            </div>
          </dl>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Account details" description="How Warranto addresses you and reaches you." />
            <form onSubmit={handleProfileSubmit} noValidate className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full Name" htmlFor="profile-name" required error={profileErrors.fullName}>
                  <Input
                    id="profile-name"
                    autoComplete="name"
                    value={profile.fullName}
                    onChange={(event) => {
                      setProfile((current) => ({ ...current, fullName: event.target.value }))
                      setProfileErrors((current) => ({ ...current, fullName: undefined }))
                    }}
                    error={Boolean(profileErrors.fullName)}
                  />
                </Field>
                <Field label="Email" htmlFor="profile-email" required error={profileErrors.email}>
                  <Input
                    id="profile-email"
                    type="email"
                    autoComplete="email"
                    value={profile.email}
                    onChange={(event) => {
                      setProfile((current) => ({ ...current, email: event.target.value }))
                      setProfileErrors((current) => ({ ...current, email: undefined }))
                    }}
                    error={Boolean(profileErrors.email)}
                  />
                </Field>
              </div>
              <div className="mt-5 flex justify-end border-t border-line pt-5">
                <Button type="submit" loading={savingProfile}>
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Change password"
              description="Use a password you do not reuse on other services."
            />
            <form onSubmit={handlePasswordSubmit} noValidate className="p-5">
              <div className="space-y-4">
                <Field
                  label="Current Password"
                  htmlFor="password-current"
                  required
                  error={passwordErrors.current}
                >
                  <Input
                    id="password-current"
                    type="password"
                    autoComplete="current-password"
                    value={passwords.current}
                    onChange={(event) => {
                      setPasswords((current) => ({ ...current, current: event.target.value }))
                      setPasswordErrors((current) => ({ ...current, current: undefined }))
                    }}
                    error={Boolean(passwordErrors.current)}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="New Password" htmlFor="password-next" required error={passwordErrors.next}>
                    <Input
                      id="password-next"
                      type="password"
                      autoComplete="new-password"
                      value={passwords.next}
                      onChange={(event) => {
                        setPasswords((current) => ({ ...current, next: event.target.value }))
                        setPasswordErrors((current) => ({ ...current, next: undefined }))
                      }}
                      error={Boolean(passwordErrors.next)}
                    />
                  </Field>
                  <Field
                    label="Confirm New Password"
                    htmlFor="password-confirm"
                    required
                    error={passwordErrors.confirm}
                  >
                    <Input
                      id="password-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={passwords.confirm}
                      onChange={(event) => {
                        setPasswords((current) => ({ ...current, confirm: event.target.value }))
                        setPasswordErrors((current) => ({ ...current, confirm: undefined }))
                      }}
                      error={Boolean(passwordErrors.confirm)}
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-5 flex justify-end border-t border-line pt-5">
                <Button type="submit" loading={savingPassword} icon={ShieldCheck}>
                  Update Password
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default Profile
