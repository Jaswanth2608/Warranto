import { FileText, Package, ShieldCheck } from 'lucide-react'

/**
 * Landing hero illustration.
 *
 * A floating composition recreated from the approved reference: three labelled
 * feature tiles (Products / Bills / Warranties), a dark dashboard preview, white
 * purchase-receipt cards layered behind it, and a product object with a soft
 * blue atmospheric glow.
 *
 * Everything is HTML/CSS/SVG — no stock imagery — so it stays crisp at any size.
 * Positions are percentages of a fixed-aspect stage, which keeps the arrangement
 * identical from tablet to desktop. Below `sm` the stage swaps to a simplified
 * stacked composition (see the end of this file) so nothing is clipped.
 */

/** One floating labelled tile. */
function FeatureTile({ icon: Icon, label, tone, className = '' }) {
  const iconColor = tone === 'cyan' ? 'text-cyan' : 'text-brand-400'
  const ringColor = tone === 'cyan' ? 'bg-cyan/12' : 'bg-brand-500/14'

  return (
    <div
      className={`absolute flex aspect-square flex-col items-center justify-center gap-[9%] rounded-[26px] border border-white/10 bg-[#0c1a30]/85 shadow-[0_18px_50px_-18px_rgba(3,10,25,0.9)] backdrop-blur-sm ${className}`}
    >
      <div className="relative flex h-[58%] w-[58%] items-center justify-center">
        <span className={`absolute inset-0 rounded-full ${ringColor}`} aria-hidden="true" />
        <span
          className="absolute inset-[-14%] rounded-full border border-white/[0.07]"
          aria-hidden="true"
        />
        <span className="relative flex h-[62%] w-[62%] items-center justify-center rounded-[10px] bg-[#0a1526] ring-1 ring-inset ring-white/10">
          <Icon className={iconColor} size={18} aria-hidden="true" />
        </span>
      </div>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/85">
        {label}
      </span>
    </div>
  )
}

