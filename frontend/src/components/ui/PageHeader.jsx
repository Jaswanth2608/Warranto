/** Icon used by the Scan Bill page so the sidebar stays consistent. */
export function PageHeaderIC() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        fill="url(#doc-grad)"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v6h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 11.5h7m-3.5 4h3.5m-3.5 4h7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.55"
      />
      <defs>
        <linearGradient id="doc-grad" x1="6" x2="18" y1="2" y2="20">
          <stop offset="0" stopColor="#f6a8ff" />
          <stop offset="1" stopColor="#f25f9e" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** Standard page heading: title, supporting copy and primary actions. */
export function PageHeader({ title, subtitle, actions, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className="text-[21px] font-semibold tracking-tight text-ink sm:text-[22px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export default PageHeader
