import {
  Camera,
  Headphones,
  Laptop,
  Monitor,
  Package,
  Refrigerator,
  Smartphone,
  Sofa,
  WashingMachine,
  Wind,
} from 'lucide-react'
import { CATEGORY_LABELS } from '../../utils/constants'

const CATEGORY_STYLE = {
  electronics: 'bg-brand-500/12 text-brand-400',
  appliances: 'bg-surface-2 text-ink-soft',
  furniture: 'bg-surface-2 text-ink-soft',
  accessories: 'bg-surface-2 text-muted',
  other: 'bg-surface-2 text-muted',
}

const CATEGORY_FALLBACK = {
  electronics: Laptop,
  appliances: WashingMachine,
  furniture: Sofa,
  accessories: Headphones,
  other: Package,
}

const KEYWORD_ICONS = [
  { match: /washing|washer/i, icon: WashingMachine },
  { match: /refrigerator|fridge|ac\b|air conditioner/i, icon: Refrigerator },
  { match: /air fryer|vacuum|cooler|fan/i, icon: Wind },
  { match: /phone|oneplus|iphone|smartphone/i, icon: Smartphone },
  { match: /laptop|pavilion|vivobook|notebook/i, icon: Laptop },
  { match: /monitor|screen|display/i, icon: Monitor },
  { match: /camera|dslr|eos/i, icon: Camera },
  { match: /headphone|earbud|earbuds|speaker|watch|boat|bose|sony|jbl/i, icon: Headphones },
  { match: /chair|shelf|table|sofa|kallax/i, icon: Sofa },
]

export function getProductIcon(product = {}) {
  const haystack = `${product.name ?? ''} ${product.brand ?? ''}`
  const hit = KEYWORD_ICONS.find(({ match }) => match.test(haystack))
  if (hit) return hit.icon
  return CATEGORY_FALLBACK[product.category] ?? Package
}

/**
 * The icon tile shown next to every product. Muted category tint + a
 * product-aware glyph so lists feel like real purchase records.
 */
export function ProductIcon({ product, size = 'md' }) {
  const Icon = getProductIcon(product)
  const dimensions =
    size === 'lg'
      ? 'h-11 w-11 rounded-[10px]'
      : size === 'sm'
        ? 'h-8 w-8 rounded-[7px]'
        : 'h-10 w-10 rounded-[9px]'
  const glyph = size === 'lg' ? 20 : size === 'sm' ? 15 : 17
  const tone = CATEGORY_STYLE[product.category] ?? CATEGORY_STYLE.other

  return (
    <div
      className={`flex shrink-0 items-center justify-center ${dimensions} ${tone}`}
      aria-hidden="true"
      title={CATEGORY_LABELS[product.category] ?? 'Product'}
    >
      <Icon size={glyph} />
    </div>
  )
}

export default ProductIcon
