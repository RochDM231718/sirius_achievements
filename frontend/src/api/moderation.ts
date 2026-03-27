import client from './client'
import { User } from '@/types/user'
import { Achievement, ModerationAchievementsResponse } from '@/types/achievement'

export const moderationApi = {
  getUsers() {
    return client.get<{ users: User[]; total_count: number }>('/moderation/users')
  },

  approveUser(id: number) {
    return client.post<{ success: boolean; user: User }>(`/moderation/users/${id}/approve`)
  },

  rejectUser(id: number) {
    return client.post<{ success: boolean; user: User }>(`/moderation/users/${id}/reject`)
  },

  getAchievements(page?: number) {
    return client.get<ModerationAchievementsResponse>('/moderation/achievements', { params: { page } })
  },

  updateAchievement(id: number, status: string, rejectionReason?: string) {
    return client.post<{ success: boolean; achievement: Achievement }>(`/moderation/achievements/${id}`, {
      status,
      rejection_reason: rejectionReason,
    })
  },

  batchUpdateAchievements(ids: number[], action: string) {
    return client.post<{ success: boolean; count: number }>('/moderation/achievements/batch', { ids, action })
  },

  takeUser(id: number) {
    return client.post<{ success: boolean; user: User }>(`/moderation/users/${id}/take`)
  },

  releaseUser(id: number) {
    return client.post<{ success: boolean; user: User }>(`/moderation/users/${id}/release`)
  },

  takeAchievement(id: number) {
    return client.post<{ success: boolean; achievement: Achievement }>(`/moderation/achievements/${id}/take`)
  },

  releaseAchievement(id: number) {
    return client.post<{ success: boolean; achievement: Achievement }>(`/moderation/achievements/${id}/release`)
  },
}
