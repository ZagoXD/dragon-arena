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

export interface AuthoritativeCharacterDefinition {
  id: string
  name: string
  maxHp: number
  movementSpeed: number
  colliderWidth: number
  colliderHeight: number
  autoAttackSpellId: string
  skillIds: string[]
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
  characterId: string
  x: number
  y: number
  direction: 'up' | 'right' | 'down' | 'left'
  animRow: number
  hp: number
  maxHp: number
  kills: number
  deaths: number
  movementSpeed: number
  colliderWidth: number
  colliderHeight: number
  autoAttackSpellId: string
  skillIds: string[]
}

export interface GameplayBootstrap {
  contentHash?: string
  world: WorldGameplayDefinition
  characterId: string
  characters: Record<string, AuthoritativeCharacterDefinition>
  spells: Record<string, AuthoritativeSpellDefinition>
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
}

export interface SessionInitPayload {
  event?: 'sessionInit'
  protocolVersion: number
  serverTimeMs?: number
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
