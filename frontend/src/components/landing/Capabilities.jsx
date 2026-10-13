import {
  BellRing,
  LayoutDashboard,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  Wrench,
} from 'lucide-react'

const CAPABILITIES = [
  {
    icon: PackageSearch,
    title: 'Product & purchase tracking',
    description:
      'Every purchase with its brand, model, serial number, seller and price in one record.',
  },
  {
    icon: ReceiptText,
    title: 'Digital bill storage',
    description:
      'Attach the invoice (PDF or photo) to the product, then preview or download it whenever you need it.',
  },
  {
    icon: ShieldCheck,
    title: 'Warranty expiry tracking',
    description:
      'Expiry is calculated from the purchase date and warranty length — never typed in by hand.',
  },
  {
    icon: BellRing,
    title: 'Expiring-soon notifications',
    description:
      'See what is about to expire, with reminder milestones at 90, 30 and 7 days before the deadline.',
  },
  {
    icon: Wrench,
    title: 'Service history',
    description:
      'Log repairs, maintenance and check-ups per product, with service type, provider and cost.',
  },
  {
    icon: LayoutDashboard,
    title: 'Centralized dashboard',
    description:
      'Totals for active, expiring and expired warranties, plus a month calendar of every expiry date.',
  },
]

/** Features section — six capabilities, one consistent card treatment. */
export function Capabilities() {
  return (
    <section id="features" className="scroll-mt-24 border-b border-line py-16 lg:py-20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-400">
            Features
          </p>
          <h2 className="mt-4 text-[26px] font-semibold tracking-tight text-ink sm:text-[28px]">
            Everything you need after the purchase.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Warranto covers the record-keeping that usually gets scattered across email, drawers and
            screenshots.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <li
              key={item.title}
              className="flex flex-col gap-3.5 rounded-[12px] border border-line bg-surface p-5 transition-colors hover:border-line-strong"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-brand-500/10 text-brand-400 ring-1 ring-inset ring-brand-500/20">
                <item.icon size={17} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default Capabilities
