import { ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  fullWidth?: boolean
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-strong focus-visible:outline-accent disabled:opacity-50',
  secondary:
    'bg-surface border border-border text-text hover:bg-surface-muted focus-visible:outline-accent disabled:opacity-50',
  ghost:
    'bg-transparent text-text-soft hover:bg-surface-muted focus-visible:outline-accent disabled:opacity-50',
  danger:
    'bg-[var(--color-danger-text)] text-white hover:opacity-90 focus-visible:outline-[var(--color-danger-text)] disabled:opacity-50',
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-5 text-base rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, disabled, className, children, ...rest },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed'
  const width = fullWidth ? 'w-full' : ''
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${width} ${className ?? ''}`.trim()}
      {...rest}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  )
})
