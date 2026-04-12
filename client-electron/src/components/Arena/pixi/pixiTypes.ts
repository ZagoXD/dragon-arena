import { NetPlayer } from '../../../hooks/useSocket'
import { ResolvedCharacterConfig } from '../../../config/visualConfig'
import { BurnStatusData, BurnZoneData, DummyData, ProjectileData } from '../../../types/arenaWorld'

export interface RemotePlayerView {
  id: string
  name: string
  role?: string
  opacity?: number
  character: ResolvedCharacterConfig
  x: number
  y: number
  direction: NetPlayer['direction']
  animRow: number
  hp: number
  shieldHp: number
  shieldMaxHp: number
  isDashing?: boolean
  dashAngle?: number
}

export interface LocalPlayerView {
  id: string
  name: string
  role?: string
  opacity?: number
  character: ResolvedCharacterConfig
  x: number
  y: number
  direction: NetPlayer['direction']
  animRow: number
  hp: number
  shieldHp: number
  shieldMaxHp: number
  isDashing?: boolean
  dashAngle?: number
}

export type DummyView = DummyData
export type ProjectileView = ProjectileData

export interface TilesetInfo {
  firstgid: number
  src: string
  cols: number
  order: number
}

export interface AimingArrowView {
  angle: number
  dist: number
  width: number
  endWidth?: number
  style?: 'arrow' | 'beam' | 'beam_constant'
  originX: number
  originY: number
}

export interface ImpactEffectView {
  id: string
  ownerId?: string
  x: number
  y: number
  radius: number
  color: number
  life: number
  maxLife: number
}

export interface ActiveSkillEffectView {
  id: string
  ownerId: string
  spellId: string
  spell: ResolvedCharacterConfig['autoAttack']
  x: number
  y: number
  angle: number
  warmupMs: number
  activeDurationMs: number
  life: number
  maxLife: number
  visibleLineSteps?: number[]
  visibleTileOffsets?: Array<[number, number]>
  visibleBeamSlices?: number[]
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
  activeSkillEffects: ActiveSkillEffectView[]
  burnStatuses: BurnStatusData[]
  burnZones: BurnZoneData[]
  aimingArrowData: AimingArrowView | null
  onReadyChange?: (ready: boolean) => void
}
