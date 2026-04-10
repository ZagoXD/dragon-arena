import { useTranslation } from 'react-i18next'
import './HomeScreen.css'

interface Props {
  nickname: string
  coins: number
  isBusy?: boolean
  onEnterTraining: () => void
  onEnterMatchmaking: () => void
}

export function HomeScreen({
  nickname,
  coins,
  isBusy = false,
  onEnterTraining,
  onEnterMatchmaking,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="home-screen">
      <div className="home-screen__glow home-screen__glow--left" />
      <div className="home-screen__glow home-screen__glow--right" />

      <aside className="home-screen__profile">
        <span className="home-screen__profile-label">{t('home.profileLabel')}</span>
        <strong className="home-screen__profile-name">{nickname}</strong>

        <div className="home-screen__coins">
          <span className="home-screen__coins-label">{t('home.coinsLabel')}</span>
          <strong className="home-screen__coins-value">{coins}</strong>
        </div>
      </aside>

      <main className="home-screen__center">
        <span className="home-screen__eyebrow">{t('home.eyebrow')}</span>
        <h1 className="home-screen__title">{t('home.title')}</h1>
        <p className="home-screen__subtitle">{t('home.subtitle')}</p>

        <div className="home-screen__cta-group">
          <button
            type="button"
            className={`home-screen__cta ${isBusy ? 'is-loading' : ''}`}
            disabled={isBusy}
            onClick={onEnterTraining}
          >
            {isBusy && <span className="home-screen__spinner" aria-hidden="true" />}
            <span>{t('home.trainingMode')}</span>
          </button>
          <button
            type="button"
            className={`home-screen__cta home-screen__cta--secondary ${isBusy ? 'is-loading' : ''}`}
            disabled={isBusy}
            onClick={onEnterMatchmaking}
          >
            <span>{t('home.playMatch')}</span>
          </button>
        </div>
      </main>
    </div>
  )
}
