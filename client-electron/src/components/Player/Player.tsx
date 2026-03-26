import { useMemo } from 'react'
import {
  DIRECTION_COLUMNS,
  Direction,
} from '../../config/spriteMap'
import { CharacterConfig } from '../../config/characters'
import './Player.css'

interface Props {
  playerName: string
  character: CharacterConfig
  x: number
  y: number
  direction: Direction
  animRow: number 
  hp: number
  isDashing?: boolean
}

export function Player({ playerName, character, x, y, direction, animRow, hp, isDashing }: Props) {
  const isCharizardDash = isDashing && character.id === 'charizard'
  const activeImage = isCharizardDash ? character.skills[0].imageSrc : character.imageSrc
  
  const frameWidth = isCharizardDash ? 32 : character.frameWidth
  const frameHeight = isCharizardDash ? 32 : character.frameHeight
  
  // Render scale: normal is character.renderScale (e.g. 0.5 for 256px -> 128px)
  // Dash: 32px asset. User wants it half character width. 
  // Character width is 128px. Half is 64px. 
  // 32px * 2.0 = 64px.
  const renderScale = isCharizardDash ? 2.0 : character.renderScale
  const renderedWidth = frameWidth * renderScale
  const renderedHeight = frameHeight * renderScale
  
  // Sheet dimensions
  // Normal: character.frameWidth * 4 columns, variable rows.
  // Dragon Dive: 96x96 total (3 columns of 32px, 3 rows of 32px).
  const colCount = isCharizardDash ? 3 : 4
  const rowCount = isCharizardDash ? 3 : Math.max(...character.idleRows, ...character.walkRows) + 1
  
  const sheetWidthPx = frameWidth * colCount * renderScale
  const sheetHeightPx = frameHeight * rowCount * renderScale

  // Row/Col selection for dragon_dive.png (3x3 grid)
  // Index (row, col):
  // (0,1): Up, (2,1): Down, (1,0): Left, (1,2): Right
  const dashPosMap: Record<Direction, { row: number, col: number }> = {
    'up':    { row: 0, col: 1 },
    'down':  { row: 2, col: 1 },
    'left':  { row: 1, col: 0 },
    'right': { row: 1, col: 2 }
  }

  const actualRow = isCharizardDash ? dashPosMap[direction].row : animRow
  const actualCol = isCharizardDash ? dashPosMap[direction].col : DIRECTION_COLUMNS[direction]

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
        left: x - (renderedWidth - 64) / 2, 
        top: y - (renderedHeight - 64), 
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
          backgroundPosition: bgPos,
          backgroundSize: `${sheetWidthPx}px ${sheetHeightPx}px`,
          imageRendering: 'pixelated',
          filter: isDashing ? 'brightness(1.5) drop-shadow(0 0 10px rgba(255,100,0,0.8))' : 'none'
        }}
      />
    </div>
  )
}
