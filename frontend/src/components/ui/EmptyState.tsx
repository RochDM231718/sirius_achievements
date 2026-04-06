interface EmptyStateProps {
  title: string
  description: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h3 className="card__title">{title}</h3>
      <p className="page__description">{description}</p>
    </div>
  )
}
