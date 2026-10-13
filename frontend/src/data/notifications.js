import { addDays, toISODate } from '../utils/dates'

const daysAgo = (days) => toISODate(addDays(new Date(), -days))

/** Mock in-app notifications (email reminders will be added with the backend). */
export const notifications = [
  {
    id: 'n-001',
    type: 'expiry',
    title: 'Bose QuietComfort Earbuds expires in 7 days',
    description: 'Warranty ends soon — keep the bill ready for a claim.',
    productId: 'p-016',
    createdAt: daysAgo(0),
    read: false,
  },
  {
    id: 'n-002',
    type: 'expiry',
    title: 'Samsung Washing Machine expires in 12 days',
    description: 'Consider scheduling a service check before coverage ends.',
    productId: 'p-001',
    createdAt: daysAgo(1),
    read: false,
  },
  {
    id: 'n-003',
    type: 'bill',
    title: 'Bill uploaded for Canon EOS R50',
    description: 'canon-eos-r50-invoice.pdf is now stored with the product.',
    productId: 'p-012',
    createdAt: daysAgo(42),
    read: false,
  },
  {
    id: 'n-004',
    type: 'summary',
    title: 'Monthly warranty summary ready',
    description: '4 warranties need attention this month.',
    productId: null,
    createdAt: daysAgo(3),
    read: true,
  },
  {
    id: 'n-005',
    type: 'product',
    title: 'Xiaomi Robot Vacuum S10 added',
    description: 'Your new product is being tracked for warranty expiry.',
    productId: 'p-013',
    createdAt: daysAgo(8),
    read: true,
  },
]

export default notifications
