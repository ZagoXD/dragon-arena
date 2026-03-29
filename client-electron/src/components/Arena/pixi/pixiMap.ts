import { Container, Sprite, Texture } from 'pixi.js'
import { getCachedFrameTexture, getResolvedTexture } from './pixiTextureCache'
import { TilesetInfo } from './pixiTypes'

const SOURCE_TILE_SIZE = 32

const TILESETS_LOCAL_PATHS: Record<string, { src: string, cols: number }> = {
  'TX Tileset Grass.png': { src: '/tilesets/TX Tileset Grass.png', cols: 8 },
  'grass.png': { src: '/tilesets/TX Tileset Grass.png', cols: 8 },
  'TX Tileset Wall.png': { src: '/tilesets/TX Tileset Wall.png', cols: 16 },
  'wall.png': { src: '/tilesets/TX Tileset Wall.png', cols: 16 },
  'TX Plant with Shadow.png': { src: '/tilesets/Extra/TX Plant with Shadow.png', cols: 16 },
  'plant.png': { src: '/tilesets/Extra/TX Plant with Shadow.png', cols: 16 },
  'plants.png': { src: '/tilesets/Extra/TX Plant with Shadow.png', cols: 16 },
}

export function getTilesetInfo(tileset: any) {
  const pathStr = tileset.image || tileset.source || ''
  if (!pathStr) {
    return null
  }

  const parts = pathStr.split('/')
  let filename = parts[parts.length - 1]
  filename = filename.replace(/\.(tsj|tsx|json)$/i, '.png')

  const fallback = TILESETS_LOCAL_PATHS[filename]
  return {
    firstgid: tileset.firstgid,
    src: fallback ? fallback.src : `/tilesets/${filename}`,
    cols: tileset.columns || (fallback ? fallback.cols : 16),
  } satisfies TilesetInfo
}

export function buildMapLayer(
  frameTextureCache: Map<string, Texture>,
  mapData: any,
  tileSize: number,
  renderLayer: 'background' | 'foreground'
) {
  const layerContainer = new Container()
  layerContainer.label = `map-${renderLayer}`

  const widthTiles = mapData.width
  const loadedTilesets = mapData.tilesets
    .map(getTilesetInfo)
    .filter((tileset: TilesetInfo | null): tileset is TilesetInfo => tileset !== null)
    .sort((a: TilesetInfo, b: TilesetInfo) => b.firstgid - a.firstgid)

  const resolveTilesetForLayer = (layerName: string, globalTileId: number) => {
    const normalizedLayer = layerName.toLowerCase()

    if (normalizedLayer === 'plants' || normalizedLayer === 'collision') {
      return loadedTilesets.find((tileset: TilesetInfo) =>
        globalTileId >= tileset.firstgid &&
        tileset.src.includes('Plant with Shadow')
      )
    }

    if (normalizedLayer === 'walls') {
      return loadedTilesets.find((tileset: TilesetInfo) =>
        globalTileId >= tileset.firstgid &&
        tileset.src.includes('Tileset Wall')
      )
    }

    if (normalizedLayer === 'ground') {
      return loadedTilesets.find((tileset: TilesetInfo) =>
        globalTileId >= tileset.firstgid &&
        tileset.src.includes('Tileset Grass')
      )
    }

    return loadedTilesets.find((tileset: TilesetInfo) => globalTileId >= tileset.firstgid)
  }

  mapData.layers.forEach((layer: any) => {
    if (layer.type !== 'tilelayer') {
      return
    }

    const isBackground = layer.name === 'ground' || layer.name === 'collision'
    if (renderLayer === 'background' && !isBackground) {
      return
    }
    if (renderLayer === 'foreground' && isBackground) {
      return
    }

    layer.data.forEach((globalTileId: number, index: number) => {
      if (globalTileId === 0) {
        return
      }

      const targetTileset = resolveTilesetForLayer(layer.name, globalTileId)
      if (!targetTileset) {
        return
      }

      const localTileId = globalTileId - targetTileset.firstgid
      const sourceTexture = getResolvedTexture(targetTileset.src)
      if (!sourceTexture) {
        return
      }
      const frameX = (localTileId % targetTileset.cols) * SOURCE_TILE_SIZE
      const frameY = Math.floor(localTileId / targetTileset.cols) * SOURCE_TILE_SIZE
      const frameTexture = getCachedFrameTexture(
        frameTextureCache,
        `tile:${targetTileset.src}:${frameX}:${frameY}:${SOURCE_TILE_SIZE}:${SOURCE_TILE_SIZE}`,
        sourceTexture,
        frameX,
        frameY,
        SOURCE_TILE_SIZE,
        SOURCE_TILE_SIZE
      )
      if (!frameTexture) {
        return
      }

      const tile = new Sprite(frameTexture)
      tile.x = (index % widthTiles) * tileSize
      tile.y = Math.floor(index / widthTiles) * tileSize
      tile.width = tileSize
      tile.height = tileSize
      tile.roundPixels = true

      layerContainer.addChild(tile)
    })
  })

  return layerContainer
}
