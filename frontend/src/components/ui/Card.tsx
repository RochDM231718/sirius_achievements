import { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg' | 'none'
  as?: 'div' | 'section' | 'article'
}

const PAD: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-7',
}

export function Card({ padding = 'md', as: Tag = 'div', className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={`rounded-2xl border border-border bg-surface shadow-[var(--color-shadow)] ${PAD[padding]} ${className ?? ''}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  )
}

interface CardSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export function CardHeader({ title, description, action, className, ...rest }: CardSectionProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className ?? ''}`.trim()} {...rest}>
      <div className="flex flex-col gap-1">
        {title ? <h3 className="text-lg font-semibold text-text">{title}</h3> : null}
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
