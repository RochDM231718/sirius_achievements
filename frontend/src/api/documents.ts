import client from './client'
import { Achievement } from '@/types/achievement'

export interface DocumentsParams {
  query?: string
  status?: string
  category?: string
  level?: string
  sort_by?: string
}

export interface DocumentsResponse {
  achievements: Achievement[]
  total: number
  statuses: string[]
  categories: string[]
  levels: string[]
}

export const documentsApi = {
  list(params: DocumentsParams) {
    return client.get<DocumentsResponse>('/documents', { params })
  },

  preview(id: number) {
    return client.get(`/documents/${id}/preview`, { responseType: 'blob' })
  },

  download(id: number) {
    return client.get(`/documents/${id}/download`, { responseType: 'blob' })
  },

  delete(id: number) {
    return client.delete<{ success: boolean }>(`/documents/${id}`)
  },
}
