import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { authApi } from '@/api/auth'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/http'

export function VerifyCodePage() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const [searchParams] = useSearchParams()
  const flowToken = searchParams.get('flow') ?? ''
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(60)
  const [canResend, setCanResend] = useState(false)

  useEffect(() => {
    if (timeLeft <= 0) {
      setCanResend(true)
      return
    }
    const timer = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [timeLeft])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const { data } = await authApi.verifyCode(flowToken, code)
      if (data.verified && data.verified_token) {
        pushToast({ title: 'Код подтверждён', tone: 'success' })
        navigate(`/reset-password?flow=${encodeURIComponent(data.verified_token)}`)
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Код не подошёл.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    try {
      const { data } = await authApi.resendCode(flowToken)
      if (data.flow_token) {
        navigate(`/verify-code?flow=${encodeURIComponent(data.flow_token)}`, { replace: true })
      }
      setTimeLeft(60)
      setCanResend(false)
      pushToast({ title: 'Код отправлен повторно', tone: 'info' })
    } catch (resendError) {
      setError(getErrorMessage(resendError, 'Не удалось отправить код повторно.'))
    }
  }

  return (
    <div className="theme-auth-card w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Проверка кода</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Код отправлен на вашу почту. Письмо может быть в папке "Спам".
        </p>
      </div>

      {!flowToken ? <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg text-center">Токен восстановления не найден.</div> : null}
      {error ? <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg text-center">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="------" maxLength={6} autoFocus autoComplete="off" className="w-full px-4 py-3 text-center text-3xl tracking-[0.4em] font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all placeholder:text-slate-300" />
        </div>

        <button type="submit" disabled={isSubmitting || !flowToken} className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 transition-colors">
          {isSubmitting ? 'Проверяем...' : 'Подтвердить'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button type="button" onClick={() => void handleResend()} disabled={!canResend || !flowToken} className={`text-xs font-medium transition-colors ${canResend ? 'text-indigo-600 hover:text-indigo-800 cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}>
          Отправить код повторно {!canResend ? `(${timeLeft})` : ''}
        </button>
      </div>
    </div>
  )
}
