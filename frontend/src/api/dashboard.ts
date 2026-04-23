import client from './client'

export interface DashboardStats {
  pending_review?: boolean
  new_users_count?: number
  pending_achievements?: number
  approved_achievements?: number
  total_achievements?: number
  top_students?: Array<{
    id: number
    first_name: string
    last_name: string
    education_level?: string | null
    points: number
  }>
  recent_achievements?: Array<{
    id: number
    title: string
    status: string
    created_at: string
    category?: string
    user?: { first_name: string; last_name: string }
  }>
  chart_data?: { labels: string[]; counts: number[]; points?: number[] }
  cohorts?: Array<{
    education_level: string
    count: number
    total?: number
    pending?: number
    approved?: number
  }>
  my_points?: number
  gpa_bonus?: number
  my_docs?: number
  my_rank?: number
  my_recent_docs?: Array<{
    id: number
    title: string
    status: string
    created_at: string
    category?: string
    points?: number
  }>
  category_breakdown?: Array<{ category: string; points: number }>
  category_activity?: Array<{ category: string; count: number; points: number }>
  rejected_achievements?: number
}

export const dashboardApi = {
  getStats(period?: string) {
    return client.get<DashboardStats>('/dashboard', { params: { period } })
  },
}
