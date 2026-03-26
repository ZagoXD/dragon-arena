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
  animRow: number   
  isDashing: boolean
  lockAction: (dir: Direction, durationMs: number) => void
  setPosition: (x: number, y: number) => void
  setIsDashing: (dashing: boolean) => void
  setDirection: (dir: Direction) => void
}

interface Options {
  mapWidth: number
  mapHeight: number
  speed: number
  renderedWidth: number
  renderedHeight: number
  idleRows: number[]
  walkRows: number[]
  hp: number
}

function isBlocked(mapData: any, nx: number, ny: number, w: number, h: number): boolean {
  if (!mapData) return false;
  const worldTileSize = 64;
  const mapWidthPixels = mapData.width * worldTileSize;
  const mapHeightPixels = mapData.height * worldTileSize;

  if (nx < 0 || ny < 0 || nx + w > mapWidthPixels || ny + h > mapHeightPixels) return true;

  const minCol = Math.floor(nx / worldTileSize);
  const maxCol = Math.floor((nx + w - 1) / worldTileSize);
  const minRow = Math.floor(ny / worldTileSize);
  const maxRow = Math.floor((ny + h - 1) / worldTileSize);

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (r >= 0 && r < mapData.height && c >= 0 && c < mapData.width) {
        let index = r * mapData.width + c;
        for (const layer of mapData.layers) {
           if (layer.type === 'tilelayer' && (layer.name === 'walls' || layer.name === 'collision')) {
              if (layer.data[index] > 0) return true;
           }
        }
      }
    }
  }
  return false;
}

export function usePlayerMovement({ mapWidth, mapHeight, speed, renderedWidth, renderedHeight, idleRows, walkRows, hp }: Options): PlayerState {
  const keys = useInput()

  const animTimerRef  = useRef(0)
  const animIndexRef  = useRef(0)
  const isMovingRef   = useRef(false)
  const lockTimerRef  = useRef(0)

  const [state, setState] = useState({
    x: Math.floor(mapWidth  / 2 - renderedWidth  / 2),
    y: Math.floor(mapHeight / 2 - renderedHeight / 2),
    direction: 'down' as Direction,
    animRow: 0,
    isDashing: false
  })

  const lockAction = useCallback((dir: Direction, durationMs: number) => {
    lockTimerRef.current = durationMs
    setState(prev => ({ ...prev, direction: dir }))
  }, [])

  const setPosition = useCallback((x: number, y: number) => {
    setState(prev => ({ ...prev, x, y }))
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
      if (held.has('KeyW') || held.has('ArrowUp'))    dy -= 1
      if (held.has('KeyS') || held.has('ArrowDown'))  dy += 1
      if (held.has('KeyA') || held.has('ArrowLeft'))  dx -= 1
      if (held.has('KeyD') || held.has('ArrowRight')) dx += 1
    }

    const isMoving = dx !== 0 || dy !== 0
    const rows = isMoving ? walkRows : idleRows
    
    if (isMoving !== isMovingRef.current) {
      animIndexRef.current = 0
      animTimerRef.current = 0
      isMovingRef.current = isMoving
    } else {
      if (dx !== 0 && dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy)
        dx /= length
        dy /= length
      }
    }

    let newDirection: Direction = state.direction
    if (isMoving) {
      if      (dx > 0) newDirection = 'right'
      else if (dx < 0) newDirection = 'left'
      else if (dy < 0) newDirection = 'up'
      else if (dy > 0) newDirection = 'down'
    }

    const step = speed * (deltaMs / 1000)
    let newX = state.x + dx * step
    let newY = state.y + dy * step

    const md = (window as any).currentGameMapData;
    const rawMapWidth = md ? md.width * 64 : mapWidth;
    const rawMapHeight = md ? md.height * 64 : mapHeight;

    newX = Math.max(0, Math.min(rawMapWidth  - 64, newX))
    newY = Math.max(0, Math.min(rawMapHeight - 64, newY))

    if (md && isBlocked(md, newX, newY, 64, 64)) {
      if (!isBlocked(md, newX, state.y, 64, 64)) newY = state.y;
      else if (!isBlocked(md, state.x, newY, 64, 64)) newX = state.x;
      else { newX = state.x; newY = state.y; }
    }

    const msPerFrame = 1000 / ANIMATION_FPS
    animTimerRef.current += deltaMs
    if (animTimerRef.current >= msPerFrame) {
      animTimerRef.current -= msPerFrame
      animIndexRef.current = (animIndexRef.current + 1) % rows.length
    }

    const animRow = rows[animIndexRef.current]
    setState(prev => ({ ...prev, x: newX, y: newY, direction: newDirection, animRow }))
  })

  return { ...state, lockAction, setPosition, setIsDashing, setDirection }
}
