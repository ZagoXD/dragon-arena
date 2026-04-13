import { CSSProperties, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PASSIVE_VISUALS,
  SPELL_VISUALS,
  VisualPassiveConfig,
  VisualSpellConfig,
  getCharacterAnimationFrames,
  getCharacterFramePosition,
  resolveCharacterCardConfig,
} from '../../config/visualConfig'
import { ANIMATION_FPS } from '../../config/spriteMap'
import { AuthoritativeCharacterDefinition } from '../../types/gameplay'
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

function getPassiveIconStyle(passive: VisualPassiveConfig): CSSProperties {
  return {
    backgroundImage: `url(${passive.imageSrc})`,
    backgroundSize: `100% ${passive.frameCount * 100}%`,
    backgroundPosition: 'center top',
    backgroundRepeat: 'no-repeat',
  }
}

interface Props {
  characters?: Record<string, AuthoritativeCharacterDefinition> | null
}

export function CollectionScreen({ characters }: Props) {
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
        {Object.keys(characters || {}).map(characterId => {
          const character = resolveCharacterCardConfig(characterId, characters)
          if (!character) {
            return null
          }

          const portraitSize = 112
          const sheetWidth = portraitSize * character.presentation.directions.length
          const idleFrames = getCharacterAnimationFrames(character, 'idle', 'down')
          const framePosition = getCharacterFramePosition(character, idleFrames[animIndex % idleFrames.length])
          const bgPosX = -(framePosition.col * portraitSize)
          const bgPosY = -(framePosition.row * portraitSize)
          const skills = character.skillIds
            .map(skillId => SPELL_VISUALS[skillId])
            .filter((skill): skill is VisualSpellConfig => Boolean(skill))
          const passive = PASSIVE_VISUALS[character.passiveId]

          if (!passive) {
            return null
          }

          return (
            <article key={character.id} className="collection-screen__card">
              <div
                className="collection-screen__portrait"
                style={{
                  width: portraitSize,
                  height: portraitSize,
                  backgroundImage: `url(${character.presentation.imageSrc})`,
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

                <p className="collection-screen__description">
                  {character.description
                    ? t(character.descriptionKey, character.description)
                    : ''}
                </p>

                <div className="collection-screen__abilities">
                  {skills.map(skill => (
                    <div key={skill.id} className="collection-screen__ability">
                      <div className="collection-screen__ability-icon" style={getSpellIconStyle(skill)} />
                      <div>
                        <strong>{t(`select.spellNames.${skill.id}`)}</strong>
                        <span>{t(skill.descriptionKey || '', skill.description)}</span>
                      </div>
                    </div>
                  ))}

                  <div className="collection-screen__ability collection-screen__ability--passive">
                    <div className="collection-screen__ability-icon" style={getPassiveIconStyle(passive)} />
                    <div>
                      <strong>{passive.name}</strong>
                      <span>{t(passive.descriptionKey || '', passive.description)}</span>
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
