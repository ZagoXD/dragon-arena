import { Container, Sprite, Texture } from 'pixi.js'
import { getCachedFrameTexture, getResolvedTexture } from './pixiTextureCache'
import { TilesetInfo } from './pixiTypes'

const SOURCE_TILE_SIZE = 32
const loggedTilesetKeys = new Set<string>()
const missingTextureKeys = new Set<string>()

function toPixiAssetPath(path: string) {
  const normalizedPath = path.replace(/\\/g, '/')
  const withBase = window.location.protocol === 'file:'
    ? normalizedPath
    : `/${normalizedPath}`.replace(/\/{2,}/g, '/')

  return encodeURI(withBase)
}

function matchesTileset(tileset: TilesetInfo, pattern: string) {
  return decodeURI(tileset.src).toLowerCase().includes(pattern.toLowerCase())
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

export function getTilesetInfo(tileset: any) {
  const pathStr = tileset.image || tileset.source || ''
  if (!pathStr) {
    return null
  }

  const parts = pathStr.split('/')
  let filename = parts[parts.length - 1]
  filename = filename.replace(/\.(tsj|tsx|json)$/i, '.png')

  const fallback = TILESETS_LOCAL_PATHS[filename]
  const resolved = {
    firstgid: tileset.firstgid,
    src: toPixiAssetPath(fallback ? fallback.src : `tilesets/${filename}`),
    cols: tileset.columns || (fallback ? fallback.cols : 16),
  } satisfies TilesetInfo

  const debugKey = `${resolved.firstgid}:${resolved.src}:${resolved.cols}`
  if (!loggedTilesetKeys.has(debugKey)) {
    loggedTilesetKeys.add(debugKey)
    console.info('[pixiMap] tileset resolved', {
      source: pathStr,
      filename,
      firstgid: resolved.firstgid,
      src: resolved.src,
      cols: resolved.cols,
    })
  }

  return resolved
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

  const findTilesetByGlobalId = (globalTileId: number) =>
    loadedTilesets.find((tileset: TilesetInfo) => globalTileId >= tileset.firstgid)

  const resolveTilesetForLayer = (layerName: string, globalTileId: number) => {
    const normalizedLayer = layerName.toLowerCase()

    if (normalizedLayer === 'props') {
      return loadedTilesets.find((tileset: TilesetInfo) =>
        globalTileId >= tileset.firstgid &&
        matchesTileset(tileset, 'props.png')
      )
    }

    if (normalizedLayer === 'plants') {
      return loadedTilesets.find((tileset: TilesetInfo) =>
        globalTileId >= tileset.firstgid &&
        matchesTileset(tileset, 'Plant with Shadow')
      )
    }

    if (normalizedLayer === 'collision') {
      if (globalTileId >= 577) {
        return loadedTilesets.find((tileset: TilesetInfo) => matchesTileset(tileset, 'TX Props'))
      }

      if (globalTileId >= 513) {
        return loadedTilesets.find((tileset: TilesetInfo) => matchesTileset(tileset, 'Tileset Grass'))
      }

      if (globalTileId >= 257) {
        return loadedTilesets.find((tileset: TilesetInfo) => matchesTileset(tileset, 'Tileset Wall'))
      }

      return loadedTilesets.find((tileset: TilesetInfo) => matchesTileset(tileset, 'Plant with Shadow'))
    }

    if (normalizedLayer === 'walls') {
      return loadedTilesets.find((tileset: TilesetInfo) =>
        globalTileId >= tileset.firstgid &&
        matchesTileset(tileset, 'Tileset Wall')
      )
    }

    if (normalizedLayer === 'ground') {
      return loadedTilesets.find((tileset: TilesetInfo) =>
        globalTileId >= tileset.firstgid &&
        matchesTileset(tileset, 'Tileset Grass')
      )
    }

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
        const debugKey = `${layer.name}:${globalTileId}:${targetTileset.src}`
        if (!missingTextureKeys.has(debugKey)) {
          missingTextureKeys.add(debugKey)
          console.warn('[pixiMap] missing source texture', {
            layer: layer.name,
            gid: globalTileId,
            firstgid: targetTileset.firstgid,
            localTileId,
            src: targetTileset.src,
          })
        }
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
