import { HTMLAttributes } from 'react'

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-text-soft',
  accent: 'bg-accent-soft text-accent-strong',
  success: 'bg-[var(--color-success-soft)] text-[var(--color-success-text)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger-text)]',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]',
  info: 'bg-[var(--color-info-soft)] text-[var(--color-info-text)]',
}

export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[tone]} ${className ?? ''}`.trim()}
      {...rest}
    >
      {children}
    </span>
  )
}
