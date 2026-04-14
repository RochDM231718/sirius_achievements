interface StatCardProps {
  eyebrow: string
  value: string | number
  detail?: string
  accent?: boolean
}

export function StatCard({ eyebrow, value, detail, accent = false }: StatCardProps) {
  return (
    <article className={`card stat-card ${accent ? 'stat-card--accent' : ''}`}>
      <div className="stat-card__top">
        <span className="stat-card__dot" aria-hidden="true" />
        <div className="card__eyebrow">{eyebrow}</div>
      </div>
      <div className="card__value">{value}</div>
      {detail ? <div className="card__text">{detail}</div> : null}
    </article>
  )
}
