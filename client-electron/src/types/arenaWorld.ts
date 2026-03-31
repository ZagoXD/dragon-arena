import { ResolvedSpellConfig } from '../config/visualConfig'

export interface DummyData {
  id: string
  x: number
  y: number
  hp: number
}

export interface ProjectileData {
  id: string
  x: number
  y: number
  angle: number
  distance: number
  spell: ResolvedSpellConfig
  isLocal: boolean
  ownerId?: string
}

export interface BurnStatusData {
  id: string
  targetType: 'player' | 'dummy'
  targetId: string
  ownerId: string
  passiveId: string
  startTimeMs: number
  endTimeMs: number
}

export interface BurnZoneData {
  id: string
  ownerId: string
  passiveId: string
  x: number
  y: number
  size: number
  startTimeMs: number
  endTimeMs: number
}
