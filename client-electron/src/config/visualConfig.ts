import meteorSrc from '../assets/characters/meteor.png'
import hydraSrc from '../assets/characters/hydra.png'
import emberSrc from '../assets/spells/ember.png'
import scratchSrc from '../assets/spells/scratch.png'
import poisonFlashSrc from '../assets/spells/poison_flash.png'
import poisonShieldSrc from '../assets/spells/poison_shield.png'
import dragonDiveSrc from '../assets/spells/dragon_dive.png'
import flamethrowerSrc from '../assets/spells/flamethrower.png'
import fireBlastSrc from '../assets/spells/fire_blast.png'
import seedBiteSrc from '../assets/spells/seed_bite.png'
import burnSrc from '../assets/spells/burn.png'
import poisonSrc from '../assets/spells/poison.png'
import { Direction } from './spriteMap'
import {
  AuthoritativeCharacterDefinition,
  AuthoritativeEffectPresentation,
  AuthoritativePassiveDefinition,
  AuthoritativeSpellDefinition,
} from '../types/gameplay'
import i18n from '../i18n'

export interface CharacterFramePosition {
  frameIndex: number
  col: number
  row: number
}

export interface ResolvedCharacterPresentation {
  imageSrc: string
  frameWidth: number
  frameHeight: number
  renderScale: number
  directions: Direction[]
  animations: Record<string, {
    fps: number
    loop: boolean
    directions: Partial<Record<Direction, number[]>>
  }>
}

export interface ResolvedEffectPresentation extends AuthoritativeEffectPresentation {
  imageSrc: string
  icon: {
    mode?: string
    frameIndex?: number
  }
}

export interface ResolvedSpellConfig extends Omit<AuthoritativeSpellDefinition, 'presentation'> {
  imageSrc: string
  frameSize: number
  frameWidth: number
  frameHeight: number
  frameCount: number
  aimingWidth?: number
  aimingStyle?: 'arrow' | 'beam' | 'beam_constant'
  effectKind: 'projectile' | 'beam' | 'tile_burst' | 'melee_slash' | 'line_burst' | 'self_aura' | 'dash'
  renderMode: 'single_rotated' | 'character_override' | 'vertical_strip' | 'vertical_strip_rotated' | 'attached_vertical_strip' | 'tiled_strip' | 'tiled_area'
  iconMode?: 'sheet_focus' | 'single_fit'
  iconFrameIndex?: number
  effectScale?: number
  rotationOffsetRad?: number
  presentation: ResolvedEffectPresentation
}

export interface ResolvedPassiveConfig extends Omit<AuthoritativePassiveDefinition, 'presentation'> {
  imageSrc: string
  frameWidth: number
  frameHeight: number
  frameCount: number
  effectKind: 'status'
  renderMode: 'attached_vertical_strip'
  iconMode?: 'sheet_focus' | 'single_fit'
  iconFrameIndex?: number
  effectScale?: number
  presentation: ResolvedEffectPresentation
}

export interface ResolvedCharacterConfig extends Omit<AuthoritativeCharacterDefinition, 'presentation'> {
  imageSrc: string
  frameWidth: number
  frameHeight: number
  renderScale: number
  presentation: ResolvedCharacterPresentation
  autoAttack: ResolvedSpellConfig
  skills: ResolvedSpellConfig[]
  passive: ResolvedPassiveConfig
}

const CHARACTER_IMAGE_SRCS: Record<string, string> = {
  'meteor.png': meteorSrc,
  'hydra.png': hydraSrc,
}

const SPELL_IMAGE_SRCS: Record<string, string> = {
  'ember.png': emberSrc,
  'scratch.png': scratchSrc,
  'poison_flash.png': poisonFlashSrc,
  'poison_shield.png': poisonShieldSrc,
  'dragon_dive.png': dragonDiveSrc,
  'flamethrower.png': flamethrowerSrc,
  'fire_blast.png': fireBlastSrc,
  'seed_bite.png': seedBiteSrc,
}

const PASSIVE_IMAGE_SRCS: Record<string, string> = {
  'burn.png': burnSrc,
  'poison.png': poisonSrc,
}

