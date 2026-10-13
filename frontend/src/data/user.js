import { addDays, toISODate } from '../utils/dates'

/**
 * Mock account used until authentication is connected to the backend.
 * The session is stored locally so the UI can be navigated end-to-end.
 */
export const mockUser = {
  id: 'usr_001',
  fullName: 'Jaswanth Kumar',
  email: 'jaswanth.kumar@example.com',
  memberSince: toISODate(addDays(new Date(), -850)),
  avatarUrl: '',
  notificationsEnabled: true,
}

export default mockUser
