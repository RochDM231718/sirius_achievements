import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { moderationApi } from '@/api/moderation'
import { myWorkApi, type MyWorkResponse } from '@/api/myWork'
import { useToast } from '@/hooks/useToast'
import { formatDateTime } from '@/utils/formatDate'
import { getErrorMessage } from '@/utils/http'

type WorkTab = 'users' | 'achievements'

function normalizeTab(value: string | null): WorkTab {
  return value === 'achievements' ? 'achievements' : 'users'
}

export function MyWorkPage() {
  const { pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<MyWorkResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const tab = normalizeTab(searchParams.get('tab'))

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await myWorkApi.get()
      setData(response.data)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Не удалось загрузить список задач в работе.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const setTab = (nextTab: WorkTab) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    setSearchParams(next)
  }

  const handleReleaseUser = async (userId: number, name: string) => {
    try {
      await moderationApi.releaseUser(userId)
      pushToast({ title: 'Пользователь снят с вас', message: name, tone: 'success' })
      await load()
    } catch (releaseError) {
      setError(getErrorMessage(releaseError, 'Не удалось освободить пользователя.'))
    }
  }

  const handleReleaseAchievement = async (achievementId: number, title: string) => {
    try {
      await moderationApi.releaseAchievement(achievementId)
      pushToast({ title: 'Документ снят с вас', message: title, tone: 'success' })
      await load()
    } catch (releaseError) {
      setError(getErrorMessage(releaseError, 'Не удалось освободить документ.'))
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Моя работа</h2>
          <p className="text-sm text-slate-500 mt-1">Личный пул задач модератора: пользователи и документы, закреплённые за вами.</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-2 inline-flex gap-1">
          <a href="?tab=users" onClick={(event) => { event.preventDefault(); setTab('users') }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Пользователи</a>
          <a href="?tab=achievements" onClick={(event) => { event.preventDefault(); setTab('achievements') }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'achievements' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Документы</a>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div><p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Пользователи</p></div>
          <p className="text-3xl font-semibold text-slate-800">{data?.total_users ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div><p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Документы</p></div>
          <p className="text-3xl font-semibold text-slate-800">{data?.total_achievements ?? 0}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">Загрузка задач…</div>
      ) : tab === 'users' ? (
        data?.users.length ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Пользователи в работе</h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Всего: {data.users.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-5 py-3 font-bold">ID</th>
                    <th className="px-5 py-3 font-bold">Пользователь</th>
                    <th className="px-5 py-3 font-bold">Роль / Обучение</th>
                    <th className="px-5 py-3 font-bold">Регистрация</th>
                    <th className="px-5 py-3 font-bold text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.users.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-xs text-slate-400">{row.id}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-medium shrink-0">{row.first_name.slice(0, 1)}</div>
                          <div>
                            <Link to={`/users/${row.id}`} className="font-medium text-slate-800 hover:text-indigo-600 transition-colors block leading-tight">{row.first_name} {row.last_name}</Link>
                            <div className="text-[10px] text-slate-400 mt-0.5">{row.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 mb-1">{row.role}</span>
                        <br />
                        {row.education_level ? <span className="text-[10px] text-slate-500">{row.education_level} {row.course ? `${row.course} курс` : ''}</span> : <span className="text-[10px] text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{new Date(row.created_at).toLocaleDateString('ru-RU')}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2 items-center">
                          <Link to={`/users/${row.id}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors mr-2">Профиль</Link>
                          <button type="button" onClick={() => void handleReleaseUser(row.id, `${row.first_name} ${row.last_name}`)} className="inline-flex text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors shadow-sm">Снять</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 mb-3 text-slate-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            </div>
            <p className="text-sm text-slate-500">У вас пока нет закреплённых пользователей</p>
            <Link to="/moderation/users" className="inline-block mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-800 transition-colors">Перейти к новым пользователям</Link>
          </div>
        )
      ) : data?.achievements.length ? (
        <div className="space-y-3">
          {data.achievements.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden p-4 transition-colors hover:border-slate-300">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex gap-3 flex-1">
                  <div className="w-20 h-24 sm:w-28 sm:h-28 shrink-0 bg-slate-50 rounded-lg overflow-hidden relative border border-slate-100 flex flex-col items-center justify-center group">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Файл</span>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col py-0.5">
                    <h3 className="text-sm font-bold text-slate-800 leading-tight line-clamp-2 mb-1.5" title={item.title}>{item.title}</h3>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100/50">{item.category || 'Без категории'}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200/50">{item.level || 'Без уровня'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="h-4 w-4 rounded bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-600 shrink-0">{item.user?.first_name?.slice(0, 1) || '?'}</div>
                      <span className="text-xs font-medium text-slate-700 truncate">{item.user ? `${item.user.first_name} ${item.user.last_name}` : 'Без автора'}</span>
                    </div>
                    <div className="mt-auto flex justify-between items-end">
                      <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">{formatDateTime(item.created_at)}</span>
                      {item.description ? <span className="text-[10px] text-slate-400 truncate max-w-[120px] italic" title={item.description}>{item.description}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col gap-2 shrink-0 sm:w-36 justify-center border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-3">
                  <Link to="/moderation/achievements" className="flex-1 sm:flex-none w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 sm:py-2.5 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center leading-tight shadow-sm">
                    К очереди
                  </Link>
                  <button type="button" onClick={() => void handleReleaseAchievement(item.id, item.title)} className="flex-1 sm:flex-none w-full bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm">
                    Снять
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 mb-3 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          </div>
          <p className="text-sm text-slate-500">У вас пока нет закреплённых документов</p>
          <Link to="/moderation/achievements" className="inline-block mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-800 transition-colors">Перейти к новым документам</Link>
        </div>
      )}
    </div>
  )
}
