import { useTranslation } from 'react-i18next'
import './SplashScreen.css'

interface Props {
  status: string
  retryCount: number
  error: string | null
  onRetry: () => void
}

export function SplashScreen({ status, retryCount, error, onRetry }: Props) {
  const { t } = useTranslation()

  return (
    <div className="splash-screen">
      <div className="splash-screen__veil" />
      <div className="splash-screen__orbit splash-screen__orbit--outer" />
      <div className="splash-screen__orbit splash-screen__orbit--inner" />

      <div className="splash-screen__core">
        <span className="splash-screen__eyebrow">{t('splash.eyebrow')}</span>
        <h1 className="splash-screen__title">
          <span className="splash-screen__title-dragon">Dragon</span>
          <span className="splash-screen__title-arena">Arena</span>
        </h1>
        <p className="splash-screen__subtitle">{t('splash.subtitle')}</p>

        <div className="splash-screen__loading">
          {!error ? (
            <>
              <div className="splash-screen__bar">
                <div className="splash-screen__bar-fill" />
              </div>
              <span className="splash-screen__loading-text">{status || t('splash.loading')}</span>
              <span className="splash-screen__attempt">{t('loading.attempt', { count: retryCount })}</span>
            </>
          ) : (
            <div className="splash-screen__error">
              <div className="splash-screen__error-icon">!</div>
              <span className="splash-screen__error-title">{t('loading.connectionFailed')}</span>
              <p className="splash-screen__error-message">{error}</p>
              <button type="button" className="splash-screen__retry-btn" onClick={onRetry}>
                {t('loading.tryAgain')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
