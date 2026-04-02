import { CSSProperties, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CHARACTER_VISUALS, PASSIVE_VISUALS, SPELL_VISUALS, VisualPassiveConfig, VisualSpellConfig } from '../../config/visualConfig'
import { ANIMATION_FPS } from '../../config/spriteMap'
import './CollectionScreen.css'

function getSpellIconStyle(spell: VisualSpellConfig): CSSProperties {
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

function getPassiveIconStyle(passive: VisualPassiveConfig): CSSProperties {
  return {
    backgroundImage: `url(${passive.imageSrc})`,
    backgroundSize: '100% 500%',
    backgroundPosition: 'center top',
    backgroundRepeat: 'no-repeat',
  }
}

export function CollectionScreen() {
  const { t } = useTranslation()
  const [animIndex, setAnimIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimIndex(prev => prev + 1)
    }, 1000 / ANIMATION_FPS)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="collection-screen">
      <header className="collection-screen__header">
        <span className="collection-screen__eyebrow">{t('collection.eyebrow')}</span>
        <h1>{t('collection.title')}</h1>
        <p>{t('collection.subtitle')}</p>
      </header>

      <div className="collection-screen__grid">
        {Object.values(CHARACTER_VISUALS).map(character => {
          const portraitSize = 112
          const sheetWidth = portraitSize * 4
          const currentRow = character.idleRows[animIndex % character.idleRows.length]
          const bgPosX = -(2 * portraitSize)
          const bgPosY = -(currentRow * portraitSize)
          const skills = [
            SPELL_VISUALS.ember,
            SPELL_VISUALS.dragon_dive,
            SPELL_VISUALS.flamethrower,
            SPELL_VISUALS.fire_blast,
          ]
          const passive = PASSIVE_VISUALS.burn

          return (
            <article key={character.id} className="collection-screen__card">
              <div
                className="collection-screen__portrait"
                style={{
                  width: portraitSize,
                  height: portraitSize,
                  backgroundImage: `url(${character.imageSrc})`,
                  backgroundSize: `${sheetWidth}px auto`,
                  backgroundPosition: `${bgPosX}px ${bgPosY}px`,
                }}
              />

              <div className="collection-screen__content">
                <div className="collection-screen__topline">
                  <div>
                    <h2>{character.name}</h2>
                    <span>{t('collection.availableStatus')}</span>
                  </div>
                  <strong className="collection-screen__rarity">{t('collection.starterRarity')}</strong>
                </div>

                <p className="collection-screen__description">{t('collection.description')}</p>

                <div className="collection-screen__abilities">
                  {skills.map(skill => (
                    <div key={skill.id} className="collection-screen__ability">
                      <div className="collection-screen__ability-icon" style={getSpellIconStyle(skill)} />
                      <div>
                        <strong>{t(`select.spellNames.${skill.id}`)}</strong>
                        <span>{skill.description}</span>
                      </div>
                    </div>
                  ))}

                  <div className="collection-screen__ability collection-screen__ability--passive">
                    <div className="collection-screen__ability-icon" style={getPassiveIconStyle(passive)} />
                    <div>
                      <strong>{passive.name}</strong>
                      <span>{passive.description}</span>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
