import { ShoppingBag, FileText, ShieldCheck, BellRing } from 'lucide-react'

const STEPS = [
  { number: '01', icon: ShoppingBag, title: 'Purchase', description: 'Buy something worth keeping track of.' },
  { number: '02', icon: FileText, title: 'Save the bill', description: 'Attach the invoice while you still have it.' },
  { number: '03', icon: ShieldCheck, title: 'Track warranty', description: 'Expiry is calculated from the purchase date.' },
  { number: '04', icon: BellRing, title: 'Get reminded', description: 'Know before a warranty expires.' },
]

/** Section 5 — the workflow, thin connectors, small icons. */
export function Workflow() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b border-line py-16 lg:py-20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-400">
            How it works
          </p>
          <h2 className="mt-4 text-[26px] font-semibold tracking-tight text-ink sm:text-[28px]">
            From purchase to protection.
          </h2>
        </div>

        <ol className="relative mt-10 grid gap-6 lg:grid-cols-4">
          <span
            className="absolute left-0 right-0 top-[26px] hidden h-px bg-line lg:block"
            aria-hidden="true"
          />
          {STEPS.map((step, index) => (
            <li key={step.number} className="relative">
              <div className="flex items-center gap-3">
                <span className="relative z-10 flex h-[50px] w-[50px] items-center justify-center rounded-lg border border-line bg-surface text-brand-400">
                  <step.icon size={17} aria-hidden="true" />
                </span>
                <span className="text-[12px] font-medium tabular-nums tracking-[0.06em] text-muted lg:hidden">
                  {step.number}
                </span>
                {index < STEPS.length - 1 ? (
                  <span
                    className="ml-auto hidden h-px flex-1 bg-line lg:hidden"
                    aria-hidden="true"
                  />
                ) : null}
              </div>

              <p className="mt-4 hidden text-[12px] font-medium tabular-nums tracking-[0.08em] text-muted lg:block">
                {step.number}
              </p>
              <h3 className="mt-2 text-ink text-[15.5px] font-semibold lg:mt-1">{step.title}</h3>
              <p className="mt-1.5 text-muted text-[13.5px] leading-relaxed">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export default Workflow
