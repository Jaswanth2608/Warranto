import { ChevronDown } from 'lucide-react'

const CONTROL =
  'w-full rounded-[8px] border bg-surface-2 px-3 text-[14px] text-ink transition placeholder:text-muted/70 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted'

const NORMAL = 'border-line focus:border-brand-500/70 focus:ring-brand-500/25'
const ERROR = 'border-danger-500/70 focus:border-danger-500 focus:ring-danger-500/25'

function controlClass(error, className) {
  return `${CONTROL} ${error ? ERROR : NORMAL} ${className}`
}

/** Label + control + hint/error wrapper used by every form in the app. */
export function Field({ label, htmlFor, hint, error, required = false, children, className = '' }) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-soft">
          {label}
          {required ? (
            <span className="ml-0.5 text-danger-500" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-[12.5px] font-medium text-danger-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className = '', error = false, ...props }) {
  return <input className={controlClass(error, `h-9 ${className}`)} {...props} />
}

export function Textarea({ className = '', error = false, rows = 4, ...props }) {
  return (
    <textarea
      rows={rows}
      className={controlClass(error, `py-2.5 leading-relaxed resize-y ${className}`)}
      {...props}
    />
  )
}

export function Select({ className = '', error = false, children, ...props }) {
  return (
    <div className="relative">
      <select className={controlClass(error, `h-9 appearance-none pr-9 ${className}`)} {...props}>
        {children}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  )
}

export default Input
