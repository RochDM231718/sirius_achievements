import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { authApi } from '@/api/auth'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/http'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const { data } = await authApi.forgotPassword(email)
      if (data.flow_token) {
        navigate(`/verify-code?flow=${encodeURIComponent(data.flow_token)}`)
      } else {
        pushToast({ title: 'Письмо отправлено', message: data.message ?? 'Если аккаунт существует, код уже в почте.', tone: 'info' })
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Не удалось запустить восстановление пароля.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="theme-auth-card w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Забыли пароль?</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">Введите ваш email, и мы отправим код для сброса.</p>
      </div>

      {error ? <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg text-center">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email адрес</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all" />
        </div>

        <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 transition-colors">
          {isSubmitting ? 'Отправляем...' : 'Отправить код'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="text-indigo-600 font-medium hover:underline flex items-center justify-center">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Вернуться ко входу
        </Link>
      </div>
    </div>
  )
}