function translateText(defaultText: string, translationKey?: string) {
  return translationKey ? i18n.t(translationKey, defaultText) : defaultText
}

function resolveCharacterImageSrc(gameplay: AuthoritativeCharacterDefinition) {
  return CHARACTER_IMAGE_SRCS[gameplay.presentation.image] || null
}

function resolveEffectImageSrc(presentation: AuthoritativeEffectPresentation) {
  return SPELL_IMAGE_SRCS[presentation.image]
    || PASSIVE_IMAGE_SRCS[presentation.image]
    || null
}

function buildResolvedCharacterPresentation(
  gameplay: AuthoritativeCharacterDefinition
): ResolvedCharacterPresentation | null {
  const imageSrc = resolveCharacterImageSrc(gameplay)
  if (!imageSrc) {
    return null
  }

  const directions = gameplay.presentation.directions as Direction[]
  const animationIds = Object.keys(gameplay.presentation.animations || {})
  const animations = Object.fromEntries(
    animationIds.map(animationId => {
      const clip = gameplay.presentation.animations[animationId]
      const resolvedDirections: Partial<Record<Direction, number[]>> = {}

      for (const direction of directions) {
        const frames = clip?.[direction]
        if (Array.isArray(frames) && frames.length > 0) {
          resolvedDirections[direction] = frames
        }
      }

      return [animationId, {
        fps: clip?.fps || 8,
        loop: clip?.loop ?? true,
        directions: resolvedDirections,
      }]
    })
  )

  return {
    imageSrc,
    frameWidth: gameplay.presentation.frameWidth,
    frameHeight: gameplay.presentation.frameHeight,
    renderScale: gameplay.presentation.renderScale,
    directions,
    animations,
  }
}

function buildResolvedEffectPresentation(
  presentation: AuthoritativeEffectPresentation
): ResolvedEffectPresentation | null {
  const imageSrc = resolveEffectImageSrc(presentation)
  if (!imageSrc) {
    return null
  }

  return {
    ...presentation,
    imageSrc,
    icon: {
      mode: presentation.icon?.mode,
      frameIndex: presentation.icon?.frameIndex,
    },
  }
}

export function getCharacterAnimationFrames(
  character: Pick<ResolvedCharacterConfig, 'presentation'> | { presentation: ResolvedCharacterPresentation },
  animationId: string,
  direction?: Direction
): number[] {
  const clip = character.presentation.animations[animationId]
  if (!clip) {
    return [0]
  }

  if (direction) {
    const directionalFrames = clip.directions[direction]
    if (Array.isArray(directionalFrames) && directionalFrames.length > 0) {
      return directionalFrames
    }
  }

  const frames: number[] = []
  for (const candidateDirection of character.presentation.directions) {
    const candidateFrames = clip.directions[candidateDirection]
    if (Array.isArray(candidateFrames) && candidateFrames.length > 0) {
      frames.push(...candidateFrames)
    }
  }

  return frames.length > 0 ? frames : [0]
}

export function getCharacterAnimationFps(
  character: Pick<ResolvedCharacterConfig, 'presentation'> | { presentation: ResolvedCharacterPresentation },
  animationId: string,
  fallbackFps = 8
) {
  return character.presentation.animations[animationId]?.fps || fallbackFps
}

export function getCharacterFramePosition(
  character: Pick<ResolvedCharacterConfig, 'presentation'> | { presentation: ResolvedCharacterPresentation },
  frameIndex: number
): CharacterFramePosition {
  const columnCount = Math.max(1, character.presentation.directions.length)
  return {
    frameIndex,
    col: ((frameIndex % columnCount) + columnCount) % columnCount,
    row: Math.floor(frameIndex / columnCount),
  }
}

