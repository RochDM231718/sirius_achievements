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
    setNotifications(data.notifications)
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
