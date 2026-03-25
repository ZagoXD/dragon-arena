import charizardSrc from '../assets/characters/charizard.png'
import emberSrc from '../assets/spells/ember.png'

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
    damage: 150,
    range: 600,
    frameSize: 32,
    castTimeMs: 300,
    cooldownMs: 800,
    imageSrc: emberSrc,
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
    imageSrc: charizardSrc,
  }
}
