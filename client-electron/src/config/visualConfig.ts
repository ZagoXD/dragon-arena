import charizardSrc from '../assets/characters/charizard.png'
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
import {
  AuthoritativeCharacterDefinition,
  AuthoritativePassiveDefinition,
  AuthoritativeSpellDefinition,
} from '../types/gameplay'
import i18n from '../i18n'

export interface VisualSpellConfig {
  id: string
  description: string
  descriptionKey?: string
  imageSrc: string
  frameSize: number
  frameWidth?: number
  frameHeight?: number
  frameCount?: number
  aimingWidth?: number
  aimingStyle?: 'arrow' | 'beam' | 'beam_constant'
  effectKind?: 'projectile' | 'beam' | 'tile_burst' | 'melee_slash' | 'line_burst' | 'self_aura'
  renderMode?: 'directional_sheet' | 'single_rotated'
  iconMode?: 'sheet_focus' | 'single_fit'
  rotationOffsetRad?: number
  iconFrameIndex?: number
  effectScale?: number
}

export interface VisualCharacterConfig {
  id: string
  name: string
  passiveId: string
  skillIds: string[]
  imageSrc: string
  frameWidth: number
  frameHeight: number
  renderScale: number
  idleRows: number[]
  walkRows: number[]
}

export interface VisualPassiveConfig {
  id: string
  name: string
  description: string
  descriptionKey?: string
  imageSrc: string
  frameWidth: number
  frameHeight: number
  frameCount: number
  iconMode?: 'single_fit'
}

export type ResolvedSpellConfig = AuthoritativeSpellDefinition & VisualSpellConfig
export type ResolvedPassiveConfig = AuthoritativePassiveDefinition & VisualPassiveConfig

export interface ResolvedCharacterConfig extends AuthoritativeCharacterDefinition, VisualCharacterConfig {
  autoAttack: ResolvedSpellConfig
  skills: ResolvedSpellConfig[]
  passive: ResolvedPassiveConfig
}

export const SPELL_VISUALS: Record<string, VisualSpellConfig> = {
  ember: {
    id: 'ember',
    description: 'O dragão cospe fogo, causando dano a quem for atingido.',
    descriptionKey: 'select.spellDescriptions.ember',
    imageSrc: emberSrc,
    frameSize: 64,
    aimingWidth: 32,
    renderMode: 'single_rotated',
    iconMode: 'single_fit',
  },
  scratch: {
    id: 'scratch',
    description: 'O dragão arranha ferozmente seus adversários, podendo envenená-los no processo.',
    descriptionKey: 'select.spellDescriptions.scratch',
    imageSrc: scratchSrc,
    frameSize: 64,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 17,
    effectKind: 'melee_slash',
    renderMode: 'single_rotated',
    iconFrameIndex: 2,
  },
  poison_flash: {
    id: 'poison_flash',
    description: 'Um clarão venenoso dispara à frente do dragão, ferindo os inimigos e podendo envenená-los.',
    descriptionKey: 'select.spellDescriptions.poison_flash',
    imageSrc: poisonFlashSrc,
    frameSize: 64,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 14,
    aimingWidth: 64,
    aimingStyle: 'beam_constant',
    effectKind: 'line_burst',
    renderMode: 'single_rotated',
    iconFrameIndex: 5,
  },
  poison_shield: {
    id: 'poison_shield',
    description: 'Uma barreira venenosa envolve o dragão, concedendo um escudo temporário.',
    descriptionKey: 'select.spellDescriptions.poison_shield',
    imageSrc: poisonShieldSrc,
    frameSize: 256,
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 13,
    effectKind: 'self_aura',
    renderMode: 'single_rotated',
    iconFrameIndex: 0,
    effectScale: 0.5,
  },
  dragon_dive: {
    id: 'dragon_dive',
    description: 'O dragão realiza um avanço feroz, causando dano ao longo do trajeto.',
    descriptionKey: 'select.spellDescriptions.dragon_dive',
    imageSrc: dragonDiveSrc,
    frameSize: 64,
    aimingWidth: 32,
    renderMode: 'single_rotated',
    iconMode: 'single_fit',
  },
  flamethrower: {
    id: 'flamethrower',
    description: 'O dragão expele uma lufada curta e densa de fogo, queimando tudo no trajeto.',
    descriptionKey: 'select.spellDescriptions.flamethrower',
    imageSrc: flamethrowerSrc,
    frameSize: 129,
    frameWidth: 129,
    frameHeight: 192,
    frameCount: 6,
    aimingWidth: 129,
    aimingStyle: 'beam',
    effectKind: 'beam',
    renderMode: 'single_rotated',
    iconMode: 'single_fit',
  },
  fire_blast: {
    id: 'fire_blast',
    description: 'O dragão dispara um projétil de chamas que avança em linha reta e continua queimando quem permanecer no trajeto.',
    descriptionKey: 'select.spellDescriptions.fire_blast',
    imageSrc: fireBlastSrc,
    frameSize: 128,
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 4,
    aimingWidth: 128,
    aimingStyle: 'beam',
    effectKind: 'projectile',
    renderMode: 'single_rotated',
    iconMode: 'single_fit',
    rotationOffsetRad: -Math.PI / 2,
  },
  seed_bite: {
    id: 'seed_bite',
    description: 'Várias sementes de planta carnívora surgem ao redor do dragão para prender e machucar seu alvo.',
    descriptionKey: 'select.spellDescriptions.seed_bite',
    imageSrc: seedBiteSrc,
    frameSize: 64,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 9,
    effectKind: 'tile_burst',
    renderMode: 'single_rotated',
    iconFrameIndex: 1,
  },
}

