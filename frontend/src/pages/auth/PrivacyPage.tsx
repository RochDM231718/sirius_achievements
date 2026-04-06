import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <div className="theme-auth-card w-full max-w-lg bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Политика конфиденциальности</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Мы обрабатываем только те данные, которые нужны для работы личного кабинета,
          модерации достижений, поддержки и формирования рейтинга.
        </p>
      </div>

      <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
        <p>
          Данные профиля, документы, обращения в поддержку и история действий хранятся на
          сервере проекта и используются только в рамках сервиса Sirius.Achievements.
        </p>
        <p>
          Права доступа, серверная валидация, защита загрузок и ограничения по ролям
          применяются независимо от того, с какого экрана вы работаете.
        </p>
        <p>
          При регистрации и использовании кабинета вы подтверждаете, что предоставляете
          достоверные сведения и загружаете только документы, которые вправе отправлять.
        </p>
      </div>

      <div className="mt-6">
        <Link to="/register" className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">
          Назад к регистрации
        </Link>
      </div>
    </div>
  )
}
