import { useState, useCallback, useEffect, useRef } from 'react'
import { NameScreen } from './components/NameScreen/NameScreen'
import { HomeScreen } from './components/HomeScreen/HomeScreen'
import { SelectScreen } from './components/SelectScreen/SelectScreen'
import { Arena } from './components/Arena/Arena'
import { LoadingScreen } from './components/LoadingScreen/LoadingScreen'
import { SplashScreen } from './components/SplashScreen/SplashScreen'
import { SettingsPanel, ShellSettings } from './components/SettingsPanel/SettingsPanel'
import { TitleBar } from './components/TitleBar/TitleBar'
import { ArenaAuthIntent, AuthSuccessPayload, ProfileSyncPayload } from './hooks/useSocket'
import i18n, { AppLanguage, supportedLanguages } from './i18n'
import { translateBackendError } from './i18n/translateBackendError'
import './App.css'

type Screen = 'splash' | 'name' | 'loading' | 'home' | 'select' | 'arena'
const AUTH_SESSION_STORAGE_KEY = 'dragon-arena-auth-session'
const SHELL_SETTINGS_STORAGE_KEY = 'dragon-arena-shell-settings'

interface StoredAuthSession {
  token: string
  expiresAtMs: number
  username: string
  nickname: string
  tag: string
}

