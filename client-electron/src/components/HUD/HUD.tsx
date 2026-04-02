import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ResolvedCharacterConfig } from '../../config/visualConfig'
import { ANIMATION_FPS } from '../../config/spriteMap'
import './HUD.css'

function getPassiveIconStyle(passive: ResolvedCharacterConfig['passive']): React.CSSProperties {
  return {
    backgroundImage: `url(${passive.imageSrc})`,
    backgroundSize: `100% ${passive.frameCount * 100}%`,
    backgroundPosition: 'center top',
    backgroundRepeat: 'no-repeat',
  }
}

function getSpellIconStyle(spell: ResolvedCharacterConfig['autoAttack']): React.CSSProperties {
  if (spell.id === 'flamethrower') {
    return {
      backgroundImage: `url(${spell.imageSrc})`,
      backgroundSize: '100% 600%',
      backgroundPosition: 'center 40%',
      backgroundRepeat: 'no-repeat',
      transform: 'rotate(90deg) scale(1.15)',
      transformOrigin: 'center',
    }
  }

  if (spell.id === 'fire_blast') {
    return {
      backgroundImage: `url(${spell.imageSrc})`,
      backgroundSize: '100% 400%',
      backgroundPosition: 'center top',
      backgroundRepeat: 'no-repeat',
    }
  }

  if (typeof spell.iconFrameIndex === 'number' && spell.frameCount) {
    const positionPercent = spell.frameCount > 1
      ? (spell.iconFrameIndex / (spell.frameCount - 1)) * 100
      : 0

    return {
      backgroundImage: `url(${spell.imageSrc})`,
      backgroundSize: `100% ${spell.frameCount * 100}%`,
      backgroundPosition: `center ${positionPercent}%`,
      backgroundRepeat: 'no-repeat',
    }
  }

  if (spell.iconMode === 'single_fit') {
    return {
      backgroundImage: `url(${spell.imageSrc})`,
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }

  return {
    backgroundImage: `url(${spell.imageSrc})`,
    backgroundSize: '300% 300%',
    backgroundPosition: '100% 50%',
  }
}

interface Props {
  playerName: string
  character: ResolvedCharacterConfig
  hp: number
  shieldHp: number
  shieldMaxHp: number
  movementSpeed: number
  playerPos: { x: number, y: number }
  dummies: { id: string, x: number, y: number, hp: number }[]
  otherPlayers?: { id: string, x: number, y: number, hp: number, kills?: number, deaths?: number }[]
  mapWidth: number
  mapHeight: number
  skillCooldowns?: Record<string, number>
  autoAttackCooldown?: number
}

export function HUD({ 
  playerName, character, hp, shieldHp, shieldMaxHp, movementSpeed, playerPos, dummies, otherPlayers = [], 
  mapWidth, mapHeight, skillCooldowns = {}, autoAttackCooldown = 0 
}: Props) {
  const { t } = useTranslation()
  const totalPool = Math.max(1, character.maxHp + shieldMaxHp)
  const hpPct = Math.max(0, (hp / totalPool) * 100)
  const totalVisiblePct = Math.max(0, ((hp + shieldHp) / totalPool) * 100)
  const totalCurrent = hp + shieldHp
  
  // Adjusted scaling for 80px container
  const portraitSize = 80
  const sheetWidth = portraitSize * 4

  const [animIndex, setAnimIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimIndex(prev => prev + 1)
    }, 1000 / ANIMATION_FPS)
    return () => clearInterval(interval)
  }, [])

  const currentRow = character.idleRows[animIndex % character.idleRows.length]
  const bgPosX = -(2 * portraitSize) 
  const bgPosY = -(currentRow * portraitSize)
  
  return (
    <div className="hud-container">
      {/* 1. Left Panel (Status) */}
      <div className="hud-panel hud-status">
        <div className="hud-portrait-container">
          <div 
            className="hud-portrait"
            style={{
              backgroundImage: `url(${character.imageSrc})`,
              backgroundSize: `${sheetWidth}px auto`,
              backgroundPosition: `${bgPosX}px ${bgPosY}px`
            }}
          />
          <div 
            className="hud-portrait-hp-ring"
            style={{ borderColor: hpPct < 30 ? '#22c55e' : 'transparent' }}
          />
        </div>
        <div className="hud-stats">
          <div className="hud-player-name">{playerName}</div>
          <div className="hud-char-name">{character.name}</div>
          <div className="hud-stats-grid">
            <div className="hud-stat-item">
               <span style={{ color: '#22c55e' }}>{t('hud.hpShort')}</span> {Math.ceil(hp)}
            </div>
            <div className="hud-stat-item">
               <span style={{ color: '#fbbf24' }}>{t('hud.spdShort')}</span> {Math.round(movementSpeed)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Center Panel (Action Bar & HP) */}
      <div className="hud-panel hud-center">
        <div className="hud-hp-container">
           <div className="hud-hp-labels">
             <span className="hud-hp-val">{t('hud.vitality')}</span>
             <span className="hud-hp-val" style={{ color: '#fff' }}>{Math.ceil(totalCurrent)} / {character.maxHp + shieldMaxHp}</span>
           </div>
           <div className="hud-hp-bar">
             <div
               className="hud-shield-fill"
               style={{
                 width: `${totalVisiblePct}%`,
               }}
             ></div>
             <div
               className="hud-hp-fill"
               style={{
                 width: `${hpPct}%`,
                 background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                 boxShadow: '0 0 10px rgba(34, 197, 94, 0.45)',
               }}
             ></div>
           </div>
        </div>

        <div className="hud-actionbar">
          {/* Auto Attack (LMB) */}
          <div 
            className="hud-spell" 
            title={t('hud.basicAttack')}
          >
             <div 
               className="hud-spell-icon" 
               style={getSpellIconStyle(character.autoAttack)}
             ></div>
             {autoAttackCooldown > 0 && (
               <div className="hud-spell-cooldown-overlay">
                  <span className="hud-spell-cooldown-text">{(autoAttackCooldown / 1000).toFixed(1)}</span>
               </div>
             )}
             <span className="hud-spell-hotkey">LMB</span>
          </div>

          {/* Special Skills (1, 2, 3) */}
          {character.skills.map((skill, idx) => {
            const cd = skillCooldowns[skill.id] || 0
            
            const iconStyle = getSpellIconStyle(skill)

            return (
              <div 
                key={skill.id} 
                className="hud-spell" 
                title={skill.name}
              >
                <div className="hud-spell-icon" style={iconStyle}></div>
                {cd > 0 && (
                  <div className="hud-spell-cooldown-overlay">
                    <span className="hud-spell-cooldown-text">{Math.ceil(cd / 1000)}</span>
                  </div>
                )}
                <span className="hud-spell-hotkey">{idx + 1}</span>
              </div>
            )
          })}

          <div
            className="hud-spell"
            title={character.passive.name}
          >
            <div className="hud-spell-icon" style={getPassiveIconStyle(character.passive)}></div>
            <span className="hud-spell-hotkey">P</span>
          </div>
        </div>
      </div>

      {/* 3. Right Panel (Minimap) */}
      <div className="hud-panel hud-minimap-panel">
         <div className="minimap-board">
           <div 
             className="minimap-dot minimap-player"
             style={{ 
               left: `${(playerPos.x / mapWidth) * 100}%`,
               top: `${(playerPos.y / mapHeight) * 100}%`
             }} 
           />
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
