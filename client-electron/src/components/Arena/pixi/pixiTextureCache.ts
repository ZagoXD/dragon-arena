import { Assets, Rectangle, Texture } from 'pixi.js'
const missingAssetLookups = new Set<string>()

export function destroyTextureCache(cache: Map<string, Texture>) {
  cache.forEach(texture => texture.destroy())
  cache.clear()
}

export function makeFrameTexture(
  texture: Texture,
  frameX: number,
  frameY: number,
  frameWidth: number,
  frameHeight: number
) {
  if (!texture || !texture.source) {
    return null
  }

  return new Texture({
    source: texture.source,
    frame: new Rectangle(frameX, frameY, frameWidth, frameHeight),
  })
}

export function getCachedFrameTexture(
  cache: Map<string, Texture>,
  cacheKey: string,
  texture: Texture,
  frameX: number,
  frameY: number,
  frameWidth: number,
  frameHeight: number
) {
  const cached = cache.get(cacheKey)
  if (cached) {
    return cached
  }

  const nextTexture = makeFrameTexture(texture, frameX, frameY, frameWidth, frameHeight)
  if (nextTexture) {
    cache.set(cacheKey, nextTexture)
  }
  return nextTexture
}

export function getResolvedTexture(src: string) {
  const loadedTexture = Assets.get(src)
  if (loadedTexture instanceof Texture && loadedTexture.source) {
    return loadedTexture
  }

  if (!missingAssetLookups.has(src)) {
    missingAssetLookups.add(src)
    console.warn('[pixiTextureCache] asset not found in Assets cache, trying Texture.from fallback', {
      src,
      cached: loadedTexture,
    })
  }

  try {
    const fallbackTexture = Texture.from(src)
    if (fallbackTexture instanceof Texture && fallbackTexture.source) {
      return fallbackTexture
    }
  } catch {
    return null
  }

  return null
}
