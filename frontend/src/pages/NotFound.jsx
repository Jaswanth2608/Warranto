import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'

import { buttonClasses } from '../components/ui'
import Logo from '../layouts/Logo'
import { useDocumentTitle } from '../hooks/useUi'

export function NotFound() {
  useDocumentTitle('Page not found')

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-6 lg:px-8">
          <Logo />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="anim-slide-up max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-surface text-brand-400 shadow-card ring-1 ring-line">
            <SearchX size={24} aria-hidden="true" />
          </div>
          <p className="mt-6 text-[13px] font-semibold uppercase tracking-widest text-brand-400">
            404
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            This page could not be found
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            The link may be outdated, or the page has moved. Your products and warranties are
            exactly where you left them.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Link to="/" className={buttonClasses({ className: 'w-full sm:w-auto' })}>
              Back to home
            </Link>
            <Link
              to="/dashboard"
              className={buttonClasses({ variant: 'secondary', className: 'w-full sm:w-auto' })}
            >
              Open dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default NotFound
