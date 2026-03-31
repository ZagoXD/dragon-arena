import { Container, Sprite, Texture } from 'pixi.js'
import { getCachedFrameTexture, getResolvedTexture } from './pixiTextureCache'
import { TilesetInfo } from './pixiTypes'

const SOURCE_TILE_SIZE = 32

function toPixiAssetPath(path: string) {
  const normalizedPath = path.replace(/\\/g, '/')
  const withBase = window.location.protocol === 'file:'
    ? normalizedPath
    : `/${normalizedPath}`.replace(/\/{2,}/g, '/')

  return encodeURI(withBase)
}

const TILESETS_LOCAL_PATHS: Record<string, { src: string, cols: number }> = {
  'TX Tileset Grass.png': { src: 'tilesets/TX Tileset Grass.png', cols: 8 },
  'grass.png': { src: 'tilesets/TX Tileset Grass.png', cols: 8 },
  'TX Tileset Wall.png': { src: 'tilesets/TX Tileset Wall.png', cols: 16 },
  'wall.png': { src: 'tilesets/TX Tileset Wall.png', cols: 16 },
  'TX Plant with Shadow.png': { src: 'tilesets/Extra/TX Plant with Shadow.png', cols: 16 },
  'TX Plant with Shadow.tsj': { src: 'tilesets/Extra/TX Plant with Shadow.png', cols: 16 },
  'plant.png': { src: 'tilesets/Extra/TX Plant with Shadow.png', cols: 16 },
  'plants.png': { src: 'tilesets/Extra/TX Plant with Shadow.png', cols: 16 },
  'TX Props.png': { src: 'tilesets/TX Props.png', cols: 16 },
  'TX Props.tsj': { src: 'tilesets/TX Props.png', cols: 16 },
  'props.png': { src: 'tilesets/TX Props.png', cols: 16 },
  'props.tsj': { src: 'tilesets/TX Props.png', cols: 16 },
}

export function getTilesetInfo(tileset: any, order = 0) {
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
    src: toPixiAssetPath(fallback ? fallback.src : `tilesets/${filename}`),
    cols: tileset.columns || (fallback ? fallback.cols : 16),
    order,
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
    .map((tileset: any, index: number) => getTilesetInfo(tileset, index))
    .filter((tileset: TilesetInfo | null): tileset is TilesetInfo => tileset !== null)
    .sort((a: TilesetInfo, b: TilesetInfo) => {
      if (b.firstgid !== a.firstgid) {
        return b.firstgid - a.firstgid
      }

      return b.order - a.order
    })

  const tilesetsWithRanges = loadedTilesets.map((tileset: TilesetInfo) => {
    const texture = getResolvedTexture(tileset.src)
    const sourceHeight = texture?.source?.height ?? 0
    const rows = sourceHeight > 0 ? Math.floor(sourceHeight / SOURCE_TILE_SIZE) : 0
    const cols = tileset.cols > 0 ? tileset.cols : 0
    const tileCount = rows > 0 && cols > 0 ? rows * cols : 0

    return {
      ...tileset,
      tileCount,
    }
  })

  const findTilesetByGlobalId = (globalTileId: number) =>
    tilesetsWithRanges.find((tileset: TilesetInfo & { tileCount: number }) =>
      globalTileId >= tileset.firstgid &&
      tileset.tileCount > 0 &&
      globalTileId < tileset.firstgid + tileset.tileCount
    ) ?? loadedTilesets.find((tileset: TilesetInfo) => globalTileId >= tileset.firstgid)

  const resolveTilesetForLayer = (_layerName: string, globalTileId: number) => {
    return findTilesetByGlobalId(globalTileId)
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
