import { useTranslation } from 'react-i18next'
import './SplashScreen.css'

export function SplashScreen() {
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
          <div className="splash-screen__bar">
            <div className="splash-screen__bar-fill" />
          </div>
          <span className="splash-screen__loading-text">{t('splash.loading')}</span>
        </div>
      </div>
    </div>
  )
}
