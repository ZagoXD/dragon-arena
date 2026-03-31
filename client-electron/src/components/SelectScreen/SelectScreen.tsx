import { useState, useEffect } from 'react'
import { CHARACTER_VISUALS, PASSIVE_VISUALS, SPELL_VISUALS, VisualPassiveConfig, VisualSpellConfig } from '../../config/visualConfig'
import { ANIMATION_FPS } from '../../config/spriteMap'
import './SelectScreen.css'

function getSpellIconStyle(spell: VisualSpellConfig): React.CSSProperties {
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

function getPassiveIconStyle(passive: VisualPassiveConfig): React.CSSProperties {
  return {
    backgroundImage: `url(${passive.imageSrc})`,
    backgroundSize: '100% 500%',
    backgroundPosition: 'center top',
    backgroundRepeat: 'no-repeat',
  }
}

interface Props {
  playerName: string
  selectionLockedUntil: number | null
  onSelect: (characterId: string) => void
}

export function SelectScreen({ playerName, selectionLockedUntil, onSelect }: Props) {
  const [animIndex, setAnimIndex] = useState(0)
  const [hoveredSkill, setHoveredSkill] = useState<VisualSpellConfig | null>(null)
  const [hoveredPassive, setHoveredPassive] = useState<VisualPassiveConfig | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [lockRemainingMs, setLockRemainingMs] = useState(0)

  const isSelectionLocked = selectionLockedUntil !== null && lockRemainingMs > 0

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimIndex(prev => prev + 1)
    }, 1000 / ANIMATION_FPS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const updateRemaining = () => {
      if (selectionLockedUntil === null) {
        setLockRemainingMs(0)
        return
      }

      setLockRemainingMs(Math.max(0, selectionLockedUntil - Date.now()))
    }

    updateRemaining()
    const interval = setInterval(updateRemaining, 250)
    return () => clearInterval(interval)
  }, [selectionLockedUntil])

  return (
    <div
      className="select-screen"
      onMouseLeave={() => {
        setHoveredSkill(null)
        setHoveredPassive(null)
      }}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      <h1>CHOOSE YOUR LEGEND</h1>
      <p>Master the battlefield, {playerName}</p>

      <div className="character-list">
        {Object.values(CHARACTER_VISUALS).map(char => {
          const portraitSize = 100
          const sheetWidth = portraitSize * 4
          const currentRow = char.idleRows[animIndex % char.idleRows.length]
          const bgPosX = -(2 * portraitSize)
          const bgPosY = -(currentRow * portraitSize)
          const allSkills = [SPELL_VISUALS.ember, SPELL_VISUALS.dragon_dive, SPELL_VISUALS.flamethrower, SPELL_VISUALS.fire_blast]
          const passive = PASSIVE_VISUALS.burn

          return (
            <div
              key={char.id}
              className="character-card"
              onClick={() => {
                if (!isSelectionLocked) {
                  onSelect(char.id)
                }
              }}
            >
              <div
                className="character-portrait"
                style={{
                  width: portraitSize,
                  height: portraitSize,
                  backgroundImage: `url(${char.imageSrc})`,
                  backgroundSize: `${sheetWidth}px auto`,
                  backgroundPosition: `${bgPosX}px ${bgPosY}px`,
                }}
              />
              <div className="character-info">
                <h3>{char.name}</h3>

                <div className="character-stats-summary">
                  <span>Gameplay stats carregados do backend ao entrar na arena</span>
                </div>

                <div className="character-skills-container">
                  {allSkills.map(skill => (
                    <div
                      key={skill.id}
                      className={`skill-icon-small ${hoveredSkill?.id === skill.id ? 'active' : ''}`}
                      onMouseEnter={(e) => {
                        e.stopPropagation()
                        setHoveredSkill(skill)
                      }}
                      onMouseLeave={() => setHoveredSkill(null)}
                      style={getSpellIconStyle(skill)}
                    />
                  ))}
                  <div
                    className={`skill-icon-small ${hoveredPassive?.id === passive.id ? 'active' : ''}`}
                    onMouseEnter={(e) => {
                      e.stopPropagation()
                      setHoveredPassive(passive)
                    }}
                    onMouseLeave={() => setHoveredPassive(null)}
                    style={getPassiveIconStyle(passive)}
                  />
                </div>

                <button className="select-btn" disabled={isSelectionLocked}>
                  {isSelectionLocked
                    ? `Respawn Lock ${Math.ceil(lockRemainingMs / 1000)}s`
                    : 'Select Legend'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {isSelectionLocked && (
        <p style={{ marginTop: '18px', color: '#ffcc88', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
          You can change your next character now, but re-entry stays locked until the respawn cooldown ends.
        </p>
      )}

      {hoveredSkill && (
        <div
          className="skill-description-tooltip"
          style={{
            left: `${mousePos.x + 15}px`,
            top: `${mousePos.y + 15}px`,
            position: 'fixed',
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-name">
              {hoveredSkill.id === 'dragon_dive'
                ? 'Dragon Dive'
                : hoveredSkill.id === 'flamethrower'
                  ? 'Flamethrower'
                  : hoveredSkill.id === 'fire_blast'
                    ? 'Fire Blast'
                  : 'Ember'}
            </span>
            <span className="tooltip-type">{hoveredSkill.id === 'ember' ? 'Basic' : 'Skill'}</span>
          </div>
          <p className="tooltip-text">{hoveredSkill.description}</p>
          <div className="tooltip-footer">
            <span>Dados numericos autoritativos via bootstrap</span>
          </div>
        </div>
      )}

      {hoveredPassive && (
        <div
          className="skill-description-tooltip"
          style={{
            left: `${mousePos.x + 15}px`,
            top: `${mousePos.y + 15}px`,
            position: 'fixed',
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-name">{hoveredPassive.name}</span>
            <span className="tooltip-type">Passive</span>
          </div>
          <p className="tooltip-text">{hoveredPassive.description}</p>
          <div className="tooltip-footer">
            <span>Aplicada autoritativamente pelo backend</span>
          </div>
        </div>
      )}
    </div>
  )
}
