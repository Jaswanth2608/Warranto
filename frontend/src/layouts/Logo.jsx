import { Link } from 'react-router-dom'

/**
 * Warranto brand mark.
 *
 * Assets are the supplied artwork, used verbatim:
 *   /images/warranto-logo.png     — the approved lockup (master asset)
 *   /images/warranto-mark.png     — the W/checkmark symbol
 *   /images/warranto-wordmark.png — the WARRANTO wordmark (transparent)
 *
 * The square lockup's wordmark is illegible below roughly 120px wide, so the
 * UI composes the same symbol and wordmark horizontally (`layout="horizontal"`)
 * or stacked (`layout="stacked"`) instead of scaling the square image down.
 * Every raster keeps its aspect ratio via object-contain — nothing is stretched
 * or cropped.
 */

const ASSETS = {
  mark: '/images/warranto-mark.png',
  wordmark: '/images/warranto-wordmark.png',
  lockup: '/images/warranto-logo.png',
}

const SIZES = {
  xs: { mark: 22, word: 76, gap: 7 },
  sm: { mark: 26, word: 92, gap: 8 },
  md: { mark: 32, word: 112, gap: 9 },
  lg: { mark: 40, word: 140, gap: 11 },
  xl: { mark: 52, word: 184, gap: 14 },
}

/** The symbol on its own — for tight spaces and app chrome. */
export function LogoMark({ size = 'md', className = '' }) {
  const { mark } = SIZES[size] ?? SIZES.md

  return (
    <img
      src={ASSETS.mark}
      alt=""
      width={mark}
      height={mark}
      decoding="async"
      className={`shrink-0 rounded-[7px] object-contain ${className}`}
    />
  )
}

/** The wordmark on its own. */
export function LogoWordmark({ size = 'md', className = '' }) {
  const { word } = SIZES[size] ?? SIZES.md

  return (
    <img
      src={ASSETS.wordmark}
      alt="Warranto"
      width={word}
      height={Math.round((word * 108) / 961)}
      decoding="async"
      className={`w-auto object-contain ${className}`}
      style={{ height: Math.round((word * 108) / 961) }}
    />
  )
}

/**
 * Lockup used across the app.
 *
 * @param {string|null} to   Route for the link; pass null to render a plain block.
 * @param {'horizontal'|'stacked'|'mark'} layout
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} size
 * @param {boolean} showWordmark  Horizontal layout only.
 */
export function Logo({
  to = '/',
  layout = 'horizontal',
  size = 'md',
  showWordmark = true,
  className = '',
  label = 'Warranto home',
}) {
  const dims = SIZES[size] ?? SIZES.md

  const content =
    layout === 'mark' ? (
      <LogoMark size={size} />
    ) : layout === 'stacked' ? (
      <span className="flex flex-col items-center gap-3">
        <LogoMark size={size} />
        {showWordmark ? <LogoWordmark size={size} /> : null}
      </span>
    ) : (
      <span className="flex items-center" style={{ gap: dims.gap }}>
        <LogoMark size={size} />
        {showWordmark ? <LogoWordmark size={size} /> : null}
      </span>
    )

  const base = `inline-flex items-center ${className}`

  if (!to) {
    return (
      <span className={base} aria-label={layout === 'mark' ? 'Warranto' : undefined}>
        {content}
      </span>
    )
  }

  return (
    <Link
      to={to}
      aria-label={label}
      className={`${base} rounded-[8px] transition-opacity hover:opacity-90`}
    >
      {content}
    </Link>
  )
}

/** The supplied square lockup, for places that display the artwork as delivered. */
export function LogoLockup({ size = 160, className = '', alt = 'Warranto' }) {
  return (
    <img
      src={ASSETS.lockup}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

export default Logo
