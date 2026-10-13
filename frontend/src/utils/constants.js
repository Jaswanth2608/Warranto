/** Shared, UI-level constants for Warranto. */

export const CATEGORIES = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'appliances', label: 'Appliances' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'other', label: 'Other' },
]

export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORIES.map((category) => [category.value, category.label]),
)

export const WARRANTY_DURATIONS = [
  { value: 3, label: '3 Months' },
  { value: 6, label: '6 Months' },
  { value: 12, label: '1 Year' },
  { value: 24, label: '2 Years' },
  { value: 36, label: '3 Years' },
  { value: 60, label: '5 Years' },
  { value: 'custom', label: 'Custom' },
]

export const WARRANTY_TYPES = [
  'Manufacturer Warranty',
  'Extended Warranty',
  'Store Warranty',
  'Seller Warranty',
  'No Warranty',
]

/** Warranty statuses used across the product. */
export const STATUS = {
  ACTIVE: 'active',
  EXPIRING_SOON: 'expiring',
  EXPIRED: 'expired',
}

/** A warranty is "expiring soon" when it ends within this many days. */
export const EXPIRING_SOON_DAYS = 30

/** Buckets used on the Expiring Soon page. */
export const EXPIRY_WINDOWS = [
  { days: 7, label: 'Within 7 days' },
  { days: 30, label: 'Within 30 days' },
  { days: 60, label: 'Within 60 days' },
]

export const PRODUCT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring Soon' },
  { value: 'expired', label: 'Expired' },
]

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'expiry', label: 'Warranty Expiry' },
  { value: 'price', label: 'Price' },
]

export const BILL_ACCEPTED_TYPES = ['PDF', 'JPG', 'JPEG', 'PNG']
export const BILL_MAX_SIZE_MB = 10

export const SERVICE_TYPES = [
  { value: 'repair', label: 'Repair' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'checkup', label: 'Check-up' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'servicing', label: 'Servicing' },
  { value: 'parts_replacement', label: 'Parts Replacement' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'support', label: 'Support' },
  { value: 'other', label: 'Other' },
]

export const SERVICE_TYPE_LABELS = Object.fromEntries(
  SERVICE_TYPES.map((type) => [type.value, type.label]),
)
