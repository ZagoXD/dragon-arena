import { useEffect, useRef, useState } from 'react'
import { Direction } from '../config/spriteMap'
import { GameplayBootstrap, SessionInitPayload, WorldSnapshotState } from '../types/gameplay'

const EXPECTED_PROTOCOL_VERSION = 2

export interface NetPlayer {
  id: string
  name: string
  role?: string
  characterId: string
  x: number
  y: number
  direction: Direction
  animRow: number
  hp: number
  maxHp: number
  shieldHp: number
  shieldMaxHp: number
  shieldEndTimeMs?: number
  kills: number
  deaths: number
  movementSpeed: number
  colliderWidth: number
  colliderHeight: number
  autoAttackSpellId: string
  skillIds: string[]
  passiveId: string
  isDashing?: boolean
}

export interface ProjectileSpawnEvent {
  id: string
  ownerId: string
  spellId: string
  x: number
  y: number
  angle: number
  distance?: number
}

export interface AutoAttackStartedEvent {
  tick?: number
  playerId: string
  spellId: string
  originX?: number
  originY?: number
  angle: number
  castTimeMs: number
  cooldownMs: number
}

export interface SkillUsedEvent {
  tick?: number
  id: string
  skillId: string
  targetX: number
  targetY: number
  originX?: number
  originY?: number
  angle?: number
  castTimeMs: number
  cooldownMs: number
  effectDurationMs: number
}

export type AuthMode = 'login' | 'register' | 'session'

export interface ArenaAuthIntent {
  mode: AuthMode
  email?: string
  username?: string
  nickname?: string
  identifier?: string
  sessionToken?: string
  rememberSession?: boolean
  password: string
}

export interface AuthSuccessPayload {
  event: 'authSuccess'
  mode: AuthMode
  user: {
    id: number
    email: string
    username: string
    nickname: string
    tag: string
    role: string
    createdAt: string
  }
  sessionToken: string
  sessionExpiresAtMs: number
  profile: {
    userId: number
    level: number
    xp: number
    coins: number
  }
}

export interface ProfileSyncPayload {
  event: 'profileSync'
  user: AuthSuccessPayload['user']
  profile: AuthSuccessPayload['profile']
}

export interface ArenaChatMessage {
  id?: number
  type: 'public' | 'whisper_in' | 'whisper_out' | 'system' | 'error'
  senderUserId?: number
  senderNickname?: string
  senderTag?: string
  targetUserId?: number
  targetLabel?: string
  body: string
  createdAt: number
}

