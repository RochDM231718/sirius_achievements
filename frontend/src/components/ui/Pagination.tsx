import { useMemo } from 'react'

import { cn } from '@/utils/cn'
import { getPaginationWindow } from '@/utils/pagination'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  windowSize?: number
  className?: string
}

function buttonClass(isActive: boolean, isDisabled = false) {
  return cn(
    'pagination-button',
    isActive && 'pagination-button--active',
    isDisabled && 'pagination-button--disabled'
  )
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  windowSize = 5,
  className,
}: PaginationProps) {
  const paginationWindow = useMemo(
    () => getPaginationWindow(currentPage, totalPages, windowSize),
    [currentPage, totalPages, windowSize]
  )

  if (totalPages <= 1) return null

  const changePage = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return
    onPageChange(page)
  }

  const renderPageButton = (page: number) => (
    <button
      key={page}
      type="button"
      onClick={() => changePage(page)}
      className={buttonClass(page === currentPage)}
      aria-current={page === currentPage ? 'page' : undefined}
    >
      {page}
    </button>
  )

  return (
    <nav aria-label="Пагинация" className={cn('pagination-nav', className)}>
      <button
        type="button"
        onClick={() => changePage(currentPage - 1)}
        disabled={currentPage <= 1}
        className={buttonClass(false, currentPage <= 1)}
      >
        Назад
      </button>

      {paginationWindow.showFirstPage ? renderPageButton(1) : null}
      {paginationWindow.showLeftEllipsis ? <span className="pagination-ellipsis">...</span> : null}
      {paginationWindow.visiblePages.map(renderPageButton)}
      {paginationWindow.showRightEllipsis ? <span className="pagination-ellipsis">...</span> : null}
      {paginationWindow.showLastPage ? renderPageButton(totalPages) : null}

      <button
        type="button"
        onClick={() => changePage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className={buttonClass(false, currentPage >= totalPages)}
      >
        Вперед
      </button>
    </nav>
  )
}
