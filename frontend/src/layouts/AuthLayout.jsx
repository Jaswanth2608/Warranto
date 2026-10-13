import { FileText, ShieldCheck, BellRing } from 'lucide-react'

import Logo, { LogoMark } from './Logo'

const HIGHLIGHTS = [
  {
    icon: FileText,
    title: 'Digital bill storage',
    description: 'Every invoice in one searchable place.',
  },
  {
    icon: ShieldCheck,
    title: 'Automatic warranty tracking',
    description: 'Expiry dates calculated from your purchase.',
  },
  {
    icon: BellRing,
    title: 'Reminders before expiry',
    description: 'Know exactly when coverage is about to end.',
  },
]

/**
 * Split layout used by Login and Register.
 * The brand lockup sits above the form heading, so the artwork is visible on
 * mobile (where the panel is hidden) and stays aligned with the form column on
 * desktop. The panel carries the compact symbol only — the full lockup is never
 * repeated twice on one screen.
 */
export function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface px-12 py-12 lg:flex lg:flex-col">
        <div className="relative flex items-center gap-3">
          <LogoMark size="sm" />
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-400">
            Digital warranty &amp; bill manager
          </p>
        </div>

        <div className="relative mt-auto max-w-md">
          <h2 className="text-[28px] font-semibold leading-[1.2] tracking-tight text-ink">
            Your purchases.
            <br />
            Protected and organized.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
            Keep every bill, product detail and warranty deadline in one place — quietly tracked,
            never lost.
          </p>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex items-start gap-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-surface-2 text-brand-400 ring-1 ring-inset ring-line">
                  <item.icon size={15} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[13.5px] font-medium text-ink">{item.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                    {item.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 text-[12px] text-muted/70">
          © {new Date().getFullYear()} Warranto. All rights reserved.
        </p>
      </aside>

      <div className="flex min-h-screen flex-col px-5 py-8 sm:px-10">
        <div className="flex flex-1 items-center justify-center py-6 sm:py-10">
          <div className="w-full max-w-[400px]">
            <div className="mb-8 flex justify-center">
              {/* `to={null}`: the heading directly below is the page's primary
                  landmark, so the lockup stays a non-interactive brand block. */}
              <Logo to={null} size="lg" />
            </div>

            {children}
          </div>
        </div>

        <p className="text-center text-[12px] text-muted">
          © {new Date().getFullYear()} Warranto. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default AuthLayout
