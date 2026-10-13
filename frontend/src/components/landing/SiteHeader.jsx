import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

import Logo from '../../layouts/Logo'
import { buttonClasses } from '../ui'

const SECTIONS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'About', href: '#about' },
]

/**
 * Landing page navbar.
 * Section links are real anchors (smooth-scrolled by CSS with the sticky header
 * offset from each section's `scroll-mt-*`), so they work on keyboard and with
 * history. The mobile menu is a real panel — it closes on Escape, on a link
 * press and on resize.
 */
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // Close the panel whenever the route changes, and let Escape dismiss it.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#081120]/80 backdrop-blur">
      <nav
        className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 pl-3 pr-5 sm:pl-4 sm:pr-6 lg:pl-5 lg:pr-8"
        aria-label="Primary"
      >
        <Logo to="/" size="md" className="shrink-0" />

        <ul className="ml-6 hidden items-center gap-7 lg:flex">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <a
                href={section.href}
                className="rounded-[6px] text-[13.5px] font-medium text-white/70 transition hover:text-white"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2.5">
          <Link
            to="/login"
            className="hidden rounded-[8px] px-3.5 py-2 text-[13.5px] font-medium text-white/85 transition hover:bg-white/10 hover:text-white sm:inline-flex"
          >
            Sign In
          </Link>
          <Link to="/register" className={buttonClasses({ size: 'md' })}>
            Get Started
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/15 text-white/80 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
          >
            {menuOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div
          id="landing-mobile-menu"
          className="border-t border-white/10 bg-[#081120] px-5 py-3 sm:px-6 lg:hidden"
        >
          <ul className="space-y-0.5">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <a
                  href={section.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-[8px] px-3 py-2.5 text-[14px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  {section.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                to="/login"
                className="block rounded-[8px] px-3 py-2.5 text-[14px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Sign In
              </Link>
            </li>
          </ul>
        </div>
      ) : null}
    </header>
  )
}

export default SiteHeader
