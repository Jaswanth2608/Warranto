const VARIANTS = {
  primary:
    'bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:bg-brand-700 border border-transparent',
  secondary:
    'bg-surface-2 text-ink border border-line hover:bg-line/80 active:bg-line',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-surface-2 hover:text-ink',
  subtle:
    'bg-brand-500/12 text-brand-400 border border-brand-500/25 hover:bg-brand-500/20',
  danger:
    'bg-danger-600 text-white shadow-sm hover:bg-danger-500 border border-danger-500/40',
  link: 'bg-transparent text-brand-400 border border-transparent hover:text-brand-300 underline-offset-4 hover:underline px-0',
}

const SIZES = {
  sm: 'h-7 px-2.5 text-[12.5px] gap-1.5',
  md: 'h-9 px-3.5 text-[13.5px] gap-1.5',
  lg: 'h-10 px-4.5 text-[14.5px] gap-2',
  icon: 'h-8 w-8 p-0',
}

/** Shared class builder so <Link>s and <button>s look identical. */
export function buttonClasses({ variant = 'primary', size = 'md', className = '' } = {}) {
  return [
    'inline-flex items-center justify-center rounded-[7px] font-medium tracking-tight',
    'transition-colors duration-150 select-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}) {
  const isSolid = variant === 'primary' || variant === 'danger'

  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className={isSolid ? 'spinner' : 'spinner spinner-brand'} aria-hidden="true" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 13 : size === 'lg' ? 16 : 15} aria-hidden="true" />
      ) : null}
      {children}
      {IconRight && !loading ? (
        <IconRight size={size === 'sm' ? 13 : 15} aria-hidden="true" />
      ) : null}
    </button>
  )
}

export default Button
