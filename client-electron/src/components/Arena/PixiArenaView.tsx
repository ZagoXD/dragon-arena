import { useEffect, useRef, useState } from 'react'
import {
  Application,
  Assets,
  Container,
  Graphics,
  Texture,
  type DestroyOptions,
} from 'pixi.js'
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../../config/spriteMap'
import { buildAimingArrow, buildImpactEffect } from './pixi/pixiEffects'
import { buildDummy, buildPlayer, buildProjectile, PIXI_STATIC_ASSET_URLS } from './pixi/pixiEntities'
import { buildMapLayer, getTilesetInfo } from './pixi/pixiMap'
import { destroyTextureCache } from './pixi/pixiTextureCache'
import { PixiArenaViewProps, TilesetInfo } from './pixi/pixiTypes'
import { getViewportBounds, isPointInsideViewport } from './pixi/pixiViewport'

function destroyChildren(container: Container) {
  const children = container.removeChildren()
  children.forEach(child => child.destroy({ children: true } as DestroyOptions))
}
function collectAssetUrls(props: PixiArenaViewProps) {
  const urls = new Set<string>()

  PIXI_STATIC_ASSET_URLS.forEach(url => urls.add(url))

  props.mapData.tilesets
    .map(getTilesetInfo)
    .filter((tileset: TilesetInfo | null): tileset is TilesetInfo => tileset !== null)
    .forEach((tileset: TilesetInfo) => urls.add(tileset.src))

  if (props.localPlayer) {
    urls.add(props.localPlayer.character.imageSrc)
    urls.add(props.localPlayer.character.autoAttack.imageSrc)
    props.localPlayer.character.skills.forEach(skill => urls.add(skill.imageSrc))
  }

  props.remotePlayers.forEach(player => {
    urls.add(player.character.imageSrc)
    urls.add(player.character.autoAttack.imageSrc)
    player.character.skills.forEach(skill => urls.add(skill.imageSrc))
  })

  props.projectiles.forEach(projectile => urls.add(projectile.spell.imageSrc))

  return [...urls]
}

