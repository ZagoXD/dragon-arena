import { getSpellFrame } from '../../config/spriteMap'
import { SpellConfig } from '../../config/characters'
import './Projectile.css'

export interface ProjectileData {
  id: string
  x: number
  y: number
  angle: number
  distance: number
  spell: SpellConfig
  isLocal: boolean // true = fired by this client; can hit other players
  ownerId?: string
}

interface Props {
  projectile: ProjectileData
}

export function Projectile({ projectile }: Props) {
  const { spell, x, y, angle } = projectile
  const { col, row } = getSpellFrame(angle)

  // sprite is 96x96 total (if 32x32 frames)
  const bgPos = `-${col * spell.frameSize}px -${row * spell.frameSize}px`

  return (
    <div
      className="projectile"
      style={{
        left: x - spell.frameSize / 2, // center the sprite
        top: y - spell.frameSize / 2,
        backgroundImage: `url(${spell.imageSrc})`,
        backgroundPosition: bgPos,
        width: spell.frameSize,
        height: spell.frameSize,
      }}
    />
  )
}
