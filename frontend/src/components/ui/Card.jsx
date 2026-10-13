export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-[12px] border border-line bg-surface ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ title, description, action, className = '', id, uppercase = false }) {
  return (
    <div
      id={id}
      className={`flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5 ${className}`}
    >
      <div className="min-w-0">
        <h3
          className={`text-[13.5px] font-semibold text-ink ${
            uppercase ? 'uppercase tracking-[0.06em] text-muted' : ''
          }`}
        >
          {title}
        </h3>
        {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function CardBody({ className = '', children }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>
}

export function CardFooter({ className = '', children }) {
  return (
    <div className={`border-t border-line bg-surface-2/60 px-4 py-3 sm:px-5 ${className}`}>
      {children}
    </div>
  )
}

export default Card