export const PASSIVE_VISUALS: Record<string, VisualPassiveConfig> = {
  burn: {
    id: 'burn',
    name: 'Burn',
    description: 'Queima o alvo por 3 segundos, causando dano periódico.',
    descriptionKey: 'select.passiveDescriptions.burn',
    imageSrc: burnSrc,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 5,
    iconMode: 'single_fit',
  },
  poison: {
    id: 'poison',
    name: 'Poison',
    description: 'Envenena o alvo por mais tempo, causando dano periódico e reduzindo sua velocidade.',
    descriptionKey: 'select.passiveDescriptions.poison',
    imageSrc: poisonSrc,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 7,
    iconMode: 'single_fit',
  },
}

export function resolvePassiveConfig(
  passiveId: string,
  passives: Record<string, AuthoritativePassiveDefinition>
): ResolvedPassiveConfig | null {
  const gameplay = passives[passiveId]
  const visual = PASSIVE_VISUALS[passiveId]

  if (!gameplay || !visual) {
    return null
  }

  return {
    ...gameplay,
    ...visual,
    description: visual.descriptionKey
      ? i18n.t(visual.descriptionKey, visual.description)
      : visual.description,
  }
}

export const CHARACTER_VISUALS: Record<string, VisualCharacterConfig> = {
  charizard: {
    id: 'charizard',
    name: 'Charizard',
    passiveId: 'burn',
    skillIds: ['dragon_dive', 'flamethrower', 'fire_blast'],
    imageSrc: charizardSrc,
    frameWidth: 256,
    frameHeight: 256,
    renderScale: 0.5,
    idleRows: [0, 1, 2, 3],
    walkRows: [4, 5, 6],
  },
  hydra: {
    id: 'hydra',
    name: 'Hydra',
    passiveId: 'poison',
    skillIds: ['poison_flash', 'poison_shield', 'seed_bite'],
    imageSrc: hydraSrc,
    frameWidth: 256,
    frameHeight: 256,
    renderScale: 0.5,
    idleRows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    walkRows: [12, 13],
  },
}

export function resolveSpellConfig(
  spellId: string,
  spells: Record<string, AuthoritativeSpellDefinition>
): ResolvedSpellConfig | null {
  const gameplay = spells[spellId]
  const visual = SPELL_VISUALS[spellId]

  if (!gameplay || !visual) {
    return null
  }

  return {
    ...gameplay,
    ...visual,
    description: visual.descriptionKey
      ? i18n.t(visual.descriptionKey, visual.description)
      : visual.description,
  }
}

export function resolveCharacterConfig(
  characterId: string,
  characters: Record<string, AuthoritativeCharacterDefinition>,
  spells: Record<string, AuthoritativeSpellDefinition>,
  passives: Record<string, AuthoritativePassiveDefinition>
): ResolvedCharacterConfig | null {
  const gameplay = characters[characterId]
  const visual = CHARACTER_VISUALS[characterId]

  if (!gameplay || !visual) {
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
    ...visual,
    autoAttack,
    skills,
    passive,
  }
}
