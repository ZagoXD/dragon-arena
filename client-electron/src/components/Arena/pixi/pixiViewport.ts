import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../../../config/spriteMap'

export interface ViewportBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export function getViewportBounds(cameraX: number, cameraY: number, padding = 128): ViewportBounds {
  return {
    left: cameraX - padding,
    top: cameraY - padding,
    right: cameraX + VIEWPORT_WIDTH + padding,
    bottom: cameraY + VIEWPORT_HEIGHT + padding,
  }
}

export function isPointInsideViewport(
  x: number,
  y: number,
  bounds: ViewportBounds,
  radius = 0
) {
  return (
    x + radius >= bounds.left &&
    y + radius >= bounds.top &&
    x - radius <= bounds.right &&
    y - radius <= bounds.bottom
  )
}
