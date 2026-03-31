import { useState, useCallback, useEffect, useRef } from 'react'
import { NameScreen } from './components/NameScreen/NameScreen'
import { SelectScreen } from './components/SelectScreen/SelectScreen'
import { Arena } from './components/Arena/Arena'
import { LoadingScreen } from './components/LoadingScreen/LoadingScreen'
import { TitleBar } from './components/TitleBar/TitleBar'
import { ArenaAuthIntent, AuthSuccessPayload } from './hooks/useSocket'
import './App.css'

type Screen = 'name' | 'loading' | 'select' | 'arena'
const AUTH_SESSION_STORAGE_KEY = 'dragon-arena-auth-session'

interface StoredAuthSession {
  token: string
  expiresAtMs: number
  username: string
  nickname: string
}

function App() {
  const [screen, setScreen] = useState<Screen>('name')
  const [playerName, setPlayerName] = useState('')
  const [authIntent, setAuthIntent] = useState<ArenaAuthIntent | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authInfo, setAuthInfo] = useState<string | null>(null)
  const [nameScreenMode, setNameScreenMode] = useState<'login' | 'register'>('login')
  const [characterId, setCharacterId] = useState<string>('charizard')
  const [selectionLockedUntil, setSelectionLockedUntil] = useState<number | null>(null)
  
  // Connectivity Test State
  const [loadingStatus, setLoadingStatus] = useState('Initializing...')
  const [retryCount, setRetryCount] = useState(0)
  const [connError, setConnError] = useState<string | null>(null)
  const attemptedStoredSessionRef = useRef(false)

  const persistSession = useCallback((payload: AuthSuccessPayload) => {
    const session: StoredAuthSession = {
      token: payload.sessionToken,
      expiresAtMs: payload.sessionExpiresAtMs,
      username: payload.user.username,
      nickname: payload.user.nickname,
    }
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
  }, [])

  const clearPersistedSession = useCallback(() => {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
  }, [])

  const serverUrl = (import.meta.env.VITE_SERVER_URL || 'ws://localhost:3001').replace('http', 'ws')

  const testConnection = useCallback(async () => {
    setScreen('loading')
    setConnError(null)
    
    for (let i = 1; i <= 6; i++) {
       setRetryCount(i)
       setLoadingStatus(`Connecting to Dragon Arena Server...`)
       
       try {
         await new Promise((resolve, reject) => {
           const ws = new WebSocket(serverUrl)
           const timeout = setTimeout(() => {
             ws.close()
             reject(new Error('Connection timeout'))
           }, 3500)

           ws.onopen = () => {
             clearTimeout(timeout)
             setTimeout(() => { ws.close(); resolve(true); }, 100)
           }
           ws.onerror = () => {
             clearTimeout(timeout)
             reject(new Error('Server unreachable'))
           }
         })
         
         // SUCCESS!
         setLoadingStatus('Success! Entering Arena...')
         setTimeout(() => setScreen('select'), 500)
         return 
       } catch (err) {
         if (i === 6) {
           setConnError('Could not establish connection to the Dragon Arena C++ server. Please check if the backend is running and reachable.')
         } else {
           await new Promise(r => setTimeout(r, i * 500)) // Exponential-ish backoff
         }
       }
    }
  }, [serverUrl])

  const authenticate = useCallback((nextAuthIntent: ArenaAuthIntent) => {
    setScreen('loading')
    setConnError(null)
    setRetryCount(1)
    setLoadingStatus(nextAuthIntent.mode === 'register' ? 'Creating account...' : 'Authenticating...')

    return new Promise<AuthSuccessPayload>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const timeout = window.setTimeout(() => {
        ws.close()
        reject(new Error('Authentication timeout'))
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
          reject(new Error(data.reason || 'Authentication failed'))
        }
      }

      ws.onerror = () => {
        cleanup()
        ws.close()
        reject(new Error('Could not reach the Dragon Arena server'))
      }

      ws.onclose = () => {
        cleanup()
      }
    })
  }, [serverUrl])

  // Called when the user submits their name
  const handleNameEnter = useCallback(async (nextAuthIntent: ArenaAuthIntent) => {
    setAuthError(null)
    setAuthInfo(null)
    setNameScreenMode(nextAuthIntent.mode === 'register' ? 'register' : 'login')

    try {
      const payload = await authenticate(nextAuthIntent)

      if (nextAuthIntent.mode === 'register') {
        setAuthInfo('Conta criada com sucesso. Agora faca login.')
        setNameScreenMode('login')
        setScreen('name')
        return
      }

      setPlayerName(payload.user.nickname || payload.user.username)
      persistSession(payload)
      setAuthIntent({
        mode: 'session',
        sessionToken: payload.sessionToken,
        username: payload.user.username,
        nickname: payload.user.nickname,
        password: '',
      })
      setScreen('select')
    } catch (error) {
      if (nextAuthIntent.mode === 'session') {
        clearPersistedSession()
        setAuthIntent(null)
      }
      setAuthError(error instanceof Error ? error.message : 'Authentication failed')
      setScreen('name')
    }
  }, [authenticate, clearPersistedSession, persistSession])

  // Called when the user picks a character
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

  const handleAuthFailure = (message: string) => {
    if (authIntent?.mode === 'session') {
      clearPersistedSession()
      setAuthIntent(null)
    }
    setAuthError(message)
    setNameScreenMode('login')
    setScreen('name')
  }

  const handleAuthenticated = useCallback((payload: AuthSuccessPayload) => {
    setPlayerName(payload.user.nickname || payload.user.username)
    persistSession(payload)
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
        password: '',
      }
    })
  }, [persistSession])

  useEffect(() => {
    if (attemptedStoredSessionRef.current) {
      return
    }
    attemptedStoredSessionRef.current = true

    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) {
      return
    }

    try {
      const session = JSON.parse(raw) as StoredAuthSession
      if (!session.token || !session.expiresAtMs || session.expiresAtMs <= Date.now()) {
        clearPersistedSession()
        return
      }

      setPlayerName(session.nickname || session.username || 'Player')
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
    }
  }, [clearPersistedSession, handleNameEnter])

  return (
    <>
      <TitleBar />
      {screen === 'name' && (
        <NameScreen authError={authError} authInfo={authInfo} initialMode={nameScreenMode} onStart={handleNameEnter} />
      )}
      {screen === 'loading' && (
        <LoadingScreen 
          status={loadingStatus} 
          retryCount={retryCount} 
          error={connError} 
          onRetry={testConnection} 
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
          onReturnToSelect={handleReturnToSelect}
        />
      )}
    </>
  )
}

export default App
