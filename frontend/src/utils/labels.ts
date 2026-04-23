export function roleLabel(role?: string | null): string {
  switch (role) {
    case 'GUEST':
      return 'Гость'
    case 'STUDENT':
      return 'Студент'
    case 'MODERATOR':
      return 'Модератор'
    case 'SUPER_ADMIN':
      return 'Админ'
    default:
      return role || '—'
  }
}

export function userStatusLabel(status?: string | null): string {
  switch (status) {
    case 'active':
      return 'Активен'
    case 'pending':
      return 'Ожидает'
    case 'rejected':
      return 'Отклонён'
    case 'deleted':
      return 'Удалён'
    default:
      return status || '—'
  }
}

export function achievementStatusLabel(status?: string | null): string {
  switch (status) {
    case 'approved':
      return 'Одобрено'
    case 'pending':
      return 'На проверке'
    case 'rejected':
      return 'Отклонено'
    case 'revision':
      return 'На доработке'
    case 'archived':
      return 'Архив'
    default:
      return status || '—'
  }
}

export const COURSES_BY_EDUCATION_LEVEL: Record<string, number[]> = {
  Колледж: [1, 2, 3, 4],
  Бакалавриат: [1, 2, 3, 4],
  Специалитет: [1, 2, 3, 4, 5, 6],
  Магистратура: [1, 2],
  Аспирантура: [1, 2, 3, 4],
}

export function coursesForEducationLevel(level?: string | null): number[] {
  if (!level) return []
  return COURSES_BY_EDUCATION_LEVEL[level] ?? [1, 2, 3, 4, 5, 6]
}
