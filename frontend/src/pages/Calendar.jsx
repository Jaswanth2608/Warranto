import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

import { calendarService } from '../services'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Badge, Button, Card, CardBody, EmptyState, ErrorState, Modal, Textarea, Select, Field, Input } from '../components/ui'
import { daysBetween, parseDate, startOfDay, toISODate } from '../utils/dates'
import { formatDayLabel } from '../utils/warranty'
import { STATUS } from '../utils/constants'
import { getInitials } from '../utils/format'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function badgeVariant(type, priority) {
  if (type === 'warranty_expiry') return 'danger'
  if (type === 'reminder_milestone') {
    if (priority === 7) return 'danger'
    if (priority === 30) return 'warning'
    if (priority === 90) return 'brand'
    return 'neutral'
  }
  if (priority === 'high') return 'danger'
  if (priority === 'medium') return 'warning'
  return 'neutral'
}

function EventChip({ item, onClick }) {
  const variant = badgeVariant(item.type, item.priority ?? item.targetMilestone)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-col items-start rounded-[6px] px-2 py-1 text-left transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-500 ${variant === 'danger' ? 'text-danger-700' : variant === 'warning' ? 'text-warning-700' : variant === 'brand' ? 'text-brand-400' : 'text-muted'}`}
    >
      <span className="text-[11px] font-medium leading-tight">{item.title}</span>
      <span className="mt-0.5 text-[10.5px] leading-tight opacity-80">{item.subtitle}</span>
    </button>
  )
}

export default function Calendar() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [year, setYear] = useState(() => {
    const now = new Date()
    return now.getFullYear()
  })
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return now.getMonth() + 1
  })
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', dueDate: '', priority: 'medium', productId: '' })

  const monthName = useMemo(
    () => new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
    [year, month],
  )

  const firstOfMonth = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const lastOfMonth = useMemo(() => new Date(year, month, 0, 23, 59, 59, 999), [year, month])
  const today = useMemo(() => startOfDay(), [])

  const daysInMonth = lastOfMonth.getDate()
  const startWeekday = firstOfMonth.getDay()
  const adjustedStart = startWeekday === 0 ? 6 : startWeekday - 1

  const weeks = useMemo(() => {
    const grid = []
    let day = 1 - adjustedStart
    while (day <= daysInMonth) {
      const week = []
      for (let i = 0; i < 7; i += 1) {
        week.push(day)
        day += 1
      }
      grid.push(week)
    }
    return grid
  }, [daysInMonth, adjustedStart])

  const dateKey = (day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const event of events) {
      map[event.date] = event.items
    }
    return map
  }, [events])

  const loadEvents = async (y, m) => {
    setLoading(true)
    setError(null)
    try {
      const res = await calendarService.getEvents(y, m)
      setEvents(Array.isArray(res.data.events) ? res.data.events : [])
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to load calendar events.')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  const handlePrev = () => {
    if (month === 1) {
      setMonth(12)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const handleNext = () => {
    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const handleToday = () => {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth() + 1)
  }

  const openDate = (dateStr, day) => {
    setSelectedDate({ date: dateStr, day, items: eventsByDate[dateStr] ?? [] })
  }

  const closeDate = () => setSelectedDate(null)

  const openCreateForDate = (dateStr) => {
    setNewTask((prev) => ({ ...prev, dueDate: dateStr }))
    setCreating(true)
  }

  const validDateForInputs = useMemo(
    () => (newTask.dueDate ? parseDate(newTask.dueDate) : null),
    [newTask.dueDate],
  )

  const submitNewTask = async (e) => {
    e.preventDefault()
    if (!newTask.title.trim() || !newTask.dueDate) return

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: newTask.productId || '',
          title: newTask.title.trim(),
          description: '',
          dueDate: newTask.dueDate,
          priority: newTask.priority,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.message || 'Could not create task.')
        return
      }
      toast.success('Task added to calendar.')
      setCreating(false)
      setNewTask({ title: '', dueDate: newTask.dueDate, priority: 'medium', productId: '' })
      loadEvents(year, month)
      if (selectedDate) {
        setSelectedDate((prev) => ({
          ...prev,
          items: [...(prev?.items ?? []), { ...data.task, type: 'task', priority: data.task.priority }],
        }))
      }
    } catch {
      toast.error('Could not create task.')
    }
  }

  const isToday = (day) => dateKey(day) === toISODate(today)
  const isSelected = (day) => selectedDate?.date === dateKey(day)

  const upcomingDays = useMemo(() => {
    const now = startOfDay()
    const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const items = []
    for (const event of events) {
      if (event.date < toISODate(now) || event.date > toISODate(cutoff)) continue
      for (const item of event.items) {
        items.push({ date: event.date, ...item })
      }
    }
    return items.sort((a, b) => a.date.localeCompare(b.date))
  }, [events])

  return (
    <div className="min-h-[60vh]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-6">
        <div>
          <h1 className="text-[15px] font-semibold text-ink">Calendar</h1>
          <p className="mt-0.5 text-[13px] text-muted">Warranty expiry dates, reminders, and action tasks.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openCreateForDate(dateKey(new Date().getDate()))}>
            <Plus size={13} aria-hidden="true" />
            Add task
          </Button>
        </div>
      </div>

      <Card className="border-0 bg-transparent">
        <CardBody className="py-4 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handlePrev} aria-label="Previous month">
                <ChevronLeft size={16} aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNext} aria-label="Next month">
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
              <span className="ml-1 text-[13.5px] font-medium text-ink">{monthName}</span>
            </div>
            {loading ? (
              <div className="h-6 w-24 animate-pulse rounded-[6px] bg-surface-2" />
            ) : error ? (
              <span className="text-[12.5px] text-danger-700">{String(error)}</span>
            ) : (
              <span className="text-[12.5px] text-muted">{events.length} event{daysInMonth === 1 ? '' : 's'} this month</span>
            )}
          </div>

          {loading ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-[10px] bg-surface-2" />
              ))}
            </div>
          ) : error ? (
            <ErrorState onRetry={() => loadEvents(year, month)} />
          ) : weeks.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No events this month"
              description="Your warranty expiry dates, reminders, and action tasks that fall in this month will appear here."
            />
          ) : (
            <>
              <div className="mt-4 grid gap-0 overflow-hidden rounded-[10px] border border-line bg-surface-2/40">
                <div className="grid grid-cols-7 border-b border-line">
                  {WEEKDAYS.map((name) => (
                    <div
                      key={name}
                      className="px-1 py-2 text-center text-[10.5px] font-medium uppercase tracking-wide text-muted"
                    >
                      {name}
                    </div>
                  ))}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 border-b border-line last:border-b-0">
                    {week.map((day) => {
                      const dateStr = dateKey(day)
                      const items = eventsByDate[dateStr] ?? []
                      const previousMonth = day < 1
                      const nextMonth = day > daysInMonth
                      const muted = previousMonth || nextMonth

                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            if (previousMonth || nextMonth) return
                            if (selectedDate?.date === dateStr) {
                              closeDate()
                            } else {
                              openDate(dateStr, day)
                            }
                          }}
                          className={`relative min-h-[88px] px-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                            muted
                              ? 'bg-transparent text-muted/50 cursor-default focus-visible:outline-0'
                              : isToday(day)
                                ? 'bg-brand-500/8 focus-visible:outline-brand-500'
                                : isSelected(day)
                                  ? 'bg-brand-500/10 focus-visible:outline-brand-500'
                                  : 'focus-visible:outline-brand-500'
                          }`}
                          disabled={muted}
                          aria-label={day > 0 ? `${day} ${monthName}` : undefined}
                        >
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium ${
                              isToday(day)
                                ? 'rounded-full bg-brand-500 text-white ring-2 ring-brand-500/30'
                                : muted
                                  ? 'bg-transparent'
                                  : 'text-muted'
                            }`}
                          >
                            {day > 0 ? day : ''}
                          </span>
                          <div className="mt-0.5 flex flex-col gap-0.5">
                            {items.slice(0, 3).map((item, idx) => (
                              <EventChip key={idx} item={item} onClick={() => navigate(item.url)} />
                            ))}
                            {items.length > 3 && (
                              <span className="self-start text-[10px] font-medium text-muted">+{items.length - 3} more</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-line pt-4">
                <h2 className="text-[13px] font-medium text-muted uppercase tracking-wide">Upcoming 30 days</h2>
                {upcomingDays.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted">Nothing scheduled in the next 30 days.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {upcomingDays.map((item) => (
                      <li
                        key={`${item.date}-${item.type}-${item.title}`}
                        className="flex items-start gap-3 rounded-[8px] border border-line bg-surface p-3 text-left transition hover:bg-surface-2"
                      >
                        <div className="flex min-w-[70px] flex-col items-center rounded-[6px] bg-surface-2 px-2 py-1.5">
                          <span className="text-[11px] font-semibold text-ink">{item.date.split('-')[2]}</span>
                          <span className="text-[10px] text-muted">
                            {new Date(item.date).toLocaleString('en-IN', { month: 'short' })}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-ink truncate">{item.title}</p>
                          <p className="text-[12px] text-muted">{item.subtitle}</p>
                          {item.daysRemaining != null && (
                            <p className="mt-0.5 text-[11.5px] text-muted">{formatDayLabel(item.daysRemaining)}</p>
                          )}
                        </div>
                        <Button size="sm" variant="subtle" onClick={() => navigate(item.url)}>
                          View
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {selectedDate && (
        <Modal
          open={selectedDate !== null}
          onClose={closeDate}
          title={`${selectedDate.date}`}
          size="md"
          footer={
            <Button variant="primary" size="sm" onClick={() => openCreateForDate(selectedDate.date)}>
              <Plus size={13} aria-hidden="true" />
              Add task for this day
            </Button>
          }
        >
          {selectedDate.items.length === 0 ? (
            <EmptyState
              compact
              icon={Clock}
              title="Nothing scheduled for this day"
              description="Add a task or wait for an upcoming warranty reminder to appear here."
            />
          ) : (
            <ul className="space-y-2">
              {selectedDate.items.map((item) => (
                <li
                  key={`${item.type}-${item.title}`}
                  className="flex items-start gap-3 rounded-[8px] border border-line bg-surface-2/60 p-3 text-left"
                >
                  <Badge variant={badgeVariant(item.type, item.priority ?? item.targetMilestone)}>
                    {item.type === 'task' ? 'Task' : item.type === 'warranty_expiry' ? 'Warranty' : 'Reminder'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink truncate">{item.title}</p>
                    {item.subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{item.subtitle}</p>}
                    {item.product && (
                      <p className="mt-1 text-[12px] text-muted">{item.product.name}</p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate(item.url)}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add action task"
        description="Link it to a product if you want. Tasks without a product still show on your calendar."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-task-form" size="sm">
              Save task
            </Button>
          </>
        }
      >
        <form id="new-task-form" onSubmit={submitNewTask} className="space-y-4">
          <Field label="Task title" required>
            <Input
              placeholder="e.g. Review warranty document"
              value={newTask.title}
              onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
              autoFocus
            />
          </Field>
          <Field label="Due date" required hint="Calendar date this task is due.">
            <Input
              type="date"
              value={newTask.dueDate}
              onChange={(e) => setNewTask((prev) => ({ ...prev, dueDate: e.target.value }))}
              min={toISODate(new Date())}
              max={toISODate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))}
            />
          </Field>
          <Field label="Priority">
            <Select
              value={newTask.priority}
              onChange={(e) => setNewTask((prev) => ({ ...prev, priority: e.target.value }))}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          {user && (
            <Field label="Linked product">
              <Select
                value={newTask.productId}
                onChange={(e) => setNewTask((prev) => ({ ...prev, productId: e.target.value }))}
              >
                <option value="">No product</option>
                {[] /* product list is loaded elsewhere; keep form usable without it */}
              </Select>
            </Field>
          )}
        </form>
      </Modal>
    </div>
  )
}
