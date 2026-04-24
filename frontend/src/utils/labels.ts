const DASH = '\u2014'

const ROLE_LABELS: Record<string, string> = {
  GUEST: '\u0413\u043e\u0441\u0442\u044c',
  STUDENT: '\u0421\u0442\u0443\u0434\u0435\u043d\u0442',
  MODERATOR: '\u041c\u043e\u0434\u0435\u0440\u0430\u0442\u043e\u0440',
  SUPER_ADMIN: '\u0410\u0434\u043c\u0438\u043d',
}

const USER_STATUS_LABELS: Record<string, string> = {
  active: '\u0410\u043a\u0442\u0438\u0432\u0435\u043d',
  pending: '\u041e\u0436\u0438\u0434\u0430\u0435\u0442',
  rejected: '\u041e\u0442\u043a\u043b\u043e\u043d\u0451\u043d',
  deleted: '\u0423\u0434\u0430\u043b\u0451\u043d',
}

const ACHIEVEMENT_STATUS_LABELS: Record<string, string> = {
  approved: '\u041e\u0434\u043e\u0431\u0440\u0435\u043d\u043e',
  pending: '\u041d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0435',
  rejected: '\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e',
  revision: '\u041d\u0430 \u0434\u043e\u0440\u0430\u0431\u043e\u0442\u043a\u0435',
  archived: '\u0410\u0440\u0445\u0438\u0432',
}

export function roleLabel(role?: string | null): string {
  if (!role) return DASH
  return ROLE_LABELS[role] ?? role
}

export function userStatusLabel(status?: string | null): string {
  if (!status) return DASH
  return USER_STATUS_LABELS[status] ?? status
}

export function achievementStatusLabel(status?: string | null): string {
  if (!status) return DASH
  return ACHIEVEMENT_STATUS_LABELS[status] ?? status
}

export const COURSES_BY_EDUCATION_LEVEL: Record<string, number[]> = {
  '\u0421\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0442\u0435\u0442': [1, 2],
}

export const GROUPS_BY_EDUCATION_AND_COURSE: Record<string, Record<number, string[]>> = {
  '\u0421\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0442\u0435\u0442': {
    1: ['\u0421-101', '\u0421-102'],
    2: ['\u0421-201', '\u0421-202'],
  },
}

export function coursesForEducationLevel(level?: string | null): number[] {
  if (!level) return []
  return COURSES_BY_EDUCATION_LEVEL[level] ?? []
}

export function groupsForEducationLevel(level?: string | null, course?: number | string | null): string[] {
  if (!level) return []
  const byCourse = GROUPS_BY_EDUCATION_AND_COURSE[level] ?? {}
  if (course) return byCourse[Number(course)] ?? []
  return Object.values(byCourse).flat()
}
