import client from './client'
import { User, UserListResponse, UserDetailResponse } from '@/types/user'

export interface UsersParams {
  page?: number
  query?: string
  role?: string
  status?: string
  education_level?: string
  course?: string
  sort_by?: string
}

export const usersApi = {
  list(params: UsersParams) {
    return client.get<UserListResponse>('/users', { params })
  },

  get(id: number) {
    return client.get<UserDetailResponse>(`/users/${id}`)
  },

  search(q: string) {
    return client.get<Array<{ value: string; text: string }>>('/users/search', { params: { q } })
  },

  updateRole(id: number, role: string, educationLevel?: string) {
    return client.post<{ success: boolean; user: User }>(`/users/${id}/role`, {
      role,
      education_level: educationLevel,
    })
  },

  delete(id: number) {
    return client.delete<{ success: boolean }>(`/users/${id}`)
  },

  generateResume(id: number) {
    return client.post<{ resume?: string; can_generate: boolean; reason?: string; user?: User }>(
      `/users/${id}/generate-resume`
    )
  },

  checkResume(id: number) {
    return client.get<{ resume?: string; can_generate: boolean; reason?: string }>(`/users/${id}/generate-resume`)
  },

  exportPdf(id: number) {
    return client.get(`/users/${id}/export-pdf`, { responseType: 'blob' })
  },

  setGpa(id: number, gpa: string) {
    return client.post<{ success: boolean; gpa: string; bonus: number; user: User }>(`/users/${id}/set-gpa`, { gpa })
  },
}
