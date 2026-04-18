import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { moderationApi } from '@/api/moderation'
import { usersApi } from '@/api/users'
import { SearchAutocompleteInput, type SearchSuggestionItem } from '@/components/staff/SearchAutocompleteInput'
import { StaffSectionHeader } from '@/components/staff/StaffSectionHeader'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import type { User } from '@/types/user'
import { formatDateTime } from '@/utils/formatDate'
import { getErrorMessage } from '@/utils/http'

function statusLabel(status: string, reviewedById?: number, currentUserId?: number) {
  if (status === 'active') return 'Активен'
  if (status === 'pending' && !reviewedById) return 'Новый'
  if (status === 'pending' && reviewedById === currentUserId) return 'В работе'
  if (status === 'pending') return 'Принято'
  return 'Блок'
}

function statusClass(status: string, reviewedById?: number, currentUserId?: number) {
  if (status === 'active') return 'bg-green-50 text-green-700 border-green-100'
  if (status === 'pending' && !reviewedById) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  if (status === 'pending' && reviewedById === currentUserId) return 'bg-blue-50 text-blue-700 border-blue-200'
  if (status === 'pending') return 'bg-slate-100 text-slate-500 border-slate-200'
  return 'bg-red-50 text-red-700 border-red-100'
}

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const { pushToast } = useToast()
  const [items, setItems] = useState<User[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [educationLevels, setEducationLevels] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [educationLevel, setEducationLevel] = useState('')
  const [course, setCourse] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SearchSuggestionItem[]>([])

  const filters = useMemo(
    () => ({
      page,
      query: query || undefined,
      role: role || undefined,
      status: status || undefined,
      education_level: educationLevel || undefined,
      course: course || undefined,
      sort_by: sortBy,
    }),
    [course, educationLevel, page, query, role, sortBy, status],
  )

  const loadUsers = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data } = await usersApi.list(filters)
      setItems(data.users)
      setRoles(data.roles)
      setStatuses(data.statuses)
      setEducationLevels(data.education_levels)
      setTotalPages(data.total_pages)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Не удалось загрузить список пользователей.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [filters])

  useEffect(() => {
    setPage(1)
  }, [query, role, status, educationLevel, course, sortBy])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSuggestions([])
      return
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const { data } = await usersApi.search(trimmed)
        setSuggestions(data)
      } catch {
        setSuggestions([])
      }
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [query])

  const resetFilters = () => {
    setQuery('')
    setRole('')
    setStatus('')
    setEducationLevel('')
    setCourse('')
    setSortBy('newest')
    setSuggestions([])
    setPage(1)
  }

  const handleTake = async (targetUser: User) => {
    try {
      await moderationApi.takeUser(targetUser.id)
      pushToast({ title: 'Пользователь взят в работу', tone: 'success' })
      await loadUsers()
    } catch (takeError) {
      setError(getErrorMessage(takeError, 'Не удалось взять пользователя в работу.'))
    }
  }

  const handleDelete = async (targetUser: User) => {
    if (!window.confirm(`Удалить пользователя ${targetUser.first_name} ${targetUser.last_name}?`)) {
      return
    }

    try {
      await usersApi.delete(targetUser.id)
      pushToast({ title: 'Пользователь удалён', tone: 'success' })
      await loadUsers()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Не удалось удалить пользователя.'))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <StaffSectionHeader
        kind="users"
        currentView="all"
        title="Все пользователи"
        description="Полный список аккаунтов с единым поиском и административными фильтрами."
      />

      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-surface p-4 sm:p-5">
        <form onSubmit={(event) => event.preventDefault()} className="flex flex-wrap items-end gap-3">
          <SearchAutocompleteInput
            label="Поиск"
            value={query}
            placeholder="Имя, email или телефон..."
            suggestions={suggestions}
            onChange={setQuery}
            onSelectSuggestion={(item) => {
              setQuery(item.value || item.text)
              setSuggestions([])
            }}
            className="min-w-[240px] flex-1"
          />

          <div className="w-full sm:w-[150px]">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Сортировка
            </label>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-600 focus:bg-surface"
            >
              <option value="newest">Новые</option>
              <option value="oldest">Старые</option>
              <option value="name_asc">По алфавиту</option>
              <option value="name_desc">Я-А</option>
            </select>
          </div>

          <div className="w-[calc(50%-0.375rem)] sm:w-[140px]">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Роль</label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-600 focus:bg-surface"
            >
              <option value="">Все роли</option>
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="w-[calc(50%-0.375rem)] sm:w-[150px]">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Обучение
            </label>
            <select
              value={educationLevel}
              onChange={(event) => setEducationLevel(event.target.value)}
              className="h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-600 focus:bg-surface"
            >
              <option value="">Все</option>
              {educationLevels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="w-[calc(33%-0.5rem)] sm:w-[96px]">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Курс</label>
            <select
              value={course}
              onChange={(event) => setCourse(event.target.value)}
              className="h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-600 focus:bg-surface"
            >
              <option value="">Все</option>
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <option key={item} value={String(item)}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="w-[calc(33%-0.5rem)] sm:w-[140px]">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Статус
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-600 focus:bg-surface"
            >
              <option value="">Все</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item === 'active' ? 'Активен' : item === 'pending' ? 'Ожидает' : item === 'rejected' ? 'Блок' : item}
                </option>
              ))}
            </select>
          </div>

          <div className="flex w-[calc(33%-0.5rem)] gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => void loadUsers()}
              className="flex-1 rounded-lg bg-indigo-600 px-4 text-xs font-medium text-white transition-colors hover:bg-indigo-700 sm:flex-none h-[38px]"
            >
              Обновить
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[38px] rounded-lg border border-slate-200 px-4 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Сбросить
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
        {isLoading ? (
          <div className="py-16">
            <LoadingSpinner />
          </div>
        ) : items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-bold">#</th>
                  <th className="px-5 py-3 font-bold">Пользователь</th>
                  <th className="px-5 py-3 font-bold">Поток</th>
                  <th className="px-5 py-3 font-bold">Статус</th>
                  <th className="px-5 py-3 font-bold">Модератор</th>
                  <th className="px-5 py-3 font-bold">Создано</th>
                  <th className="px-5 py-3 text-right font-bold">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3 text-xs text-slate-400">{item.id}</td>
                    <td className="px-5 py-3">
                      <Link
                        to={`/users/${item.id}`}
                        className="block font-medium text-slate-800 transition-colors hover:text-indigo-600"
                      >
                        {item.first_name} {item.last_name}
                      </Link>
                      <div className="text-[10px] text-slate-400">{item.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      {item.education_level ? (
                        <>
                          <span className="block text-xs text-slate-700">{item.education_level}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {item.course ? `${item.course} курс` : '—'}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="mb-1 inline-flex rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {item.role}
                      </span>
                      <br />
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass(item.status, item.reviewed_by_id, currentUser?.id)}`}
                      >
                        {statusLabel(item.status, item.reviewed_by_id, currentUser?.id)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {item.status === 'pending' && item.reviewed_by_id ? (
                        item.reviewed_by_id === currentUser?.id ? (
                          <div className="font-medium text-slate-700">Вы</div>
                        ) : (
                          <span className="text-slate-400">Другой модератор</span>
                        )
                      ) : item.status === 'pending' ? (
                        <span className="text-slate-400">Свободно</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(item.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.status === 'pending' && !item.reviewed_by_id ? (
                          <button
                            type="button"
                            onClick={() => void handleTake(item)}
                            className="text-xs font-bold text-indigo-600 hover:underline"
                          >
                            Взять
                          </button>
                        ) : null}
                        {item.status === 'pending' && item.reviewed_by_id === currentUser?.id ? (
                          <Link to="/my-work?tab=users" className="text-xs font-bold text-indigo-600 hover:underline">
                            Моя работа
                          </Link>
                        ) : null}
                        <Link
                          to={`/users/${item.id}`}
                          className="text-xs font-medium text-slate-500 transition-colors hover:text-indigo-600"
                        >
                          Профиль
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          className="cursor-pointer text-xs font-medium text-slate-400 transition-colors hover:text-red-600"
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-sm text-slate-500">Пользователи по текущим фильтрам не найдены.</p>
          </div>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