function App() {
  const [shellSettings, setShellSettings] = useState<ShellSettings>({
    displayMode: 'borderless',
    resolution: { width: 1600, height: 900 },
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [screen, setScreen] = useState<Screen>('splash')
  const [bootReady, setBootReady] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [playerTag, setPlayerTag] = useState('')
  const [playerCoins, setPlayerCoins] = useState(0)
  const [sessionExpiresAtMs, setSessionExpiresAtMs] = useState(0)
  const [shouldPersistSession, setShouldPersistSession] = useState(false)
  const [authIntent, setAuthIntent] = useState<ArenaAuthIntent | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authInfo, setAuthInfo] = useState<string | null>(null)
  const [nameScreenMode, setNameScreenMode] = useState<'login' | 'register'>('login')
  const [characterId, setCharacterId] = useState<string>('charizard')
  const [selectionLockedUntil, setSelectionLockedUntil] = useState<number | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(() => i18n.t('app.initializing'))
  const [retryCount, setRetryCount] = useState(0)
  const [connError, setConnError] = useState<string | null>(null)
  const [authPending, setAuthPending] = useState(false)
  const [enterArenaPending, setEnterArenaPending] = useState(false)
  const attemptedStoredSessionRef = useRef(false)
  const currentLanguage = (supportedLanguages.includes(i18n.language as AppLanguage)
    ? i18n.language
    : 'pt-BR') as AppLanguage
  const showTitleBar = shellSettings.displayMode !== 'fullscreen'
  const showSettingsButton = screen === 'home'

  const applyAccountSnapshot = useCallback((payload: Pick<AuthSuccessPayload, 'user' | 'profile'>) => {
    setPlayerName(payload.user.nickname || payload.user.username)
    setPlayerTag(payload.user.tag || '')
    setPlayerCoins(payload.profile.coins ?? 0)
    setAuthIntent(current => {
      if (current?.mode !== 'session') {
        return current
      }

      if (
        current.username === payload.user.username &&
        current.nickname === payload.user.nickname
      ) {
        return current
      }

      return {
        ...current,
        username: payload.user.username,
        nickname: payload.user.nickname,
      }
    })
  }, [])

  const persistStoredSession = useCallback((session: StoredAuthSession) => {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
  }, [])

  const persistSession = useCallback((payload: AuthSuccessPayload) => {
    const session: StoredAuthSession = {
      token: payload.sessionToken,
      expiresAtMs: payload.sessionExpiresAtMs,
      username: payload.user.username,
      nickname: payload.user.nickname,
      tag: payload.user.tag,
    }
    persistStoredSession(session)
  }, [persistStoredSession])

  const clearPersistedSession = useCallback(() => {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
  }, [])

  const serverUrl = (import.meta.env.VITE_SERVER_URL || 'ws://localhost:3001').replace('http', 'ws')

  const testConnection = useCallback(async () => {
    setScreen('loading')
    setConnError(null)

    for (let i = 1; i <= 6; i++) {
      setRetryCount(i)
      setLoadingStatus(i18n.t('app.connectingServer'))

      try {
        await new Promise((resolve, reject) => {
          const ws = new WebSocket(serverUrl)
          const timeout = setTimeout(() => {
            ws.close()
            reject(new Error(i18n.t('app.connectionTimeout')))
          }, 3500)

          ws.onopen = () => {
            clearTimeout(timeout)
            setTimeout(() => { ws.close(); resolve(true) }, 100)
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            reject(new Error(i18n.t('app.serverUnreachable')))
          }
        })

        setLoadingStatus(i18n.t('app.successPreparingHome'))
        setTimeout(() => setScreen('home'), 500)
        return
      } catch {
        if (i === 6) {
          setConnError(i18n.t('app.connectionError'))
        } else {
          await new Promise(r => setTimeout(r, i * 500))
        }
      }
    }
  }, [serverUrl])

  const authenticate = useCallback((nextAuthIntent: ArenaAuthIntent, options?: { showLoadingScreen?: boolean }) => {
    if (options?.showLoadingScreen) {
      setScreen('loading')
      setConnError(null)
      setRetryCount(1)
      setLoadingStatus(i18n.t(nextAuthIntent.mode === 'register' ? 'app.creatingAccount' : 'app.authenticating'))
    }

    return new Promise<AuthSuccessPayload>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const timeout = window.setTimeout(() => {
        ws.close()
        reject(new Error(i18n.t('app.authTimeout')))
      }, 6000)

      const cleanup = () => {
        window.clearTimeout(timeout)
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
      }

      ws.onopen = () => {
        if (nextAuthIntent.mode === 'register') {
          ws.send(JSON.stringify({
            event: 'register',
            email: nextAuthIntent.email,
            username: nextAuthIntent.username,
            nickname: nextAuthIntent.nickname,
            password: nextAuthIntent.password,
          }))
          return
        }

        if (nextAuthIntent.mode === 'session') {
          ws.send(JSON.stringify({
            event: 'authToken',
            token: nextAuthIntent.sessionToken,
          }))
          return
        }

        ws.send(JSON.stringify({
          event: 'login',
          identifier: nextAuthIntent.identifier,
          password: nextAuthIntent.password,
        }))
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.event === 'authSuccess') {
          cleanup()
          ws.close()
          resolve(data as AuthSuccessPayload)
          return
        }

        if (data.event === 'authError') {
          cleanup()
          ws.close()
          reject(new Error(translateBackendError(i18n.t.bind(i18n), data.code, data.reason)))
        }
      }

      ws.onerror = () => {
        cleanup()
        ws.close()
        reject(new Error(i18n.t('app.authServerError')))
      }

      ws.onclose = () => {
        cleanup()
      }
    })
  }, [serverUrl])

  const handleNameEnter = useCallback(async (nextAuthIntent: ArenaAuthIntent) => {
    setAuthError(null)
    setAuthInfo(null)
    setNameScreenMode(nextAuthIntent.mode === 'register' ? 'register' : 'login')
    setAuthPending(true)

    try {
      const payload = await authenticate(nextAuthIntent, {
        showLoadingScreen: nextAuthIntent.mode === 'session',
      })

      if (nextAuthIntent.mode === 'register') {
        setAuthInfo(i18n.t('app.accountCreated'))
        setNameScreenMode('login')
        setScreen('name')
        return
      }

      applyAccountSnapshot(payload)
      setSessionExpiresAtMs(payload.sessionExpiresAtMs)
      const persistChoice = nextAuthIntent.mode === 'session' || Boolean(nextAuthIntent.rememberSession)
      setShouldPersistSession(persistChoice)
      if (persistChoice) {
        persistSession(payload)
      } else {
        clearPersistedSession()
      }
      setAuthIntent({
        mode: 'session',
        sessionToken: payload.sessionToken,
        username: payload.user.username,
        nickname: payload.user.nickname,
        rememberSession: persistChoice,
        password: '',
      })
      setScreen('home')
    } catch (error) {
      if (nextAuthIntent.mode === 'session') {
        clearPersistedSession()
        setAuthIntent(null)
      }
      setShouldPersistSession(false)
      setAuthError(error instanceof Error ? error.message : i18n.t('app.authFailed'))
      setScreen('name')
    } finally {
      setAuthPending(false)
    }
  }, [applyAccountSnapshot, authenticate, clearPersistedSession, persistSession])

  const handleSelectCharacter = (id: string) => {
    if (selectionLockedUntil !== null && Date.now() < selectionLockedUntil) {
      return
    }
    setCharacterId(id)
    setScreen('arena')
  }

  const handleReturnToSelect = (respawnAvailableAt?: number) => {
    setSelectionLockedUntil(respawnAvailableAt ?? null)
    setScreen('select')
  }

  const handleAuthFailure = useCallback((message: string) => {
    if (authIntent?.mode === 'session') {
      clearPersistedSession()
      setAuthIntent(null)
    }
    setSessionExpiresAtMs(0)
    setShouldPersistSession(false)
    setAuthError(message)
    setNameScreenMode('login')
    setScreen('name')
  }, [authIntent?.mode, clearPersistedSession])

  const handleAuthenticated = useCallback((payload: AuthSuccessPayload) => {
    applyAccountSnapshot(payload)
    setSessionExpiresAtMs(payload.sessionExpiresAtMs)
    if (shouldPersistSession) {
      persistSession(payload)
    }
    setAuthIntent(current => {
      if (
        current?.mode === 'session' &&
        current.sessionToken === payload.sessionToken &&
        current.username === payload.user.username &&
        current.nickname === payload.user.nickname
      ) {
        return current
      }

      return {
        mode: 'session',
        sessionToken: payload.sessionToken,
        username: payload.user.username,
        nickname: payload.user.nickname,
        rememberSession: current?.rememberSession ?? shouldPersistSession,
        password: '',
      }
    })
  }, [applyAccountSnapshot, persistSession, shouldPersistSession])

  const handleEnterArena = useCallback(() => {
    setEnterArenaPending(true)
    window.setTimeout(() => {
      setEnterArenaPending(false)
      setScreen('select')
    }, 220)
  }, [])

  const handleReturnToHome = useCallback(() => {
    setSelectionLockedUntil(null)
    setScreen('home')
  }, [])

  const handleLogout = useCallback(() => {
    clearPersistedSession()
    setSettingsOpen(false)
    setShouldPersistSession(false)
    setSessionExpiresAtMs(0)
    setAuthIntent(null)
    setAuthError(null)
    setAuthInfo(null)
    setAuthPending(false)
    setEnterArenaPending(false)
    setPlayerCoins(0)
    setPlayerName('')
    setPlayerTag('')
    setSelectionLockedUntil(null)
    setNameScreenMode('login')
    setScreen('name')
  }, [clearPersistedSession])

  const handleLanguageChange = useCallback(async (language: AppLanguage) => {
    await i18n.changeLanguage(language)
    setLoadingStatus(i18n.t('app.initializing'))
    setSettingsOpen(false)
    if (screen !== 'name' && screen !== 'loading') {
      handleLogout()
    }
  }, [handleLogout, screen])

  const applyShellSettings = useCallback(async (nextSettings: ShellSettings) => {
    const applied = await (window as any).ipcRenderer.invoke('window-apply-shell-settings', nextSettings)
    setShellSettings(applied as ShellSettings)
    localStorage.setItem(SHELL_SETTINGS_STORAGE_KEY, JSON.stringify(applied))
  }, [])

  const handleQuitGame = useCallback(() => {
    void (window as any).ipcRenderer.invoke('app-quit')
  }, [])

  useEffect(() => {
    const loadShellSettings = async () => {
      const fromMain = await (window as any).ipcRenderer.invoke('window-get-shell-settings')
      let nextSettings = fromMain as ShellSettings
      const raw = localStorage.getItem(SHELL_SETTINGS_STORAGE_KEY)

      if (raw) {
        try {
          nextSettings = JSON.parse(raw) as ShellSettings
        } catch {
          nextSettings = fromMain as ShellSettings
        }
      }

      setShellSettings(nextSettings)
      await (window as any).ipcRenderer.invoke('window-apply-shell-settings', nextSettings)
    }

    void loadShellSettings()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBootReady(true)
    }, 1650)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!bootReady || attemptedStoredSessionRef.current) {
      return
    }

    if (attemptedStoredSessionRef.current) {
      return
    }
    attemptedStoredSessionRef.current = true

    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) {
      setScreen('name')
      return
    }

    try {
      const session = JSON.parse(raw) as StoredAuthSession
      if (!session.token || !session.expiresAtMs || session.expiresAtMs <= Date.now()) {
        clearPersistedSession()
        setScreen('name')
        return
      }

      setPlayerName(session.nickname || session.username || 'Player')
      setPlayerTag(session.tag || '')
      setPlayerCoins(0)
      setSessionExpiresAtMs(session.expiresAtMs)
      setShouldPersistSession(true)
      setAuthError(null)
      setAuthInfo(null)
      void handleNameEnter({
        mode: 'session',
        sessionToken: session.token,
        username: session.username,
        nickname: session.nickname,
        password: '',
      })
    } catch {
      clearPersistedSession()
      setScreen('name')
    }
  }, [bootReady, clearPersistedSession, handleNameEnter])

  useEffect(() => {
    if (authIntent?.mode !== 'session' || !authIntent.sessionToken) {
      return
    }

    if (screen !== 'home' && screen !== 'select') {
      return
    }

    const sessionToken = authIntent.sessionToken

    let disposed = false
    let syncInterval: number | null = null
    let ws: WebSocket | null = new WebSocket(serverUrl)

    const stopInterval = () => {
      if (syncInterval !== null) {
        window.clearInterval(syncInterval)
        syncInterval = null
      }
    }

    const requestSync = () => {
      if (disposed || !ws || ws.readyState !== WebSocket.OPEN) {
        return
      }

      ws.send(JSON.stringify({ event: 'profileSync' }))
    }

    ws.onopen = () => {
      if (disposed || !ws) {
        ws?.close()
        return
      }

      ws.send(JSON.stringify({
        event: 'authToken',
        token: sessionToken,
      }))
    }

    ws.onmessage = (event) => {
      if (disposed || !ws) {
        return
      }

      const data = JSON.parse(event.data)
      if (data.event === 'authSuccess') {
        requestSync()
        stopInterval()
        syncInterval = window.setInterval(requestSync, 5000)
        return
      }

      if (data.event === 'profileSync') {
        const payload = data as ProfileSyncPayload
        applyAccountSnapshot(payload)
        if (shouldPersistSession) {
          persistStoredSession({
            token: sessionToken,
            expiresAtMs: sessionExpiresAtMs,
            username: payload.user.username,
            nickname: payload.user.nickname,
            tag: payload.user.tag,
          })
        }
        return
      }

      if (data.event === 'authError') {
        stopInterval()
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
        handleAuthFailure(translateBackendError(i18n.t.bind(i18n), data.code, data.reason))
      }
    }

    ws.onerror = () => {
      stopInterval()
    }

    ws.onclose = () => {
      stopInterval()
      ws = null
    }

    return () => {
      disposed = true
      stopInterval()
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close()
      }
      ws = null
    }
  }, [applyAccountSnapshot, authIntent, handleAuthFailure, persistStoredSession, screen, serverUrl, sessionExpiresAtMs, shouldPersistSession])

  return (
    <div className={`app-shell app-shell--${screen}`}>
      <div className="app-shell__backdrop" />
      <div className="app-shell__frame">
        {showTitleBar && <TitleBar />}
        <main className={`app-shell__viewport ${showTitleBar ? '' : 'app-shell__viewport--fullscreen'}`}>
          <div className="app-shell__stage">
            {showSettingsButton && (
              <button
                type="button"
                className="app-shell__settings-button"
                onClick={() => setSettingsOpen(true)}
                title={i18n.t('settings.title')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M10.5 2h3l.6 2.45a7.86 7.86 0 0 1 1.9.79l2.19-1.23 2.12 2.12-1.23 2.19c.31.6.58 1.24.79 1.9L22 10.5v3l-2.45.6a7.86 7.86 0 0 1-.79 1.9l1.23 2.19-2.12 2.12-2.19-1.23a7.86 7.86 0 0 1-1.9.79L13.5 22h-3l-.6-2.45a7.86 7.86 0 0 1-1.9-.79l-2.19 1.23-2.12-2.12 1.23-2.19a7.86 7.86 0 0 1-.79-1.9L2 13.5v-3l2.45-.6c.17-.66.44-1.3.79-1.9L4.01 5.81l2.12-2.12 2.19 1.23c.6-.31 1.24-.58 1.9-.79L10.5 2Z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
            )}
            <div key={screen} className={`app-scene app-scene--${screen}`}>
              {screen === 'splash' && <SplashScreen />}
              {screen === 'name' && (
                <NameScreen
                  authError={authError}
                  authInfo={authInfo}
                  initialMode={nameScreenMode}
                  isBusy={authPending}
                  onLanguageChange={handleLanguageChange}
                  onStart={handleNameEnter}
                />
              )}
              {screen === 'loading' && (
                <LoadingScreen
                  status={loadingStatus}
                  retryCount={retryCount}
                  error={connError}
                  onRetry={testConnection}
                />
              )}
              {screen === 'home' && (
                <HomeScreen
                  nickname={`${playerName}${playerTag}`}
                  coins={playerCoins}
                  isBusy={enterArenaPending}
                  onEnterArena={handleEnterArena}
                />
              )}
              {screen === 'select' && (
                <SelectScreen
                  playerName={playerName}
                  selectionLockedUntil={selectionLockedUntil}
                  onSelect={handleSelectCharacter}
                />
              )}
              {screen === 'arena' && (
                <Arena
                  playerName={playerName}
                  authIntent={authIntent}
                  characterId={characterId}
                  onAuthenticated={handleAuthenticated}
                  onAuthFailure={handleAuthFailure}
                  onReturnToHome={handleReturnToHome}
                  onReturnToSelect={handleReturnToSelect}
                />
              )}
            </div>
          </div>
        </main>
        {settingsOpen && (
          <SettingsPanel
            currentLanguage={currentLanguage}
            onChangeLanguage={handleLanguageChange}
            onClose={() => setSettingsOpen(false)}
            onLogout={handleLogout}
            onQuit={handleQuitGame}
            onUpdateSettings={applyShellSettings}
            settings={shellSettings}
            showLogout={screen === 'home'}
          />
        )}
      </div>
    </div>
  )
}

export default App
