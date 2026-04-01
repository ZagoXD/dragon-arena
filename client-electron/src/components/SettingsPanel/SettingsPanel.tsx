import { BR, ES, US } from 'country-flag-icons/react/3x2'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppLanguage, supportedLanguages } from '../../i18n'
import './SettingsPanel.css'

export type DisplayMode = 'windowed' | 'borderless' | 'fullscreen'

export interface ResolutionOption {
  width: number
  height: number
}

export interface ShellSettings {
  displayMode: DisplayMode
  resolution: ResolutionOption
}

interface Props {
  currentLanguage: AppLanguage
  onChangeLanguage: (language: AppLanguage) => void | Promise<void>
  onClose: () => void
  onLogout: () => void
  onQuit: () => void
  onUpdateSettings: (settings: ShellSettings) => void | Promise<void>
  settings: ShellSettings
  showLogout: boolean
}

const resolutionOptions: ResolutionOption[] = [
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
]

const languageFlags = {
  'pt-BR': BR,
  en: US,
  es: ES,
} as const

export function SettingsPanel({
  currentLanguage,
  onChangeLanguage,
  onClose,
  onLogout,
  onQuit,
  onUpdateSettings,
  settings,
  showLogout,
}: Props) {
  const { t } = useTranslation()
  const [pendingLanguage, setPendingLanguage] = useState<AppLanguage | null>(null)

  return (
    <div className="settings-panel">
      <button type="button" className="settings-panel__scrim" onClick={onClose} aria-label={t('settings.close')} />

      <aside className="settings-panel__card">
        <div className="settings-panel__header">
          <div>
            <span className="settings-panel__eyebrow">{t('settings.eyebrow')}</span>
            <h2 className="settings-panel__title">{t('settings.title')}</h2>
          </div>
          <button type="button" className="settings-panel__close" onClick={onClose} aria-label={t('settings.close')}>
            x
          </button>
        </div>

        <section className="settings-panel__section">
          <span className="settings-panel__section-label">{t('settings.displayMode')}</span>
          <div className="settings-panel__segmented">
            {(['windowed', 'borderless', 'fullscreen'] as DisplayMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                className={`settings-panel__segmented-btn ${settings.displayMode === mode ? 'is-active' : ''}`}
                onClick={() => void onUpdateSettings({ ...settings, displayMode: mode })}
              >
                {t(`settings.displayModes.${mode}`)}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-panel__section">
          <span className="settings-panel__section-label">{t('settings.resolution')}</span>
          {settings.displayMode === 'windowed' ? (
            <div className="settings-panel__list">
              {resolutionOptions.map(option => {
                const isActive = settings.resolution.width === option.width && settings.resolution.height === option.height
                return (
                  <button
                    key={`${option.width}x${option.height}`}
                    type="button"
                    className={`settings-panel__list-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => void onUpdateSettings({ ...settings, resolution: option })}
                  >
                    {option.width}x{option.height}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="settings-panel__hint">{t('settings.resolutionHint')}</p>
          )}
        </section>

        <section className="settings-panel__section">
          <span className="settings-panel__section-label">{t('settings.language')}</span>
          <div className="settings-panel__list">
            {supportedLanguages.map(language => {
              const Flag = languageFlags[language]
              return (
                <button
                  key={language}
                  type="button"
                  className={`settings-panel__list-item settings-panel__list-item--language ${currentLanguage === language ? 'is-active' : ''}`}
                  onClick={() => {
                    if (language === currentLanguage) {
                      return
                    }
                    setPendingLanguage(language)
                  }}
                >
                  <Flag className="settings-panel__flag" />
                  <span>{t(`language.${language}`)}</span>
                </button>
              )
            })}
          </div>
          <p className="settings-panel__hint">{t('settings.languageHint')}</p>
        </section>

        <section className="settings-panel__actions">
          {showLogout && (
            <button type="button" className="settings-panel__action settings-panel__action--secondary" onClick={onLogout}>
              {t('settings.logout')}
            </button>
          )}
          <button type="button" className="settings-panel__action settings-panel__action--danger" onClick={onQuit}>
            {t('settings.quit')}
          </button>
        </section>

        {pendingLanguage && (
          <div className="settings-panel__confirm">
            <div className="settings-panel__confirm-card">
              <span className="settings-panel__section-label">{t('settings.languageConfirmEyebrow')}</span>
              <h3 className="settings-panel__confirm-title">{t('settings.languageConfirmTitle')}</h3>
              <p className="settings-panel__confirm-text">{t('settings.languageConfirmText')}</p>
              <div className="settings-panel__confirm-actions">
                <button
                  type="button"
                  className="settings-panel__action settings-panel__action--secondary"
                  onClick={() => setPendingLanguage(null)}
                >
                  {t('settings.cancel')}
                </button>
                <button
                  type="button"
                  className="settings-panel__action"
                  onClick={() => {
                    const nextLanguage = pendingLanguage
                    setPendingLanguage(null)
                    void onChangeLanguage(nextLanguage)
                  }}
                >
                  {t('settings.confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
