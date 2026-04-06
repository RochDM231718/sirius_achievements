import axios from 'axios'

function stringifyValidationDetail(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }

        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          const path = Array.isArray(record.loc) ? record.loc.slice(1).join('.') : ''
          const message = typeof record.msg === 'string' ? record.msg : ''
          return [path, message].filter(Boolean).join(': ')
        }

        return ''
      })
      .filter(Boolean)

    return messages.length ? messages.join('; ') : null
  }

  if (detail && typeof detail === 'object') {
    const record = detail as Record<string, unknown>
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message
    }
  }

  return null
}

export function getErrorMessage(error: unknown, fallback = 'Что-то пошло не так. Попробуйте ещё раз.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: unknown; message?: unknown } | undefined
    return stringifyValidationDetail(data?.detail) ?? stringifyValidationDetail(data?.message) ?? fallback
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
