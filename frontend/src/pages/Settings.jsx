import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Download, KeyRound, LogOut, MonitorCog, ShieldCheck, UserCog } from 'lucide-react'

import { Button, Card, CardHeader, PageHeader, SettingRow, Switch } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useProductStore } from '../context/ProductStore'
import { useToast } from '../context/ToastContext'
import { useDocumentTitle } from '../hooks/useUi'
import { getWarrantyExpiryDate, getWarrantyInfo } from '../utils/warranty'
import { formatDate } from '../utils/dates'

function Section({ title, description, icon: Icon, children }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {Icon ? <Icon size={15} className="text-muted" aria-hidden="true" /> : null}
            {title}
          </span>
        }
        description={description}
      />
      <div className="divide-y divide-line px-5 py-1">{children}</div>
    </Card>
  )
}

export function Settings() {
  useDocumentTitle('Settings')
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { products } = useProductStore()
  const toast = useToast()

  const [notifications, setNotifications] = useState({
    reminders: true,
    days30: true,
    days7: true,
    days1: true,
  })
  const [reduceMotion, setReduceMotion] = useState(() =>
    document.documentElement.classList.contains('reduce-motion'),
  )

  const toggleNotification = (key) => (value) => {
    if (key === 'reminders' && !value) {
      setNotifications({ reminders: false, days30: false, days7: false, days1: false })
      toast.success('Warranty reminders are turned off.')
      return
    }
    setNotifications((current) => {
      const next = { ...current, [key]: value }
      if (key !== 'reminders' && value) next.reminders = true
      return next
    })
    toast.success('Notification preferences saved.')
  }

  const toggleReduceMotion = (value) => {
    setReduceMotion(value)
    document.documentElement.classList.toggle('reduce-motion', value)
    toast.success(value ? 'Animations are now reduced.' : 'Animations restored.')
  }

  const exportData = () => {
    const payload = products.map((product) => {
      const info = getWarrantyInfo(product)
      return {
        ...product,
        warrantyExpiry: formatDate(getWarrantyExpiryDate(product)),
        warrantyStatus: info.status,
        daysRemaining: info.daysRemaining,
      }
    })
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `warranto-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.success('Your data export has been downloaded.')
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Control your account, reminders and preferences." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Account"
          description="Your identity inside Warranto."
          icon={UserCog}
        >
          <SettingRow title="Full name" description={user?.fullName}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/profile')}>
              Edit
            </Button>
          </SettingRow>
          <SettingRow title="Email address" description={user?.email}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/profile')}>
              Edit
            </Button>
          </SettingRow>
          <SettingRow
            title="Session"
            description="Signed in on this device."
            className="pb-5"
          >
            <Button variant="ghost" size="sm" icon={LogOut} onClick={handleLogout}>
              Log out
            </Button>
          </SettingRow>
        </Section>

        <Section
          title="Notifications"
          description="Email reminders arrive once the mail service is connected."
          icon={Bell}
        >
          <SettingRow
            title="Warranty reminders"
            description="Get notified before any warranty expires."
          >
            <Switch
              checked={notifications.reminders}
              onChange={toggleNotification('reminders')}
              label="Warranty reminders"
            />
          </SettingRow>
          <SettingRow title="30 days before expiry" description="First heads-up for long coverage.">
            <Switch
              checked={notifications.days30}
              onChange={toggleNotification('days30')}
              label="Reminder 30 days before expiry"
              disabled={!notifications.reminders}
            />
          </SettingRow>
          <SettingRow title="7 days before expiry" description="Time to gather proof of purchase.">
            <Switch
              checked={notifications.days7}
              onChange={toggleNotification('days7')}
              label="Reminder 7 days before expiry"
              disabled={!notifications.reminders}
            />
          </SettingRow>
          <SettingRow
            title="1 day before expiry"
            description="Final reminder on the last covered day."
            className="pb-5"
          >
            <Switch
              checked={notifications.days1}
              onChange={toggleNotification('days1')}
              label="Reminder 1 day before expiry"
              disabled={!notifications.reminders}
            />
          </SettingRow>
        </Section>

        <Section title="Security" description="Keep your archive private." icon={ShieldCheck}>
          <SettingRow title="Password" description="Last changed during account setup.">
            <Button variant="secondary" size="sm" icon={KeyRound} onClick={() => navigate('/profile')}>
              Change
            </Button>
          </SettingRow>
          <SettingRow
            title="Two-step verification"
            description="Ask for a code when signing in from a new device."
          >
            <Switch checked={false} onChange={() => toast.info('Two-step verification arrives with the backend.')} label="Two-step verification" />
          </SettingRow>
          <SettingRow
            title="Active sessions"
            description="1 active session · this device"
            className="pb-5"
          >
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success-50 px-2 py-1 text-[12px] font-medium text-success-700 ring-1 ring-inset ring-success-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />
              Current
            </span>
          </SettingRow>
        </Section>

        <Section title="Preferences" description="Tune Warranto to how you work." icon={MonitorCog}>
          <SettingRow
            title="Reduce animations"
            description="Minimise motion across the interface."
          >
            <Switch
              checked={reduceMotion}
              onChange={toggleReduceMotion}
              label="Reduce animations"
            />
          </SettingRow>
          <SettingRow
            title="Export my data"
            description={`Download all ${products.length} products and their bills as JSON.`}
          >
            <Button variant="secondary" size="sm" icon={Download} onClick={exportData}>
              Export
            </Button>
          </SettingRow>
          <SettingRow
            title="Currency & dates"
            description="Amounts are shown in ₹ (INR) with dates as DD MMM YYYY."
            className="pb-5"
          >
            <span className="rounded-md bg-canvas px-2 py-1 text-[12px] font-medium text-muted ring-1 ring-line">
              Default
            </span>
          </SettingRow>
        </Section>
      </div>

      <p className="text-[13px] text-muted">
        Settings are saved for this preview session. Account-level changes are wired up once the
        backend is connected.
      </p>
    </div>
  )
}

export default Settings
