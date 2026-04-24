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
  SPORT = '\u0421\u043f\u043e\u0440\u0442',
  SCIENCE = '\u041d\u0430\u0443\u043a\u0430',
  ART = '\u0418\u0441\u043a\u0443\u0441\u0441\u0442\u0432\u043e',
  VOLUNTEERING = '\u0412\u043e\u043b\u043e\u043d\u0442\u0451\u0440\u0441\u0442\u0432\u043e',
  HACKATHON = '\u0425\u0430\u043a\u0430\u0442\u043e\u043d',
  PATRIOTISM = '\u041f\u0430\u0442\u0440\u0438\u043e\u0442\u0438\u0437\u043c',
  PROJECTS = '\u041f\u0440\u043e\u0435\u043a\u0442\u044b',
  OTHER = '\u0414\u0440\u0443\u0433\u043e\u0435',
}

export enum AchievementLevel {
  SCHOOL = '\u0428\u043a\u043e\u043b\u044c\u043d\u044b\u0439',
  MUNICIPAL = '\u041c\u0443\u043d\u0438\u0446\u0438\u043f\u0430\u043b\u044c\u043d\u044b\u0439',
  REGIONAL = '\u0420\u0435\u0433\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0439',
  FEDERAL = '\u0424\u0435\u0434\u0435\u0440\u0430\u043b\u044c\u043d\u044b\u0439',
  INTERNATIONAL = '\u041c\u0435\u0436\u0434\u0443\u043d\u0430\u0440\u043e\u0434\u043d\u044b\u0439',
}

export enum AchievementResult {
  PARTICIPANT = '\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a',
  PRIZEWINNER = '\u041f\u0440\u0438\u0437\u0451\u0440',
  WINNER = '\u041f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044c',
}

export enum EducationLevel {
  SPECIALIST = '\u0421\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0442\u0435\u0442',
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
