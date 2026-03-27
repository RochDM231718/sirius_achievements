export enum UserRole {
  GUEST = 'GUEST',
  STUDENT = 'STUDENT',
  MODERATOR = 'MODERATOR',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum UserStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  DELETED = 'deleted',
}

export enum AchievementStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REVISION = 'revision',
  ARCHIVED = 'archived',
}

export enum AchievementCategory {
  SPORT = 'Спорт',
  SCIENCE = 'Наука',
  ART = 'Искусство',
  VOLUNTEERING = 'Волонтёрство',
  HACKATHON = 'Хакатон',
  PATRIOTISM = 'Патриотизм',
  PROJECTS = 'Проекты',
  OTHER = 'Другое',
}

export enum AchievementLevel {
  SCHOOL = 'Школьный',
  MUNICIPAL = 'Муниципальный',
  REGIONAL = 'Региональный',
  FEDERAL = 'Федеральный',
  INTERNATIONAL = 'Международный',
}

export enum AchievementResult {
  PARTICIPANT = 'Участник',
  PRIZEWINNER = 'Призёр',
  WINNER = 'Победитель',
}

export enum EducationLevel {
  COLLEGE = 'Колледж',
  BACHELOR = 'Бакалавриат',
  SPECIALIST = 'Специалитет',
  MASTER = 'Магистратура',
  POSTGRADUATE = 'Аспирантура',
}

export enum SupportTicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export const STAFF_ROLES = [UserRole.MODERATOR, UserRole.SUPER_ADMIN]

export function isStaff(role?: UserRole): boolean {
  return role ? STAFF_ROLES.includes(role) : false
}
