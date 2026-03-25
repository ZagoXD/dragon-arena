import { useEffect, useRef } from 'react'

import grassImgSrc from '/tilesets/TX Tileset Grass.png'
import plantImgSrc from '/tilesets/Extra/TX Plant with Shadow.png'
import wallImgSrc from '/tilesets/TX Tileset Wall.png'

const SOURCE_TILE_SIZE = 32
const SCALE = 2
const WORLD_TILE_SIZE = SOURCE_TILE_SIZE * SCALE

const TILESETS_LOCAL_PATHS: Record<string, { src: string, cols: number }> = {
  'TX Tileset Grass.png': { src: grassImgSrc, cols: 8 },
  'TX Tileset Wall.png': { src: wallImgSrc, cols: 16 },
  'TX Plant with Shadow.png': { src: plantImgSrc, cols: 16 }
}

export function MapRenderer({ mapData, renderLayer = 'all' }: { mapData: any, renderLayer?: 'all' | 'background' | 'foreground' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: renderLayer === 'foreground' })
    if (!ctx) return

    const images: Record<number, HTMLImageElement> = {}
    let loadedCount = 0

    const loadedTilesets: any[] = []
    
    mapData.tilesets.forEach((ts: any) => {
      const pathStr = ts.image || ts.source || ""
      if (!pathStr) return;

      const parts = pathStr.split('/')
      let filename = parts[parts.length - 1]
      // External Tiled maps output .tsj reference instead of an image. Convert them to the local PNG counterpart.
      filename = filename.replace(/\.(tsj|tsx|json)$/i, '.png')
      
      const fallback = TILESETS_LOCAL_PATHS[filename]
      const src = fallback ? fallback.src : `/tilesets/${filename}`
      const cols = ts.columns || (fallback ? fallback.cols : 16) // If columns property is omitted because it's external, inject locally known columns.
      
      loadedTilesets.push({
        firstgid: ts.firstgid,
        src: src,
        cols: cols
      })
    })

    const drawMap = () => {
      // Clear canvas entirely so foreground layer is transparent
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // Paint background solid color only if it's not the foreground overlay
      if (renderLayer !== 'foreground') {
        ctx.fillStyle = '#1c2614'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      
      const widthTiles = mapData.width
      
      mapData.layers.forEach((layer: any) => {
        if (layer.type !== 'tilelayer') return
        
        const isBackground = layer.name === 'ground' || layer.name === 'collision';
        if (renderLayer === 'background' && !isBackground) return;
        if (renderLayer === 'foreground' && isBackground) return;
        
        layer.data.forEach((globalTileId: number, index: number) => {
          if (globalTileId === 0) return
          
          let targetTileset = null
          for (const ts of [...loadedTilesets].sort((a,b) => b.firstgid - a.firstgid)) {
            if (globalTileId >= ts.firstgid) {
              targetTileset = ts
              break
            }
          }
          if (!targetTileset) return
          
          const localTileId = globalTileId - targetTileset.firstgid
          const img = images[targetTileset.firstgid]
          if (!img) return
          
          const srcX = (localTileId % targetTileset.cols) * SOURCE_TILE_SIZE
          const srcY = Math.floor(localTileId / targetTileset.cols) * SOURCE_TILE_SIZE
          
          const destX = (index % widthTiles) * WORLD_TILE_SIZE
          const destY = Math.floor(index / widthTiles) * WORLD_TILE_SIZE
          
          ctx.drawImage(
            img, 
            srcX, srcY, SOURCE_TILE_SIZE, SOURCE_TILE_SIZE, 
            destX, destY, WORLD_TILE_SIZE, WORLD_TILE_SIZE
          )
        })
      })
    }

    loadedTilesets.forEach(ts => {
      const img = new Image()
      img.src = ts.src
      
      const onImageFinished = () => {
        loadedCount++
        if (loadedCount === loadedTilesets.length) {
          drawMap()
        }
      }

      img.onload = onImageFinished
      img.onerror = () => {
        console.error(`Falha ao carregar o tileset: ${ts.src}. Ignorando para não travar o mapa.`)
        onImageFinished()
      }
      images[ts.firstgid] = img
    })
  }, [mapData, renderLayer])

  if (!mapData) return null

  const mapWidth = mapData.width * WORLD_TILE_SIZE
  const mapHeight = mapData.height * WORLD_TILE_SIZE

  return (
    <canvas 
      ref={canvasRef} 
      width={mapWidth} 
      height={mapHeight} 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: mapWidth,
        height: mapHeight,
        zIndex: renderLayer === 'foreground' ? 20 : 0, // Ensure foreground stays above players (z-index 10)
        pointerEvents: 'none',
        imageRendering: 'pixelated'
      }}
    />
  )
}
