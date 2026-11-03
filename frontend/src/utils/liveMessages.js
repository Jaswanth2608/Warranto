/**
 * Wording for the live-update surfaces.
 *
 * Kept apart from the components so the same phrasing is used by the header
 * panel and by the toast that announces a change made in another tab, and so
 * the rules (which changes deserve interrupting the user) can be tested.
 */

export const LIVE_RESOURCE_LABELS = {
  products: 'Products',
  bills: 'Bills',
  tasks: 'Tasks',
  reminders: 'Reminders',
  services: 'Service history',
  profile: 'Profile',
}

/** Human name for a resource key, when we have one. */
export function liveResourceLabel(resource) {
  return LIVE_RESOURCE_LABELS[resource] ?? 'Your records'
}

/** One-line summary of a change frame, e.g. "Products updated". */
export function describeLiveChange(change) {
  if (!change || change.type !== 'change') return null
  const label = liveResourceLabel(change.resource)
  const action = change.action === 'deleted' ? 'deleted' : change.action === 'created' ? 'added' : 'updated'
  return {
    title: `${label} ${action}`,
    message: `Changed in another tab or device — this view is already up to date.`,
    isDestructive: change.action === 'deleted',
  }
}

/**
 * Whether a remote change should raise a toast, or merely refresh quietly.
 *
 * Silent refreshes are the default: a toast for every background update would
 * be noise. A deletion is different — records visibly disappearing deserve an
 * explanation — and the profile resource is excluded because it changes on
 * every sign-in rather than because of the user's data.
 */
export function shouldAnnounceChange(change, { visible = true } = {}) {
  if (!visible) return false
  return Boolean(change && change.type === 'change' && change.action === 'deleted')
}
