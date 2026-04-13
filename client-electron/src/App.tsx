import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { NameScreen } from './components/NameScreen/NameScreen'
import { HomeScreen } from './components/HomeScreen/HomeScreen'
import { FriendListEntry, IncomingFriendRequest, OutgoingFriendRequest } from './components/FriendListPanel/FriendListPanel'
import { FriendListPanel } from './components/FriendListPanel/FriendListPanel'
import { PrivateChatMessage } from './components/PrivateChatPanel/PrivateChatPanel'
import { PrivateChatPanel } from './components/PrivateChatPanel/PrivateChatPanel'
import { SelectScreen } from './components/SelectScreen/SelectScreen'
import { ProfileScreen } from './components/ProfileScreen/ProfileScreen'
import { CollectionScreen } from './components/CollectionScreen/CollectionScreen'
import { AdminLookupResult, AdminReportRecord, AdminScreen } from './components/AdminScreen/AdminScreen'
import { ReportModal, ReportReasonCode } from './components/ReportModal/ReportModal'
import { Arena } from './components/Arena/Arena'
import { LoadingScreen } from './components/LoadingScreen/LoadingScreen'
import { SplashScreen } from './components/SplashScreen/SplashScreen'
import { SettingsPanel, ShellSettings } from './components/SettingsPanel/SettingsPanel'
import { TitleBar } from './components/TitleBar/TitleBar'
import { ArenaAuthIntent, ArenaChatMessage, AuthSuccessPayload, ProfileSyncPayload } from './hooks/useSocket'
import i18n, { AppLanguage, supportedLanguages } from './i18n'
import { translateBackendError } from './i18n/translateBackendError'
import { AuthoritativeCharacterDefinition, AuthoritativePassiveDefinition, AuthoritativeSpellDefinition } from './types/gameplay'
import './App.css'

type Screen = 'splash' | 'name' | 'loading' | 'home' | 'profile' | 'collection' | 'admin' | 'select' | 'arena'
const AUTH_SESSION_STORAGE_KEY = 'dragon-arena-auth-session'
const SHELL_SETTINGS_STORAGE_KEY = 'dragon-arena-shell-settings'
const MAX_OPEN_PRIVATE_CHATS = 4
const DEFAULT_SHELL_SETTINGS: ShellSettings = {
  displayMode: 'borderless',
  resolution: { width: 1600, height: 900 },
}

function getIpcRenderer() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as typeof window & {
    ipcRenderer?: {
      invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }).ipcRenderer
}

interface StoredAuthSession {
  token: string
  expiresAtMs: number
  username: string
  nickname: string
  tag: string
}

interface PrivateConversationSummary {
  friendUserId: number
  nickname: string
  tag: string
  online: boolean
  unreadCount: number
  lastMessagePreview: string
  lastMessageAt: number
}

interface LobbyContentPayload {
  event: 'contentSync'
  contentHash?: string
  characters: Record<string, AuthoritativeCharacterDefinition>
  spells: Record<string, AuthoritativeSpellDefinition>
  passives: Record<string, AuthoritativePassiveDefinition>
}

type AppUpdateStatus = 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'not-available'

interface AppUpdateState {
  status: AppUpdateStatus
  currentVersion: string
  availableVersion?: string
  progressPercent?: number
  transferredBytes?: number
  totalBytes?: number
  message?: string
  error?: string
}

interface ReportTargetDraft {
  nickname: string
  tag: string
}

type ArenaLaunchMode = 'training' | 'match'

interface PendingMatchInvite {
  matchId: string
  acceptDeadlineMs: number
  durationMs: number
  opponent: {
    userId: number
    nickname: string
    tag: string
    characterId: string
  }
}

interface MatchResultState {
  result: 'victory' | 'defeat' | 'draw'
  reason: 'time_limit' | 'disconnect'
  yourKills: number
  yourDeaths: number
  opponentKills: number
  opponentDeaths: number
}

