export interface Notification {
  id: number
  title: string
  message: string
  is_read: boolean
  link?: string
  created_at: string
}

export interface NotificationCountResponse {
  count: number
  notifications: Notification[]
}