export function resolveSpellConfig(
  spellId: string,
  spells: Record<string, AuthoritativeSpellDefinition>
): ResolvedSpellConfig | null {
  const gameplay = spells[spellId]
  if (!gameplay) {
    return null
  }

  const presentation = buildResolvedEffectPresentation(gameplay.presentation)
  if (!presentation) {
    return null
  }

  return {
    ...gameplay,
    name: translateText(gameplay.name),
    description: translateText(gameplay.description, gameplay.descriptionKey),
    imageSrc: presentation.imageSrc,
    frameSize: presentation.frameWidth,
    frameWidth: presentation.frameWidth,
    frameHeight: presentation.frameHeight,
    frameCount: presentation.frameCount,
    aimingWidth: presentation.aimingWidth || undefined,
    aimingStyle: presentation.aimingStyle as ResolvedSpellConfig['aimingStyle'],
    effectKind: gameplay.effectKind as ResolvedSpellConfig['effectKind'],
    renderMode: presentation.renderMode as ResolvedSpellConfig['renderMode'],
    iconMode: presentation.icon.mode as ResolvedSpellConfig['iconMode'],
    iconFrameIndex: typeof presentation.icon.frameIndex === 'number' ? presentation.icon.frameIndex : undefined,
    effectScale: presentation.effectScale,
    rotationOffsetRad: undefined,
    presentation,
  }
}

export function resolvePassiveConfig(
  passiveId: string,
  passives: Record<string, AuthoritativePassiveDefinition>
): ResolvedPassiveConfig | null {
  const gameplay = passives[passiveId]
  if (!gameplay) {
    return null
  }

  const presentation = buildResolvedEffectPresentation(gameplay.presentation)
  if (!presentation) {
    return null
  }

  return {
    ...gameplay,
    name: translateText(gameplay.name),
    description: translateText(gameplay.description, gameplay.descriptionKey),
    imageSrc: presentation.imageSrc,
    frameWidth: presentation.frameWidth,
    frameHeight: presentation.frameHeight,
    frameCount: presentation.frameCount,
    effectKind: gameplay.effectKind as ResolvedPassiveConfig['effectKind'],
    renderMode: presentation.renderMode as ResolvedPassiveConfig['renderMode'],
    iconMode: presentation.icon.mode as ResolvedPassiveConfig['iconMode'],
    iconFrameIndex: typeof presentation.icon.frameIndex === 'number' ? presentation.icon.frameIndex : undefined,
    effectScale: presentation.effectScale,
    presentation,
  }
}

export function resolveCharacterCardConfig(
  characterId: string,
  characters?: Record<string, AuthoritativeCharacterDefinition> | null
) {
  const authoritative = characters?.[characterId]
  if (!authoritative) {
    return null
  }

  const presentation = buildResolvedCharacterPresentation(authoritative)
  if (!presentation) {
    return null
  }

  return {
    id: authoritative.id,
    name: translateText(authoritative.name),
    description: translateText(authoritative.description, authoritative.descriptionKey),
    descriptionKey: authoritative.descriptionKey,
    passiveId: authoritative.passiveId,
    skillIds: authoritative.skillIds,
    presentation,
  }
}

export function resolveCharacterConfig(
  characterId: string,
  characters: Record<string, AuthoritativeCharacterDefinition>,
  spells: Record<string, AuthoritativeSpellDefinition>,
  passives: Record<string, AuthoritativePassiveDefinition>
): ResolvedCharacterConfig | null {
  const gameplay = characters[characterId]
  if (!gameplay) {
    return null
  }

  const presentation = buildResolvedCharacterPresentation(gameplay)
  if (!presentation) {
    return null
  }

  const autoAttack = resolveSpellConfig(gameplay.autoAttackSpellId, spells)
  if (!autoAttack) {
    return null
  }

  const passive = resolvePassiveConfig(gameplay.passiveId, passives)
  if (!passive) {
    return null
  }

  const skills = gameplay.skillIds
    .map(skillId => resolveSpellConfig(skillId, spells))
    .filter((skill): skill is ResolvedSpellConfig => skill !== null)

  return {
    ...gameplay,
    name: translateText(gameplay.name),
    description: translateText(gameplay.description, gameplay.descriptionKey),
    imageSrc: presentation.imageSrc,
    frameWidth: presentation.frameWidth,
    frameHeight: presentation.frameHeight,
    renderScale: presentation.renderScale,
    presentation,
    autoAttack,
    skills,
    passive,
  }
}
