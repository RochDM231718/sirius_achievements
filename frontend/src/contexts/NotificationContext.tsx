import { createContext, useEffect, useState, type ReactNode } from 'react'
import { notificationsApi } from '@/api/notifications'
import { Notification } from '@/types/notification'
import { STORAGE_KEYS } from '@/utils/constants'
import { useAuth } from '@/hooks/useAuth'

interface NotificationContextValue {
  unreadCount: number
  notifications: Notification[]
  refreshNotifications: () => Promise<void>
  markAllRead: () => Promise<void>
}

export const NotificationContext = createContext<NotificationContextValue | null>(null)

function localizeNotificationText(value: string) {
  if (value === 'Application status updated') {
    return 'Статус документа обновлён'
  }
  if (value === 'Support ticket taken') {
    return 'Обращение взято в работу'
  }
  if (value === 'New support reply') {
    return 'Новый ответ поддержки'
  }
  if (value === 'Support ticket closed') {
    return 'Обращение закрыто'
  }
  if (value === 'Support ticket reopened') {
    return 'Обращение открыто повторно'
  }

  const rejectedMatch = value.match(/^Document '(.+)' was rejected\. Reason: (.*)$/)
  if (rejectedMatch) {
    return `Документ «${rejectedMatch[1]}» отклонён. Причина: ${rejectedMatch[2] || '—'}`
  }

  const approvedMatch = value.match(/^Document '(.+)' was approved\.$/)
  if (approvedMatch) {
    return `Документ «${approvedMatch[1]}» одобрен.`
  }

  const statusMatch = value.match(/^Status for '(.+)' was updated\.$/)
  if (statusMatch) {
    return `Статус документа «${statusMatch[1]}» обновлён.`
  }

  const supportTakenMatch = value.match(/^Moderator started working on ticket "(.+)"\.$/)
  if (supportTakenMatch) {
    return `Модератор начал работу с обращением «${supportTakenMatch[1]}».`
  }

  const supportReplyMatch = value.match(/^Moderator replied in ticket "(.+)"\.$/)
  if (supportReplyMatch) {
    return `Модератор ответил в обращении «${supportReplyMatch[1]}».`
  }

  const supportClosedMatch = value.match(/^Moderator closed ticket "(.+)"\.$/)
  if (supportClosedMatch) {
    return `Модератор закрыл обращение «${supportClosedMatch[1]}».`
  }

  const supportReopenedMatch = value.match(/^Moderator reopened ticket "(.+)"\.$/)
  if (supportReopenedMatch) {
    return `Модератор снова открыл обращение «${supportReopenedMatch[1]}».`
  }

  return value
}

function localizeNotification(notification: Notification): Notification {
  return {
    ...notification,
    title: localizeNotificationText(notification.title),
    message: localizeNotificationText(notification.message),
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])

  const refreshNotifications = async () => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      setNotifications([])
      return
    }

    const { data } = await notificationsApi.unreadCount()
    setUnreadCount(data.count)
    setNotifications(data.notifications.map(localizeNotification))
  }

  const markAllRead = async () => {
    await notificationsApi.markRead()
    await refreshNotifications()
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      setNotifications([])
      return
    }

    void refreshNotifications()

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
    const socket = token
      ? new WebSocket(`${protocol}://${window.location.host}/ws/notifications`, token)
      : new WebSocket(`${protocol}://${window.location.host}/ws/notifications`)
    socket.onmessage = () => {
      void refreshNotifications()
    }
    socket.onerror = () => {
      socket.close()
    }

    return () => {
      socket.close()
    }
  }, [isAuthenticated])

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        notifications,
        refreshNotifications,
        markAllRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
