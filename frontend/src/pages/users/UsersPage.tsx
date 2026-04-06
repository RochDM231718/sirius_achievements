import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { moderationApi } from '@/api/moderation'
import { usersApi } from '@/api/users'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { User } from '@/types/user'
import { formatDateTime } from '@/utils/formatDate'
import { getErrorMessage } from '@/utils/http'

interface SuggestionItem {
  value: string
  text: string
}

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
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])

  const filters = useMemo(
    () => ({
      page,
      query: query || undefined,
      role: role || undefined,
      status: status || undefined,
      education_level: educationLevel || undefined,
      course: course || undefined,
      sort_by: 'newest',
    }),
    [course, educationLevel, page, query, role, status]
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
  }, [query, role, status, educationLevel, course])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 1) {
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
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [query])

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
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Все пользователи</h2>
          <p className="text-sm text-slate-500">Управление аккаунтами платформы</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/moderation/users" className="text-sm text-slate-500 font-medium hover:text-indigo-600 transition-colors">
            Новые пользователи
          </Link>
          <Link to="/users" className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1">
            Все пользователи
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div> : null}

      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200">
        <form onSubmit={(event) => event.preventDefault()} className="flex flex-wrap gap-3 items-end">
          <div className="flex-grow min-w-[200px] relative">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Поиск</label>
            <div className="relative">
              <div className="absolute left-3 top-2.5 text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onBlur={() => window.setTimeout(() => setSuggestions([]), 150)}
                placeholder="Имя, Email..."
                autoComplete="off"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none text-sm h-[38px] transition-all"
              />
            </div>
            {suggestions.length ? (
              <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                {suggestions.map((item) => (
                  <li
                    key={`${item.value}-${item.text}`}
                    onMouseDown={() => {
                      setQuery(item.value || item.text)
                      setSuggestions([])
                    }}
                    className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm border-b border-slate-100 last:border-0 text-slate-700"
                  >
                    {item.text || item.value}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="w-[calc(50%-0.375rem)] sm:w-[120px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Роль</label>
            <select value={role} onChange={(event) => setRole(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none h-[38px]">
              <option value="">Все роли</option>
              {roles.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div className="w-[calc(50%-0.375rem)] sm:w-[120px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Обучение</label>
            <select value={educationLevel} onChange={(event) => setEducationLevel(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none h-[38px]">
              <option value="">Все</option>
              {educationLevels.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div className="w-[calc(33%-0.5rem)] sm:w-[80px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Курс</label>
            <select value={course} onChange={(event) => setCourse(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none h-[38px]">
              <option value="">Все</option>
              {[1, 2, 3, 4, 5, 6].map((item) => <option key={item} value={String(item)}>{item}</option>)}
            </select>
          </div>

          <div className="w-[calc(33%-0.5rem)] sm:w-[120px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Статус</label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:bg-white focus:border-indigo-600 outline-none h-[38px]">
              <option value="">Все</option>
              {statuses.map((item) => <option key={item} value={item}>{item === 'active' ? 'Активен' : item === 'pending' ? 'Ожидает' : item === 'rejected' ? 'Блок' : item}</option>)}
            </select>
          </div>

          <div className="flex gap-2 w-[calc(33%-0.5rem)] sm:w-auto mt-auto">
            <button type="button" onClick={() => setPage(1)} className="flex-1 px-4 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center h-[38px]">Найти</button>
            <button type="button" onClick={() => { setQuery(''); setRole(''); setStatus(''); setEducationLevel(''); setCourse(''); setPage(1); setSuggestions([]) }} className="w-[38px] flex-shrink-0 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center h-[38px]" title="Сбросить">✕</button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-16"><LoadingSpinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-bold">#</th>
                  <th className="px-5 py-3 font-bold">Пользователь</th>
                  <th className="px-5 py-3 font-bold">Поток</th>
                  <th className="px-5 py-3 font-bold">Статус</th>
                  <th className="px-5 py-3 font-bold">Модератор</th>
                  <th className="px-5 py-3 font-bold">Создано</th>
                  <th className="px-5 py-3 font-bold text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 text-xs text-slate-400">{item.id}</td>
                    <td className="px-5 py-3">
                      <Link to={`/users/${item.id}`} className="font-medium text-slate-800 hover:text-indigo-600 transition-colors block">{item.first_name} {item.last_name}</Link>
                      <div className="text-[10px] text-slate-400">{item.email}</div>
                    </td>
                    <td className="px-5 py-3">{item.education_level ? <><span className="block text-xs text-slate-700">{item.education_level}</span><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.course ? `${item.course} курс` : '—'}</span></> : <span className="text-xs text-slate-400">—</span>}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 mb-1">{item.role}</span>
                      <br />
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${statusClass(item.status, item.reviewed_by_id, currentUser?.id)}`}>{statusLabel(item.status, item.reviewed_by_id, currentUser?.id)}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{item.status === 'pending' && item.reviewed_by_id ? item.reviewed_by_id === currentUser?.id ? <div className="font-medium text-slate-700">Вы</div> : <span className="text-slate-400">Другой модератор</span> : item.status === 'pending' ? <span className="text-slate-400">Свободно</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(item.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end items-center gap-2">
                        {item.status === 'pending' && !item.reviewed_by_id ? <button type="button" onClick={() => void handleTake(item)} className="text-xs text-indigo-600 font-bold hover:underline">Взять</button> : null}
                        {item.status === 'pending' && item.reviewed_by_id === currentUser?.id ? <Link to="/my-work?tab=users" className="text-xs text-indigo-600 font-bold hover:underline">Моя работа</Link> : null}
                        <Link to={`/users/${item.id}`} className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors">Профиль</Link>
                        <button type="button" onClick={() => void handleDelete(item)} className="text-xs font-medium text-slate-400 hover:text-red-600 transition-colors cursor-pointer">Удалить</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
