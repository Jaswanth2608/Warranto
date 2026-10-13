import { Link } from 'react-router-dom'

import { buttonClasses } from '../ui'

/** Final CTA — solid dark panel, no gradient explosion. */
export function CtaBanner() {
  return (
    <section className="border-b border-line py-16 lg:py-20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8">
        <div className="rounded-[16px] border border-line bg-surface px-6 py-12 text-center sm:px-12 sm:py-14">
          <h2 className="text-ink text-[26px] font-semibold tracking-tight sm:text-[28px]">
            Never lose track of what you bought.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted text-[15px] leading-relaxed">
            Warranto keeps your purchases, bills and warranties together.
          </p>
          <div className="mt-7 flex justify-center">
            <Link
              to="/register"
              className={buttonClasses({ size: 'lg', className: 'w-full sm:w-auto' })}
            >
              Start using Warranto
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export default CtaBanner
