import { KeyboardEvent, useEffect, useState } from 'react'
import { ArenaAuthIntent, AuthMode } from '../../hooks/useSocket'
import './NameScreen.css'

interface Props {
  authError?: string | null
  authInfo?: string | null
  initialMode?: AuthMode
  onStart: (authIntent: ArenaAuthIntent) => void
}

export function NameScreen({ authError, authInfo, initialMode = 'login', onStart }: Props) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberSession, setRememberSession] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  const validateRegister = () => {
    const trimmedEmail = email.trim()
    const trimmedUsername = username.trim()
    const trimmedNickname = nickname.trim()

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      return 'Use um email valido.'
    }

    if (!/^[A-Za-z0-9_]{3,20}$/.test(trimmedUsername)) {
      return 'Username precisa ter 3-20 caracteres usando apenas letras, numeros ou _.'
    }

    if (!/^[A-Za-z0-9_]{3,20}$/.test(trimmedNickname)) {
      return 'Nickname precisa ter 3-20 caracteres usando apenas letras, numeros ou _.'
    }

    if (password.length < 8 || /\s/.test(password) || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return 'Senha precisa ter 8+ caracteres, com maiuscula, minuscula e numero.'
    }

    return null
  }

  const handleSubmit = () => {
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

        <p className="name-screen__subtitle">Autentique-se para entrar no campo de batalha</p>

        <div className="name-screen__tabs">
          <button
            type="button"
            className={`name-screen__tab ${mode === 'login' ? 'is-active' : ''}`}
            onClick={() => setMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`name-screen__tab ${mode === 'register' ? 'is-active' : ''}`}
            onClick={() => setMode('register')}
          >
            Cadastro
          </button>
        </div>

        <div className="name-screen__form">
          {mode === 'register' && (
            <>
              <label className="name-screen__label" htmlFor="register-email">
                Email
              </label>
              <input
                id="register-email"
                className="name-screen__input"
                type="email"
                value={email}
                autoFocus
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <label className="name-screen__label" htmlFor="register-username">
                Username
              </label>
              <input
                id="register-username"
                className="name-screen__input"
                type="text"
                value={username}
                maxLength={20}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <label className="name-screen__label" htmlFor="register-nickname">
                Nickname
              </label>
              <input
                id="register-nickname"
                className="name-screen__input"
                type="text"
                value={nickname}
                maxLength={20}
                onChange={e => setNickname(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </>
          )}

          {mode === 'login' && (
            <>
              <label className="name-screen__label" htmlFor="login-identifier">
                Email ou username
              </label>
              <input
                id="login-identifier"
                className="name-screen__input"
                type="text"
                value={identifier}
                autoFocus
                onChange={e => setIdentifier(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </>
          )}

          <label className="name-screen__label" htmlFor="auth-password">
            Senha
          </label>
          <input
            id="auth-password"
            className="name-screen__input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          {mode === 'login' && (
            <label className="name-screen__checkbox">
              <input
                className="name-screen__checkbox-input"
                type="checkbox"
                checked={rememberSession}
                onChange={e => setRememberSession(e.target.checked)}
              />
              <span className="name-screen__checkbox-label">Manter conectado</span>
            </label>
          )}

          {(localError || authError) && <p className="name-screen__error">{localError || authError}</p>}
          {!localError && !authError && authInfo && <p className="name-screen__success">{authInfo}</p>}

          {mode === 'register' && (
            <p className="name-screen__hint">
              Senha: 8+ caracteres, com maiuscula, minuscula e numero.
            </p>
          )}

          <button
            id="start-btn"
            className="name-screen__btn"
            onClick={handleSubmit}
          >
            {mode === 'register' ? 'Criar conta' : 'Entrar'} - Continuar
          </button>
        </div>
      </div>
    </div>
  )
}
