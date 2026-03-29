import charizardSrc from '../assets/characters/charizard.png'
import emberSrc from '../assets/spells/ember.png'
import dragonDiveSrc from '../assets/spells/dragon_dive.png'
import {
  AuthoritativeCharacterDefinition,
  AuthoritativeSpellDefinition,
} from '../types/gameplay'

export interface VisualSpellConfig {
  id: string
  description: string
  imageSrc: string
  frameSize: number
  aimingWidth?: number
  renderMode?: 'directional_sheet' | 'single_rotated'
  iconMode?: 'sheet_focus' | 'single_fit'
}

export interface VisualCharacterConfig {
  id: string
  name: string
  imageSrc: string
  frameWidth: number
  frameHeight: number
  renderScale: number
  idleRows: number[]
  walkRows: number[]
}

export type ResolvedSpellConfig = AuthoritativeSpellDefinition & VisualSpellConfig

export interface ResolvedCharacterConfig extends AuthoritativeCharacterDefinition, VisualCharacterConfig {
  autoAttack: ResolvedSpellConfig
  skills: ResolvedSpellConfig[]
}

export const SPELL_VISUALS: Record<string, VisualSpellConfig> = {
  ember: {
    id: 'ember',
    description: 'O dragao cospe fogo, causando dano a quem for atingido.',
    imageSrc: emberSrc,
    frameSize: 64,
    aimingWidth: 32,
    renderMode: 'single_rotated',
    iconMode: 'single_fit',
  },
  dragon_dive: {
    id: 'dragon_dive',
    description: 'O dragao realiza um avanco feroz, causando dano ao longo do trajeto.',
    imageSrc: dragonDiveSrc,
    frameSize: 64,
    aimingWidth: 32,
    renderMode: 'single_rotated',
    iconMode: 'single_fit',
  },
}

export const CHARACTER_VISUALS: Record<string, VisualCharacterConfig> = {
  charizard: {
    id: 'charizard',
    name: 'Charizard',
    imageSrc: charizardSrc,
    frameWidth: 256,
    frameHeight: 256,
    renderScale: 0.5,
    idleRows: [0, 1, 2, 3],
    walkRows: [4, 5, 6],
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
  }
}

export function resolveCharacterConfig(
  characterId: string,
  characters: Record<string, AuthoritativeCharacterDefinition>,
  spells: Record<string, AuthoritativeSpellDefinition>
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

  const skills = gameplay.skillIds
    .map(skillId => resolveSpellConfig(skillId, spells))
    .filter((skill): skill is ResolvedSpellConfig => skill !== null)

  return {
    ...gameplay,
    ...visual,
    autoAttack,
    skills,
  }
}