export function useSocket(
  authIntent: ArenaAuthIntent,
  characterId: string,
  onCurrentDummies: (dummies: any[]) => void,
  onDummyDamaged: (id: string, hp: number) => void,
  onSelfDamaged: (newHp: number, shieldHp: number, shieldMaxHp: number, x?: number, y?: number, movementSpeed?: number) => void,
  onSelfMoved: (x: number, y: number, movementSpeed?: number) => void,
  onProjectileSpawned?: (projectile: ProjectileSpawnEvent) => void,
  onProjectileRemoved?: (projectileId: string) => void,
  onProjectilesSnapshot?: (projectiles: ProjectileSpawnEvent[]) => void,
  onAutoAttackStarted?: (event: AutoAttackStartedEvent) => void,
  onAutoAttackRejected?: () => void,
  onSkillUsed?: (event: SkillUsedEvent) => void,
  onSkillRejected?: (skillId: string) => void,
  onAuthSucceeded?: (payload: AuthSuccessPayload) => void,
  onAuthFailed?: (code: string, reason: string) => void,
  onArenaChatMessage?: (message: ArenaChatMessage) => void
) {
  const socketIdRef = useRef<string | undefined>(undefined)
  const [socketId, setSocketId] = useState<string | undefined>(undefined)
  const [mapData, setMapData] = useState<any | null>(null)
  const [bootstrap, setBootstrap] = useState<GameplayBootstrap | null>(null)
  const [otherPlayers, setOtherPlayers] = useState<Record<string, NetPlayer>>({})
  const [burnStatuses, setBurnStatuses] = useState<WorldSnapshotState['burnStatuses']>([])
  const [burnZones, setBurnZones] = useState<WorldSnapshotState['burnZones']>([])
  const [kills, setKills] = useState(0)
  const [deaths, setDeaths] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const latestSnapshotTickRef = useRef(0)
  const hasSessionInitRef = useRef(false)

  const onProjectileSpawnedRef = useRef(onProjectileSpawned)
  onProjectileSpawnedRef.current = onProjectileSpawned
  const onProjectileRemovedRef = useRef(onProjectileRemoved)
  onProjectileRemovedRef.current = onProjectileRemoved
  const onProjectilesSnapshotRef = useRef(onProjectilesSnapshot)
  onProjectilesSnapshotRef.current = onProjectilesSnapshot
  const onAutoAttackStartedRef = useRef(onAutoAttackStarted)
  onAutoAttackStartedRef.current = onAutoAttackStarted
  const onAutoAttackRejectedRef = useRef(onAutoAttackRejected)
  onAutoAttackRejectedRef.current = onAutoAttackRejected
  const onSkillUsedRef = useRef(onSkillUsed)
  onSkillUsedRef.current = onSkillUsed
  const onSkillRejectedRef = useRef(onSkillRejected)
  onSkillRejectedRef.current = onSkillRejected

  const serverUrl = (import.meta.env.VITE_SERVER_URL || 'ws://localhost:3001').replace('http', 'ws')

  useEffect(() => {
    let disposed = false
    let ws: WebSocket | null = null
    latestSnapshotTickRef.current = 0
    hasSessionInitRef.current = false

    const connectTimeout = window.setTimeout(() => {
      if (disposed) return

      const socket = new WebSocket(serverUrl)
      ws = socket
      wsRef.current = socket

      socket.onopen = () => {
        if (disposed) {
          socket.close()
          return
        }

        if (authIntent.mode === 'register') {
          socket.send(JSON.stringify({
            event: 'register',
            email: authIntent.email,
            username: authIntent.username,
            nickname: authIntent.nickname,
            password: authIntent.password,
          }))
        } else if (authIntent.mode === 'login') {
          socket.send(JSON.stringify({
            event: 'login',
            identifier: authIntent.identifier,
            password: authIntent.password,
          }))
        } else {
          socket.send(JSON.stringify({
            event: 'authToken',
            token: authIntent.sessionToken,
          }))
        }
      }

      socket.onmessage = (msgEvent) => {
        if (disposed) return

        const data = JSON.parse(msgEvent.data)
        const { event: eventName } = data

        switch (eventName) {
        case 'authSuccess': {
          const authPayload = data as AuthSuccessPayload
          onAuthSucceeded?.(authPayload)
          socket.send(JSON.stringify({
            event: 'join',
            characterId,
          }))
          break
        }

        case 'authError':
          console.error('Authentication error:', data.code || 'unknown', data.reason || '')
          onAuthFailed?.(data.code || 'auth_error', data.reason || 'Authentication failed')
          socket.close()
          break

        case 'sessionInit': {
          const session = data as SessionInitPayload
          if (session.protocolVersion !== EXPECTED_PROTOCOL_VERSION) {
            console.error(
              `Unsupported Dragon Arena protocol version ${session.protocolVersion}. Expected ${EXPECTED_PROTOCOL_VERSION}.`
            )
            break
          }
          const md = typeof session.map === 'string' ? JSON.parse(session.map) : session.map
          socketIdRef.current = session.selfId
          setSocketId(session.selfId)
          setBootstrap(session.bootstrap)
          setMapData(md)
          ;(window as any).currentGameMapData = md
          hasSessionInitRef.current = true
          latestSnapshotTickRef.current = session.snapshot.tick || 0

          const players = { ...(session.snapshot.players as Record<string, NetPlayer>) }
          if (players[session.selfId]) {
            const self = players[session.selfId]
            setKills(self.kills || 0)
            setDeaths(self.deaths || 0)
            onSelfDamaged(self.hp, self.shieldHp || 0, self.shieldMaxHp || 0, self.x, self.y, self.movementSpeed)
            delete players[session.selfId]
          } else if (session.bootstrap.player) {
            setKills(session.bootstrap.player.kills || 0)
            setDeaths(session.bootstrap.player.deaths || 0)
            onSelfDamaged(
              session.bootstrap.player.hp,
              session.bootstrap.player.shieldHp || 0,
              session.bootstrap.player.shieldMaxHp || 0,
              session.bootstrap.player.x,
              session.bootstrap.player.y,
              session.bootstrap.player.movementSpeed
            )
          }

          setOtherPlayers(players)
          onCurrentDummies(session.snapshot.dummies)
          onProjectilesSnapshotRef.current?.(session.snapshot.projectiles || [])
          setBurnStatuses(session.snapshot.burnStatuses || [])
          setBurnZones(session.snapshot.burnZones || [])
          break
        }

        case 'playerJoined':
          if (!hasSessionInitRef.current) break
          if (data.player.id === socketIdRef.current) break
          setOtherPlayers(prev => ({ ...prev, [data.player.id]: data.player }))
          break

        case 'playerMoved':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          if (data.id === socketIdRef.current) {
            onSelfMoved(data.x, data.y, data.movementSpeed)
          } else {
            setOtherPlayers(prev => {
              if (!prev[data.id]) return prev
              return {
                ...prev,
                [data.id]: {
                  ...prev[data.id],
                  x: data.x,
                  y: data.y,
                  direction: data.direction,
                  animRow: data.animRow,
                  isDashing: data.isDashing,
                },
              }
            })
          }
          break

        case 'playerDamaged':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          if (data.id === socketIdRef.current) {
            onSelfDamaged(data.hp, data.shieldHp || 0, data.shieldMaxHp || 0, undefined, undefined, data.movementSpeed)
          } else {
            setOtherPlayers(prev => {
              if (!prev[data.id]) return prev
              return { ...prev, [data.id]: { ...prev[data.id], hp: data.hp, shieldHp: data.shieldHp ?? prev[data.id].shieldHp, shieldMaxHp: data.shieldMaxHp ?? prev[data.id].shieldMaxHp } }
            })
          }
          break

        case 'dummyDamaged':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          onDummyDamaged(data.id, data.hp)
          break

        case 'playerScored':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          if (data.victimId === socketIdRef.current) setDeaths(data.targetDeaths)
          if (data.attackerId === socketIdRef.current) setKills(data.attackerKills)

          setOtherPlayers(prev => {
            const next = { ...prev }
            if (next[data.victimId]) {
              next[data.victimId] = { ...next[data.victimId], deaths: data.targetDeaths }
            }
            if (data.attackerId && next[data.attackerId]) {
              next[data.attackerId] = { ...next[data.attackerId], kills: data.attackerKills }
            }
            return next
          })
          break

        case 'playerRespawned':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          if (data.id === socketIdRef.current) {
            onSelfDamaged(data.hp, data.shieldHp || 0, data.shieldMaxHp || 0, data.x, data.y, data.movementSpeed)
          } else {
            setOtherPlayers(prev => {
              if (!prev[data.id]) return prev
              return { ...prev, [data.id]: { ...prev[data.id], hp: data.hp, shieldHp: data.shieldHp ?? prev[data.id].shieldHp, shieldMaxHp: data.shieldMaxHp ?? prev[data.id].shieldMaxHp, x: data.x, y: data.y } }
            })
          }
          break

        case 'playerShieldChanged':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          if (data.id === socketIdRef.current) {
            onSelfDamaged(
              data.hp ?? 0,
              data.shieldHp || 0,
              data.shieldMaxHp || 0
            )
          } else {
            setOtherPlayers(prev => {
              if (!prev[data.id]) return prev
              return {
                ...prev,
                [data.id]: {
                  ...prev[data.id],
                  shieldHp: data.shieldHp ?? prev[data.id].shieldHp,
                  shieldMaxHp: data.shieldMaxHp ?? prev[data.id].shieldMaxHp,
                },
              }
            })
          }
          break

        case 'playerLeft':
          setOtherPlayers(prev => {
            const next = { ...prev }
            delete next[data.id]
            return next
          })
          break

        case 'projectileSpawned':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          onProjectileSpawnedRef.current?.(data.projectile)
          break

        case 'projectileRemoved':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          onProjectileRemovedRef.current?.(data.id)
          break

        case 'worldSnapshot': {
          const snapshot = data as WorldSnapshotState & { event: string }
          const snapshotTick = snapshot.tick || 0
          if (snapshotTick <= latestSnapshotTickRef.current) break
          latestSnapshotTickRef.current = snapshotTick
          const players = { ...(snapshot.players as Record<string, NetPlayer>) }
          const selfId = socketIdRef.current
          if (selfId && players[selfId]) {
            const self = players[selfId]
            onSelfDamaged(self.hp, self.shieldHp || 0, self.shieldMaxHp || 0, self.x, self.y, self.movementSpeed)
            delete players[selfId]
          }
          setOtherPlayers(players)
          onCurrentDummies(snapshot.dummies)
          onProjectilesSnapshotRef.current?.(snapshot.projectiles || [])
          setBurnStatuses(snapshot.burnStatuses || [])
          setBurnZones(snapshot.burnZones || [])
          break
        }

        case 'autoAttackStarted':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          onAutoAttackStartedRef.current?.(data)
          break

        case 'autoAttackRejected':
          console.warn('Auto attack rejected:', data.code || 'unknown', data.reason || '')
          onAutoAttackRejectedRef.current?.()
          break

        case 'skillUsed':
          if (data.tick && data.tick < latestSnapshotTickRef.current) break
          onSkillUsedRef.current?.(data)
          break

        case 'skillRejected':
          console.warn('Skill rejected:', data.skillId, data.code || 'unknown', data.reason || '')
          onSkillRejectedRef.current?.(data.skillId)
          break

        case 'actionRejected':
          console.warn('Action rejected:', data.requestEvent, data.code || 'unknown', data.reason || '')
          if (data.requestEvent === 'shoot') onAutoAttackRejectedRef.current?.()
          if (data.requestEvent === 'useSkill' && typeof data.skillId === 'string') onSkillRejectedRef.current?.(data.skillId)
          break

        case 'protocolError':
          console.error('Protocol error:', data.code || 'unknown', data.reason || '')
          break

        case 'arenaMessage':
          onArenaChatMessage?.(data.message as ArenaChatMessage)
          break

        case 'arenaChatSync':
          for (const message of (data.messages || []) as ArenaChatMessage[]) {
            onArenaChatMessage?.(message)
          }
          break

        case 'arenaWhisper':
          if (data.message?.senderNickname) {
            onArenaChatMessage?.(data.message as ArenaChatMessage)
          } else {
            onArenaChatMessage?.({
              id: data.message?.id,
              type: 'whisper_in',
              senderUserId: data.friendUserId,
              senderNickname: data.nickname,
              senderTag: data.tag,
              body: data.message?.body || '',
              createdAt: data.message?.createdAt || Date.now(),
            })
          }
          break

        case 'arenaSystemMessage':
          onArenaChatMessage?.(data.message as ArenaChatMessage)
          break
        }
      }

      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null
        }
      }
    }, 0)

    return () => {
      disposed = true
      window.clearTimeout(connectTimeout)
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onclose = null
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
      }
      if (wsRef.current === ws) {
        wsRef.current = null
      }
    }
  }, [authIntent, characterId, serverUrl, onAuthFailed, onAuthSucceeded, onCurrentDummies, onDummyDamaged, onSelfDamaged, onSelfMoved])

  const emitMove = (inputX: number, inputY: number, direction: Direction, animRow: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'move', inputX, inputY, direction, animRow }))
    }
  }

  const emitShoot = (targetX: number, targetY: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'shoot', targetX, targetY }))
    }
  }

  const emitRespawn = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'respawn' }))
    }
  }

  const emitUseSkill = (skillId: string, x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'useSkill', skillId, x, y }))
    }
  }

  const emitArenaChat = (body: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'arenaMessageSend', body }))
    }
  }

  return {
    socketId,
    mapData,
    bootstrap,
    otherPlayers,
    burnStatuses,
    burnZones,
    kills,
    deaths,
    emitMove,
    emitShoot,
    emitRespawn,
    emitUseSkill,
    emitArenaChat,
    isConnected: !!socketId && !!bootstrap && hasSessionInitRef.current,
  }
}
