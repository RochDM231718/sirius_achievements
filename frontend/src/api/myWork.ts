import client from './client'
import { Achievement } from '@/types/achievement'
import { User } from '@/types/user'

export interface MyWorkResponse {
  users: User[]
  achievements: Achievement[]
  total_users: number
  total_achievements: number
}

export const myWorkApi = {
  get() {
    return client.get<MyWorkResponse>('/my-work')
  },
}