/** Compact, convincing stand-in for the Warranto dashboard. */
function DashboardPreview() {
  return (
    <div
      className="absolute left-[36%] top-[45%] w-[44%] overflow-hidden rounded-[10px] border border-white/10 bg-[#0b1526] shadow-[0_30px_70px_-24px_rgba(0,0,0,0.95)]"
      style={{ transform: 'perspective(1200px) rotateX(6deg) rotateY(-17deg) rotateZ(1deg)' }}
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-2.5 py-1.5">
        <span className="text-[7px] font-semibold uppercase tracking-[0.12em] text-white/70">
          Warranto
        </span>
        <span className="ml-3 h-[6px] w-[38%] rounded-full bg-white/[0.06]" />
        <span className="ml-auto h-[9px] w-[9px] rounded-full bg-white/10" />
      </div>

      <div className="flex gap-2 p-2.5">
        <div className="hidden w-[26%] shrink-0 flex-col gap-1.5 sm:flex">
          {[0, 1, 2, 3, 4].map((row) => (
            <span
              key={row}
              className={`h-[3px] rounded-full ${row === 0 ? 'w-[80%] bg-brand-500/70' : 'w-[62%] bg-white/[0.09]'}`}
            />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Active', value: '12', tone: 'text-success-700' },
              { label: 'Expiring', value: '3', tone: 'text-warning-700' },
              { label: 'Expired', value: '2', tone: 'text-danger-700' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-[5px] bg-white/[0.045] px-1.5 py-1">
                <p className="text-[5.5px] uppercase tracking-[0.08em] text-white/45">
                  {stat.label}
                </p>
                <p className={`text-[9px] font-semibold ${stat.tone}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-1.5 space-y-1">
            {[
              { name: 'Samsung Washing Machine', badge: 'Active', badgeClass: 'text-success-700' },
              { name: 'Sony WH-1000XM5', badge: 'Expiring', badgeClass: 'text-warning-700' },
              { name: 'Apple Watch Series 9', badge: 'Expired', badgeClass: 'text-danger-700' },
            ].map((row) => (
              <div
                key={row.name}
                className="flex items-center gap-2 rounded-[5px] bg-white/[0.03] px-1.5 py-[5px]"
              >
                <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-brand-400" />
                <span className="truncate text-[6.5px] text-white/70">{row.name}</span>
                <span className={`ml-auto shrink-0 text-[6px] font-medium ${row.badgeClass}`}>
                  {row.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Layered white receipt cards, built from elements rather than an image. */
function ReceiptCard({ serial, product, price, className = '', style }) {
  return (
    <div
      className={`absolute w-[30%] rounded-[8px] bg-white p-2.5 shadow-[0_22px_45px_-18px_rgba(0,0,0,0.85)] ${className}`}
      style={style}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[8px] font-bold uppercase tracking-[0.06em] text-slate-900">
          Purchase
          <br />
          Receipt
        </span>
        <span className="text-right text-[6px] leading-tight text-slate-400">{serial}</span>
      </div>

      <div className="mt-2 flex h-[26px] items-end gap-[2px]" aria-hidden="true">
        {[8, 16, 11, 22, 14, 26, 9, 18, 12, 24, 7, 20, 13, 9, 21, 11].map((height, index) => (
          <span
            key={index}
            className="w-[3px] rounded-[1px] bg-slate-800"
            style={{ height: `${height}px` }}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100 pt-1.5">
        <span className="truncate text-[6.5px] text-slate-500">{product}</span>
        <span className="shrink-0 text-[7px] font-semibold text-slate-800">{price}</span>
      </div>
    </div>
  )
}

/**
 * Product object: a green pod with a wrist-worn device resting on it — the kind
 * of purchase Warranto keeps a warranty for.
 */
function ProductObject({ className = '' }) {
  return (
    <svg viewBox="0 0 200 260" className={className} role="presentation" aria-hidden="true">
      <defs>
        <linearGradient id="wnt-pod" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#3f9a63" />
          <stop offset="45%" stopColor="#24784a" />
          <stop offset="100%" stopColor="#0f3f27" />
        </linearGradient>
        <linearGradient id="wnt-case" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#243050" />
          <stop offset="100%" stopColor="#0a1120" />
        </linearGradient>
      </defs>

      {/* Pod body — organic rounded silhouette */}
      <path
        d="M100 6c46 0 76 28 76 68v96c0 40-30 66-76 66s-76-26-76-66V74c0-40 30-68 76-68z"
        fill="url(#wnt-pod)"
      />
      <path
        d="M100 6c46 0 76 28 76 68v96c0 40-30 66-76 66s-76-26-76-66V74c0-40 30-68 76-68z"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
      />
      {/* Rim light along the top-left edge */}
      <path
        d="M42 74c0-28 20-48 52-52"
        fill="none"
        stroke="rgba(150,225,255,0.6)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Shadow the device casts on the pod */}
      <ellipse cx="106" cy="214" rx="58" ry="12" fill="rgba(4,20,12,0.45)" />

      {/* Wrist strap behind the case */}
      <path d="M74 58h52l-6 34H80z" fill="#111a2e" />
      <path d="M80 214h40l6 34H74z" fill="#111a2e" />

      {/* Device case */}
      <rect x="60" y="86" width="80" height="116" rx="24" fill="url(#wnt-case)" />
      <rect
        x="60"
        y="86"
        width="80"
        height="116"
        rx="24"
        fill="none"
        stroke="rgba(255,255,255,0.16)"
      />
      {/* Crown */}
      <rect x="139" y="124" width="6" height="16" rx="3" fill="#2b3a5e" />
      {/* Screen */}
      <rect x="70" y="96" width="60" height="96" rx="17" fill="#050a14" />
      <circle cx="100" cy="136" r="15" fill="none" stroke="#3f6be8" strokeWidth="2.5" />
      <path
        d="M93 136l5 5 9-10"
        fill="none"
        stroke="#36c5ff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="86" y="162" width="28" height="4" rx="2" fill="rgba(255,255,255,0.22)" />
      <rect x="92" y="171" width="16" height="4" rx="2" fill="rgba(255,255,255,0.14)" />
    </svg>
  )
}

/** Full composition for tablet and up. */
function Stage() {
  return (
    <div className="relative mx-auto aspect-[66/70] w-full max-w-[660px]">
      <FeatureTile
        icon={Package}
        label="Products"
        tone="cyan"
        className="left-0 top-[1%] w-[26%] -rotate-[7deg] anim-float"
      />
      <FeatureTile
        icon={FileText}
        label="Bills"
        tone="blue"
        className="left-[30%] top-[11%] w-[29%] rotate-[4deg] anim-float-slow"
      />
      <FeatureTile
        icon={ShieldCheck}
        label="Warranties"
        tone="cyan"
        className="left-[76%] top-[3%] w-[24%] rotate-[8deg] anim-float"
      />

      <DashboardPreview />

      <div className="absolute inset-0 z-10">
        <ReceiptCard
          serial="#WR-004821"
          product="Apple iPhone 15 Pro"
          price="$1,299.00"
          className="left-[61%] top-[58%] !w-[27%]"
          style={{ transform: 'rotate(9deg)' }}
        />
        <ReceiptCard
          serial="#WR-004822"
          product="Apple Watch Series 9"
          price="$399.00"
          className="left-[71%] top-[66%] !w-[28%]"
          style={{ transform: 'rotate(16deg)' }}
        />
        <ReceiptCard
          serial="#WR-004823"
          product="AirPods Pro (2nd gen)"
          price="$249.00"
          className="left-[52%] top-[72%] !w-[27%]"
          style={{ transform: 'rotate(4deg)' }}
        />

        <ProductObject className="absolute left-[69%] top-[63%] z-20 w-[25%] drop-shadow-[0_26px_42px_rgba(0,0,0,0.75)] anim-float-slow" />
      </div>

      {/* Stand reflection under the dashboard */}
      <span
        className="absolute left-[36%] top-[66%] h-[3px] w-[42%] rounded-full bg-gradient-to-r from-transparent via-cyan/45 to-transparent blur-[1px]"
        aria-hidden="true"
      />
    </div>
  )
}

/** Simplified stack for phones — same identity, nothing clipped. */
function MobileStage() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="grid grid-cols-3 gap-2.5">
        <FeatureTile icon={Package} label="Products" tone="cyan" className="!static w-full" />
        <FeatureTile icon={FileText} label="Bills" tone="blue" className="!static w-full" />
        <FeatureTile
          icon={ShieldCheck}
          label="Warranties"
          tone="cyan"
          className="!static w-full"
        />
      </div>

      <div className="relative mt-3">
        <div className="relative overflow-hidden rounded-[10px] border border-white/10 bg-[#0b1526] p-3 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.95)]">
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Active', value: '12', tone: 'text-success-700' },
              { label: 'Expiring', value: '3', tone: 'text-warning-700' },
              { label: 'Expired', value: '2', tone: 'text-danger-700' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-[6px] bg-white/[0.045] px-2 py-1.5">
                <p className="text-[9px] uppercase tracking-[0.08em] text-white/45">{stat.label}</p>
                <p className={`text-[13px] font-semibold ${stat.tone}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <ReceiptCard
          serial="#WR-004821"
          product="Apple iPhone 15 Pro"
          price="$1,299.00"
          className="!left-auto !top-auto right-0 top-3 !w-[42%]"
          style={{ transform: 'rotate(8deg)' }}
        />
      </div>
    </div>
  )
}

export function HeroIllustration() {
  return (
    <>
      <div className="hidden sm:block">
        <Stage />
      </div>
      <div className="sm:hidden">
        <MobileStage />
      </div>
    </>
  )
}

export default HeroIllustration
