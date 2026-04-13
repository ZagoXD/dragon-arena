import { KeyboardEvent, useEffect, useState } from 'react'
import { BR } from 'country-flag-icons/react/3x2'
import { ES } from 'country-flag-icons/react/3x2'
import { US } from 'country-flag-icons/react/3x2'
import { useTranslation } from 'react-i18next'
import { ArenaAuthIntent, AuthMode } from '../../hooks/useSocket'
import { AppLanguage, supportedLanguages } from '../../i18n'
import './NameScreen.css'

interface Props {
  authError?: string | null
  authInfo?: string | null
  initialMode?: AuthMode
  isBusy?: boolean
  versionLabel?: string | null
  onLanguageChange: (language: AppLanguage) => void
  onStart: (authIntent: ArenaAuthIntent) => void | Promise<void>
}

const languageFlags = {
  'pt-BR': BR,
  en: US,
  es: ES,
} as const

export function NameScreen({
  authError,
  authInfo,
  initialMode = 'login',
  isBusy = false,
  versionLabel = null,
  onLanguageChange,
  onStart,
}: Props) {
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberSession, setRememberSession] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)

  const currentLanguage = (supportedLanguages.includes(i18n.language as AppLanguage)
    ? i18n.language
    : 'pt-BR') as AppLanguage
  const CurrentFlag = languageFlags[currentLanguage]

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  const validateRegister = () => {
    const trimmedEmail = email.trim()
    const trimmedUsername = username.trim()
    const trimmedNickname = nickname.trim()

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      return t('auth.errors.invalidEmail')
    }

    if (!/^[A-Za-z0-9_]{3,20}$/.test(trimmedUsername)) {
      return t('auth.errors.invalidUsername')
    }

    if (!/^[A-Za-z0-9_]{3,20}$/.test(trimmedNickname)) {
      return t('auth.errors.invalidNickname')
    }

    if (password.length < 8 || /\s/.test(password) || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return t('auth.errors.invalidPassword')
    }

    return null
  }

  const handleSubmit = () => {
    if (isBusy) {
      return
    }

    if (mode === 'register') {
      const validationError = validateRegister()
      setLocalError(validationError)
      if (validationError) {
        return
      }

      onStart({
        mode,
        email: email.trim(),
        username: username.trim(),
        nickname: nickname.trim(),
        password,
      })
      return
    }

    setLocalError(null)
    onStart({
      mode,
      identifier: identifier.trim(),
      password,
      rememberSession,
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="name-screen">
      <div className="name-screen__bg" />

      <div className="name-screen__card">
        <h1 className="name-screen__title">
          <span className="name-screen__title-dragon">Dragon</span>
          <span className="name-screen__title-arena"> Arena</span>
        </h1>

        <div className="name-screen__topbar">
          <p className="name-screen__subtitle">{t('auth.subtitle')}</p>

          <div className="name-screen__language">
            <span className="name-screen__language-label">{t('language.label')}</span>
            <button
              type="button"
              className="name-screen__language-trigger"
              disabled={isBusy}
              onClick={() => setLanguageMenuOpen(open => !open)}
            >
              <CurrentFlag className="name-screen__language-flag" />
              <span>{t(`language.${currentLanguage}`)}</span>
            </button>

            {languageMenuOpen && (
              <div className="name-screen__language-menu">
                {supportedLanguages.map(language => {
                  const Flag = languageFlags[language]
                  return (
                    <button
                      key={language}
                      type="button"
                      className={`name-screen__language-option ${language === currentLanguage ? 'is-active' : ''}`}
                      disabled={isBusy}
                      onClick={() => {
                        setLanguageMenuOpen(false)
                        onLanguageChange(language)
                      }}
                    >
                      <Flag className="name-screen__language-flag" />
                      <span>{t(`language.${language}`)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="name-screen__tabs">
          <button
            type="button"
            className={`name-screen__tab ${mode === 'login' ? 'is-active' : ''}`}
            disabled={isBusy}
            onClick={() => setMode('login')}
          >
            {t('auth.login')}
          </button>
          <button
            type="button"
            className={`name-screen__tab ${mode === 'register' ? 'is-active' : ''}`}
            disabled={isBusy}
            onClick={() => setMode('register')}
          >
            {t('auth.register')}
          </button>
        </div>

        <div className="name-screen__form">
          {mode === 'register' && (
            <>
              <label className="name-screen__label" htmlFor="register-email">
                {t('auth.email')}
              </label>
              <input
                id="register-email"
                className="name-screen__input"
                type="email"
                value={email}
                autoFocus
                disabled={isBusy}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <label className="name-screen__label" htmlFor="register-username">
                {t('auth.username')}
              </label>
              <input
                id="register-username"
                className="name-screen__input"
                type="text"
                value={username}
                maxLength={20}
                disabled={isBusy}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <label className="name-screen__label" htmlFor="register-nickname">
                {t('auth.nickname')}
              </label>
              <input
                id="register-nickname"
                className="name-screen__input"
                type="text"
                value={nickname}
                maxLength={20}
                disabled={isBusy}
                onChange={e => setNickname(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </>
          )}

          {mode === 'login' && (
            <>
              <label className="name-screen__label" htmlFor="login-identifier">
                {t('auth.identifier')}
              </label>
              <input
                id="login-identifier"
                className="name-screen__input"
                type="text"
                value={identifier}
                autoFocus
                disabled={isBusy}
                onChange={e => setIdentifier(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </>
          )}

          <label className="name-screen__label" htmlFor="auth-password">
            {t('auth.password')}
          </label>
          <input
            id="auth-password"
            className="name-screen__input"
            type="password"
            value={password}
            disabled={isBusy}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {mode === 'login' && (
            <label className="name-screen__checkbox">
              <input
                className="name-screen__checkbox-input"
                type="checkbox"
                checked={rememberSession}
                disabled={isBusy}
                onChange={e => setRememberSession(e.target.checked)}
              />
              <span className="name-screen__checkbox-label">{t('auth.remember')}</span>
            </label>
          )}

          {(localError || authError) && <p className="name-screen__error">{localError || authError}</p>}
          {!localError && !authError && authInfo && <p className="name-screen__success">{authInfo}</p>}

          {mode === 'register' && (
            <p className="name-screen__hint">
              {t('auth.passwordHint')}
            </p>
          )}

          <button
            id="start-btn"
            className={`name-screen__btn ${isBusy ? 'is-loading' : ''}`}
            disabled={isBusy}
            onClick={handleSubmit}
          >
            {isBusy && <span className="name-screen__spinner" aria-hidden="true" />}
            <span>{mode === 'register' ? t('auth.submitRegister') : t('auth.submitLogin')}</span>
          </button>
        </div>
      </div>

      {versionLabel && (
        <div className="name-screen__version">
          {versionLabel}
        </div>
      )}
    </div>
  )
}
