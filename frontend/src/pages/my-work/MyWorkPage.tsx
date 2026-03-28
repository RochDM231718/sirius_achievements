import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { documentsApi } from '@/api/documents'
import { moderationApi } from '@/api/moderation'
import { myWorkApi, type MyWorkResponse } from '@/api/myWork'
import { DocumentPreviewImage } from '@/components/ui/DocumentPreviewImage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/hooks/useToast'
import type { Achievement } from '@/types/achievement'
import type { User } from '@/types/user'
import { isImageFile, isPdfFile, openDocumentPreview } from '@/utils/documentPreview'
import { formatDateTime } from '@/utils/formatDate'
import { getErrorMessage } from '@/utils/http'

type WorkTab = 'users' | 'achievements'
type DecisionStatus = 'revision' | 'rejected'

const successActionClass =
  'inline-flex items-center justify-center px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors shadow-sm bg-green-600 text-white hover:bg-green-700'

const dangerActionClass =
  'inline-flex items-center justify-center px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors shadow-sm bg-red-50 text-red-700 border border-red-100 hover:bg-red-100'

const neutralActionClass =
  'inline-flex items-center justify-center px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors shadow-sm bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'

function normalizeTab(value: string | null): WorkTab {
  return value === 'achievements' ? 'achievements' : 'users'
}

