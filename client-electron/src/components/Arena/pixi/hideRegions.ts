interface HideRegionAnalysis {
  width: number
  height: number
  tileSize: number
  regionIds: Int32Array
}

interface HideableActor {
  x: number
  y: number
  colliderWidth: number
  colliderHeight: number
}

function toTileIndex(width: number, x: number, y: number) {
  return y * width + x
}

export function buildHideRegionAnalysis(mapData: any, tileSize: number): HideRegionAnalysis | null {
  if (!mapData || !Array.isArray(mapData.layers) || !mapData.width || !mapData.height) {
    return null
  }

  const hideLayer = mapData.layers.find((layer: any) =>
    layer?.type === 'tilelayer' && String(layer?.name || '').toLowerCase() === 'hide'
  )
  if (!hideLayer || !Array.isArray(hideLayer.data)) {
    return null
  }

  const width = Number(mapData.width) || 0
  const height = Number(mapData.height) || 0
  if (width <= 0 || height <= 0 || hideLayer.data.length < width * height) {
    return null
  }

  const regionIds = new Int32Array(width * height)
  let nextRegionId = 1

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const startIndex = toTileIndex(width, col, row)
      if (hideLayer.data[startIndex] === 0 || regionIds[startIndex] !== 0) {
        continue
      }

      const stack = [[col, row]]
      regionIds[startIndex] = nextRegionId

      while (stack.length > 0) {
        const [currentCol, currentRow] = stack.pop()!
        const neighbors = [
          [currentCol + 1, currentRow],
          [currentCol - 1, currentRow],
          [currentCol, currentRow + 1],
          [currentCol, currentRow - 1],
        ]

        for (const [neighborCol, neighborRow] of neighbors) {
          if (neighborCol < 0 || neighborCol >= width || neighborRow < 0 || neighborRow >= height) {
            continue
          }

          const neighborIndex = toTileIndex(width, neighborCol, neighborRow)
          if (hideLayer.data[neighborIndex] === 0 || regionIds[neighborIndex] !== 0) {
            continue
          }

          regionIds[neighborIndex] = nextRegionId
          stack.push([neighborCol, neighborRow])
        }
      }

      nextRegionId += 1
    }
  }

  return {
    width,
    height,
    tileSize,
    regionIds,
  }
}

export function getHideRegionIdForActor(analysis: HideRegionAnalysis | null, actor: HideableActor | null | undefined) {
  if (!analysis || !actor) {
    return 0
  }

  const probeX = actor.x + actor.colliderWidth / 2
  const probeY = actor.y + actor.colliderHeight - 4
  const col = Math.floor(probeX / analysis.tileSize)
  const row = Math.floor(probeY / analysis.tileSize)

  if (col < 0 || col >= analysis.width || row < 0 || row >= analysis.height) {
    return 0
  }

  return analysis.regionIds[toTileIndex(analysis.width, col, row)] || 0
}

export function getHideRegionIdForPoint(analysis: HideRegionAnalysis | null, x: number, y: number) {
  if (!analysis) {
    return 0
  }

  const col = Math.floor(x / analysis.tileSize)
  const row = Math.floor(y / analysis.tileSize)

  if (col < 0 || col >= analysis.width || row < 0 || row >= analysis.height) {
    return 0
  }

  return analysis.regionIds[toTileIndex(analysis.width, col, row)] || 0
}
