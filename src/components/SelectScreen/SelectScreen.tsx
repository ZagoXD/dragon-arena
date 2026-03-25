import { useState, useEffect } from 'react'
import { CHARACTERS } from '../../config/characters'
import { ANIMATION_FPS } from '../../config/spriteMap'
import './SelectScreen.css'

interface Props {
  playerName: string
  onSelect: (characterId: string) => void
}

export function SelectScreen({ playerName, onSelect }: Props) {
  const [animIndex, setAnimIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimIndex(prev => prev + 1)
    }, 1000 / ANIMATION_FPS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="select-screen">
      <h1>Choose Your Character</h1>
      <p>Welcome, {playerName}!</p>
      
      <div className="character-list">
        {Object.values(CHARACTERS).map(char => {
          const portraitWidth = char.frameWidth * 0.5
          const portraitHeight = char.frameHeight * 0.5
          const sheetWidth = char.frameWidth * 4 * 0.5
          
          const currentRow = char.idleRows[animIndex % char.idleRows.length]
          const bgPosX = -(2 * portraitWidth) // Column 2 (Down/Front)
          const bgPosY = -(currentRow * portraitHeight)
          
          return (
            <div key={char.id} className="character-card" onClick={() => onSelect(char.id)}>
              <div 
                className="character-portrait"
                style={{
                  width: portraitWidth,
                  height: portraitHeight,
                  backgroundImage: `url(${char.imageSrc})`,
                  backgroundSize: `${sheetWidth}px auto`,
                  backgroundPosition: `${bgPosX}px ${bgPosY}px`
                }}
              />
              <div className="character-info">
                <h3>{char.name}</h3>
                <p><strong>HP:</strong> {char.maxHp}</p>
                <p><strong>Speed:</strong> {char.movementSpeed}</p>
                <p><strong>Attack:</strong> {char.autoAttack.name}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
