import { useMemo } from 'react'
import {
  DIRECTION_COLUMNS,
  Direction,
  getSpellFrame,
} from '../../config/spriteMap'
import { ResolvedCharacterConfig } from '../../config/visualConfig'
import './Player.css'

interface Props {
  playerName: string
  character: ResolvedCharacterConfig
  x: number
  y: number
  direction: Direction
  animRow: number 
  hp: number
  isDashing?: boolean
  dashAngle?: number
}

export function Player({ playerName, character, x, y, direction, animRow, hp, isDashing, dashAngle }: Props) {
  const dashVisual = character.skills[0]
  const isCharizardDash = isDashing && character.id === 'charizard' && !!dashVisual
  const isDashSingleRotated = isCharizardDash && dashVisual.renderMode === 'single_rotated'
  const activeImage = isCharizardDash ? dashVisual.imageSrc : character.imageSrc

  const frameWidth = isCharizardDash ? dashVisual.frameSize : character.frameWidth
  const frameHeight = isCharizardDash ? dashVisual.frameSize : character.frameHeight

  const renderScale = isCharizardDash
    ? (isDashSingleRotated ? 1.0 : 2.0)
    : character.renderScale
  const renderedWidth = frameWidth * renderScale
  const renderedHeight = frameHeight * renderScale
  const horizontalOffset = (renderedWidth - character.colliderWidth) / 2
  const verticalOffset = renderedHeight - character.colliderHeight
  
  const isDirectionalDash = isCharizardDash && !isDashSingleRotated
  const colCount = isDirectionalDash ? 3 : 4
  const rowCount = isDirectionalDash ? 3 : Math.max(...character.idleRows, ...character.walkRows) + 1
  
  const sheetWidthPx = frameWidth * colCount * renderScale
  const sheetHeightPx = frameHeight * rowCount * renderScale

  const fallbackDashAngle =
    direction === 'right' ? 0 :
    direction === 'down' ? Math.PI / 2 :
    direction === 'left' ? Math.PI :
    -Math.PI / 2
  const { col: dashCol, row: dashRow } = getSpellFrame(dashAngle ?? fallbackDashAngle)

  const actualRow = isDirectionalDash ? dashRow : animRow
  const actualCol = isDirectionalDash ? dashCol : DIRECTION_COLUMNS[direction]

  const bgPos = `-${actualCol * renderedWidth}px -${actualRow * renderedHeight}px`

  const hpPercentage = Math.max(0, (hp / character.maxHp) * 100)
  const barColor = useMemo(() => {
    return hpPercentage > 60 ? '#4caf50' :
           hpPercentage > 30 ? '#ff9800' :
                               '#f44336'
  }, [hpPercentage])

  return (
    <div
      className="player"
      style={{ 
        left: x - horizontalOffset,
        top: y - verticalOffset,
        width: renderedWidth, 
        height: renderedHeight,
        zIndex: isDashing ? 10 : 1
      }}
    >
      <div className="player__overhead">
        <span className="player__name">{playerName}</span>
        <div className="player__hp-track">
          <div
            className="player__hp-fill"
            style={{ width: `${hpPercentage}%`, background: barColor }}
          />
        </div>
      </div>
      <div
        className="player-sprite"
        style={{
          width: renderedWidth,
          height: renderedHeight,
          backgroundImage: `url(${activeImage})`,
          backgroundPosition: isCharizardDash
            ? (isDirectionalDash ? bgPos : 'center')
            : bgPos,
          backgroundSize: isCharizardDash
            ? (isDashSingleRotated ? 'contain' : `${sheetWidthPx}px ${sheetHeightPx}px`)
            : `${sheetWidthPx}px ${sheetHeightPx}px`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          filter: isDashing ? 'brightness(1.5) drop-shadow(0 0 10px rgba(255,100,0,0.8))' : 'none',
          transform: isDashSingleRotated ? `rotate(${dashAngle ?? fallbackDashAngle}rad)` : undefined,
        }}
      />
    </div>
  )
}
