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
    summary ?? (pageSize
      ? `\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u0430 ${currentPage} \u0438\u0437 ${totalPages} \u00b7 \u041f\u043e ${pageSize} \u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0443.`
      : `\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u0430 ${currentPage} \u0438\u0437 ${totalPages}.`)

  return (
    <div className={cn('pagination-footer', className)}>
      <p className="pagination-summary">{summaryText}</p>
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  )
}
