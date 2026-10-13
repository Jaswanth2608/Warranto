import apiClient from './httpClient'

/**
 * Calendar API client.
 * - year/month are sent as query parameters; the backend returns only events
 *   that fall within that calendar month for the authenticated user.
 * - Empty response means no events for that month, not an error.
 */
export const calendarService = {
  getEvents: (year, month) =>
    apiClient.get('/calendar/events', { params: { year, month } }),
}

export default calendarService
