/**
 * Identity for this browser tab in the live-update protocol.
 *
 * The API echoes a change to every tab of the account except the one that made
 * it, so the acting tab does not revalidate work it just saved. The id lives in
 * sessionStorage: it survives a reload of this tab but not a duplicate tab or a
 * new window, which is exactly the level of uniqueness the stream needs.
 */

const STORAGE_KEY = 'warranto.live.client'

function randomId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    // Older browsers / insecure contexts: fall through.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

let cached = null

/** Returns this tab's stable identifier, creating one on first use. */
export function getLiveClientId() {
  if (cached) return cached

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored && /^[A-Za-z0-9._:-]{1,64}$/.test(stored)) {
      cached = stored
      return cached
    }
    const created = randomId()
    sessionStorage.setItem(STORAGE_KEY, created)
    cached = created
    return cached
  } catch {
    // Storage blocked (private mode, embedded frame): a per-load id still
    // stops the stream from echoing writes back to this same page.
    cached = randomId()
    return cached
  }
}

export default getLiveClientId
