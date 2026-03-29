export const VIEWPORT_WIDTH = 1280
export const VIEWPORT_HEIGHT = 720

export type Direction = 'up' | 'right' | 'down' | 'left'

export const DIRECTION_COLUMNS: Record<Direction, number> = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
}

export const ANIMATION_FPS = 8

export function getSpellFrame(angle: number): { col: number, row: number } {
  const pi = Math.PI
  let normalized = angle + pi / 8
  if (normalized < 0) normalized += 2 * pi

  const sector = Math.floor(normalized / (pi / 4)) % 8

  switch (sector) {
    case 0: return { col: 2, row: 1 }
    case 1: return { col: 2, row: 2 }
    case 2: return { col: 1, row: 2 }
    case 3: return { col: 0, row: 2 }
    case 4: return { col: 0, row: 1 }
    case 5: return { col: 0, row: 0 }
    case 6: return { col: 1, row: 0 }
    case 7: return { col: 2, row: 0 }
    default: return { col: 1, row: 1 }
  }
}

export function getClosest4WayDirection(angle: number): Direction {
  let normalized = angle + Math.PI / 4
  if (normalized < 0) normalized += 2 * Math.PI
  const quadrant = Math.floor(normalized / (Math.PI / 2)) % 4

  switch (quadrant) {
    case 0: return 'right'
    case 1: return 'down'
    case 2: return 'left'
    case 3: return 'up'
    default: return 'down'
  }
}
