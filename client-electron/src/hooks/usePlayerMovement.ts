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
  inputX: number
  inputY: number
  direction: Direction
  animRow: number
  isDashing: boolean
  lockAction: (dir: Direction, durationMs: number) => void
  setPosition: (x: number, y: number) => void
  reconcilePosition: (x: number, y: number) => void
  setIsDashing: (dashing: boolean) => void
  setDirection: (dir: Direction) => void
}

interface Options {
  mapWidth: number
  mapHeight: number
  tileSize: number
  speed: number
  colliderWidth: number
  colliderHeight: number
  idleRows: number[]
  walkRows: number[]
  hp: number
}

function isBlocked(mapData: any, nx: number, ny: number, width: number, height: number, tileSize: number): boolean {
  if (!mapData) return false

  const mapWidthPixels = mapData.width * tileSize
  const mapHeightPixels = mapData.height * tileSize

  if (nx < 0 || ny < 0 || nx + width > mapWidthPixels || ny + height > mapHeightPixels) return true

  const minCol = Math.floor(nx / tileSize)
  const maxCol = Math.floor((nx + width - 1) / tileSize)
  const minRow = Math.floor(ny / tileSize)
  const maxRow = Math.floor((ny + height - 1) / tileSize)

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      if (row >= 0 && row < mapData.height && col >= 0 && col < mapData.width) {
        const index = row * mapData.width + col
        for (const layer of mapData.layers) {
          if (layer.type === 'tilelayer' && (layer.name === 'walls' || layer.name === 'collision')) {
            if (layer.data[index] > 0) return true
          }
        }
      }
    }
  }

  return false
}

export function usePlayerMovement({
  mapWidth,
  mapHeight,
  tileSize,
  speed,
  colliderWidth,
  colliderHeight,
  idleRows,
  walkRows,
  hp,
}: Options): PlayerState {
  const keys = useInput()

  const animTimerRef = useRef(0)
  const animIndexRef = useRef(0)
  const isMovingRef = useRef(false)
  const lockTimerRef = useRef(0)
  const authoritativeTargetRef = useRef<{ x: number, y: number } | null>(null)

  const [state, setState] = useState({
    x: Math.floor(mapWidth / 2 - colliderWidth / 2),
    y: Math.floor(mapHeight / 2 - colliderHeight / 2),
    inputX: 0,
    inputY: 0,
    direction: 'down' as Direction,
    animRow: 0,
    isDashing: false,
  })

  const lockAction = useCallback((dir: Direction, durationMs: number) => {
    lockTimerRef.current = durationMs
    setState(prev => ({ ...prev, direction: dir }))
  }, [])

  const setPosition = useCallback((x: number, y: number) => {
    authoritativeTargetRef.current = null
    setState(prev => ({ ...prev, x, y }))
  }, [])

  const reconcilePosition = useCallback((x: number, y: number) => {
    authoritativeTargetRef.current = { x, y }
  }, [])

  const setIsDashing = useCallback((isDashing: boolean) => {
    setState(prev => ({ ...prev, isDashing }))
  }, [])

  const setDirection = useCallback((direction: Direction) => {
    setState(prev => ({ ...prev, direction }))
  }, [])

  useGameLoop((deltaMs) => {
    if (state.isDashing || hp <= 0) return

    const held = keys.current
    if (!held) {
      isMovingRef.current = false
      return
    }

    let dx = 0
    let dy = 0

    if (lockTimerRef.current > 0) {
      lockTimerRef.current -= deltaMs
    } else {
      if (held.has('KeyW') || held.has('ArrowUp')) dy -= 1
      if (held.has('KeyS') || held.has('ArrowDown')) dy += 1
      if (held.has('KeyA') || held.has('ArrowLeft')) dx -= 1
      if (held.has('KeyD') || held.has('ArrowRight')) dx += 1
    }

    const isMoving = dx !== 0 || dy !== 0
    const rows = isMoving ? walkRows : idleRows

    if (isMoving !== isMovingRef.current) {
      animIndexRef.current = 0
      animTimerRef.current = 0
      isMovingRef.current = isMoving
    } else if (dx !== 0 && dy !== 0) {
      const length = Math.sqrt(dx * dx + dy * dy)
      dx /= length
      dy /= length
    }

    let newDirection: Direction = state.direction
    const isLocked = lockTimerRef.current > 0
    if (isMoving && !isLocked) {
      if (dx > 0) newDirection = 'right'
      else if (dx < 0) newDirection = 'left'
      else if (dy < 0) newDirection = 'up'
      else if (dy > 0) newDirection = 'down'
    }

    const step = speed * (deltaMs / 1000)
    let newX = state.x + dx * step
    let newY = state.y + dy * step

    const currentMap = (window as any).currentGameMapData
    const rawMapWidth = currentMap ? currentMap.width * tileSize : mapWidth
    const rawMapHeight = currentMap ? currentMap.height * tileSize : mapHeight

    newX = Math.max(0, Math.min(rawMapWidth - colliderWidth, newX))
    newY = Math.max(0, Math.min(rawMapHeight - colliderHeight, newY))

    if (currentMap && isBlocked(currentMap, newX, newY, colliderWidth, colliderHeight, tileSize)) {
      if (!isBlocked(currentMap, newX, state.y, colliderWidth, colliderHeight, tileSize)) newY = state.y
      else if (!isBlocked(currentMap, state.x, newY, colliderWidth, colliderHeight, tileSize)) newX = state.x
      else {
        newX = state.x
        newY = state.y
      }
    }

    const target = authoritativeTargetRef.current
    if (target) {
      const errorX = target.x - newX
      const errorY = target.y - newY
      const errorDistance = Math.hypot(errorX, errorY)

      if (errorDistance > 96) {
        newX = target.x
        newY = target.y
        authoritativeTargetRef.current = null
      } else if (errorDistance > 1) {
        const correctionFactor = Math.min(1, (deltaMs / 1000) * 12)
        newX += errorX * correctionFactor
        newY += errorY * correctionFactor
      } else {
        authoritativeTargetRef.current = null
      }
    }

    const msPerFrame = 1000 / ANIMATION_FPS
    animTimerRef.current += deltaMs
    if (animTimerRef.current >= msPerFrame) {
      animTimerRef.current -= msPerFrame
      animIndexRef.current = (animIndexRef.current + 1) % rows.length
    }

    const animRow = rows[animIndexRef.current]
    setState(prev => ({ ...prev, x: newX, y: newY, inputX: dx, inputY: dy, direction: newDirection, animRow }))
  })

  return { ...state, lockAction, setPosition, reconcilePosition, setIsDashing, setDirection }
}
