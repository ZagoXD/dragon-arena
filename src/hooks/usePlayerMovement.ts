import { useState, useRef, useCallback } from 'react'
import {
  Direction,
  ANIMATION_FPS,
} from '../config/spriteMap'
import { useInput } from './useInput'
import { useGameLoop } from './useGameLoop'

export interface PlayerState {
  x: number
  y: number
  direction: Direction
  animRow: number   // the actual sprite sheet row to use
  lockAction: (dir: Direction, durationMs: number) => void
}

interface Options {
  /** Width of the full game map in px. */
  mapWidth: number
  /** Height of the full game map in px. */
  mapHeight: number
  /** Pixels moved per second (in logical map coordinates). */
  speed: number
  /** Rendered width of the player sprite. */
  renderedWidth: number
  /** Rendered height of the player sprite. */
  renderedHeight: number
  /** Rows representing the idle animation sequence. */
  idleRows: number[]
  /** Rows representing the walk animation sequence. */
  walkRows: number[]
  /** Current HP to disable movement on death. */
  hp: number
}

/**
 * Manages player position, direction, and sprite animation.
 * Reads keyboard state via useInput, steps physics via useGameLoop.
 */
export function usePlayerMovement({ mapWidth, mapHeight, speed, renderedWidth, renderedHeight, idleRows, walkRows, hp }: Options): PlayerState {
  const keys = useInput()

  const animTimerRef  = useRef(0)
  const animIndexRef  = useRef(0)
  const isMovingRef   = useRef(false)
  const lockTimerRef  = useRef(0) // time remaining for movement lock

  const lockAction = useCallback((dir: Direction, durationMs: number) => {
    lockTimerRef.current = durationMs
    setState(prev => ({ ...prev, direction: dir }))
  }, [])

  const [state, setState] = useState<Omit<PlayerState, 'lockAction'>>({
    // Start at the centre of the map
    x: Math.floor(mapWidth  / 2 - renderedWidth  / 2),
    y: Math.floor(mapHeight / 2 - renderedHeight / 2),
    direction: 'down',
    animRow: 0, // Will be overridden by the config later if needed, but safe default
  })

  useGameLoop((deltaMs) => {
    const held = keys.current
    if (!held || hp <= 0) {
      isMovingRef.current = false
      return
    }

    let dx = 0
    let dy = 0

    // Check if we are locked in an animation (e.g. casting fireball)
    if (lockTimerRef.current > 0) {
      lockTimerRef.current -= deltaMs
      // Lock movement and keep current direction
    } else {
      // Normal input processing
      if (held.has('KeyW') || held.has('ArrowUp'))    dy -= 1
      if (held.has('KeyS') || held.has('ArrowDown'))  dy += 1
      if (held.has('KeyA') || held.has('ArrowLeft'))  dx -= 1
      if (held.has('KeyD') || held.has('ArrowRight')) dx += 1
    }

    const isMoving = dx !== 0 || dy !== 0

    // --- Animation ---
    const rows = isMoving ? walkRows : idleRows
    
    // If we switch between moving/idle, start animation from frame 0
    if (isMoving !== isMovingRef.current) {
      animIndexRef.current = 0
      animTimerRef.current = 0
      isMovingRef.current = isMoving
    } else {
      // Normalise diagonal
      if (dx !== 0 && dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy)
        dx /= length
        dy /= length
      }
    }

    // --- Direction (horizontal has priority) ---
    let newDirection: Direction = state.direction
    if (isMoving) {
      if      (dx > 0) newDirection = 'right'
      else if (dx < 0) newDirection = 'left'
      else if (dy < 0) newDirection = 'up'
      else if (dy > 0) newDirection = 'down'
    }

    // --- Position ---
    // Apply speed
    const step = speed * (deltaMs / 1000)
    let newX = state.x + dx * step
    let newY = state.y + dy * step

    // Clamp to map boundaries
    newX = Math.max(0, Math.min(mapWidth  - renderedWidth,  newX))
    newY = Math.max(0, Math.min(mapHeight - renderedHeight, newY))

    // --- Animation ---
    const msPerFrame = 1000 / ANIMATION_FPS

    animTimerRef.current += deltaMs
    if (animTimerRef.current >= msPerFrame) {
      animTimerRef.current -= msPerFrame
      animIndexRef.current = (animIndexRef.current + 1) % rows.length
    }

    const animRow = rows[animIndexRef.current]

    setState({ x: newX, y: newY, direction: newDirection, animRow })
  })

  return { ...state, lockAction }
}
