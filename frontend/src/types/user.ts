import { Achievement } from './achievement'
import { EducationLevel, UserRole, UserStatus } from './enums'

export interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  phone_number?: string
  avatar_path?: string
  role: UserRole
  status: UserStatus
  education_level?: EducationLevel
  course?: number
  study_group?: string
  session_gpa?: string
  reviewed_by_id?: number
  is_active: boolean
  created_at: string
  updated_at: string
  resume_text?: string
  resume_generated_at?: string
}

export interface UserListResponse {
  users: User[]
  page: number
  total_pages: number
  roles: string[]
  statuses: string[]
  education_levels: string[]
}

export interface UserDetailResponse {
  user: User
  achievements: Achievement[]
  season_history: SeasonResult[]
  total_docs: number
  rank: number | null
  total_points: number
  gpa_bonus: number
  chart_labels: string[]
  chart_counts: number[]
  chart_points: number[]
  roles: string[]
  education_levels: string[]
}

export interface SeasonResult {
  id: number
  season_name: string
  points: number
  rank: number
  created_at: string
}
