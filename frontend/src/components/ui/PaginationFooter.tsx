import { cn } from '@/utils/cn'

import { Pagination } from './Pagination'

interface PaginationFooterProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize?: number
  summary?: string
  className?: string
}

export function PaginationFooter({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  summary,
  className,
}: PaginationFooterProps) {
  if (totalPages <= 1) return null

  const summaryText =
    summary ?? (pageSize ? `Страница ${currentPage} из ${totalPages}. По ${pageSize} на страницу.` : `Страница ${currentPage} из ${totalPages}.`)

  return (
    <div className={cn('pagination-footer', className)}>
      <p className="pagination-summary">{summaryText}</p>
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  )
}
