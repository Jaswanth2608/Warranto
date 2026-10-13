import { AlertCircle, RefreshCw } from 'lucide-react'
import Button from './Button'

/** Consistent empty state used when a list has no items. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[12px] border border-dashed border-line bg-surface px-6 text-center ${
        compact ? 'py-8' : 'py-12'
      } ${className}`}
    >
      {Icon ? (
        <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-[10px] bg-surface-2 text-muted ring-1 ring-line">
          <Icon size={19} aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/** Shown when loading fails; always offers a way to retry. */
export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this content. Please check your connection and try again.',
  onRetry,
  compact = false,
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[12px] border border-danger-500/25 bg-danger-500/6 px-6 text-center ${
        compact ? 'py-8' : 'py-12'
      }`}
      role="alert"
    >
      <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-[10px] bg-danger-500/12 text-danger-700 ring-1 ring-inset ring-danger-500/25">
        <AlertCircle size={18} aria-hidden="true" />
      </div>
      <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" icon={RefreshCw} className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export default EmptyState
