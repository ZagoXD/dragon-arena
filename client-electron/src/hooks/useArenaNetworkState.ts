import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveCharacterConfig, ResolvedCharacterConfig } from '../config/visualConfig'
import { useGameLoop } from './useGameLoop'
import {
  AutoAttackStartedEvent,
  AuthSuccessPayload,
  ArenaChatMessage,
  ArenaAuthIntent,
  NetPlayer,
  ProjectileSpawnEvent,
  SkillUsedEvent,
  useSocket,
} from './useSocket'
import { GameplayBootstrap } from '../types/gameplay'
import { BurnStatusData, BurnZoneData, DummyData, ProjectileData } from '../types/arenaWorld'
import { ActiveSkillEffectView } from '../components/Arena/pixi/pixiTypes'

interface UseArenaNetworkStateParams {
  authIntent: ArenaAuthIntent
  characterId: string
  onAutoAttackStarted?: (event: AutoAttackStartedEvent) => void
  onAutoAttackRejected?: () => void
  onSkillUsed?: (event: SkillUsedEvent) => void
  onSkillRejected?: (skillId: string) => void
  onAuthSucceeded?: (payload: AuthSuccessPayload) => void
  onAuthFailed?: (code: string, reason: string) => void
  onArenaChatMessage?: (message: ArenaChatMessage) => void
}

interface RemotePlayerSample {
  receivedAt: number
  state: NetPlayer
}

interface LocalDashState {
  isDashing: boolean
  dashAngle?: number
}

interface ImpactEffect {
  id: string
  x: number
  y: number
  radius: number
  color: number
  life: number
  maxLife: number
}

function getRemoteDashAngle(
  player: NetPlayer,
  samples: RemotePlayerSample[]
): number | undefined {
  if (!player.isDashing || samples.length < 2) {
    return undefined
  }

  const previous = samples[samples.length - 2]?.state
  const current = samples[samples.length - 1]?.state
  if (!previous || !current) {
    return undefined
  }

  const dx = current.x - previous.x
  const dy = current.y - previous.y
  if (Math.hypot(dx, dy) < 0.5) {
    return undefined
  }

  return Math.atan2(dy, dx)
}

