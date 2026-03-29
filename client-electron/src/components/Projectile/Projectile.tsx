import { getSpellFrame } from '../../config/spriteMap'
import { ResolvedSpellConfig } from '../../config/visualConfig'
import './Projectile.css'

export interface ProjectileData {
  id: string
  x: number
  y: number
  angle: number
  distance: number
  spell: ResolvedSpellConfig
  isLocal: boolean // true = fired by this client; can hit other players
  ownerId?: string
}

interface Props {
  projectile: ProjectileData
}

export function Projectile({ projectile }: Props) {
  const { spell, x, y, angle } = projectile
  const isDirectionalSheet = spell.renderMode !== 'single_rotated'
  const { col, row } = getSpellFrame(angle)
  const bgPos = `-${col * spell.frameSize}px -${row * spell.frameSize}px`

  return (
    <div
      className="projectile"
      style={{
        left: x - spell.frameSize / 2, // center the sprite
        top: y - spell.frameSize / 2,
        backgroundImage: `url(${spell.imageSrc})`,
        backgroundPosition: isDirectionalSheet ? bgPos : 'center',
        backgroundSize: isDirectionalSheet ? `${spell.frameSize * 3}px ${spell.frameSize * 3}px` : 'contain',
        backgroundRepeat: 'no-repeat',
        width: spell.frameSize,
        height: spell.frameSize,
        transform: isDirectionalSheet ? undefined : `rotate(${angle}rad)`,
      }}
    />
  )
}
