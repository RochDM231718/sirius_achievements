export interface PaginationWindow {
  visiblePages: number[]
  showFirstPage: boolean
  showLastPage: boolean
  showLeftEllipsis: boolean
  showRightEllipsis: boolean
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(Math.trunc(page), 1), Math.max(totalPages, 1))
}

export function getTotalPages(totalItems: number, pageSize: number) {
  if (pageSize <= 0) return 1
  return Math.max(1, Math.ceil(totalItems / pageSize))
}

export function paginateItems<T>(items: T[], currentPage: number, pageSize: number) {
  if (pageSize <= 0) return items

  const totalPages = getTotalPages(items.length, pageSize)
  const safeCurrentPage = clampPage(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize

  return items.slice(startIndex, startIndex + pageSize)
}

export function getPaginationWindow(currentPage: number, totalPages: number, windowSize = 5): PaginationWindow {
  const safeTotalPages = Math.max(totalPages, 1)
  const normalizedWindowSize = windowSize > 2
    ? (windowSize % 2 === 0 ? windowSize - 1 : windowSize)
    : 3
  const safeCurrentPage = clampPage(currentPage, safeTotalPages)
  const halfWindow = Math.floor(normalizedWindowSize / 2)

  let startPage = Math.max(1, safeCurrentPage - halfWindow)
  let endPage = Math.min(safeTotalPages, startPage + normalizedWindowSize - 1)

  startPage = Math.max(1, endPage - normalizedWindowSize + 1)

  const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index)

  return {
    visiblePages,
    showFirstPage: startPage > 1,
    showLastPage: endPage < safeTotalPages,
    showLeftEllipsis: startPage > 2,
    showRightEllipsis: endPage < safeTotalPages - 1,
  }
}
