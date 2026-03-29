import charizardSrc from '../assets/characters/charizard.png'
import emberSrc from '../assets/spells/ember.png'
import dragonDiveSrc from '../assets/spells/dragon_dive.png'

export interface SpellConfig {
  id: string
  name: string
  speed: number
  damage: number
  range: number
  frameSize: number
  castTimeMs: number
  cooldownMs: number
  imageSrc: string
  description: string
  aimingWidth?: number // For reusable aiming arrows
}

export interface CharacterConfig {
  id: string
  name: string
  maxHp: number
  movementSpeed: number
  frameWidth: number
  frameHeight: number
  renderScale: number
  idleRows: number[]
  walkRows: number[]
  autoAttack: SpellConfig
  skills: SpellConfig[]
  imageSrc: string
}

// ------------------------------------------------------------
// Spells Database
// ------------------------------------------------------------
export const SPELLS: Record<string, SpellConfig> = {
  ember: {
    id: 'ember',
    name: 'Ember',
    speed: 1000,
    damage: 50,
    range: 600,
    frameSize: 32,
    castTimeMs: 300,
    cooldownMs: 800,
    imageSrc: emberSrc,
    description: 'O dragão cospe fogo, causando dano a quem for atingido',
    aimingWidth: 32
  },
  dragonDive: {
    id: 'dragon_dive',
    name: 'Dragon Dive',
    speed: 0, // Instant dash logic
    damage: 200,
    range: 600,
    frameSize: 32,
    castTimeMs: 0,
    cooldownMs: 3000,
    imageSrc: dragonDiveSrc,
    description: 'O dragão realiza um avanço feroz, causando dano a todos os alvos atingidos pelo caminho',
    aimingWidth: 32
  }
}

// ------------------------------------------------------------
// Characters Database
// ------------------------------------------------------------
export const CHARACTERS: Record<string, CharacterConfig> = {
  charizard: {
    id: 'charizard',
    name: 'Charizard',
    maxHp: 1000,
    movementSpeed: 220,
    frameWidth: 256,
    frameHeight: 256,
    renderScale: 0.5,
    idleRows: [0, 1, 2, 3],
    walkRows: [4, 5, 6],
    autoAttack: SPELLS.ember,
    skills: [SPELLS.dragonDive],
    imageSrc: charizardSrc,
  }
}
