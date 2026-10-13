const CHAIN = ['Purchase', 'Product', 'Bill', 'Warranty', 'Expiry', 'Reminder']

/** About — states the product identity plainly, without marketing noise. */
export function AboutSection() {
  return (
    <section id="about" className="scroll-mt-20 border-b border-line bg-surface py-16 lg:py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16 lg:px-8">
        <div>
          <p className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-400">
            About
          </p>
          <h2 className="mt-4 text-[26px] font-semibold tracking-tight text-ink sm:text-[28px]">
            A record manager for the things you own.
          </h2>
          <p className="mt-4 text-muted text-[15px] leading-relaxed">
            Two questions decide whether a warranty is useful: is it still valid, and do you have
            the bill? Warranto answers both for everything you own — no folders of receipts, no
            dates scribbled on paper, no guessing.
          </p>
          <p className="mt-3 text-muted text-[15px] leading-relaxed">
            Every record follows the same lifecycle, and every screen is built around it.
          </p>
        </div>

        <ol className="rounded-[14px] border border-line bg-canvas p-6">
          {CHAIN.map((step, index) => (
            <li key={step} className="relative flex items-center gap-3.5 pb-5 last:pb-0">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-surface-2 text-[11px] font-medium tabular-nums text-brand-400 ring-1 ring-inset ring-line"
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-[14px] font-medium text-ink-soft">{step}</span>
              {index < CHAIN.length - 1 ? (
                <span
                  className="absolute left-[13.5px] top-7 h-[calc(100%-28px)] w-px bg-line"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export default AboutSection
