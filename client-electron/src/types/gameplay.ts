export interface AuthoritativeSpellDefinition {
  id: string
  name: string
  damage: number
  range: number
  castTimeMs: number
  cooldownMs: number
  projectileSpeed: number
  projectileRadius: number
  effectDurationMs: number
}

export interface AuthoritativePassiveDefinition {
  id: string
  name: string
  durationMs: number
  tickDamage: number
  tickIntervalMs: number
  movementSlowPct?: number
  applicationChances: Record<string, number>
}

export interface AuthoritativeCharacterDefinition {
  id: string
  name: string
  description: string
  descriptionKey: string
  maxHp: number
  movementSpeed: number
  damageMultiplier?: number
  colliderWidth: number
  colliderHeight: number
  autoAttackSpellId: string
  skillIds: string[]
  passiveId: string
}

export interface WorldGameplayDefinition {
  tileSize: number
  mapWidth: number
  mapHeight: number
  dummyMaxHp: number
  dummyRespawnMs: number
  dummyColliderSize: number
  playerRespawnMs: number
}

export interface BootstrapPlayerState {
  id: string
  name: string
  role?: string
  characterId: string
  x: number
  y: number
  direction: 'up' | 'right' | 'down' | 'left'
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
}

export interface GameplayBootstrap {
  contentHash?: string
  world: WorldGameplayDefinition
  characterId: string
  characters: Record<string, AuthoritativeCharacterDefinition>
  spells: Record<string, AuthoritativeSpellDefinition>
  passives: Record<string, AuthoritativePassiveDefinition>
  player?: BootstrapPlayerState
}

export interface WorldSnapshotPlayerState extends BootstrapPlayerState {
  isDashing?: boolean
}

export interface WorldSnapshotDummyState {
  id: string
  x: number
  y: number
  hp: number
}

export interface WorldSnapshotProjectileState {
  id: string
  ownerId: string
  spellId: string
  x: number
  y: number
  angle: number
  distance?: number
}

export interface WorldSnapshotState {
  tick: number
  players: Record<string, WorldSnapshotPlayerState>
  dummies: WorldSnapshotDummyState[]
  projectiles: WorldSnapshotProjectileState[]
  burnStatuses: {
    id: string
    targetType: 'player' | 'dummy'
    targetId: string
    ownerId: string
    passiveId: string
    startTimeMs: number
    endTimeMs: number
  }[]
  burnZones: {
    id: string
    ownerId: string
    passiveId: string
    x: number
    y: number
    size: number
    startTimeMs: number
    endTimeMs: number
  }[]
}

export interface SessionInitPayload {
  event?: 'sessionInit'
  protocolVersion: number
  serverTimeMs?: number
  instance?: {
    key: string
    mode: 'training' | 'match'
    matchId?: string
    matchStartedAtMs?: number
    matchEndsAtMs?: number
    matchDurationMs?: number
  }
  capabilities?: {
    authoritativeGameplay?: boolean
    authoritativeProjectiles?: boolean
    tickSnapshots?: boolean
    actionRejectionCodes?: boolean
  }
  selfId: string
  bootstrap: GameplayBootstrap
  map: any | null
  snapshot: WorldSnapshotState
}