export function useArenaNetworkState({
  authIntent,
  characterId,
  onAutoAttackStarted,
  onAutoAttackRejected,
  onSkillUsed,
  onSkillRejected,
  onAuthSucceeded,
  onAuthFailed,
  onArenaChatMessage,
}: UseArenaNetworkStateParams) {
  const [hp, setHp] = useState(0)
  const [shieldHp, setShieldHp] = useState(0)
  const [shieldMaxHp, setShieldMaxHp] = useState(0)
  const [movementSpeed, setMovementSpeed] = useState(0)
  const [hasAuthoritativePlayerState, setHasAuthoritativePlayerState] = useState(false)
  const [dummies, setDummies] = useState<DummyData[]>([])
  const [projectiles, setProjectiles] = useState<ProjectileData[]>([])
  const [renderOtherPlayers, setRenderOtherPlayers] = useState<Record<string, NetPlayer>>({})
  const [skillCooldowns, setSkillCooldowns] = useState<Record<string, number>>({})
  const [autoAttackCD, setAutoAttackCD] = useState(0)
  const [authoritativePosition, setAuthoritativePosition] = useState<{ x: number, y: number } | null>(null)
  const [localDashState, setLocalDashState] = useState<LocalDashState>({ isDashing: false })
  const [impactEffects, setImpactEffects] = useState<ImpactEffect[]>([])
  const [activeSkillEffects, setActiveSkillEffects] = useState<ActiveSkillEffectView[]>([])

  const otherPlayersRef = useRef<Record<string, NetPlayer>>({})
  const remoteSamplesRef = useRef<Record<string, RemotePlayerSample[]>>({})
  const projectilesRef = useRef<ProjectileData[]>([])
  const socketIdRef = useRef<string | undefined>(undefined)
  const bootstrapRef = useRef<GameplayBootstrap | null>(null)
  const localDashTimeoutRef = useRef<number | null>(null)

  const onCurrentDummies = useCallback((data: DummyData[]) => setDummies(data), [])
  const onDummyDamaged = useCallback((id: string, newHp: number) => {
    setDummies(prev => prev.map(d => d.id === id ? { ...d, hp: newHp } : d))
  }, [])

  const onSelfDamaged = useCallback((newHp: number, nextShieldHp: number, nextShieldMaxHp: number, x?: number, y?: number, nextMovementSpeed?: number) => {
    setHp(newHp)
    setShieldHp(nextShieldHp)
    setShieldMaxHp(nextShieldMaxHp)
    if (typeof nextMovementSpeed === 'number') {
      setMovementSpeed(nextMovementSpeed)
    }
    setHasAuthoritativePlayerState(true)
    if (x !== undefined && y !== undefined) {
      setAuthoritativePosition({ x, y })
    }
  }, [])

  const onSelfMoved = useCallback((x: number, y: number, nextMovementSpeed?: number) => {
    if (typeof nextMovementSpeed === 'number') {
      setMovementSpeed(nextMovementSpeed)
    }
    setAuthoritativePosition({ x, y })
  }, [])

  const resolveProjectile = useCallback((data: ProjectileSpawnEvent): ProjectileData | null => {
    const currentBootstrap = bootstrapRef.current
    if (!currentBootstrap) return null

    const owner =
      data.ownerId === socketIdRef.current
        ? currentBootstrap.player
        : otherPlayersRef.current[data.ownerId]
    if (!owner) return null

    const ownerCharacter = resolveCharacterConfig(owner.characterId, currentBootstrap.characters, currentBootstrap.spells, currentBootstrap.passives)
    if (!ownerCharacter) return null

    const spell = data.spellId === ownerCharacter.autoAttack.id
      ? ownerCharacter.autoAttack
      : ownerCharacter.skills.find(skill => skill.id === data.spellId)
    if (!spell) return null

    return {
      id: data.id,
      ownerId: data.ownerId,
      x: data.x,
      y: data.y,
      angle: data.angle,
      distance: data.distance ?? 0,
      spell,
      isLocal: data.ownerId === socketIdRef.current,
    }
  }, [])

  const onProjectileSpawned = useCallback((data: ProjectileSpawnEvent) => {
    const projectile = resolveProjectile(data)
    if (!projectile) return

    projectilesRef.current.push(projectile)
    setProjectiles([...projectilesRef.current])
  }, [resolveProjectile])

  const onProjectileRemoved = useCallback((projectileId: string) => {
    const removedProjectile = projectilesRef.current.find(proj => proj.id === projectileId)
    projectilesRef.current = projectilesRef.current.filter(proj => proj.id !== projectileId)
    setProjectiles([...projectilesRef.current])

    if (removedProjectile) {
      const isEmber = removedProjectile.spell.id === 'ember'
      setImpactEffects(prev => [
        ...prev,
        {
          id: `${projectileId}-${performance.now()}`,
          x: removedProjectile.x,
          y: removedProjectile.y,
          radius: isEmber ? 28 : 40,
          color: isEmber ? 0xff8a00 : 0xffd166,
          life: isEmber ? 180 : 220,
          maxLife: isEmber ? 180 : 220,
        },
      ])
    }
  }, [])

  const onProjectilesSnapshot = useCallback((snapshotProjectiles: ProjectileSpawnEvent[]) => {
    const resolvedProjectiles = snapshotProjectiles
      .map(resolveProjectile)
      .filter((projectile): projectile is ProjectileData => projectile !== null)

    projectilesRef.current = resolvedProjectiles
    setProjectiles(resolvedProjectiles)
  }, [resolveProjectile])

  const handleAutoAttackStarted = useCallback((event: AutoAttackStartedEvent) => {
    const currentBootstrap = bootstrapRef.current
    if (currentBootstrap) {
      const owner =
        event.playerId === socketIdRef.current
          ? currentBootstrap.player
          : otherPlayersRef.current[event.playerId]

      if (owner) {
        const resolvedCharacter = resolveCharacterConfig(owner.characterId, currentBootstrap.characters, currentBootstrap.spells, currentBootstrap.passives)
        const resolvedSpell = resolvedCharacter?.autoAttack

        if (resolvedSpell?.effectKind === 'melee_slash') {
          const fallbackOwnerX =
            event.playerId === socketIdRef.current
              ? (authoritativePosition?.x ?? owner.x)
              : owner.x
          const fallbackOwnerY =
            event.playerId === socketIdRef.current
              ? (authoritativePosition?.y ?? owner.y)
              : owner.y
          const centerX = event.originX ?? (fallbackOwnerX + owner.colliderWidth / 2)
          const centerY = event.originY ?? (fallbackOwnerY + owner.colliderHeight / 2)
          const slashOffset = Math.cos(event.angle) >= 0 ? 72 : 22
          const originX = centerX + Math.cos(event.angle) * slashOffset
          const originY = centerY + Math.sin(event.angle) * slashOffset
          setActiveSkillEffects(prev => [
            ...prev,
            {
              id: `${event.playerId}-${event.spellId}-${performance.now()}`,
              ownerId: event.playerId,
              spellId: event.spellId,
              spell: resolvedSpell,
              x: originX,
              y: originY,
              angle: event.angle,
              warmupMs: 0,
              activeDurationMs: event.cooldownMs,
              life: event.cooldownMs,
              maxLife: event.cooldownMs,
            },
          ])
        }
      }
    }

    if (event.playerId !== socketIdRef.current) {
      return
    }

    setAutoAttackCD(event.cooldownMs)
    onAutoAttackStarted?.(event)
  }, [onAutoAttackStarted])

  const handleSkillUsed = useCallback((event: SkillUsedEvent) => {
    if (event.id === socketIdRef.current) {
      setSkillCooldowns(prev => ({ ...prev, [event.skillId]: event.cooldownMs }))
    }

    const currentBootstrap = bootstrapRef.current
    if (currentBootstrap) {
      const owner =
        event.id === socketIdRef.current
          ? currentBootstrap.player
          : otherPlayersRef.current[event.id]

      if (owner) {
        const resolvedCharacter = resolveCharacterConfig(owner.characterId, currentBootstrap.characters, currentBootstrap.spells, currentBootstrap.passives)
        const resolvedSpell = resolvedCharacter?.skills.find(skill => skill.id === event.skillId)

        if (
          resolvedSpell?.effectKind === 'beam' ||
          resolvedSpell?.effectKind === 'tile_burst' ||
          resolvedSpell?.effectKind === 'line_burst' ||
          resolvedSpell?.effectKind === 'self_aura'
        ) {
          const fallbackOriginX = owner.x + owner.colliderWidth / 2
          const fallbackOriginY = owner.y + owner.colliderHeight / 2
          const originX = event.originX ?? fallbackOriginX
          const originY = event.originY ?? fallbackOriginY
          const angle = event.angle ?? Math.atan2(event.targetY - originY, event.targetX - originX)

          setActiveSkillEffects(prev => [
            ...prev,
            {
              id: `${event.id}-${event.skillId}-${performance.now()}`,
              ownerId: event.id,
              spellId: event.skillId,
              spell: resolvedSpell,
              x: originX,
              y: originY,
              angle,
              warmupMs: event.castTimeMs,
              activeDurationMs: event.effectDurationMs,
              life: event.castTimeMs + event.effectDurationMs,
              maxLife: event.castTimeMs + event.effectDurationMs,
            },
          ])
        }
      }
    }

    if (event.id === socketIdRef.current && event.skillId === 'dragon_dive' && bootstrapRef.current?.player) {
      const player = bootstrapRef.current.player
      const originX = (authoritativePosition?.x ?? player.x) + player.colliderWidth / 2
      const originY = (authoritativePosition?.y ?? player.y) + player.colliderHeight / 2
      const dashAngle = Math.atan2(event.targetY - originY, event.targetX - originX)

      setLocalDashState({ isDashing: true, dashAngle })
      if (localDashTimeoutRef.current !== null) {
        window.clearTimeout(localDashTimeoutRef.current)
      }
      localDashTimeoutRef.current = window.setTimeout(() => {
        setLocalDashState({ isDashing: false })
        localDashTimeoutRef.current = null
      }, Math.max(0, event.effectDurationMs))
    }

    onSkillUsed?.(event)
  }, [authoritativePosition, onSkillUsed])

  const {
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
  } = useSocket(
    authIntent,
    characterId,
    onCurrentDummies,
    onDummyDamaged,
    onSelfDamaged,
    onSelfMoved,
    onProjectileSpawned,
    onProjectileRemoved,
    onProjectilesSnapshot,
    handleAutoAttackStarted,
    onAutoAttackRejected,
    handleSkillUsed,
    onSkillRejected,
    onAuthSucceeded,
    onAuthFailed,
    onArenaChatMessage,
  )

  const character = useMemo<ResolvedCharacterConfig | null>(() => {
    if (!bootstrap) return null
    return resolveCharacterConfig(characterId, bootstrap.characters, bootstrap.spells, bootstrap.passives)
  }, [bootstrap, characterId])

  const resolvedOtherPlayers = useMemo(() => {
    if (!bootstrap) return []

    return Object.values(renderOtherPlayers)
      .map(player => {
        const resolvedCharacter = resolveCharacterConfig(player.characterId, bootstrap.characters, bootstrap.spells, bootstrap.passives)
        if (!resolvedCharacter || player.hp <= 0) {
          return null
        }

        return {
          id: player.id,
          name: player.name,
          role: player.role,
          character: resolvedCharacter,
          x: player.x,
          y: player.y,
          direction: player.direction,
          animRow: player.animRow,
          hp: player.hp,
          shieldHp: player.shieldHp || 0,
          shieldMaxHp: player.shieldMaxHp || 0,
          isDashing: player.isDashing,
          dashAngle: getRemoteDashAngle(player, remoteSamplesRef.current[player.id] ?? []),
        }
      })
      .filter((player): player is NonNullable<typeof player> => player !== null)
  }, [bootstrap, renderOtherPlayers])

  const scoreboardEntries = useMemo(() => {
    return [
      {
        id: socketId || 'local',
        name: bootstrap?.player?.name || authIntent.nickname || authIntent.username || authIntent.identifier || 'Player',
        characterId,
        kills,
        deaths,
        isLocal: true,
      },
      ...Object.values(otherPlayers).map(player => ({
        id: player.id,
        name: player.name,
        characterId: player.characterId,
        kills: player.kills || 0,
        deaths: player.deaths || 0,
        isLocal: false,
      })),
    ].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
  }, [socketId, bootstrap?.player?.name, authIntent.nickname, authIntent.username, authIntent.identifier, characterId, kills, deaths, otherPlayers])

  const tileSize = bootstrap?.world.tileSize ?? 64
  const mapWidth = mapData ? mapData.width * tileSize : (bootstrap?.world.mapWidth ?? 2048)
  const mapHeight = mapData ? mapData.height * tileSize : (bootstrap?.world.mapHeight ?? 1280)
  const dummyColliderSize = bootstrap?.world.dummyColliderSize ?? 64
  const dummyMaxHp = bootstrap?.world.dummyMaxHp ?? 500
  const respawnSeconds = Math.max(1, Math.ceil((bootstrap?.world.playerRespawnMs ?? 5000) / 1000))

  otherPlayersRef.current = otherPlayers
  projectilesRef.current = projectiles
  socketIdRef.current = socketId
  bootstrapRef.current = bootstrap

  useEffect(() => {
    const receivedAt = performance.now()
    const nextSamples: Record<string, RemotePlayerSample[]> = {}

    for (const [id, playerState] of Object.entries(otherPlayers)) {
      const history = remoteSamplesRef.current[id] ?? []
      nextSamples[id] = [...history, { receivedAt, state: { ...playerState } }].slice(-6)
    }

    remoteSamplesRef.current = nextSamples

    setRenderOtherPlayers(prev => {
      const next: Record<string, NetPlayer> = {}
      for (const [id, playerState] of Object.entries(otherPlayers)) {
        next[id] = prev[id]
          ? {
              ...prev[id],
              ...playerState,
              // Preserve the current rendered position so interpolation can
              // move toward the new authoritative sample instead of snapping
              // to it on every network update.
              x: prev[id].x,
              y: prev[id].y,
            }
          : { ...playerState }
      }
      return next
    })
  }, [otherPlayers])

  useEffect(() => {
    if (!bootstrap?.player) return
    setHp(bootstrap.player.hp)
    setShieldHp(bootstrap.player.shieldHp || 0)
    setShieldMaxHp(bootstrap.player.shieldMaxHp || 0)
    setMovementSpeed(bootstrap.player.movementSpeed)
    setHasAuthoritativePlayerState(true)
    setAuthoritativePosition({ x: bootstrap.player.x, y: bootstrap.player.y })
  }, [bootstrap])

  useEffect(() => {
    return () => {
      if (localDashTimeoutRef.current !== null) {
        window.clearTimeout(localDashTimeoutRef.current)
      }
    }
  }, [])

  useGameLoop((deltaMs) => {
    if (projectilesRef.current.length > 0) {
      projectilesRef.current = projectilesRef.current
        .map(proj => {
          const dx = Math.cos(proj.angle) * proj.spell.projectileSpeed * (deltaMs / 1000)
          const dy = Math.sin(proj.angle) * proj.spell.projectileSpeed * (deltaMs / 1000)
          return {
            ...proj,
            x: proj.x + dx,
            y: proj.y + dy,
            distance: proj.distance + proj.spell.projectileSpeed * (deltaMs / 1000),
          }
        })
        .filter(proj => proj.distance <= proj.spell.range + proj.spell.projectileSpeed * 0.25)

      setProjectiles([...projectilesRef.current])
    }

    if (Object.keys(otherPlayersRef.current).length > 0) {
      setRenderOtherPlayers(prev => {
        const renderAt = performance.now() - 100
        let changed = false
        const next: Record<string, NetPlayer> = {}

        for (const [id, authoritative] of Object.entries(otherPlayersRef.current)) {
          const rendered = prev[id] ?? authoritative
          const samples = remoteSamplesRef.current[id] ?? []
          const latest = samples[samples.length - 1]?.state ?? authoritative

          let x = latest.x
          let y = latest.y

          if (samples.length >= 2) {
            let from = samples[0]
            let to = samples[samples.length - 1]

            for (let index = 1; index < samples.length; index += 1) {
              if (samples[index].receivedAt >= renderAt) {
                from = samples[index - 1]
                to = samples[index]
                break
              }
            }

            const range = Math.max(1, to.receivedAt - from.receivedAt)
            const t = Math.min(1, Math.max(0, (renderAt - from.receivedAt) / range))
            x = from.state.x + (to.state.x - from.state.x) * t
            y = from.state.y + (to.state.y - from.state.y) * t
          }

          const snapDistance = Math.hypot(latest.x - rendered.x, latest.y - rendered.y)
          if (snapDistance > 128) {
            x = latest.x
            y = latest.y
          }

          const nextRendered: NetPlayer = {
            ...rendered,
            ...latest,
            x,
            y,
          }

          if (
            !prev[id] ||
            prev[id].x !== nextRendered.x ||
            prev[id].y !== nextRendered.y ||
            prev[id].hp !== nextRendered.hp ||
            prev[id].animRow !== nextRendered.animRow ||
            prev[id].direction !== nextRendered.direction ||
            prev[id].isDashing !== nextRendered.isDashing
          ) {
            changed = true
          }

          next[id] = nextRendered
        }

        return changed || Object.keys(prev).length !== Object.keys(next).length ? next : prev
      })
    }

    if (autoAttackCD > 0) {
      setAutoAttackCD(prev => Math.max(0, prev - deltaMs))
    }

    setImpactEffects(prev => prev
      .map(effect => ({ ...effect, life: effect.life - deltaMs }))
      .filter(effect => effect.life > 0))

    setActiveSkillEffects(prev => prev
      .map(effect => ({
        ...effect,
        warmupMs: Math.max(0, effect.warmupMs - deltaMs),
        life: effect.life - deltaMs,
      }))
      .filter(effect => effect.life > 0))

    setSkillCooldowns(prev => {
      const next: Record<string, number> = {}
      let changed = false
      for (const id in prev) {
        if (prev[id] > 0) {
          next[id] = Math.max(0, prev[id] - deltaMs)
          changed = true
        }
      }
      return changed ? next : prev
    })
  })

  return {
    socketId,
    mapData,
    bootstrap,
    character,
    tileSize,
    mapWidth,
    mapHeight,
    dummyColliderSize,
    dummyMaxHp,
    respawnSeconds,
    hp,
    shieldHp,
    shieldMaxHp,
    hasAuthoritativePlayerState,
    dummies,
    projectiles,
    renderOtherPlayers,
    resolvedOtherPlayers,
    otherPlayers,
    scoreboardEntries,
    kills,
    deaths,
    skillCooldowns,
    autoAttackCD,
    movementSpeed,
    authoritativePosition,
    localDashState,
    impactEffects,
    activeSkillEffects,
    burnStatuses: burnStatuses as BurnStatusData[],
    burnZones: burnZones as BurnZoneData[],
    emitMove,
    emitShoot,
    emitRespawn,
    emitUseSkill,
    emitArenaChat,
  }
}
