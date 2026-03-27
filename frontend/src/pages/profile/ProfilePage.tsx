import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chart, registerables } from 'chart.js'
import { profileApi, type ProfileResponse } from '@/api/profile'
import { usersApi } from '@/api/users'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { UserRole } from '@/types/enums'
import { getErrorMessage } from '@/utils/http'
import { APP_PREFIX } from '@/utils/constants'

Chart.register(...registerables)

function buildStaticUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('/')) return path
  return `/static/${path.replace(/^\/+/, '')}`
}

function docStatusBadge(status: string, points?: number) {
  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-green-500 text-white shadow-sm">
          {points ?? 0} б.
        </span>
      )
    case 'revision':
      return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-yellow-500 text-white shadow-sm">
          Доработка
        </span>
      )
    case 'rejected':
      return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-red-500 text-white shadow-sm">
          Отклонено
        </span>
      )
    default:
      return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-500 text-white shadow-sm">
          Проверка
        </span>
      )
  }
}

function isImageFile(path?: string | null) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(path ?? '')
}
function isPdfFile(path?: string | null) {
  return /\.pdf$/i.test(path ?? '')
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, refreshProfile, logout } = useAuth()
  const { pushToast } = useToast()

  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile')

  // Profile form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Avatar + cropper
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const imageToCropRef = useRef<HTMLImageElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cropperRef = useRef<any>(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [croppedFile, setCroppedFile] = useState<File | null>(null)

  // AI Resume
  const [isGeneratingResume, setIsGeneratingResume] = useState(false)
  const [resumeText, setResumeText] = useState('')
  const [canGenerate, setCanGenerate] = useState(false)
  const [generateReason, setGenerateReason] = useState('')

  // Password change
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [passwordFlowId, setPasswordFlowId] = useState('')
  const [passwordVerifiedFlowId, setPasswordVerifiedFlowId] = useState('')
  const [passwordCode, setPasswordCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  // Chart
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstanceRef = useRef<Chart | null>(null)

  const isStudent = user?.role === UserRole.STUDENT

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await profileApi.get()
      setProfile(data)
      setFirstName(data.user.first_name)
      setLastName(data.user.last_name)
      setPhoneNumber(data.user.phone_number ?? '')
      setAvatarPreviewUrl(data.user.avatar_path ? buildStaticUrl(data.user.avatar_path) + '?t=' + Date.now() : null)
      setResumeText(data.user.resume_text ?? '')
      setCanGenerate(data.can_generate)
      setGenerateReason(data.generate_reason ?? '')
    } catch (e) {
      setError(getErrorMessage(e, 'Не удалось загрузить профиль.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Chart init
  useEffect(() => {
    if (!profile || !profile.has_chart_data || !chartRef.current || !isStudent) return
    if (chartInstanceRef.current) chartInstanceRef.current.destroy()

    const font = { family: "'Inter', system-ui, sans-serif", size: 11 }
    chartInstanceRef.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: profile.chart_labels,
        datasets: [
          {
            label: 'Баллы (накопительно)',
            data: profile.chart_cumulative,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.06)',
            fill: true,
            borderWidth: 2.5,
            tension: 0.35,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#6366f1',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 7,
            yAxisID: 'y',
          },
          {
            label: 'Баллы за месяц',
            data: profile.chart_points,
            borderColor: '#a78bfa',
            backgroundColor: 'rgba(167, 139, 250, 0.06)',
            fill: true,
            borderWidth: 2,
            borderDash: [5, 3],
            tension: 0.35,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#a78bfa',
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            yAxisID: 'y',
          },
          {
            label: 'Загрузки',
            data: profile.chart_uploads,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.06)',
            fill: true,
            borderWidth: 2,
            tension: 0.35,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#10b981',
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font, usePointStyle: true, pointStyle: 'circle', padding: 16, boxWidth: 6 },
          },
          tooltip: {
            backgroundColor: '#1e293b',
            titleFont: { ...font, weight: 'bold' },
            bodyFont: font,
            padding: 12,
            cornerRadius: 10,
            displayColors: true,
            boxPadding: 4,
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 2) return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + ' шт.'
                return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + ' б.'
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            position: 'left',
            grid: { color: '#f1f5f9' },
            ticks: { font, color: '#94a3b8' },
            title: { display: true, text: 'Баллы', font: { ...font, size: 10 }, color: '#94a3b8' },
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { font, color: '#10b981', stepSize: 1 },
            title: { display: true, text: 'Документы', font: { ...font, size: 10 }, color: '#10b981' },
          },
          x: {
            grid: { display: false },
            ticks: { font, color: '#64748b' },
          },
        },
      },
    })

    return () => {
      chartInstanceRef.current?.destroy()
      chartInstanceRef.current = null
    }
  }, [profile, isStudent])

  // Cropper init when modal opens
  useEffect(() => {
    if (!showCropModal || !imageToCropRef.current) return
    // @ts-expect-error Cropper loaded from CDN
    const CropperClass = window.Cropper
    if (!CropperClass) return
    const inst = new CropperClass(imageToCropRef.current, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: 'move',
      guides: false,
      center: false,
      highlight: false,
      background: false,
    })
    cropperRef.current = inst
    return () => {
      inst.destroy()
      cropperRef.current = null
    }
  }, [showCropModal])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      pushToast({ title: 'Разрешены JPG, PNG, WEBP.', tone: 'error' })
      e.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      pushToast({ title: 'Файл слишком большой (до 2 МБ).', tone: 'error' })
      e.target.value = ''
      return
    }
    const url = URL.createObjectURL(file)
    if (imageToCropRef.current) imageToCropRef.current.src = url
    setShowCropModal(true)
    e.target.value = ''
  }

  const handleCropSave = () => {
    const cropper = cropperRef.current
    if (!cropper) return
    cropper.getCroppedCanvas({ maxWidth: 800, maxHeight: 800 }).toBlob((blob: Blob) => {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      setCroppedFile(file)
      setAvatarPreviewUrl(URL.createObjectURL(blob))
      setShowCropModal(false)
    }, 'image/jpeg')
  }

  const handleProfileSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSavingProfile(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('first_name', firstName)
      formData.append('last_name', lastName)
      formData.append('phone_number', phoneNumber)
      if (croppedFile) formData.append('avatar', croppedFile)
      await profileApi.update(formData)
      await refreshProfile()
      setCroppedFile(null)
      pushToast({ title: 'Профиль обновлён', tone: 'success' })
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось обновить профиль.'))
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleGenerateResume = async () => {
    if (!user) return
    setIsGeneratingResume(true)
    try {
      const { data } = await usersApi.generateResume(user.id)
      if (data.resume) {
        setResumeText(data.resume)
        pushToast({ title: 'Резюме успешно обновлено', tone: 'success' })
      }
      if (data.can_generate !== undefined) {
        setCanGenerate(data.can_generate)
        setGenerateReason(data.reason ?? '')
      }
    } catch (err) {
      pushToast({ title: getErrorMessage(err, 'Ошибка при генерации резюме'), tone: 'error' })
    } finally {
      setIsGeneratingResume(false)
    }
  }

  const handleSendPasswordCode = async () => {
    setIsSendingCode(true)
    setError(null)
    try {
      const { data } = await profileApi.sendPasswordCode()
      setPasswordFlowId(data.flow_id)
      setPasswordVerifiedFlowId('')
      setPasswordCode('')
      setNewPassword('')
      setConfirmPassword('')
      pushToast({ title: 'Код отправлен', message: 'Проверьте почту.', tone: 'success' })
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось отправить код.'))
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleVerifyPasswordCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsVerifyingCode(true)
    setError(null)
    try {
      const { data } = await profileApi.verifyPasswordCode(passwordFlowId, passwordCode)
      setPasswordVerifiedFlowId(data.flow_id)
      pushToast({ title: 'Код подтверждён', tone: 'success' })
    } catch (err) {
      setError(getErrorMessage(err, 'Неверный код.'))
    } finally {
      setIsVerifyingCode(false)
    }
  }

  const handleResendPasswordCode = async () => {
    setIsSendingCode(true)
    try {
      const { data } = await profileApi.resendPasswordCode(passwordFlowId)
      setPasswordFlowId(data.flow_id)
      pushToast({ title: 'Код отправлен повторно', tone: 'success' })
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось отправить код повторно.'))
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsResettingPassword(true)
    setError(null)
    try {
      await profileApi.resetPassword(passwordVerifiedFlowId, newPassword, confirmPassword)
      await logout()
      pushToast({ title: 'Пароль изменён', message: 'Войдите снова.', tone: 'success' })
      navigate(`${APP_PREFIX}/login`)
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось изменить пароль.'))
    } finally {
      setIsResettingPassword(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-16">
        <LoadingSpinner />
      </div>
    )
  }

  if (!profile) return null

  const docs = profile.my_docs ?? []

  return (
    <>
      {/* Cropper.js CSS/JS loaded from CDN */}
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css" />
      <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js" />

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Настройки профиля</h2>
          {isStudent && (
            <a
              href={`${APP_PREFIX}/public/${user?.id}`}
              onClick={(e) => {
                e.preventDefault()
                navigate(`${APP_PREFIX}/public/${user?.id}`)
              }}
              className="inline-flex items-center text-sm text-slate-500 hover:text-indigo-600 transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Публичный профиль
            </a>
          )}
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-slate-100 rounded-lg mb-6 w-max">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'profile' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Основное
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'security' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Безопасность
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* ===== PROFILE TAB ===== */}
          {activeTab === 'profile' && (
            <div className="p-5 sm:p-6">
              {/* Student cohort banner */}
              {isStudent && (
                <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ваш учебный поток</p>
                    <p className="text-sm font-medium text-slate-800">
                      {profile.user.education_level ?? 'Не указано'}
                      {profile.user.course && (
                        <>
                          <span className="mx-1 text-slate-300">&bull;</span>{profile.user.course} курс
                        </>
                      )}
                      {profile.user.study_group && (
                        <>
                          <span className="mx-1 text-slate-300">&bull;</span>{profile.user.study_group}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center border border-slate-100 shadow-sm">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14v7" />
                    </svg>
                  </div>
                </div>
              )}

              {/* GPA cards */}
              {isStudent && (
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Оценка модератора</p>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-slate-800">{profile.user.session_gpa || '—'}</span>
                      {profile.user.session_gpa && <span className="text-xs text-slate-400 mb-1">из 5.0</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Средний балл сессии, который влияет на рейтинг</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Бонус в рейтинг</p>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-indigo-700">
                        {profile.gpa_bonus ? `+${profile.gpa_bonus}` : '0'}
                      </span>
                      <span className="text-xs text-indigo-400 mb-1">баллов</span>
                    </div>
                    <p className="text-[11px] text-indigo-500/80 mt-1">Бонус автоматически считается из оценки модератора</p>
                  </div>
                </div>
              )}

              {/* Profile form */}
              <form onSubmit={handleProfileSave} className="space-y-5">
                <div className="flex items-center space-x-5 pb-4 border-b border-slate-100">
                  <div className="shrink-0 relative">
                    {avatarPreviewUrl ? (
                      <img className="h-20 w-20 object-cover rounded-full border border-slate-200" src={avatarPreviewUrl} alt="" />
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-medium text-xl">
                        {profile.user.first_name?.[0] ?? '?'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="inline-block bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors">
                      Загрузить фото
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1">JPG, PNG до 2 МБ</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Имя</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Фамилия</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Email</label>
                  <input
                    type="email"
                    value={profile.user.email}
                    disabled
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Телефон (Опционально)</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+7 (999) 123-45-67"
                    pattern="[\d\s\+\-\(\)]{0,20}"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
                  />
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {isSavingProfile ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                </div>
              </form>

              {/* AI Resume block (students only) */}
              {isStudent && (
                <div className="mt-8 pt-6 border-t border-slate-100">
                  <div className="bg-indigo-50/60 p-5 rounded-xl border border-indigo-100 shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                      <div>
                        <h3 className="text-base font-bold text-indigo-900 flex items-center gap-2">
                          <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          AI-Сводка профиля
                        </h3>
                        <p className="text-xs text-indigo-700/70 mt-1">Автоматический анализ всех подтвержденных достижений нейросетью.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleGenerateResume()}
                        disabled={isGeneratingResume || !canGenerate}
                        className="shrink-0 px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm whitespace-nowrap"
                      >
                        {isGeneratingResume ? (
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        )}
                        {resumeText ? 'Обновить сводку' : 'Сгенерировать сводку'}
                      </button>
                    </div>

                    {!canGenerate && generateReason && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                        {generateReason}
                      </p>
                    )}

                    {resumeText ? (
                      <div className="bg-white border border-indigo-100/80 rounded-lg p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed shadow-sm">
                        {resumeText}
                      </div>
                    ) : !isGeneratingResume ? (
                      <div className="text-center py-6 bg-white/50 border border-indigo-100 border-dashed rounded-lg text-indigo-400 text-xs mt-2">
                        Здесь появится ваше профессиональное резюме.<br />Нажмите кнопку выше, чтобы ИИ проанализировал ваши грамоты.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== SECURITY TAB ===== */}
          {activeTab === 'security' && (
            <div className="p-5 sm:p-6">
              <div className="space-y-4">
                {!passwordFlowId ? (
                  <>
                    <p className="text-sm text-slate-600">
                      Для смены пароля мы отправим код подтверждения на вашу почту{' '}
                      <span className="font-medium text-slate-800">{profile.user.email}</span>.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleSendPasswordCode()}
                      disabled={isSendingCode}
                      className="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {isSendingCode ? 'Отправляем...' : 'Сменить пароль'}
                    </button>
                  </>
                ) : !passwordVerifiedFlowId ? (
                  <form onSubmit={handleVerifyPasswordCode} className="space-y-4">
                    <p className="text-sm text-slate-600">Введите код из письма:</p>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Код подтверждения</label>
                      <input
                        type="text"
                        value={passwordCode}
                        onChange={(e) => setPasswordCode(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={isVerifyingCode}
                        className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                      >
                        {isVerifyingCode ? 'Проверяем...' : 'Подтвердить'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResendPasswordCode()}
                        disabled={isSendingCode}
                        className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                      >
                        Отправить повторно
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Новый пароль</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Подтвердите пароль</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isResettingPassword}
                      className="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {isResettingPassword ? 'Меняем...' : 'Сменить пароль'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== MY DOCS GRID ===== */}
      {activeTab === 'profile' && docs.length > 0 && (
        <div className="max-w-2xl mx-auto mt-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Мои документы</h3>
              <a
                href={`${APP_PREFIX}/achievements`}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(`${APP_PREFIX}/achievements`)
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Все &rarr;
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {docs.slice(0, 6).map((doc) => (
                <a
                  key={doc.id}
                  href={`${APP_PREFIX}/achievements`}
                  onClick={(e) => {
                    e.preventDefault()
                    navigate(`${APP_PREFIX}/achievements`)
                  }}
                  className="group block bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all overflow-hidden"
                >
                  <div className="h-28 w-full bg-slate-100 flex items-center justify-center overflow-hidden relative">
                    {isImageFile(doc.file_path) ? (
                      <img
                        src={`/sirius.achievements/documents/${doc.id}/preview`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        alt={doc.title}
                        loading="lazy"
                      />
                    ) : isPdfFile(doc.file_path) ? (
                      <div className="flex flex-col items-center gap-1">
                        <svg className="w-10 h-10 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4z" />
                        </svg>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">PDF</span>
                      </div>
                    ) : (
                      <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    <div className="absolute top-2 right-2">
                      {docStatusBadge(doc.status, doc.points)}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-slate-800 truncate">{doc.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {doc.category}
                      {doc.result ? ` · ${doc.result}` : ''}
                    </p>
                  </div>
                </a>
              ))}
            </div>
            {docs.length > 6 && (
              <div className="mt-3 text-center">
                <a
                  href={`${APP_PREFIX}/achievements`}
                  onClick={(e) => {
                    e.preventDefault()
                    navigate(`${APP_PREFIX}/achievements`)
                  }}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Показать все {docs.length} документов
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== DYNAMICS CHART (students only) ===== */}
      {activeTab === 'profile' && isStudent && (
        <div className="max-w-2xl mx-auto mt-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Динамика достижений</h3>
              {profile.user.session_gpa && (
                <span className="text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full">
                  GPA: <span className="font-semibold text-slate-700">{profile.user.session_gpa}</span> &middot; бонус +{profile.gpa_bonus}
                </span>
              )}
            </div>
            {profile.has_chart_data ? (
              <div className="h-64">
                <canvas ref={chartRef} />
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-slate-400">Пока нет данных для отображения графика</div>
            )}
          </div>
        </div>
      )}

      {/* ===== CROP MODAL ===== */}
      {showCropModal && (
        <div className="fixed inset-0 z-[80] overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen p-4 text-center">
            <div
              className="fixed inset-0 bg-slate-900 bg-opacity-70 backdrop-blur-sm transition-opacity"
              onClick={() => setShowCropModal(false)}
            />
            <div className="relative bg-white rounded-xl text-left overflow-hidden shadow-sm transform transition-all w-full max-w-lg flex flex-col">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800">Фото профиля</h3>
              </div>
              <div className="p-4 bg-slate-50">
                <div className="w-full h-64 bg-slate-200 rounded-lg overflow-hidden">
                  <img ref={imageToCropRef} src="" className="max-w-full h-full object-contain" alt="" />
                </div>
              </div>
              <div className="p-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCropModal(false)}
                  className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleCropSave}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
