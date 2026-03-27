import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { moderationApi } from '@/api/moderation'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { User } from '@/types/user'
import { getErrorMessage } from '@/utils/http'

export function ModerationUsersPage() {
  const { user: currentUser } = useAuth()
  const { pushToast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data } = await moderationApi.getUsers()
      setUsers(data.users)
      setTotalCount(data.total_count)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Не удалось загрузить очередь пользователей.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleTake = async (user: User) => {
    try {
      await moderationApi.takeUser(user.id)
      pushToast({ title: 'Пользователь взят в работу', tone: 'success' })
      await load()
    } catch (takeError) {
      setError(getErrorMessage(takeError, 'Не удалось взять пользователя в работу.'))
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Новые пользователи</h2>
          <p className="text-sm text-slate-500 mt-1">{totalCount} пользователей ожидают подтверждения</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/my-work?tab=users" className="text-sm text-slate-500 font-medium hover:text-indigo-600 transition-colors">
            Мои пользователи
          </Link>
          <Link to="/users" className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1">
            Все пользователи
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div> : null}

      {isLoading ? (
        <div className="py-16"><LoadingSpinner /></div>
      ) : users.length ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-bold">ID</th>
                  <th className="px-5 py-3 font-bold">Пользователь</th>
                  <th className="px-5 py-3 font-bold">Роль / Обучение</th>
                  <th className="px-5 py-3 font-bold">Регистрация</th>
                  <th className="px-5 py-3 font-bold">Статус</th>
                  <th className="px-5 py-3 font-bold">Модератор</th>
                  <th className="px-5 py-3 font-bold text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 text-xs text-slate-400">{u.id}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-medium shrink-0">
                          {u.first_name.slice(0, 1)}
                        </div>
                        <div>
                          <Link to={`/users/${u.id}?from=moderation`} className="font-medium text-slate-800 hover:text-indigo-600 transition-colors block leading-tight">
                            {u.first_name} {u.last_name}
                          </Link>
                          <div className="text-[10px] text-slate-400 mt-0.5">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 mb-1">
                        {u.role}
                      </span>
                      <br />
                      {u.education_level ? (
                        <span className="text-[10px] text-slate-500">{u.education_level} {u.course ? `${u.course} курс` : ''}</span>
                      ) : (
                        <span className="text-[10px] text-slate-400">&mdash;</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td className="px-5 py-3">
                      {!u.reviewed_by_id ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-50 text-yellow-700 border border-yellow-200">Новый</span>
                      ) : u.reviewed_by_id === currentUser?.id ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">В работе</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">Занят</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {u.reviewed_by_id === currentUser?.id ? (
                        <div className="font-medium text-slate-700">Вы</div>
                      ) : u.reviewed_by_id ? (
                        <span className="text-slate-400">Другой модератор</span>
                      ) : (
                        <span className="text-slate-400">Ещё не взято</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!u.reviewed_by_id ? (
                        <button type="button" onClick={() => void handleTake(u)} className="text-xs text-indigo-600 font-bold hover:underline">Взять в работу</button>
                      ) : u.reviewed_by_id === currentUser?.id ? (
                        <Link to="/my-work?tab=users" className="text-xs text-indigo-600 font-bold hover:underline">Моя работа</Link>
                      ) : (
                        <Link to={`/users/${u.id}?from=moderation`} className="text-xs text-slate-500 font-bold hover:underline">Просмотр</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
          </div>
          <p className="text-sm text-slate-500">Нет новых заявок на регистрацию</p>
        </div>
      )}
    </div>
  )
}
