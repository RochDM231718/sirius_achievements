import type { ReactNode } from 'react'

import { isStaff } from '@/types/enums'
import type { User } from '@/types/user'

export type NavIcon =
  | 'dashboard'
  | 'achievements'
  | 'leaderboard'
  | 'support'
  | 'users'
  | 'documents'
  | 'moderation'
  | 'my_work'
  | 'profile'

export interface NavItem {
  to: string
  label: string
  mobileLabel?: string
  icon: NavIcon
}

export interface NavSection {
  label?: string
  items: NavItem[]
}

const studentSections: NavSection[] = [
  {
    items: [
      { to: '/dashboard', label: 'Дашборд', mobileLabel: 'Главная', icon: 'dashboard' },
      { to: '/achievements', label: 'Мои достижения', mobileLabel: 'Документы', icon: 'achievements' },
      { to: '/leaderboard', label: 'Рейтинг', mobileLabel: 'Рейтинг', icon: 'leaderboard' },
      { to: '/support', label: 'Поддержка', mobileLabel: 'Поддержка', icon: 'support' },
    ],
  },
]

const staffSections: NavSection[] = [
  {
    items: [
      { to: '/dashboard', label: 'Дашборд', mobileLabel: 'Главная', icon: 'dashboard' },
      { to: '/leaderboard', label: 'Рейтинг', mobileLabel: 'Рейтинг', icon: 'leaderboard' },
    ],
  },
  {
    label: 'Все записи',
    items: [
      { to: '/users', label: 'Все пользователи', icon: 'users' },
      { to: '/documents', label: 'Все документы', icon: 'documents' },
    ],
  },
  {
    label: 'Моя работа',
    items: [
      { to: '/my-work', label: 'Мои задачи', mobileLabel: 'Моя работа', icon: 'my_work' },
    ],
  },
  {
    label: 'Входящие',
    items: [
      { to: '/moderation/users', label: 'Новые пользователи', icon: 'moderation' },
      { to: '/moderation/achievements', label: 'Новые документы', icon: 'achievements' },
      { to: '/moderation/support', label: 'Поддержка', mobileLabel: 'Модерация', icon: 'support' },
    ],
  },
]

const pageTitles: Array<[string, string]> = [
  ['/moderation/support/', 'Чат поддержки'],
  ['/moderation/support', 'Модерация поддержки'],
  ['/moderation/achievements', 'Модерация документов'],
  ['/moderation/users', 'Модерация пользователей'],
  ['/my-work', 'Моя работа'],
  ['/documents', 'Все документы'],
  ['/users/', 'Карточка пользователя'],
  ['/users', 'Все пользователи'],
  ['/support/', 'Чат поддержки'],
  ['/support', 'Поддержка'],
  ['/leaderboard', 'Рейтинг студентов'],
  ['/achievements', 'Мои достижения'],
  ['/profile', 'Настройки профиля'],
  ['/dashboard', 'Дашборд'],
  ['/students/', 'Публичный профиль'],
  ['/register', 'Регистрация'],
  ['/forgot-password', 'Восстановление пароля'],
  ['/verify-email', 'Подтверждение email'],
  ['/verify-code', 'Проверка кода'],
  ['/reset-password', 'Новый пароль'],
  ['/privacy', 'Политика конфиденциальности'],
  ['/login', 'Вход'],
]

export function getSidebarSections(user: User | null): NavSection[] {
  return isStaff(user?.role) ? staffSections : studentSections
}

export function getMobilePrimaryItems(user: User | null): NavItem[] {
  if (isStaff(user?.role)) {
    return [
      { to: '/dashboard', label: 'Дашборд', mobileLabel: 'Главная', icon: 'dashboard' },
      { to: '/my-work', label: 'Моя работа', mobileLabel: 'Работа', icon: 'my_work' },
      { to: '/moderation/support', label: 'Поддержка', mobileLabel: 'Входящие', icon: 'support' },
    ]
  }

  return [
    { to: '/dashboard', label: 'Дашборд', mobileLabel: 'Главная', icon: 'dashboard' },
    { to: '/achievements', label: 'Мои достижения', mobileLabel: 'Документы', icon: 'achievements' },
    { to: '/support', label: 'Поддержка', mobileLabel: 'Поддержка', icon: 'support' },
  ]
}

export function getPageTitle(pathname: string): string {
  const matched = pageTitles.find(([prefix]) => pathname.startsWith(prefix))
  return matched?.[1] ?? 'Sirius.Achievements'
}

export function renderNavIcon(icon: NavIcon, className = ''): ReactNode {
  switch (icon) {
    case 'dashboard':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      )
    case 'achievements':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    case 'leaderboard':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      )
    case 'support':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      )
    case 'users':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5V4H2v16h5m10 0v-2a4 4 0 00-8 0v2m8 0H7m10-10a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    case 'documents':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h10M7 12h10M7 17h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
        </svg>
      )
    case 'moderation':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      )
    case 'my_work':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c1.657 0 3-1.343 3-3S13.657 2 12 2 9 3.343 9 5s1.343 3 3 3zm0 2c-2.761 0-5 2.239-5 5v5h10v-5c0-2.761-2.239-5-5-5z" />
        </svg>
      )
    case 'profile':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A9 9 0 1118.88 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    default:
      return null
  }
}
