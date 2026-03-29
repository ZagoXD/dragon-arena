import { NetPlayer } from '../../../hooks/useSocket'
import { ResolvedCharacterConfig } from '../../../config/visualConfig'
import { DummyData, ProjectileData } from '../../../types/arenaWorld'

export interface RemotePlayerView {
  id: string
  name: string
  character: ResolvedCharacterConfig
  x: number
  y: number
  direction: NetPlayer['direction']
  animRow: number
  hp: number
  isDashing?: boolean
  dashAngle?: number
}

export interface LocalPlayerView {
  name: string
  character: ResolvedCharacterConfig
  x: number
  y: number
  direction: NetPlayer['direction']
  animRow: number
  hp: number
  isDashing?: boolean
  dashAngle?: number
}

export type DummyView = DummyData
export type ProjectileView = ProjectileData

export interface TilesetInfo {
  firstgid: number
  src: string
  cols: number
}

export interface AimingArrowView {
  angle: number
  dist: number
  width: number
  originX: number
  originY: number
}

export interface ImpactEffectView {
  id: string
  x: number
  y: number
  radius: number
  color: number
  life: number
  maxLife: number
}

export interface PixiArenaViewProps {
  mapData: any
  tileSize: number
  mapWidth: number
  mapHeight: number
  cameraX: number
  cameraY: number
  dummies: DummyView[]
  dummyMaxHp: number
  dummyColliderSize: number
  remotePlayers: RemotePlayerView[]
  localPlayer: LocalPlayerView | null
  projectiles: ProjectileView[]
  impactEffects: ImpactEffectView[]
  aimingArrowData: AimingArrowView | null
}
