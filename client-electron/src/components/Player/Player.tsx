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
  animRow: number // the current row in the sprite sheet to render
  hp: number
}

export function Player({ playerName, character, x, y, direction, animRow, hp }: Props) {
  const renderedWidth = character.frameWidth * character.renderScale
  const renderedHeight = character.frameHeight * character.renderScale
  const sheetWidth = character.frameWidth * 4 // Assuming 4 columns for all characters
  const sheetHeight = character.frameHeight * Math.max(...character.idleRows, ...character.walkRows) + character.frameHeight

  const bgPos = `-${DIRECTION_COLUMNS[direction] * renderedWidth}px -${animRow * renderedHeight}px`

  const hpPercentage = Math.max(0, Math.min(100, (hp / character.maxHp) * 100))
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
        height: renderedHeight 
      }}
    >
      {/* Overhead label: name + HP bar */}
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
          backgroundImage: `url(${character.imageSrc})`,
          backgroundPosition: bgPos,
          backgroundSize: `${sheetWidth * character.renderScale}px ${sheetHeight * character.renderScale}px`,
        }}
      />
    </div>
  )
}
