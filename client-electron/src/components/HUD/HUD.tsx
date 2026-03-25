import { useState, useEffect } from 'react'
import { CharacterConfig } from '../../config/characters'
import { ANIMATION_FPS } from '../../config/spriteMap'
import './HUD.css'

interface Props {
  playerName: string
  character: CharacterConfig
  hp: number
  playerPos: { x: number, y: number }
  dummies: { id: string, x: number, y: number, hp: number }[]
  otherPlayers?: { id: string, x: number, y: number, hp: number }[]
  mapWidth: number
  mapHeight: number
}

export function HUD({ playerName, character, hp, playerPos, dummies, otherPlayers = [], mapWidth, mapHeight }: Props) {
  const hpPct = Math.max(0, (hp / character.maxHp) * 100)
  
  // Portrait logic
  const portraitWidth = character.frameWidth * 0.5
  const portraitHeight = character.frameHeight * 0.5
  const sheetWidth = character.frameWidth * 4 * 0.5

  const [animIndex, setAnimIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimIndex(prev => prev + 1)
    }, 1000 / ANIMATION_FPS)
    return () => clearInterval(interval)
  }, [])

  const currentRow = character.idleRows[animIndex % character.idleRows.length]
  const bgPosX = -(2 * portraitWidth) // Column 2 (Down/Front)
  const bgPosY = -(currentRow * portraitHeight)
  
  return (
    <div className="hud-container">
      {/* 1. Left Panel (Status) */}
      <div className="hud-panel hud-status">
        <div 
          className="hud-portrait"
          style={{
            backgroundImage: `url(${character.imageSrc})`,
            width: portraitWidth,
            height: portraitHeight,
            backgroundSize: `${sheetWidth}px auto`,
            backgroundPosition: `${bgPosX}px ${bgPosY}px`
          }}
        />
        <div className="hud-stats">
          <div className="hud-player-name">{playerName}</div>
          <div className="hud-char-name">{character.name}</div>
          <div className="hud-stat-line">Speed: {character.movementSpeed}</div>
          <div className="hud-stat-line">Damage: {character.autoAttack.damage}</div>
        </div>
      </div>

      {/* 2. Center Panel (Action Bar & HP) */}
      <div className="hud-panel hud-center">
        {/* Action Bar */}
        <div className="hud-actionbar">
          <div className="hud-spell" id="action-bar-spell-1" style={{ '--cooldown-pct': '0%' } as React.CSSProperties}>
             <div className="hud-spell-icon" style={{ backgroundImage: `url(${character.autoAttack.imageSrc})` }}></div>
             <div className="hud-spell-cooldown-overlay"></div>
             <span className="hud-spell-hotkey">LMB</span>
          </div>
        </div>

        {/* HP Bar */}
        <div className="hud-hp-bar">
          <div className="hud-hp-fill" style={{ width: `${hpPct}%` }}></div>
          <span className="hud-hp-text">{Math.ceil(hp)} / {character.maxHp}</span>
        </div>
      </div>

      {/* 3. Right Panel (Minimap) */}
      <div className="hud-panel hud-minimap">
         <div className="minimap-board">
           {/* Player Dot */}
           <div 
             className="minimap-dot minimap-player"
             style={{ 
               left: `${(playerPos.x / mapWidth) * 100}%`,
               top: `${(playerPos.y / mapHeight) * 100}%`
             }} 
           />
           {/* Dummy Dots (White) */}
           {dummies && dummies.map(d => (
             d.hp > 0 && (
               <div 
                 key={d.id}
                 className="minimap-dot minimap-dummy"
                 style={{
                   left: `${(d.x / mapWidth) * 100}%`,
                   top: `${(d.y / mapHeight) * 100}%`
                 }}
               />
             )
           ))}
           {/* Other Players (Red) */}
           {otherPlayers.map(p => (
             p.hp > 0 && (
               <div 
                 key={p.id}
                 className="minimap-dot minimap-enemy"
                 style={{
                   left: `${(p.x / mapWidth) * 100}%`,
                   top: `${(p.y / mapHeight) * 100}%`
                 }}
               />
             )
           ))}
         </div>
      </div>
    </div>
  )
}
