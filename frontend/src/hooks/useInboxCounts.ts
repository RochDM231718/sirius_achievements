import { useEffect, useState } from 'react'

import { dashboardApi, type InboxCounts } from '@/api/dashboard'
import type { User } from '@/types/user'

export function useInboxCounts(user: User | null) {
  const [counts, setCounts] = useState<InboxCounts | null>(null)

  useEffect(() => {
    if (!user || user.status === 'deleted') {
      setCounts(null)
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const response = await dashboardApi.getInboxCounts()
        if (!cancelled) setCounts(response.data)
      } catch {
        if (!cancelled) setCounts(null)
      }
    }

    void load()
    const timerId = window.setInterval(load, 30000)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [user?.id, user?.role, user?.status])

  return counts
}
