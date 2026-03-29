import { useState, useEffect } from 'react'
import { CHARACTER_VISUALS, SPELL_VISUALS, VisualSpellConfig } from '../../config/visualConfig'
import { ANIMATION_FPS } from '../../config/spriteMap'
import './SelectScreen.css'

function getSpellIconStyle(spell: VisualSpellConfig): React.CSSProperties {
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
  onSelect: (characterId: string) => void
}

export function SelectScreen({ playerName, onSelect }: Props) {
  const [animIndex, setAnimIndex] = useState(0)
  const [hoveredSkill, setHoveredSkill] = useState<VisualSpellConfig | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimIndex(prev => prev + 1)
    }, 1000 / ANIMATION_FPS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className="select-screen"
      onMouseLeave={() => setHoveredSkill(null)}
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
          const allSkills = [SPELL_VISUALS.ember, SPELL_VISUALS.dragon_dive]

          return (
            <div key={char.id} className="character-card" onClick={() => onSelect(char.id)}>
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
                </div>

                <button className="select-btn">Select Legend</button>
              </div>
            </div>
          )
        })}
      </div>

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
            <span className="tooltip-name">{hoveredSkill.id === 'dragon_dive' ? 'Dragon Dive' : 'Ember'}</span>
            <span className="tooltip-type">{hoveredSkill.id === 'ember' ? 'Basic' : 'Skill'}</span>
          </div>
          <p className="tooltip-text">{hoveredSkill.description}</p>
          <div className="tooltip-footer">
            <span>Dados numericos autoritativos via bootstrap</span>
          </div>
        </div>
      )}
    </div>
  )
}
