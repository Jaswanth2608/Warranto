import { Link } from 'react-router-dom'

import Logo from '../../layouts/Logo'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How It Works', href: '#how-it-works' },
      { label: 'About', href: '#about' },
      { label: 'Get Started', to: '/register' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Log in', to: '/login' },
      { label: 'Create account', to: '/register' },
      { label: 'Overview', to: '/dashboard' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="bg-canvas">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo to="/" size="md" />
            <p className="mt-4 text-muted text-[13.5px] leading-relaxed">
              Your purchases. Your bills. Your warranties. One place.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h3 className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link
                        to={link.to}
                        className="text-[13.5px] text-muted transition hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-[13.5px] text-muted transition hover:text-ink"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-muted">
            © {new Date().getFullYear()} Warranto. All rights reserved.
          </p>
          <p className="text-[12.5px] text-muted/70">Digital warranty manager</p>
        </div>
      </div>
    </footer>
  )
}

export default SiteFooter
