import { useTranslation } from 'react-i18next'
import './LoadingScreen.css'

interface Props {
  status: string
  retryCount: number
  error: string | null
  onRetry: () => void
}

export function LoadingScreen({ status, retryCount, error, onRetry }: Props) {
  const { t } = useTranslation()

  return (
    <div className="loading-screen">
      <div className="loading-screen__bg" />

      <div className="loading-screen__card">
        <h1 className="loading-screen__title">
          <span className="loading-screen__title-dragon">Dragon</span>
          <span className="loading-screen__title-arena"> Arena</span>
        </h1>

        <div className="loading-screen__content">
          {!error ? (
            <>
              <div className="loading-screen__spinner" />
              <p className="loading-screen__status">{status}</p>
              <p className="loading-screen__retry">{t('loading.attempt', { count: retryCount })}</p>
            </>
          ) : (
            <>
              <div className="loading-screen__error-icon">!</div>
              <p className="loading-screen__error-title">{t('loading.connectionFailed')}</p>
              <p className="loading-screen__error-msg">{error}</p>
              <button className="loading-screen__retry-btn" onClick={onRetry}>
                {t('loading.tryAgain')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
