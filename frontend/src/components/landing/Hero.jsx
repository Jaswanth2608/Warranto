import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import HeroIllustration from './HeroIllustration'

const PRIMARY_CTA =
  'inline-flex h-[58px] w-full items-center justify-center gap-2 rounded-[12px] border border-white/10 bg-gradient-to-r from-[#3b82f6] via-[#6366f1] to-[#8b5cf6] px-6 text-[16px] font-semibold text-white shadow-[0_16px_40px_-14px_rgba(99,102,241,0.75)] transition duration-200 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 sm:h-[62px] sm:w-auto sm:px-7 sm:text-[17px]'

const SECONDARY_CTA =
  'inline-flex h-[58px] w-full items-center justify-center rounded-[12px] border border-white/15 bg-white/[0.03] px-6 text-[16px] font-semibold text-white transition duration-200 hover:bg-white/[0.08] hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 sm:h-[62px] sm:w-auto sm:px-7 sm:text-[17px]'

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0a1628]">
      {/* Atmosphere: violet toward the lower-left, blue behind the illustration. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 bottom-[-22%] h-[520px] w-[520px] rounded-full bg-purple/14 blur-[140px]" />
        <div className="absolute right-[-6%] top-[2%] h-[620px] w-[620px] rounded-full bg-brand-500/20 blur-[130px]" />
        <div className="absolute right-[14%] top-[38%] h-[360px] w-[360px] rounded-full bg-cyan/10 blur-[120px]" />
        <div className="absolute inset-x-0 top-0 h-[220px] bg-gradient-to-b from-[#0d1e39] to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-[1320px] px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20 xl:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-14 xl:gap-20">
          <div className="max-w-[660px]">
            {/* Eyebrow — two lines, cyan then violet */}
            <p className="text-[13.5px] font-medium uppercase leading-[1.6] tracking-[0.18em] text-cyan sm:text-[15px]">
              Digital Warranty
              <br />
              <span className="text-purple">Management</span>
            </p>

            {/* Headline — third line carries the blue → violet gradient */}
            <h1 className="mt-5 text-[34px] font-extrabold leading-[1.04] tracking-[-0.02em] text-white sm:mt-6 sm:text-[48px] lg:text-[58px] xl:text-[66px]">
              <span className="block">Every Purchase.</span>
              <span className="block">Every Bill.</span>
              <span className="block bg-gradient-to-r from-[#3aa0ff] via-[#7c5cff] to-[#a855f7] bg-clip-text text-transparent">
                Every Warranty.
              </span>
            </h1>

            <p className="mt-6 max-w-[560px] text-[16.5px] leading-relaxed text-[#c8d4ea] sm:text-[17.5px] lg:text-[19px]">
              Keep your products, purchase bills, and warranty dates organized in one secure place.
            </p>

            <div className="mt-8 flex flex-col gap-3.5 sm:flex-row sm:items-center sm:gap-4">
              <Link to="/register" className={PRIMARY_CTA}>
                Get Started
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#features" className={SECONDARY_CTA}>
                Explore Features
              </a>
            </div>

          </div>

          <div className="w-full">
            <HeroIllustration />
          </div>
        </div>
      </div>

      {/* Blend the hero into the page canvas below. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-canvas"
      />
    </section>
  )
}

export default Hero