function App() {
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState | null>(null)
  const [shellSettings, setShellSettings] = useState<ShellSettings>(DEFAULT_SHELL_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [screen, setScreen] = useState<Screen>('splash')
  const [bootReady, setBootReady] = useState(false)
  const [playerUserId, setPlayerUserId] = useState<number | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [playerTag, setPlayerTag] = useState('')
  const [playerCoins, setPlayerCoins] = useState(0)
  const [playerRole, setPlayerRole] = useState('player')
  const [sessionExpiresAtMs, setSessionExpiresAtMs] = useState(0)
  const [shouldPersistSession, setShouldPersistSession] = useState(false)
  const [authIntent, setAuthIntent] = useState<ArenaAuthIntent | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authInfo, setAuthInfo] = useState<string | null>(null)
  const [nameScreenMode, setNameScreenMode] = useState<'login' | 'register'>('login')
  const [characterId, setCharacterId] = useState<string>('meteor')
  const [selectionLockedUntil, setSelectionLockedUntil] = useState<number | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(() => i18n.t('app.initializing'))
  const [retryCount, setRetryCount] = useState(0)
  const [connError, setConnError] = useState<string | null>(null)
  const [authPending, setAuthPending] = useState(false)
  const [enterArenaPending, setEnterArenaPending] = useState(false)
  const [pendingArenaLaunchMode, setPendingArenaLaunchMode] = useState<ArenaLaunchMode | null>(null)
  const [arenaJoinMode, setArenaJoinMode] = useState<ArenaLaunchMode>('training')
  const [arenaMatchId, setArenaMatchId] = useState<string | null>(null)
  const [matchmakingActive, setMatchmakingActive] = useState(false)
  const [matchmakingStartedAtMs, setMatchmakingStartedAtMs] = useState<number | null>(null)
  const [matchmakingElapsedSeconds, setMatchmakingElapsedSeconds] = useState(0)
  const [pendingMatchInvite, setPendingMatchInvite] = useState<PendingMatchInvite | null>(null)
  const [matchAcceptBusy, setMatchAcceptBusy] = useState(false)
  const [acceptCountdownSeconds, setAcceptCountdownSeconds] = useState(20)
  const [acceptTotalSeconds, setAcceptTotalSeconds] = useState(20)
  const [matchmakingInfo, setMatchmakingInfo] = useState<string | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResultState | null>(null)
  const [friendPanelExpanded, setFriendPanelExpanded] = useState(false)
  const [friendNotificationCount, setFriendNotificationCount] = useState(0)
  const [friends, setFriends] = useState<FriendListEntry[]>([])
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<IncomingFriendRequest[]>([])
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<OutgoingFriendRequest[]>([])
  const [privateConversations, setPrivateConversations] = useState<PrivateConversationSummary[]>([])
  const [privateMessagesByFriendId, setPrivateMessagesByFriendId] = useState<Record<number, PrivateChatMessage[]>>({})
  const [openPrivateChatFriendIds, setOpenPrivateChatFriendIds] = useState<number[]>([])
  const [privateChatMinimizedByFriendId, setPrivateChatMinimizedByFriendId] = useState<Record<number, boolean>>({})
  const [privateChatSendBusyByFriendId, setPrivateChatSendBusyByFriendId] = useState<Record<number, boolean>>({})
  const [lobbyContent, setLobbyContent] = useState<LobbyContentPayload | null>(null)
  const [arenaReplyTarget, setArenaReplyTarget] = useState<{ userId: number, label: string } | null>(null)
  const [friendSendBusy, setFriendSendBusy] = useState(false)
  const [friendSendError, setFriendSendError] = useState<string | null>(null)
  const [friendSendInfo, setFriendSendInfo] = useState<string | null>(null)
  const [friendActionBusyRequestId, setFriendActionBusyRequestId] = useState<number | null>(null)
  const [adminLookupResult, setAdminLookupResult] = useState<AdminLookupResult | null>(null)
  const [adminReports, setAdminReports] = useState<AdminReportRecord[]>([])
  const [adminLookupBusy, setAdminLookupBusy] = useState(false)
  const [adminReportsBusy, setAdminReportsBusy] = useState(false)
  const [adminActionBusy, setAdminActionBusy] = useState(false)
  const [adminFeedbackError, setAdminFeedbackError] = useState<string | null>(null)
  const [adminFeedbackInfo, setAdminFeedbackInfo] = useState<string | null>(null)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportInfo, setReportInfo] = useState<string | null>(null)
  const [reportInitialTarget, setReportInitialTarget] = useState<ReportTargetDraft | null>(null)
  const attemptedStoredSessionRef = useRef(false)
  const lobbySocketRef = useRef<WebSocket | null>(null)
  const lastIncomingRequestIdsRef = useRef<number[]>([])
  const lastAdminLookupRef = useRef<{ nickname: string, tag: string } | null>(null)
  const pendingAcceptedReportIdRef = useRef<number | null>(null)
  const reportCloseTimeoutRef = useRef<number | null>(null)
  const openPrivateChatFriendIdsRef = useRef<number[]>([])
  const privateChatMinimizedByFriendIdRef = useRef<Record<number, boolean>>({})
  const friendPanelExpandedRef = useRef(false)
  const shouldPersistSessionRef = useRef(false)
  const sessionExpiresAtMsRef = useRef(0)
  const matchAcceptBusyRef = useRef(false)
  const characterIdRef = useRef(characterId)

  // Keep matchAcceptBusyRef in sync so socket closures read the current value
  useEffect(() => {
    matchAcceptBusyRef.current = matchAcceptBusy
  }, [matchAcceptBusy])

  // Keep characterIdRef in sync so socket closures read the current character
  useEffect(() => {
    characterIdRef.current = characterId
  }, [characterId])

  // Track elapsed seconds in the matchmaking queue
  useEffect(() => {
    if (!matchmakingActive || matchmakingStartedAtMs === null) {
      setMatchmakingElapsedSeconds(0)
      return
    }
    const tick = () => {
      setMatchmakingElapsedSeconds(Math.floor((Date.now() - matchmakingStartedAtMs) / 1000))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [matchmakingActive, matchmakingStartedAtMs])

  // Countdown for the accept-match modal.
  // The server sets MATCH_ACCEPT_TIMEOUT_MS = 20 000 ms and uses steady_clock
  // (monotonic), so acceptDeadlineMs is NOT a Unix timestamp and cannot be
  // compared against Date.now(). We drive the bar with a fixed 20-second
  // client-local countdown that starts the moment the invite arrives.
  useEffect(() => {
    if (!pendingMatchInvite) {
      setAcceptCountdownSeconds(20)
      setAcceptTotalSeconds(20)
      return
    }
    const WINDOW = 20
    setAcceptTotalSeconds(WINDOW)
    setAcceptCountdownSeconds(WINDOW)
    const arrivedAt = Date.now()
    const tick = () => {
      const elapsed = Math.floor((Date.now() - arrivedAt) / 1000)
      setAcceptCountdownSeconds(Math.max(0, WINDOW - elapsed))
    }
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [pendingMatchInvite])

  const currentLanguage = (supportedLanguages.includes(i18n.language as AppLanguage)
    ? i18n.language
    : 'pt-BR') as AppLanguage
  const showTitleBar = shellSettings.displayMode !== 'fullscreen'
  const isAuthenticatedScreen = ['home', 'profile', 'collection', 'admin', 'select', 'arena'].includes(screen)
  const isLobbyScreen = ['home', 'profile', 'collection', 'admin', 'select'].includes(screen)
  const showSettingsButton = isLobbyScreen
  const activeMenuView = screen === 'profile' || screen === 'collection' || screen === 'admin' ? screen : 'home'
  const appUpdateBlocking = !!appUpdateState && ['checking', 'available', 'downloading', 'downloaded', 'error'].includes(appUpdateState.status)
  const appUpdateTitle = useMemo(() => {
    if (!appUpdateState) {
      return i18n.t('appUpdate.titles.default')
    }

    if (appUpdateState.status === 'downloaded') {
      return i18n.t('appUpdate.titles.downloaded')
    }

    if (appUpdateState.status === 'error') {
      return i18n.t('appUpdate.titles.error')
    }

    return i18n.t('appUpdate.titles.default')
  }, [appUpdateState])
  const appUpdateStatusMessage = useMemo(() => {
    if (!appUpdateState) {
      return i18n.t('appUpdate.status.checking')
    }

    switch (appUpdateState.status) {
      case 'disabled':
        return i18n.t('appUpdate.status.disabled')
      case 'idle':
        return i18n.t('appUpdate.status.idle')
      case 'checking':
        return i18n.t('appUpdate.status.checking')
      case 'available':
        return i18n.t('appUpdate.status.available', { version: appUpdateState.availableVersion || '-' })
      case 'downloading':
        return i18n.t('appUpdate.status.downloading', { version: appUpdateState.availableVersion || '-' })
      case 'downloaded':
        return i18n.t('appUpdate.status.downloaded', { version: appUpdateState.availableVersion || '-' })
      case 'error':
        return i18n.t('appUpdate.status.error')
      case 'not-available':
        return i18n.t('appUpdate.status.notAvailable')
      default:
        return i18n.t('appUpdate.status.checking')
    }
  }, [appUpdateState])
  const appUpdateGateMessage = useMemo(() => {
    if (!appUpdateState) {
      return i18n.t('appUpdate.gate.waiting')
    }

    return appUpdateState.status === 'error'
      ? i18n.t('appUpdate.gate.error')
      : i18n.t('appUpdate.gate.required')
  }, [appUpdateState])

  const formatUpdateBytes = useCallback((bytes?: number) => {
    if (!bytes || bytes <= 0) {
      return '0 MB'
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }, [])

  const handleRetryAppUpdateCheck = useCallback(async () => {
    const ipc = getIpcRenderer()
    if (!ipc?.invoke) {
      return
    }
    const nextState = await ipc.invoke('app-update-check') as AppUpdateState
    setAppUpdateState(nextState)
  }, [])

  const handleInstallAppUpdate = useCallback(async () => {
    const ipc = getIpcRenderer()
    if (!ipc?.invoke) {
      return
    }
    await ipc.invoke('app-update-install')
  }, [])

  useEffect(() => {
    const ipc = getIpcRenderer()
    if (!ipc?.on || !ipc?.off || !ipc?.invoke) {
      return
    }

    const handleUpdateStatus = (_event: unknown, nextState: AppUpdateState) => {
      setAppUpdateState(nextState)
    }

    ipc.on('app-update-status', handleUpdateStatus)
    void ipc.invoke('app-update-get-state').then((state) => {
      setAppUpdateState(state as AppUpdateState)
    })

    return () => {
      ipc.off('app-update-status', handleUpdateStatus)
    }
  }, [])

  const formatAuthErrorMessage = useCallback((payload: { code?: string, reason?: string, isPermanent?: boolean, banReason?: string, bannedUntilMs?: number }) => {
    if (payload.code === 'user_banned') {
      const reason = payload.banReason || payload.reason || '-'
      if (payload.isPermanent) {
        return i18n.t('errors.auth.user_banned_permanent', { reason })
      }

      if (typeof payload.bannedUntilMs === 'number' && payload.bannedUntilMs > 0) {
        const formattedDate = new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(payload.bannedUntilMs)
        return i18n.t('errors.auth.user_banned_until', { reason, date: formattedDate })
      }
    }

    return translateBackendError(i18n.t.bind(i18n), payload.code, payload.reason)
  }, [])

  const applyAccountSnapshot = useCallback((payload: Pick<AuthSuccessPayload, 'user' | 'profile'>) => {
    setPlayerUserId(payload.user.id)
    setPlayerName(payload.user.nickname || payload.user.username)
    setPlayerTag(payload.user.tag || '')
    setPlayerCoins(payload.profile.coins ?? 0)
    setPlayerRole(payload.user.role || 'player')
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

  const testConnection = useCallback(async (options?: { targetScreen?: Screen, preserveCurrentScreen?: boolean }) => {
    if (appUpdateBlocking) {
      setAuthError(appUpdateGateMessage)
      setScreen('name')
      return
    }

    if (!options?.preserveCurrentScreen) {
      setScreen('loading')
    }
    setConnError(null)

    setRetryCount(current => current + 1)
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

      const nextScreen = options?.targetScreen || 'home'
      setLoadingStatus(i18n.t(nextScreen === 'name' ? 'app.successPreparingLogin' : 'app.successPreparingHome'))
      window.setTimeout(() => setScreen(nextScreen), 350)
    } catch {
      setConnError(i18n.t('app.connectionError'))
    }
  }, [appUpdateBlocking, appUpdateGateMessage, serverUrl])

  const authenticate = useCallback((nextAuthIntent: ArenaAuthIntent, options?: { showLoadingScreen?: boolean }) => {
    if (!appUpdateState || appUpdateBlocking) {
      return Promise.reject(new Error(appUpdateGateMessage))
    }

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
          reject(new Error(formatAuthErrorMessage(data)))
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
  }, [appUpdateBlocking, appUpdateGateMessage, appUpdateState, formatAuthErrorMessage, serverUrl])

  const handleNameEnter = useCallback(async (nextAuthIntent: ArenaAuthIntent) => {
    if (!appUpdateState || appUpdateBlocking) {
      setAuthError(appUpdateGateMessage)
      setAuthInfo(null)
      setScreen('name')
      return
    }

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
  }, [appUpdateBlocking, appUpdateGateMessage, appUpdateState, applyAccountSnapshot, authenticate, clearPersistedSession, persistSession])

  const handleSelectCharacter = (id: string) => {
    if (selectionLockedUntil !== null && Date.now() < selectionLockedUntil) {
      return
    }
    setCharacterId(id)
    if (pendingArenaLaunchMode === 'match') {
      if (lobbySocketRef.current?.readyState !== WebSocket.OPEN) {
        setMatchmakingInfo(i18n.t('matchmaking.connectionUnavailable'))
        return
      }

      setMatchmakingInfo(null)
      setMatchmakingActive(true)
      setMatchmakingStartedAtMs(Date.now())
      setPendingMatchInvite(null)
      setArenaMatchId(null)
      lobbySocketRef.current.send(JSON.stringify({
        event: 'queueMatch',
        characterId: id,
      }))
      setScreen('home')
      return
    }

    setArenaJoinMode('training')
    setArenaMatchId(null)
    setScreen('arena')
  }

  const handleAuthFailure = useCallback((message: string) => {
    if (authIntent?.mode === 'session') {
      clearPersistedSession()
      setAuthIntent(null)
    }
    setPlayerUserId(null)
    setSessionExpiresAtMs(0)
    setShouldPersistSession(false)
    setPendingArenaLaunchMode(null)
    setArenaJoinMode('training')
    setArenaMatchId(null)
    setMatchmakingActive(false)
    setMatchmakingStartedAtMs(null)
    setPendingMatchInvite(null)
    setMatchAcceptBusy(false)
    setMatchmakingInfo(null)
    setMatchResult(null)
    setFriendPanelExpanded(false)
    setFriendNotificationCount(0)
    setFriends([])
    setIncomingFriendRequests([])
    setOutgoingFriendRequests([])
    setPrivateConversations([])
    setPrivateMessagesByFriendId({})
    setOpenPrivateChatFriendIds([])
    setPrivateChatMinimizedByFriendId({})
    setPrivateChatSendBusyByFriendId({})
    setLobbyContent(null)
    setArenaReplyTarget(null)
    setFriendSendBusy(false)
    setFriendSendError(null)
    setFriendSendInfo(null)
    setFriendActionBusyRequestId(null)
    setAdminLookupResult(null)
    setAdminReports([])
    setAdminLookupBusy(false)
    setAdminReportsBusy(false)
    setAdminActionBusy(false)
    setAdminFeedbackError(null)
    setAdminFeedbackInfo(null)
    setReportModalOpen(false)
    setReportBusy(false)
    setReportError(null)
    setReportInfo(null)
    setReportInitialTarget(null)
    pendingAcceptedReportIdRef.current = null
    lastIncomingRequestIdsRef.current = []
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

  const handleEnterTraining = useCallback(() => {
    if (!appUpdateState || appUpdateBlocking) {
      setMatchmakingInfo(appUpdateGateMessage)
      return
    }

    setEnterArenaPending(true)
    setPendingArenaLaunchMode('training')
    window.setTimeout(() => {
      setEnterArenaPending(false)
      setScreen('select')
    }, 220)
  }, [appUpdateBlocking, appUpdateGateMessage, appUpdateState])

  const handleEnterMatchmaking = useCallback(() => {
    if (!appUpdateState || appUpdateBlocking) {
      setMatchmakingInfo(appUpdateGateMessage)
      return
    }

    setEnterArenaPending(true)
    setPendingArenaLaunchMode('match')
    window.setTimeout(() => {
      setEnterArenaPending(false)
      setScreen('select')
    }, 220)
  }, [appUpdateBlocking, appUpdateGateMessage, appUpdateState])

  const handleCancelMatchmaking = useCallback(() => {
    if (lobbySocketRef.current?.readyState === WebSocket.OPEN) {
      lobbySocketRef.current.send(JSON.stringify({ event: 'leaveQueue' }))
    }
    setMatchmakingActive(false)
    setMatchmakingStartedAtMs(null)
    setMatchmakingInfo(null)
  }, [])

  const handleAcceptMatch = useCallback(() => {
    if (!pendingMatchInvite || lobbySocketRef.current?.readyState !== WebSocket.OPEN) {
      return
    }

    setMatchAcceptBusy(true)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'acceptMatch',
      matchId: pendingMatchInvite.matchId,
    }))
  }, [pendingMatchInvite])

  const handleDeclineMatch = useCallback(() => {
    if (!pendingMatchInvite || lobbySocketRef.current?.readyState !== WebSocket.OPEN) {
      setPendingMatchInvite(null)
      setMatchmakingInfo(null)
      return
    }

    lobbySocketRef.current.send(JSON.stringify({
      event: 'declineMatch',
      matchId: pendingMatchInvite.matchId,
    }))
    setPendingMatchInvite(null)
    setMatchAcceptBusy(false)
    setMatchmakingInfo(null)
    setMatchmakingActive(false)
    setMatchmakingStartedAtMs(null)
  }, [pendingMatchInvite])

  const handleReturnToHome = useCallback(() => {
    setSelectionLockedUntil(null)
    setPendingArenaLaunchMode(null)
    setArenaMatchId(null)
    setArenaJoinMode('training')
    setScreen('home')
  }, [])

  const handleOpenProfile = useCallback(() => {
    setScreen('profile')
  }, [])

  const handleOpenCollection = useCallback(() => {
    setScreen('collection')
  }, [])

  const handleOpenAdmin = useCallback(() => {
    if (playerRole !== 'admin') {
      return
    }
    setScreen('admin')
    if (lobbySocketRef.current?.readyState === WebSocket.OPEN) {
      lobbySocketRef.current.send(JSON.stringify({ event: 'adminReportsSync' }))
      setAdminReportsBusy(true)
    }
  }, [playerRole])

  const handleToggleFriendPanel = useCallback(() => {
    setFriendPanelExpanded(current => {
      const next = !current
      if (next) {
        setFriendNotificationCount(0)
      }
      return next
    })
  }, [])

  const handleOpenPrivateChat = useCallback((friend: FriendListEntry) => {
    setOpenPrivateChatFriendIds(current => {
      const next = current.filter(friendUserId => friendUserId !== friend.userId)
      next.push(friend.userId)
      return next.slice(-MAX_OPEN_PRIVATE_CHATS)
    })
    setPrivateChatMinimizedByFriendId(current => ({
      ...current,
      [friend.userId]: false,
    }))

    if (lobbySocketRef.current?.readyState === WebSocket.OPEN) {
      lobbySocketRef.current.send(JSON.stringify({
        event: 'privateChatOpen',
        friendUserId: friend.userId,
      }))
      lobbySocketRef.current.send(JSON.stringify({
        event: 'privateMessagesMarkRead',
        friendUserId: friend.userId,
      }))
    }
  }, [])

  const handleTogglePrivateChatMinimized = useCallback((friendUserId: number) => {
    setPrivateChatMinimizedByFriendId(current => ({
      ...current,
      [friendUserId]: !current[friendUserId],
    }))
  }, [])

  const handleClosePrivateChat = useCallback((friendUserId: number) => {
    setOpenPrivateChatFriendIds(current => current.filter(id => id !== friendUserId))
    setPrivateChatMinimizedByFriendId(current => {
      const next = { ...current }
      delete next[friendUserId]
      return next
    })
    setPrivateChatSendBusyByFriendId(current => {
      const next = { ...current }
      delete next[friendUserId]
      return next
    })
  }, [])

  const handleSendPrivateMessage = useCallback((friendUserId: number, body: string) => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setFriendSendError(i18n.t('friends.connectionUnavailable'))
      setFriendSendInfo(null)
      return
    }

    setPrivateChatSendBusyByFriendId(current => ({
      ...current,
      [friendUserId]: true,
    }))
    setFriendSendError(null)
    setFriendSendInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'privateMessageSend',
      friendUserId,
      body,
    }))
  }, [])

  const handleSendFriendRequest = useCallback((nickname: string, tag: string) => {
    if (!nickname || !tag) {
      setFriendSendError(i18n.t('friends.invalidRequest'))
      setFriendSendInfo(null)
      return
    }

    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setFriendSendError(i18n.t('friends.connectionUnavailable'))
      setFriendSendInfo(null)
      return
    }

    setFriendSendBusy(true)
    setFriendSendError(null)
    setFriendSendInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'sendFriendRequest',
      nickname,
      tag,
    }))
  }, [])

  const handleRespondFriendRequest = useCallback((requestId: number, action: 'accept' | 'reject') => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setFriendSendError(i18n.t('friends.connectionUnavailable'))
      setFriendSendInfo(null)
      return
    }

    setFriendActionBusyRequestId(requestId)
    setFriendSendError(null)
    setFriendSendInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'respondFriendRequest',
      requestId,
      action,
    }))
  }, [])

  const handleCancelOutgoingFriendRequest = useCallback((requestId: number) => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setFriendSendError(i18n.t('friends.connectionUnavailable'))
      setFriendSendInfo(null)
      return
    }

    setFriendActionBusyRequestId(requestId)
    setFriendSendError(null)
    setFriendSendInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'cancelFriendRequest',
      requestId,
    }))
  }, [])

  const handleRemoveFriend = useCallback((friendUserId: number) => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setFriendSendError(i18n.t('friends.connectionUnavailable'))
      setFriendSendInfo(null)
      return
    }

    setFriendActionBusyRequestId(friendUserId)
    setFriendSendError(null)
    setFriendSendInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'removeFriend',
      friendUserId,
    }))
  }, [])

  const handleAdminSearch = useCallback((nickname: string, tag: string) => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setAdminFeedbackError(i18n.t('friends.connectionUnavailable'))
      setAdminFeedbackInfo(null)
      return
    }

    setAdminLookupBusy(true)
    setAdminActionBusy(false)
    setAdminFeedbackError(null)
    setAdminFeedbackInfo(null)
    lastAdminLookupRef.current = { nickname, tag }
    lobbySocketRef.current.send(JSON.stringify({
      event: 'adminLookupUser',
      nickname,
      tag,
    }))
  }, [])

  const handleAdminForceAddFriend = useCallback((targetUserId: number) => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setAdminFeedbackError(i18n.t('friends.connectionUnavailable'))
      setAdminFeedbackInfo(null)
      return
    }

    setAdminActionBusy(true)
    setAdminFeedbackError(null)
    setAdminFeedbackInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'adminForceAddFriend',
      targetUserId,
    }))
  }, [])

  const handleAdminBanUser = useCallback((targetUserId: number, reason: string, durationMs: number | null, isPermanent: boolean, reportId?: number) => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setAdminFeedbackError(i18n.t('friends.connectionUnavailable'))
      setAdminFeedbackInfo(null)
      return
    }

    pendingAcceptedReportIdRef.current = reportId ?? null
    setAdminActionBusy(true)
    setAdminFeedbackError(null)
    setAdminFeedbackInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'adminBanUser',
      targetUserId,
      reason,
      durationMs,
      isPermanent,
    }))
  }, [])

  const handleAdminUnbanUser = useCallback((targetUserId: number) => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setAdminFeedbackError(i18n.t('friends.connectionUnavailable'))
      setAdminFeedbackInfo(null)
      return
    }

    setAdminActionBusy(true)
    setAdminFeedbackError(null)
    setAdminFeedbackInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'adminUnbanUser',
      targetUserId,
    }))
  }, [])

  const handleOpenReportModal = useCallback((target?: Partial<ReportTargetDraft>) => {
    if (reportCloseTimeoutRef.current !== null) {
      window.clearTimeout(reportCloseTimeoutRef.current)
      reportCloseTimeoutRef.current = null
    }
    setReportInitialTarget(target?.nickname && target?.tag
      ? { nickname: target.nickname, tag: target.tag }
      : null)
    setReportError(null)
    setReportInfo(null)
    setReportModalOpen(true)
  }, [])

  const handleSubmitReport = useCallback((nickname: string, tag: string, reasonCodes: ReportReasonCode[], description: string) => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setReportError(i18n.t('friends.connectionUnavailable'))
      setReportInfo(null)
      return
    }

    setReportBusy(true)
    setReportError(null)
    setReportInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'submitPlayerReport',
      nickname,
      tag,
      reasonCodes,
      description,
    }))
  }, [])

  const handleRefreshAdminReports = useCallback(() => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setAdminFeedbackError(i18n.t('friends.connectionUnavailable'))
      setAdminFeedbackInfo(null)
      return
    }

    setAdminReportsBusy(true)
    setAdminFeedbackError(null)
    setAdminFeedbackInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'adminReportsSync',
    }))
  }, [])

  const handleResolveAdminReport = useCallback((reportId: number, action: 'accept' | 'reject') => {
    if (!lobbySocketRef.current || lobbySocketRef.current.readyState !== WebSocket.OPEN) {
      setAdminFeedbackError(i18n.t('friends.connectionUnavailable'))
      setAdminFeedbackInfo(null)
      return
    }

    setAdminActionBusy(true)
    setAdminFeedbackError(null)
    setAdminFeedbackInfo(null)
    lobbySocketRef.current.send(JSON.stringify({
      event: 'adminResolveReport',
      reportId,
      action,
    }))
  }, [])

  const handleLogout = useCallback(() => {
    if (reportCloseTimeoutRef.current !== null) {
      window.clearTimeout(reportCloseTimeoutRef.current)
      reportCloseTimeoutRef.current = null
    }
    clearPersistedSession()
    setSettingsOpen(false)
    setPlayerUserId(null)
    setShouldPersistSession(false)
    setSessionExpiresAtMs(0)
    setAuthIntent(null)
    setAuthError(null)
    setAuthInfo(null)
    setAuthPending(false)
    setEnterArenaPending(false)
    setPendingArenaLaunchMode(null)
    setArenaJoinMode('training')
    setArenaMatchId(null)
    setMatchmakingActive(false)
    setMatchmakingStartedAtMs(null)
    setPendingMatchInvite(null)
    setMatchAcceptBusy(false)
    setMatchmakingInfo(null)
    setMatchResult(null)
    setFriendPanelExpanded(false)
    setFriendNotificationCount(0)
    setFriends([])
    setIncomingFriendRequests([])
    setOutgoingFriendRequests([])
    setPrivateConversations([])
    setPrivateMessagesByFriendId({})
    setOpenPrivateChatFriendIds([])
    setPrivateChatMinimizedByFriendId({})
    setPrivateChatSendBusyByFriendId({})
    setArenaReplyTarget(null)
    setFriendSendBusy(false)
    setFriendSendError(null)
    setFriendSendInfo(null)
    setFriendActionBusyRequestId(null)
    setAdminLookupResult(null)
    setAdminReports([])
    setAdminLookupBusy(false)
    setAdminReportsBusy(false)
    setAdminActionBusy(false)
    setAdminFeedbackError(null)
    setAdminFeedbackInfo(null)
      setReportModalOpen(false)
      setReportBusy(false)
      setReportError(null)
      setReportInfo(null)
      setReportInitialTarget(null)
    pendingAcceptedReportIdRef.current = null
    lastAdminLookupRef.current = null
    lastIncomingRequestIdsRef.current = []
    setPlayerCoins(0)
    setPlayerRole('player')
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
    const ipcRenderer = getIpcRenderer()
    const applied = ipcRenderer?.invoke
      ? await ipcRenderer.invoke('window-apply-shell-settings', nextSettings)
      : nextSettings

    setShellSettings(applied as ShellSettings)
    localStorage.setItem(SHELL_SETTINGS_STORAGE_KEY, JSON.stringify(applied))
  }, [])

  const handleQuitGame = useCallback(() => {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer?.invoke) {
      return
    }

    void ipcRenderer.invoke('app-quit')
  }, [])

  useEffect(() => {
    openPrivateChatFriendIdsRef.current = openPrivateChatFriendIds
  }, [openPrivateChatFriendIds])

  useEffect(() => {
    privateChatMinimizedByFriendIdRef.current = privateChatMinimizedByFriendId
  }, [privateChatMinimizedByFriendId])

  useEffect(() => {
    friendPanelExpandedRef.current = friendPanelExpanded
  }, [friendPanelExpanded])

  useEffect(() => {
    shouldPersistSessionRef.current = shouldPersistSession
  }, [shouldPersistSession])

  useEffect(() => {
    sessionExpiresAtMsRef.current = sessionExpiresAtMs
  }, [sessionExpiresAtMs])

  useEffect(() => {
    const loadShellSettings = async () => {
      const ipcRenderer = getIpcRenderer()
      const fromMain = ipcRenderer?.invoke
        ? await ipcRenderer.invoke('window-get-shell-settings')
        : DEFAULT_SHELL_SETTINGS
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
      if (ipcRenderer?.invoke) {
        await ipcRenderer.invoke('window-apply-shell-settings', nextSettings)
      }
    }

    void loadShellSettings()
  }, [])

  useEffect(() => {
    if (!friendSendError && !friendSendInfo) {
      return
    }

    const timer = window.setTimeout(() => {
      setFriendSendError(null)
      setFriendSendInfo(null)
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [friendSendError, friendSendInfo])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBootReady(true)
    }, 1650)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!bootReady || attemptedStoredSessionRef.current || !appUpdateState || appUpdateBlocking) {
      return
    }

    if (attemptedStoredSessionRef.current) {
      return
    }
    attemptedStoredSessionRef.current = true

    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) {
      void testConnection({
        targetScreen: 'name',
        preserveCurrentScreen: true,
      })
      return
    }

    try {
      const session = JSON.parse(raw) as StoredAuthSession
      if (!session.token || !session.expiresAtMs || session.expiresAtMs <= Date.now()) {
        clearPersistedSession()
        void testConnection({
          targetScreen: 'name',
          preserveCurrentScreen: true,
        })
        return
      }

      setPlayerName(session.nickname || session.username || 'Player')
      setPlayerTag(session.tag || '')
      setPlayerCoins(0)
      setPlayerRole('player')
      setPlayerUserId(null)
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
      void testConnection({
        targetScreen: 'name',
        preserveCurrentScreen: true,
      })
    }
  }, [appUpdateBlocking, appUpdateState, bootReady, clearPersistedSession, handleNameEnter, testConnection])

  useEffect(() => {
    if (authIntent?.mode !== 'session' || !authIntent.sessionToken) {
      return
    }

    if (!['home', 'profile', 'collection', 'admin', 'select', 'arena'].includes(screen)) {
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
      ws.send(JSON.stringify({ event: 'contentSync' }))
      ws.send(JSON.stringify({ event: 'friendsSync' }))
      ws.send(JSON.stringify({ event: 'privateChatsSync' }))
      if (playerRole === 'admin') {
        ws.send(JSON.stringify({ event: 'adminReportsSync' }))
      }
    }

    ws.onopen = () => {
      if (disposed || !ws) {
        ws?.close()
        return
      }

      lobbySocketRef.current = ws

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
        if (shouldPersistSessionRef.current) {
          persistStoredSession({
            token: sessionToken,
            expiresAtMs: sessionExpiresAtMsRef.current,
            username: payload.user.username,
            nickname: payload.user.nickname,
            tag: payload.user.tag,
          })
        }
        return
      }

      if (data.event === 'contentSync') {
        setLobbyContent(data as LobbyContentPayload)
        return
      }

      if (data.event === 'friendsSync') {
        const nextFriends = (data.friends || []) as FriendListEntry[]
        const nextIncomingRequests = (data.incomingRequests || []) as IncomingFriendRequest[]
        const nextOutgoingRequests = (data.outgoingRequests || []) as OutgoingFriendRequest[]
        const nextRequestIds = nextIncomingRequests.map(request => request.requestId)

        if (!friendPanelExpandedRef.current) {
          const previousIds = new Set(lastIncomingRequestIdsRef.current)
          const newRequestCount = nextRequestIds.filter(requestId => !previousIds.has(requestId)).length
          if (newRequestCount > 0) {
            setFriendNotificationCount(current => current + newRequestCount)
          }
        } else {
          setFriendNotificationCount(0)
        }

        lastIncomingRequestIdsRef.current = nextRequestIds
        setFriends(nextFriends)
        setIncomingFriendRequests(nextIncomingRequests)
        setOutgoingFriendRequests(nextOutgoingRequests)
        setFriendSendBusy(false)
        setFriendActionBusyRequestId(null)
        return
      }

      if (data.event === 'privateChatsSync') {
        const nextConversations = (data.conversations || []) as PrivateConversationSummary[]
        setPrivateConversations(nextConversations)
        setOpenPrivateChatFriendIds(current => current.filter(friendUserId => (
          nextConversations.some(conversation => conversation.friendUserId === friendUserId)
        )))
        return
      }

      if (data.event === 'privateChatHistory') {
        const friendUserId = Number(data.friendUserId)
        setPrivateMessagesByFriendId(prev => ({
          ...prev,
          [friendUserId]: (data.messages || []) as PrivateChatMessage[],
        }))
        setPrivateChatSendBusyByFriendId(prev => ({
          ...prev,
          [friendUserId]: false,
        }))
        return
      }

      if (data.event === 'privateMessageReceived') {
        const friendUserId = Number(data.friendUserId)
        const nextMessage = data.message as PrivateChatMessage
        setPrivateMessagesByFriendId(prev => ({
          ...prev,
          [friendUserId]: [...(prev[friendUserId] || []), nextMessage],
        }))

        const isOpen = openPrivateChatFriendIdsRef.current.includes(friendUserId)
        const isMinimized = privateChatMinimizedByFriendIdRef.current[friendUserId] ?? false

        if (isOpen && !isMinimized && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            event: 'privateMessagesMarkRead',
            friendUserId,
          }))
        }
        requestSync()
        return
      }

      if (data.event === 'privateMessageSent') {
        const friendUserId = Number(data.friendUserId)
        const nextMessage = data.message as PrivateChatMessage
        setPrivateMessagesByFriendId(prev => ({
          ...prev,
          [friendUserId]: [...(prev[friendUserId] || []), nextMessage],
        }))
        setPrivateChatSendBusyByFriendId(prev => ({
          ...prev,
          [friendUserId]: false,
        }))
        requestSync()
        return
      }

      if (data.event === 'friendRequestSent') {
        setFriendSendBusy(false)
        setFriendSendError(null)
        setFriendSendInfo(i18n.t(
          data.mode === 'accepted_existing'
            ? 'friends.requestAcceptedExisting'
            : 'friends.requestSent'
        ))
        requestSync()
        return
      }

      if (data.event === 'friendRequestResponded') {
        setFriendActionBusyRequestId(null)
        setFriendSendError(null)
        setFriendSendInfo(i18n.t(
          data.action === 'accept'
            ? 'friends.requestAccepted'
            : 'friends.requestRejected'
        ))
        requestSync()
        return
      }

      if (data.event === 'friendRequestCancelled') {
        setFriendActionBusyRequestId(null)
        setFriendSendError(null)
        setFriendSendInfo(i18n.t('friends.requestCancelled'))
        requestSync()
        return
      }

      if (data.event === 'friendRemoved') {
        setFriendActionBusyRequestId(null)
        setFriendSendError(null)
        setFriendSendInfo(i18n.t('friends.removeSuccess'))
        handleClosePrivateChat(Number(data.friendUserId))
        requestSync()
        return
      }

      if (data.event === 'adminUserLookupResult') {
        setAdminLookupBusy(false)
        setAdminActionBusy(false)
        setAdminFeedbackError(null)
        setAdminFeedbackInfo(null)
        setAdminLookupResult(data as AdminLookupResult)
        return
      }

      if (data.event === 'adminReportsSync') {
        setAdminReportsBusy(false)
        setAdminActionBusy(false)
        setAdminFeedbackError(null)
        setAdminReports((data.reports || []) as AdminReportRecord[])
        return
      }

      if (data.event === 'matchQueueStarted') {
        setMatchmakingActive(true)
        setMatchmakingStartedAtMs(Date.now())
        setMatchmakingInfo(i18n.t('matchmaking.searching'))
        return
      }

      if (data.event === 'matchQueueCancelled') {
        setMatchmakingActive(false)
        setMatchmakingStartedAtMs(null)
        setMatchmakingInfo(null)
        setPendingMatchInvite(null)
        setMatchAcceptBusy(false)
        return
      }

      if (data.event === 'matchFound') {
        setMatchmakingActive(false)
        setMatchmakingStartedAtMs(null)
        setMatchmakingInfo(null)
        setMatchAcceptBusy(false)
        setPendingMatchInvite(data as PendingMatchInvite)
        return
      }

      if (data.event === 'matchCancelled') {
        const hadAccepted = matchAcceptBusyRef.current
        const reason = data.reason as string
        setPendingMatchInvite(null)
        setMatchAcceptBusy(false)
        setMatchmakingInfo(null)

        // 'declined': server never sends this to the player who declined, so
        // if WE receive it, the OTHER player declined — we re-enter the queue.
        // 'timeout' + hadAccepted: we did our part, re-enter the queue.
        // Anything else (timeout without accepting, cancelled): exit silently.
        const shouldRequeue = reason === 'declined' || (reason === 'timeout' && hadAccepted)

        if (shouldRequeue && lobbySocketRef.current?.readyState === WebSocket.OPEN) {
          setMatchmakingActive(true)
          setMatchmakingStartedAtMs(Date.now())
          lobbySocketRef.current.send(JSON.stringify({
            event: 'queueMatch',
            characterId: characterIdRef.current,
          }))
        } else {
          setMatchmakingActive(false)
          setMatchmakingStartedAtMs(null)
        }
        return
      }

      if (data.event === 'matchAccepted') {
        setMatchmakingInfo(null)
        setMatchAcceptBusy(true)
        return
      }

      if (data.event === 'matchReady') {
        setPendingMatchInvite(null)
        setMatchAcceptBusy(false)
        setMatchmakingActive(false)
        setMatchmakingStartedAtMs(null)
        setMatchmakingInfo(null)
        setArenaJoinMode('match')
        setArenaMatchId(data.matchId as string)
        setLoadingStatus(i18n.t('matchmaking.preparingMatch'))
        setScreen('loading')
        window.setTimeout(() => setScreen('arena'), 250)
        return
      }

      if (data.event === 'playerReportSubmitted') {
        setReportBusy(false)
        setReportError(null)
        setReportInfo(i18n.t('report.success'))
        if (reportCloseTimeoutRef.current !== null) {
          window.clearTimeout(reportCloseTimeoutRef.current)
        }
        reportCloseTimeoutRef.current = window.setTimeout(() => {
          setReportModalOpen(false)
          setReportInfo(null)
          setReportInitialTarget(null)
          reportCloseTimeoutRef.current = null
        }, 1400)
        return
      }

      if (data.event === 'adminActionSuccess') {
        setAdminLookupBusy(false)
        setAdminFeedbackError(null)
        setAdminFeedbackInfo(i18n.t(`admin.success.${data.action}`))

        if (data.action === 'ban_user' && pendingAcceptedReportIdRef.current && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            event: 'adminResolveReport',
            reportId: pendingAcceptedReportIdRef.current,
            action: 'accept',
          }))
          pendingAcceptedReportIdRef.current = null
        } else {
          setAdminActionBusy(false)
        }

        if (lastAdminLookupRef.current) {
          ws.send(JSON.stringify({
            event: 'adminLookupUser',
            nickname: lastAdminLookupRef.current.nickname,
            tag: lastAdminLookupRef.current.tag,
          }))
        }

        requestSync()
        return
      }

      if (data.event === 'authError') {
        stopInterval()
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
        handleAuthFailure(formatAuthErrorMessage(data))
        return
      }

      if (data.event === 'actionRejected' || data.event === 'protocolError') {
        const translatedMessage = translateBackendError(i18n.t.bind(i18n), data.code, data.reason)
        setFriendSendBusy(false)
        setReportBusy(false)
        setReportInfo(null)
        setPrivateChatSendBusyByFriendId({})
        setFriendActionBusyRequestId(null)
        setFriendSendInfo(null)
        if (typeof data.requestEvent === 'string' && data.requestEvent === 'submitPlayerReport') {
          setReportError(translatedMessage)
        } else if (typeof data.requestEvent === 'string' && ['queueMatch', 'leaveQueue', 'acceptMatch', 'declineMatch'].includes(data.requestEvent)) {
          setMatchmakingActive(false)
          setMatchAcceptBusy(false)
          setPendingMatchInvite(null)
          setMatchmakingInfo(translatedMessage)
        } else if (typeof data.requestEvent === 'string' && data.requestEvent.startsWith('admin')) {
          if (data.requestEvent === 'adminBanUser') {
            pendingAcceptedReportIdRef.current = null
          }
          setAdminLookupBusy(false)
          setAdminReportsBusy(false)
          setAdminActionBusy(false)
          setAdminFeedbackInfo(null)
          setAdminFeedbackError(translatedMessage)
        } else {
          setFriendSendError(translatedMessage)
        }
      }
    }

    ws.onerror = () => {
      stopInterval()
    }

    ws.onclose = () => {
      stopInterval()
      if (lobbySocketRef.current === ws) {
        lobbySocketRef.current = null
      }
      ws = null
    }

    return () => {
      disposed = true
      if (reportCloseTimeoutRef.current !== null) {
        window.clearTimeout(reportCloseTimeoutRef.current)
        reportCloseTimeoutRef.current = null
      }
      stopInterval()
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close()
      }
      if (lobbySocketRef.current === ws) {
        lobbySocketRef.current = null
      }
      ws = null
    }
  }, [applyAccountSnapshot, authIntent?.mode, authIntent?.sessionToken, formatAuthErrorMessage, handleAuthFailure, handleClosePrivateChat, persistStoredSession, playerRole, serverUrl])

  const privateUnreadByFriendId = useMemo(() => {
    const next: Record<number, number> = {}
    for (const conversation of privateConversations) {
      next[conversation.friendUserId] = conversation.unreadCount
    }
    return next
  }, [privateConversations])

  const openPrivateChats = useMemo(() => openPrivateChatFriendIds
    .map(friendUserId => {
      const friend = friends.find(entry => entry.userId === friendUserId)
        || privateConversations
          .filter(conversation => conversation.friendUserId === friendUserId)
          .map(conversation => ({
            userId: conversation.friendUserId,
            nickname: conversation.nickname,
            tag: conversation.tag,
            online: conversation.online,
          } as FriendListEntry))[0]

      if (!friend) {
        return null
      }

      return {
        friend,
        messages: privateMessagesByFriendId[friendUserId] || [],
        minimized: privateChatMinimizedByFriendId[friendUserId] ?? false,
        unreadCount: privateUnreadByFriendId[friendUserId] || 0,
        sendBusy: privateChatSendBusyByFriendId[friendUserId] ?? false,
      }
    })
    .filter((chat): chat is NonNullable<typeof chat> => chat !== null), [
    friends,
    openPrivateChatFriendIds,
    privateConversations,
    privateMessagesByFriendId,
    privateChatMinimizedByFriendId,
    privateChatSendBusyByFriendId,
    privateUnreadByFriendId,
  ])

  const closedChatUnreadCount = useMemo(() => privateConversations.reduce((total, conversation) => {
    if (openPrivateChatFriendIds.includes(conversation.friendUserId)) {
      return total
    }

    return total + conversation.unreadCount
  }, 0), [openPrivateChatFriendIds, privateConversations])

  const handleArenaChatMessage = useCallback((message: ArenaChatMessage) => {
    if (message.type === 'whisper_in' && message.senderUserId && message.senderNickname && message.senderTag) {
      setArenaReplyTarget({
        userId: message.senderUserId,
        label: `${message.senderNickname}${message.senderTag}`,
      })
    }
  }, [])

  const handleMatchEnded = useCallback((payload: MatchResultState) => {
    setMatchResult(payload)
    setPendingArenaLaunchMode(null)
    setArenaMatchId(null)
    setArenaJoinMode('training')
  }, [])

  return (
    <div className={`app-shell app-shell--${screen}`}>
      <div className="app-shell__backdrop" />
      <div className="app-shell__frame">
        {showTitleBar && <TitleBar />}
        <main className={`app-shell__viewport ${showTitleBar ? '' : 'app-shell__viewport--fullscreen'}`}>
          <div className="app-shell__stage">
            {showSettingsButton && (
              <div className="app-shell__top-actions">
                <button
                  type="button"
                  className={`app-shell__nav-button ${activeMenuView === 'home' ? 'is-active' : ''}`}
                  onClick={handleReturnToHome}
                >
                  {i18n.t('settings.menu.home')}
                </button>
                <button
                  type="button"
                  className={`app-shell__nav-button ${activeMenuView === 'profile' ? 'is-active' : ''}`}
                  onClick={handleOpenProfile}
                >
                  {i18n.t('settings.menu.profile')}
                </button>
                <button
                  type="button"
                  className={`app-shell__nav-button ${activeMenuView === 'collection' ? 'is-active' : ''}`}
                  onClick={handleOpenCollection}
                >
                  {i18n.t('settings.menu.collection')}
                </button>
                <button
                  type="button"
                  className="app-shell__nav-button"
                  onClick={() => handleOpenReportModal()}
                >
                  {i18n.t('settings.menu.report')}
                </button>
                {playerRole === 'admin' && (
                  <button
                    type="button"
                    className={`app-shell__nav-button ${activeMenuView === 'admin' ? 'is-active' : ''}`}
                    onClick={handleOpenAdmin}
                  >
                    {i18n.t('settings.menu.admin')}
                  </button>
                )}
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
              </div>
            )}
            <div key={screen} className={`app-scene app-scene--${screen}`}>
              {screen === 'splash' && (
                <SplashScreen
                  status={loadingStatus || i18n.t('splash.loading')}
                  retryCount={Math.max(1, retryCount)}
                  error={connError}
                  onRetry={() => {
                    void testConnection({
                      targetScreen: 'name',
                      preserveCurrentScreen: true,
                    })
                  }}
                />
              )}
              {screen === 'name' && (
                <NameScreen
                  authError={authError}
                  authInfo={authInfo}
                  initialMode={nameScreenMode}
                  isBusy={authPending}
                  versionLabel={appUpdateState?.currentVersion ? `version ${appUpdateState.currentVersion}` : null}
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
                  matchmakingActive={matchmakingActive}
                  matchmakingElapsedSeconds={matchmakingElapsedSeconds}
                  onEnterTraining={handleEnterTraining}
                  onEnterMatchmaking={handleEnterMatchmaking}
                  onCancelMatchmaking={handleCancelMatchmaking}
                />
              )}
              {screen === 'profile' && (
                <ProfileScreen
                  nickname={playerName}
                  tag={playerTag}
                  coins={playerCoins}
                />
              )}
              {screen === 'collection' && (
                <CollectionScreen
                  characters={lobbyContent?.characters || null}
                  spells={lobbyContent?.spells || null}
                  passives={lobbyContent?.passives || null}
                />
              )}
              {screen === 'admin' && playerRole === 'admin' && (
                <AdminScreen
                  result={adminLookupResult}
                  reports={adminReports}
                  searchBusy={adminLookupBusy}
                  reportsBusy={adminReportsBusy}
                  actionBusy={adminActionBusy}
                  feedbackError={adminFeedbackError}
                  feedbackInfo={adminFeedbackInfo}
                  onSearch={handleAdminSearch}
                  onRefreshReports={handleRefreshAdminReports}
                  onForceAddFriend={handleAdminForceAddFriend}
                  onBan={handleAdminBanUser}
                  onUnban={handleAdminUnbanUser}
                  onResolveReport={handleResolveAdminReport}
                />
              )}
              {screen === 'select' && (
                <SelectScreen
                  playerName={playerName}
                  selectionLockedUntil={selectionLockedUntil}
                  characters={lobbyContent?.characters || null}
                  spells={lobbyContent?.spells || null}
                  passives={lobbyContent?.passives || null}
                  onSelect={handleSelectCharacter}
                />
              )}
              {screen === 'arena' && (
                <Arena
                  playerUserId={playerUserId}
                  playerName={playerName}
                  authIntent={authIntent}
                  joinMode={arenaJoinMode}
                  matchId={arenaMatchId}
                  reportModalOpen={reportModalOpen}
                  characterId={characterId}
                  onAuthenticated={handleAuthenticated}
                  onAuthFailure={handleAuthFailure}
                  onArenaChatMessage={handleArenaChatMessage}
                  onMatchEnded={handleMatchEnded}
                  onOpenReportModal={handleOpenReportModal}
                  replyTarget={arenaReplyTarget}
                  onReturnToHome={handleReturnToHome}
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
            showLogout={isAuthenticatedScreen}
          />
        )}
        <ReportModal
          open={reportModalOpen}
          busy={reportBusy}
          error={reportError}
          info={reportInfo}
          initialNickname={reportInitialTarget?.nickname}
          initialTag={reportInitialTarget?.tag}
          onClose={() => {
            if (reportCloseTimeoutRef.current !== null) {
              window.clearTimeout(reportCloseTimeoutRef.current)
              reportCloseTimeoutRef.current = null
            }
            setReportModalOpen(false)
            setReportError(null)
            setReportInfo(null)
            setReportInitialTarget(null)
          }}
          onSubmit={handleSubmitReport}
        />
        {matchmakingInfo && !matchmakingActive && (
          <div className="matchmaking-overlay matchmaking-overlay--info" onClick={() => setMatchmakingInfo(null)}>
            <div className="matchmaking-card" onClick={e => e.stopPropagation()}>
              <span className="matchmaking-eyebrow">{i18n.t('matchmaking.eyebrow')}</span>
              <p>{matchmakingInfo}</p>
              <button
                type="button"
                className="matchmaking-button matchmaking-button--secondary"
                style={{ marginTop: 18 }}
                onClick={() => setMatchmakingInfo(null)}
              >
                OK
              </button>
            </div>
          </div>
        )}
        {pendingMatchInvite && (
          <div className="matchmaking-overlay">
            <div className="matchmaking-card">
              <span className="matchmaking-eyebrow">{i18n.t('matchmaking.matchFoundEyebrow')}</span>
              <h2>{i18n.t('matchmaking.matchFoundTitle')}</h2>
              <p>{i18n.t('matchmaking.matchFoundText', {
                opponent: `${pendingMatchInvite.opponent.nickname}${pendingMatchInvite.opponent.tag}`,
              })}</p>
              <div className="matchmaking-countdown">
                <div
                  className="matchmaking-countdown__bar"
                  style={{
                    width: `${(acceptCountdownSeconds / acceptTotalSeconds) * 100}%`,
                    background: acceptCountdownSeconds <= 5
                      ? 'linear-gradient(90deg, #ff4444 0%, #ff6b35 100%)'
                      : acceptCountdownSeconds <= Math.floor(acceptTotalSeconds / 2)
                        ? 'linear-gradient(90deg, #ffaa20 0%, #ffcc55 100%)'
                        : 'linear-gradient(90deg, #ffb347 0%, #ffd280 100%)',
                  }}
                />
                <span className="matchmaking-countdown__label">{acceptCountdownSeconds}s</span>
              </div>
              <div className="matchmaking-actions">
                <button
                  type="button"
                  className="matchmaking-button matchmaking-button--secondary"
                  disabled={matchAcceptBusy}
                  onClick={handleDeclineMatch}
                >
                  {i18n.t('matchmaking.decline')}
                </button>
                <button
                  type="button"
                  className="matchmaking-button"
                  disabled={matchAcceptBusy}
                  onClick={handleAcceptMatch}
                >
                  {matchAcceptBusy ? i18n.t('matchmaking.waitingOpponent') : i18n.t('matchmaking.accept')}
                </button>
              </div>
            </div>
          </div>
        )}
        {matchResult && (
          <div className="matchmaking-overlay">
            <div className="matchmaking-card">
              <span className="matchmaking-eyebrow">{i18n.t('matchmaking.resultEyebrow')}</span>
              <h2>{i18n.t(`matchmaking.result.${matchResult.result}`)}</h2>
              <p>{i18n.t(`matchmaking.finishReason.${matchResult.reason}`)}</p>
              <div className="matchmaking-result-grid">
                <div>
                  <span>{i18n.t('arena.kills')}</span>
                  <strong>{matchResult.yourKills}</strong>
                </div>
                <div>
                  <span>{i18n.t('arena.deaths')}</span>
                  <strong>{matchResult.yourDeaths}</strong>
                </div>
                <div>
                  <span>{i18n.t('matchmaking.opponentKills')}</span>
                  <strong>{matchResult.opponentKills}</strong>
                </div>
                <div>
                  <span>{i18n.t('matchmaking.opponentDeaths')}</span>
                  <strong>{matchResult.opponentDeaths}</strong>
                </div>
              </div>
              <button
                type="button"
                className="matchmaking-button"
                onClick={() => {
                  setMatchResult(null)
                  handleReturnToHome()
                }}
              >
                {i18n.t('matchmaking.backHome')}
              </button>
            </div>
          </div>
        )}
        {appUpdateBlocking && appUpdateState && (
          <div className="app-update-overlay">
            <div className="app-update-card">
              <span className="app-update-eyebrow">{i18n.t('appUpdate.eyebrow')}</span>
              <h2>{appUpdateTitle}</h2>
              <p>{appUpdateStatusMessage}</p>
              {appUpdateState.availableVersion && (
                <p className="app-update-meta">
                  {i18n.t('appUpdate.meta.versions', {
                    currentVersion: appUpdateState.currentVersion,
                    availableVersion: appUpdateState.availableVersion,
                  })}
                </p>
              )}
              {(appUpdateState.status === 'checking' || appUpdateState.status === 'available' || appUpdateState.status === 'downloading') && (
                <>
                  <div className="app-update-progress">
                    <div
                      className="app-update-progress__bar"
                      style={{ width: `${Math.max(6, Math.min(100, appUpdateState.progressPercent || 0))}%` }}
                    />
                  </div>
                  <div className="app-update-progress__meta">
                    <span>{Math.round(appUpdateState.progressPercent || 0)}%</span>
                    {(appUpdateState.transferredBytes || appUpdateState.totalBytes) && (
                      <span>{formatUpdateBytes(appUpdateState.transferredBytes)} / {formatUpdateBytes(appUpdateState.totalBytes)}</span>
                    )}
                  </div>
                </>
              )}
              {appUpdateState.status === 'downloaded' && (
                <div className="app-update-actions">
                  <button
                    type="button"
                    className="matchmaking-button"
                    onClick={handleInstallAppUpdate}
                  >
                    {i18n.t('appUpdate.actions.install')}
                  </button>
                </div>
              )}
              {appUpdateState.status === 'error' && (
                <div className="app-update-actions">
                  <button
                    type="button"
                    className="matchmaking-button"
                    onClick={handleRetryAppUpdateCheck}
                  >
                    {i18n.t('appUpdate.actions.retry')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {isLobbyScreen && (
          <>
            <FriendListPanel
              expanded={friendPanelExpanded}
              unreadCount={friendNotificationCount + closedChatUnreadCount}
              friends={friends}
              privateUnreadByFriendId={privateUnreadByFriendId}
              incomingRequests={incomingFriendRequests}
              outgoingRequests={outgoingFriendRequests}
              sendBusy={friendSendBusy}
              sendError={friendSendError}
              sendInfo={friendSendInfo}
              actionBusyRequestId={friendActionBusyRequestId}
              onToggleExpanded={handleToggleFriendPanel}
              onOpenChat={handleOpenPrivateChat}
              onSendRequest={handleSendFriendRequest}
              onRespondRequest={handleRespondFriendRequest}
              onCancelOutgoingRequest={handleCancelOutgoingFriendRequest}
              onRemoveFriend={handleRemoveFriend}
            />

            {openPrivateChats.map((chat, index) => (
              <PrivateChatPanel
                key={chat.friend.userId}
                friendLabel={`${chat.friend.nickname}${chat.friend.tag}`}
                online={chat.friend.online}
                unreadCount={chat.unreadCount}
                minimized={chat.minimized}
                messages={chat.messages}
                sendBusy={chat.sendBusy}
                style={{ right: `${396 + index * 344}px` }}
                onToggleMinimized={() => handleTogglePrivateChatMinimized(chat.friend.userId)}
                onClose={() => handleClosePrivateChat(chat.friend.userId)}
                onSend={(body) => handleSendPrivateMessage(chat.friend.userId, body)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default App
