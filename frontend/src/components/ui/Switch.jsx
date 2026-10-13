/** Accessible toggle used in Settings. */
export function Switch({ checked = false, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-brand-500' : 'bg-line-strong'
      }`}
    >
      <span
        className={`inline-block h-[15px] w-[15px] rounded-full bg-ink shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[19px]' : 'translate-x-0.5'
        }`}
        aria-hidden="true"
      />
    </button>
  )
}

/** Row layout for a settings entry: copy on the left, control on the right. */
export function SettingRow({ title, description, children, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-6 py-3.5 ${className}`}>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink">{title}</p>
        {description ? (
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {children ? <div className="shrink-0 pt-0.5">{children}</div> : null}
    </div>
  )
}

export default Switch
