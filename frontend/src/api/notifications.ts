import client from './client'
import { NotificationCountResponse } from '@/types/notification'

export const notificationsApi = {
  unreadCount() {
    return client.get<NotificationCountResponse>('/notifications/unread-count')
  },

  markRead() {
    return client.post('/notifications/mark-read')
  },
}
