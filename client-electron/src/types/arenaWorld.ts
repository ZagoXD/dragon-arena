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