export function MyWorkPage() {
  const { pushToast } = useToast()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<MyWorkResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [decisionTarget, setDecisionTarget] = useState<Achievement | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false)
  const [editTarget, setEditTarget] = useState<Achievement | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)

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

  const closeDecisionModal = () => {
    setDecisionTarget(null)
    setDecisionReason('')
    setIsSubmittingDecision(false)
  }

  const openEditModal = (item: Achievement) => {
    setEditTarget(item)
    setEditTitle(item.title)
    setEditDescription(item.description ?? '')
    setIsSubmittingEdit(false)
  }

  const closeEditModal = () => {
    setEditTarget(null)
    setEditTitle('')
    setEditDescription('')
    setIsSubmittingEdit(false)
  }

  const handleApproveUser = async (user: User) => {
    try {
      await moderationApi.approveUser(user.id)
      pushToast({
        title: 'Пользователь одобрен',
        message: `${user.first_name} ${user.last_name}`,
        tone: 'success',
      })
      await load()
    } catch (approveError) {
      setError(getErrorMessage(approveError, 'Не удалось одобрить пользователя.'))
    }
  }

  const handleRejectUser = async (user: User) => {
    const confirmed = window.confirm(
      `Отклонить пользователя ${user.first_name} ${user.last_name}? Это действие необратимо.`
    )

    if (!confirmed) {
      return
    }

    try {
      await moderationApi.rejectUser(user.id)
      pushToast({
        title: 'Пользователь отклонён',
        message: `${user.first_name} ${user.last_name}`,
        tone: 'success',
      })
      await load()
    } catch (rejectError) {
      setError(getErrorMessage(rejectError, 'Не удалось отклонить пользователя.'))
    }
  }

  const handleReleaseUser = async (user: User) => {
    try {
      await moderationApi.releaseUser(user.id)
      pushToast({
        title: 'Пользователь снят с вас',
        message: `${user.first_name} ${user.last_name}`,
        tone: 'success',
      })
      await load()
    } catch (releaseError) {
      setError(getErrorMessage(releaseError, 'Не удалось освободить пользователя.'))
    }
  }

  const handleApproveAchievement = async (item: Achievement) => {
    try {
      await moderationApi.updateAchievement(item.id, 'approved')
      pushToast({
        title: 'Документ одобрен',
        message: item.title,
        tone: 'success',
      })
      await load()
    } catch (approveError) {
      setError(getErrorMessage(approveError, 'Не удалось одобрить документ.'))
    }
  }

  const handleSaveAchievementMetadata = async () => {
    if (!editTarget) {
      return
    }

    const normalizedTitle = editTitle.trim()
    const normalizedDescription = editDescription.trim()

    if (!normalizedTitle) {
      setError('Укажите название документа.')
      return
    }

    setIsSubmittingEdit(true)
    setError(null)

    try {
      await moderationApi.updateAchievementMetadata(editTarget.id, {
        title: normalizedTitle,
        description: normalizedDescription || undefined,
      })
      pushToast({
        title: 'Данные документа обновлены',
        message: normalizedTitle,
        tone: 'success',
      })
      closeEditModal()
      await load()
    } catch (editError) {
      setError(getErrorMessage(editError, 'Не удалось обновить название или описание документа.'))
      setIsSubmittingEdit(false)
    }
  }

  const handleAchievementDecision = async (status: DecisionStatus) => {
    if (!decisionTarget) {
      return
    }

    if (!decisionReason.trim()) {
      setError('Укажите причину или комментарий для студента.')
      return
    }

    setIsSubmittingDecision(true)
    setError(null)

    try {
      await moderationApi.updateAchievement(decisionTarget.id, status, decisionReason.trim())
      pushToast({
        title: status === 'revision' ? 'Документ отправлен на доработку' : 'Документ отклонён',
        message: decisionTarget.title,
        tone: 'success',
      })
      closeDecisionModal()
      await load()
    } catch (decisionError) {
      setError(getErrorMessage(decisionError, 'Не удалось обновить статус документа.'))
      setIsSubmittingDecision(false)
    }
  }

  const handleReleaseAchievement = async (item: Achievement) => {
    try {
      await moderationApi.releaseAchievement(item.id)
      pushToast({
        title: 'Документ снят с вас',
        message: item.title,
        tone: 'success',
      })
      await load()
    } catch (releaseError) {
      setError(getErrorMessage(releaseError, 'Не удалось освободить документ.'))
    }
  }

  const handleDownloadAchievement = async (item: Achievement) => {
    try {
      const response = await documentsApi.download(item.id)
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = item.file_path?.split('/').pop() || `${item.title}.bin`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, 'Не удалось скачать документ.'))
    }
  }

  const users = data?.users ?? []
  const achievements = data?.achievements ?? []
  const sectionLinks =
    tab === 'users'
      ? {
          queueTo: '/moderation/users',
          queueLabel: 'Новые пользователи',
          allTo: '/users',
          allLabel: 'Все пользователи',
        }
      : {
          queueTo: '/moderation/achievements',
          queueLabel: 'Новые документы',
          allTo: '/documents',
          allLabel: 'Все документы',
        }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Моя работа</h2>
          <p className="text-sm text-slate-500 mt-1">
            {tab === 'users'
              ? `Личный пул пользователей в работе: ${data?.total_users ?? 0}`
              : `Личный пул документов в работе: ${data?.total_achievements ?? 0}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to={sectionLinks.queueTo} className="text-sm text-slate-500 font-medium hover:text-indigo-600 transition-colors">
            {sectionLinks.queueLabel}
          </Link>
          <Link to={sectionLinks.allTo} className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1">
            {sectionLinks.allLabel}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/my-work?tab=users"
          className={`bg-white p-5 rounded-xl border shadow-sm flex flex-col justify-between transition-colors ${
            tab === 'users'
              ? 'border-indigo-200 ring-2 ring-indigo-500/10'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
            <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Пользователи</p>
          </div>
          <p className="text-3xl font-semibold text-slate-800">{data?.total_users ?? 0}</p>
        </Link>

        <Link
          to="/my-work?tab=achievements"
          className={`bg-white p-5 rounded-xl border shadow-sm flex flex-col justify-between transition-colors ${
            tab === 'achievements'
              ? 'border-indigo-200 ring-2 ring-indigo-500/10'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
            <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Документы</p>
          </div>
          <p className="text-3xl font-semibold text-slate-800">{data?.total_achievements ?? 0}</p>
        </Link>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16">
          <LoadingSpinner />
        </div>
      ) : tab === 'users' ? (
        users.length ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Пользователи в работе</h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Всего: {users.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-400 border-b border-slate-100 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-5 py-3 font-bold">ID</th>
                    <th className="px-5 py-3 font-bold">Пользователь</th>
                    <th className="px-5 py-3 font-bold">Роль / обучение</th>
                    <th className="px-5 py-3 font-bold">Регистрация</th>
                    <th className="px-5 py-3 font-bold text-right">Действия</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-50">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-xs text-slate-400">{user.id}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-medium shrink-0">
                            {user.first_name.slice(0, 1)}
                          </div>
                          <div>
                            <Link
                              to={`/users/${user.id}?from=my-work`}
                              className="font-medium text-slate-800 hover:text-indigo-600 transition-colors block leading-tight"
                            >
                              {user.first_name} {user.last_name}
                            </Link>
                            <div className="text-[10px] text-slate-400 mt-0.5">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 mb-1">
                          {user.role}
                        </span>
                        <br />
                        {user.education_level ? (
                          <span className="text-[10px] text-slate-500">
                            {user.education_level} {user.course ? `${user.course} курс` : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2 items-center flex-wrap">
                          <Link
                            to={`/users/${user.id}?from=my-work`}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors mr-1"
                          >
                            Профиль
                          </Link>
                          <button type="button" onClick={() => void handleApproveUser(user)} className={successActionClass}>
                            Принять
                          </button>
                          <button type="button" onClick={() => void handleRejectUser(user)} className={dangerActionClass}>
                            Отклонить
                          </button>
                          <button type="button" onClick={() => void handleReleaseUser(user)} className={neutralActionClass}>
                            Снять
                          </button>
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
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                ></path>
              </svg>
            </div>
            <p className="text-sm text-slate-500">У вас пока нет закреплённых пользователей</p>
            <Link to="/moderation/users" className="inline-block mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-800 transition-colors">
              Перейти к новым пользователям
            </Link>
          </div>
        )
      ) : achievements.length ? (
        <div className="space-y-3">
          {achievements.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden p-4 transition-colors hover:border-slate-300">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex gap-3 flex-1">
                  <button
                    type="button"
                    onClick={() => openDocumentPreview(item.id, item.file_path)}
                    className="w-20 h-24 sm:w-28 sm:h-28 shrink-0 bg-slate-50 rounded-lg overflow-hidden relative border border-slate-100 flex flex-col items-center justify-center group"
                    title="Открыть превью"
                  >
                    {item.file_path && isImageFile(item.file_path) ? (
                      <DocumentPreviewImage documentId={item.id} alt={item.title} className="w-full h-full object-cover" />
                    ) : item.file_path && isPdfFile(item.file_path) ? (
                      <>
                        <svg className="w-6 h-6 text-slate-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                        </svg>
                        <span className="text-[9px] font-bold text-slate-500 uppercase">PDF</span>
                      </>
                    ) : (
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Нет файла</span>
                    )}
                  </button>

                  <div className="flex-1 min-w-0 flex flex-col py-0.5">
                    <h3 className="text-sm font-bold text-slate-800 leading-tight line-clamp-2 mb-1.5" title={item.title}>
                      {item.title}
                    </h3>

                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100/50">
                        {item.category || 'Без категории'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200/50">
                        {item.level || 'Без уровня'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="h-4 w-4 rounded bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-600 shrink-0">
                        {item.user?.first_name?.slice(0, 1) || '?'}
                      </div>
                      <span className="text-xs font-medium text-slate-700 truncate">
                        {item.user ? `${item.user.first_name} ${item.user.last_name}` : 'Без автора'}
                      </span>
                    </div>

                    <div className="mt-auto flex justify-between items-end gap-3">
                      <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">
                        {formatDateTime(item.created_at)}
                      </span>
                      {item.description ? (
                        <span className="text-[10px] text-slate-400 truncate max-w-[160px] italic" title={item.description}>
                          {item.description}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col gap-2 shrink-0 sm:w-36 justify-center border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-3">
                  <button
                    type="button"
                    onClick={() => void handleApproveAchievement(item)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-2 sm:py-2.5 px-2 rounded-lg text-xs font-medium transition-colors flex flex-col items-center justify-center leading-tight shadow-sm"
                  >
                    <span>Одобрить</span>
                    {typeof item.projected_points === 'number' ? (
                      <span className="text-[9px] opacity-90 mt-0.5 font-normal">+{item.projected_points} баллов</span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="w-full bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2 sm:py-2.5 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L12 15l-4 1 1-4 9.586-9.586z"></path>
                    </svg>
                    <span>Редактировать</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDecisionTarget(item)
                      setDecisionReason(item.rejection_reason ?? '')
                    }}
                    className="flex-1 sm:flex-none w-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 py-2 sm:py-2.5 px-2 rounded-lg text-xs font-medium transition-colors flex flex-col items-center justify-center leading-tight shadow-sm"
                  >
                    <span>Отклонить /</span>
                    <span>Вернуть</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleReleaseAchievement(item)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    Снять
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDownloadAchievement(item)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                    <span>Скачать</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 mb-3 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
          <p className="text-sm text-slate-500">У вас пока нет закреплённых документов</p>
          <Link to="/moderation/achievements" className="inline-block mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-800 transition-colors">
            Перейти к новым документам
          </Link>
        </div>
      )}

      {editTarget ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={closeEditModal}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-lg flex flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Редактирование документа</h3>
                <p className="text-xs text-slate-400 mt-1">Исправьте название или описание перед одобрением</p>
              </div>
              <button type="button" onClick={closeEditModal} className="text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div className="p-4 bg-slate-50 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Название <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  disabled={isSubmittingEdit}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  placeholder="Название документа"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Описание
                </label>
                <textarea
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  rows={4}
                  disabled={isSubmittingEdit}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
                  placeholder="Короткое описание документа"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSubmittingEdit}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={() => void handleSaveAchievementMetadata()}
                disabled={isSubmittingEdit}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmittingEdit ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {decisionTarget ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={closeDecisionModal}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-lg flex flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Решение по документу</h3>
                <p className="text-xs text-slate-400 mt-1">{decisionTarget.title}</p>
              </div>
              <button type="button" onClick={closeDecisionModal} className="text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div className="p-4 bg-slate-50">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Причина или комментарий для студента <span className="text-red-500">*</span>
              </label>
              <textarea
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                rows={4}
                disabled={isSubmittingDecision}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
                placeholder="Например: размытое фото, загрузите документ заново."
              />
            </div>

            <div className="p-4 border-t border-slate-100 bg-white grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleAchievementDecision('revision')}
                disabled={isSubmittingDecision}
                className="w-full px-4 py-2.5 bg-yellow-50 text-yellow-700 border border-yellow-200 text-sm font-medium rounded-lg hover:bg-yellow-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                На доработку
              </button>

              <button
                type="button"
                onClick={() => void handleAchievementDecision('rejected')}
                disabled={isSubmittingDecision}
                className="w-full px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                Полный отказ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