export function PixiArenaView(props: PixiArenaViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const backgroundRef = useRef<Container | null>(null)
  const entitiesRef = useRef<Container | null>(null)
  const foregroundRef = useRef<Container | null>(null)
  const overlayRef = useRef<Container | null>(null)
  const frameTextureCacheRef = useRef<Map<string, Texture>>(new Map())
  const [assetsReadyVersion, setAssetsReadyVersion] = useState(0)

  useEffect(() => {
    let disposed = false

    const setup = async () => {
      if (!hostRef.current) {
        return
      }

      const app = new Application()
      await app.init({
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        backgroundAlpha: 0,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      })

      if (disposed) {
        app.destroy(true, { children: true })
        return
      }

      hostRef.current.appendChild(app.canvas)
      app.canvas.style.width = '100%'
      app.canvas.style.height = '100%'
      app.canvas.style.display = 'block'
      app.canvas.style.imageRendering = 'pixelated'

      const world = new Container()
      const background = new Container()
      const entities = new Container()
      const overlay = new Container()
      const foreground = new Container()

      entities.sortableChildren = true

      world.addChild(background, entities, overlay, foreground)
      app.stage.addChild(world)

      appRef.current = app
      worldRef.current = world
      backgroundRef.current = background
      entitiesRef.current = entities
      foregroundRef.current = foreground
      overlayRef.current = overlay
    }

    setup()

    return () => {
      disposed = true

      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
      }

      destroyTextureCache(frameTextureCacheRef.current)

      worldRef.current = null
      backgroundRef.current = null
      entitiesRef.current = null
      foregroundRef.current = null
      overlayRef.current = null

      if (hostRef.current) {
        hostRef.current.innerHTML = ''
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadAssets = async () => {
      try {
        await Assets.load(collectAssetUrls(props))
      } catch (error) {
        console.error('PixiArenaView: failed to load one or more assets.', error)
      }

      if (cancelled) {
        return
      }

      worldRef.current?.position.set(-props.cameraX, -props.cameraY)
      setAssetsReadyVersion(version => version + 1)
    }

    loadAssets()

    return () => {
      cancelled = true
    }
  }, [
    props.mapData,
    props.cameraX,
    props.cameraY,
    props.localPlayer,
    props.remotePlayers,
    props.projectiles,
  ])

  useEffect(() => {
    worldRef.current?.position.set(-props.cameraX, -props.cameraY)
  }, [props.cameraX, props.cameraY])

  useEffect(() => {
    if (
      !backgroundRef.current ||
      !foregroundRef.current ||
      assetsReadyVersion === 0
    ) {
      return
    }

    destroyChildren(backgroundRef.current)
    destroyChildren(foregroundRef.current)

    const backgroundTint = new Graphics()
    backgroundTint.rect(0, 0, props.mapWidth, props.mapHeight)
    backgroundTint.fill(0x1c2614)
    backgroundRef.current.addChild(backgroundTint)
    backgroundRef.current.addChild(
      buildMapLayer(frameTextureCacheRef.current, props.mapData, props.tileSize, 'background')
    )

    foregroundRef.current.addChild(
      buildMapLayer(frameTextureCacheRef.current, props.mapData, props.tileSize, 'foreground')
    )
  }, [props.mapData, props.mapHeight, props.mapWidth, props.tileSize, assetsReadyVersion])

  useEffect(() => {
    const entities = entitiesRef.current
    const overlay = overlayRef.current

    if (!entities || !overlay || assetsReadyVersion === 0) {
      return
    }

    destroyChildren(entities)
    destroyChildren(overlay)
    entities.sortableChildren = true
    const viewportBounds = getViewportBounds(props.cameraX, props.cameraY, 160)

    props.dummies.forEach(dummy => {
      if (!isPointInsideViewport(dummy.x, dummy.y, viewportBounds, props.dummyColliderSize)) {
        return
      }
      entities.addChild(buildDummy(dummy, props.dummyMaxHp, props.dummyColliderSize))
    })

    props.remotePlayers.forEach(player => {
      if (!isPointInsideViewport(player.x, player.y, viewportBounds, player.character.colliderWidth)) {
        return
      }
      entities.addChild(
        buildPlayer(
          frameTextureCacheRef.current,
          player.name,
          player.character,
          player.x,
          player.y,
          player.direction,
          player.animRow,
          player.hp,
          player.isDashing,
          player.dashAngle
        )
      )
    })

    if (props.localPlayer) {
      entities.addChild(
        buildPlayer(
          frameTextureCacheRef.current,
          props.localPlayer.name,
          props.localPlayer.character,
          props.localPlayer.x,
          props.localPlayer.y,
          props.localPlayer.direction,
          props.localPlayer.animRow,
          props.localPlayer.hp,
          props.localPlayer.isDashing,
          props.localPlayer.dashAngle
        )
      )
    }

    props.projectiles.forEach(projectile => {
      if (!isPointInsideViewport(projectile.x, projectile.y, viewportBounds, projectile.spell.frameSize)) {
        return
      }
      entities.addChild(buildProjectile(frameTextureCacheRef.current, projectile))
    })

    props.impactEffects.forEach(effect => {
      if (!isPointInsideViewport(effect.x, effect.y, viewportBounds, effect.radius)) {
        return
      }
      entities.addChild(buildImpactEffect(effect))
    })

    const aimingArrow = buildAimingArrow(props.aimingArrowData)
    if (aimingArrow) {
      overlay.addChild(aimingArrow)
    }
  }, [
    props.dummies,
    props.dummyColliderSize,
    props.dummyMaxHp,
    props.remotePlayers,
    props.localPlayer,
    props.projectiles,
    props.impactEffects,
    props.aimingArrowData,
    props.cameraX,
    props.cameraY,
    assetsReadyVersion,
  ])

  useEffect(() => {
    let cancelled = false

    const warmStaticAssets = async () => {
      if (
        !backgroundRef.current ||
        !foregroundRef.current
      ) {
        return
      }

      const staticAssetUrls = props.mapData.tilesets
        .map(getTilesetInfo)
        .filter((tileset: TilesetInfo | null): tileset is TilesetInfo => tileset !== null)
        .map((tileset: TilesetInfo) => tileset.src)

      try {
        await Assets.load(staticAssetUrls)
      } catch (error) {
        console.error('PixiArenaView: failed to warm static map assets.', error)
      }

      if (cancelled) {
        return
      }

      setAssetsReadyVersion(version => version + 1)
    }

    warmStaticAssets()

    return () => {
      cancelled = true
    }
  }, [props.mapData])

  return <div ref={hostRef} className="arena-pixi-root" />
}
