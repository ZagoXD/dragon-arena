// ============================================================
// Dragon Arena — Shared Game Configs (World & Physics)
// ============================================================

/** Base tile size used as the grid unit across the arena (px). */
export const TILE_SIZE = 64

// ------------------------------------------------------------
// Map dimensions  (in tiles and pixels)
// ------------------------------------------------------------
export const MAP_COLS = 32
export const MAP_ROWS = 20
export const MAP_WIDTH  = MAP_COLS * TILE_SIZE   // 2048 px
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE   // 1280 px

// ------------------------------------------------------------
// Logical viewport
// ------------------------------------------------------------
export const VIEWPORT_WIDTH  = 1280
export const VIEWPORT_HEIGHT = 720

// ------------------------------------------------------------
// Shared Direction / Animation Constants
// ------------------------------------------------------------
export type Direction = 'up' | 'right' | 'down' | 'left'

export const DIRECTION_COLUMNS: Record<Direction, number> = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
}

export const ANIMATION_FPS = 8

// ------------------------------------------------------------
// Shared Spells / Aiming Helpers
// ------------------------------------------------------------

/**
 * Maps an angle in radians (-PI to PI) to the nearest 8-way direction
 * for a 3x3 sprite sheet. 
 * col 0 = left, col 1 = center, col 2 = right
 * row 0 = up, row 1 = center, row 2 = down
 */
export function getSpellFrame(angle: number): { col: number, row: number } {
  // Normalize angle to [0, 2PI) relative to East (starts at 0)
  const PI = Math.PI
  let a = angle + PI / 8
  if (a < 0) a += 2 * PI
  
  const sector = Math.floor(a / (PI / 4)) % 8
  
  // Sectors:
  // 0: East (E)   -> col 2, row 1
  // 1: SE         -> col 2, row 2
  // 2: South (S)  -> col 1, row 2
  // 3: SW         -> col 0, row 2
  // 4: West (W)   -> col 0, row 1
  // 5: NW         -> col 0, row 0
  // 6: North (N)  -> col 1, row 0
  // 7: NE         -> col 2, row 0
  
  switch (sector) {
    case 0: return { col: 2, row: 1 } // E
    case 1: return { col: 2, row: 2 } // SE
    case 2: return { col: 1, row: 2 } // S
    case 3: return { col: 0, row: 2 } // SW
    case 4: return { col: 0, row: 1 } // W
    case 5: return { col: 0, row: 0 } // NW
    case 6: return { col: 1, row: 0 } // N
    case 7: return { col: 2, row: 0 } // NE
    default: return { col: 1, row: 1 }
  }
}

/** Converts a continuous angle (radians) to the nearest cardinal direction (up, down, left, right). */
export function getClosest4WayDirection(angle: number): Direction {
  // Shift by PI/4 to align quadrants nicely with the axes
  let a = angle + Math.PI / 4
  if (a < 0) a += 2 * Math.PI
  const quadrant = Math.floor(a / (Math.PI / 2)) % 4

  switch (quadrant) {
    case 0: return 'right'
    case 1: return 'down'
    case 2: return 'left'
    case 3: return 'up'
    default: return 'down'
  }
}

// ------------------------------------------------------------
// Target Dummy Config
// ------------------------------------------------------------
export const DUMMY_MAX_HP = 500
export const DUMMY_SIZE = 64
