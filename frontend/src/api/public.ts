import client from './client'
import { Achievement } from '@/types/achievement'
import { User } from '@/types/user'

export interface PublicStudentAchievement extends Achievement {
  preview_url: string | null
}

export interface PublicStudentResponse {
  student: User
  achievements: PublicStudentAchievement[]
  total_points: number
  total_docs: number
  rank: number | null
  gpa_bonus: number
  chart_labels: string[]
  chart_points: number[]
  chart_uploads: number[]
  chart_cumulative: number[]
  has_chart_data: boolean
  category_breakdown: Array<{
    category: string
    count: number
  }>
  public_url: string
}

export const publicApi = {
  getStudent(studentId: number) {
    return client.get<PublicStudentResponse>(`/public/students/${studentId}`)
  },
}
