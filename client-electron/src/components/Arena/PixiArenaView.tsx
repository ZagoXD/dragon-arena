import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Application,
  Assets,
  Container,
  Graphics,
  Texture,
  type DestroyOptions,
} from 'pixi.js'
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../../config/spriteMap'
import { PASSIVE_VISUALS } from '../../config/visualConfig'
import { buildAimingArrow, buildBurnEffect, buildImpactEffect, buildSkillEffect } from './pixi/pixiEffects'
import { buildDummy, buildPlayer, buildProjectile, PIXI_STATIC_ASSET_URLS } from './pixi/pixiEntities'
import { buildMapLayer, getTilesetInfo } from './pixi/pixiMap'
import { destroyTextureCache } from './pixi/pixiTextureCache'
import { PixiArenaViewProps, TilesetInfo } from './pixi/pixiTypes'
import { getViewportBounds, isPointInsideViewport } from './pixi/pixiViewport'

function replaceChildren(container: Container, nextChildren: Container['children']) {
  const previousChildren = container.removeChildren()

  if (nextChildren.length > 0) {
    container.addChild(...nextChildren)
  }

  previousChildren.forEach(child =>
    child.destroy({
      children: true,
      texture: false,
      textureSource: false,
    } as DestroyOptions)
  )
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
    urls.add(props.localPlayer.character.passive.imageSrc)
  }

  props.remotePlayers.forEach(player => {
    urls.add(player.character.imageSrc)
    urls.add(player.character.autoAttack.imageSrc)
    player.character.skills.forEach(skill => urls.add(skill.imageSrc))
    urls.add(player.character.passive.imageSrc)
  })

  props.projectiles.forEach(projectile => urls.add(projectile.spell.imageSrc))
  Object.values(PASSIVE_VISUALS).forEach(passive => urls.add(passive.imageSrc))

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
  const persistentAssetUrlsRef = useRef<Set<string>>(new Set(PIXI_STATIC_ASSET_URLS))
  const hasCompletedInitialAssetLoadRef = useRef(false)
  const onReadyChangeRef = useRef(props.onReadyChange)
  const [appReady, setAppReady] = useState(false)
  const [assetsReadyVersion, setAssetsReadyVersion] = useState(0)

  onReadyChangeRef.current = props.onReadyChange

  const assetUrls = useMemo(() => {
    collectAssetUrls(props).forEach(url => persistentAssetUrlsRef.current.add(url))
    return [...persistentAssetUrlsRef.current]
  }, [
    props.mapData,
    props.localPlayer?.character.id,
    props.remotePlayers.map(player => player.character.id).join('|'),
  ])
  const assetUrlsKey = useMemo(() => assetUrls.join('|'), [assetUrls])

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
      setAppReady(true)
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
      setAppReady(false)

      if (hostRef.current) {
      hostRef.current.innerHTML = ''
      }

      onReadyChangeRef.current?.(false)
    }
  }, [])

  useEffect(() => {
    if (!appReady) {
      return
    }

    let cancelled = false

    const loadAssets = async () => {
      const isInitialAssetLoad = !hasCompletedInitialAssetLoadRef.current
      if (isInitialAssetLoad) {
        onReadyChangeRef.current?.(false)
      }

      try {
        await Promise.allSettled(assetUrls.map(url => Assets.load(url)))
      } catch (error) {
        console.error('PixiArenaView: failed to load one or more assets.', error)
      }

      if (cancelled) {
        return
      }

      worldRef.current?.position.set(-props.cameraX, -props.cameraY)
      hasCompletedInitialAssetLoadRef.current = true
      setAssetsReadyVersion(version => version + 1)
      onReadyChangeRef.current?.(true)
    }

    loadAssets()

    return () => {
      cancelled = true
    }
  }, [
    appReady,
    assetUrlsKey,
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

    const backgroundTint = new Graphics()
    backgroundTint.rect(0, 0, props.mapWidth, props.mapHeight)
    backgroundTint.fill(0x1c2614)
    const nextBackgroundChildren = [
      backgroundTint,
      buildMapLayer(frameTextureCacheRef.current, props.mapData, props.tileSize, 'background')
    ]
    const nextForegroundChildren = [
      buildMapLayer(frameTextureCacheRef.current, props.mapData, props.tileSize, 'foreground')
    ]

    replaceChildren(backgroundRef.current, nextBackgroundChildren)
    replaceChildren(foregroundRef.current, nextForegroundChildren)
  }, [props.mapData, props.mapHeight, props.mapWidth, props.tileSize, assetsReadyVersion])

  useEffect(() => {
    const entities = entitiesRef.current
    const overlay = overlayRef.current

    if (!entities || !overlay || assetsReadyVersion === 0) {
      return
    }

    const nextEntities: Container['children'] = []
    const nextOverlay: Container['children'] = []
    const viewportBounds = getViewportBounds(props.cameraX, props.cameraY, 160)
    const resolvePassiveVisual = (passiveId: string) => PASSIVE_VISUALS[passiveId] || null

    props.dummies.forEach(dummy => {
      if (!isPointInsideViewport(dummy.x, dummy.y, viewportBounds, props.dummyColliderSize)) {
        return
      }
      nextEntities.push(buildDummy(dummy, props.dummyMaxHp, props.dummyColliderSize))
    })

    props.remotePlayers.forEach(player => {
      if (!isPointInsideViewport(player.x, player.y, viewportBounds, player.character.colliderWidth)) {
        return
      }
      nextEntities.push(
        buildPlayer(
          frameTextureCacheRef.current,
          player.name,
          player.role,
          player.character,
          player.x,
          player.y,
          player.direction,
          player.animRow,
          player.hp,
          player.shieldHp,
          player.shieldMaxHp,
          false,
          player.isDashing,
          player.dashAngle
        )
      )
    })

    if (props.localPlayer) {
      nextEntities.push(
        buildPlayer(
          frameTextureCacheRef.current,
          props.localPlayer.name,
          props.localPlayer.role,
          props.localPlayer.character,
          props.localPlayer.x,
          props.localPlayer.y,
          props.localPlayer.direction,
          props.localPlayer.animRow,
          props.localPlayer.hp,
          props.localPlayer.shieldHp,
          props.localPlayer.shieldMaxHp,
          true,
          props.localPlayer.isDashing,
          props.localPlayer.dashAngle
        )
      )
    }

    props.projectiles.forEach(projectile => {
      if (!isPointInsideViewport(projectile.x, projectile.y, viewportBounds, projectile.spell.frameSize)) {
        return
      }
      nextEntities.push(buildProjectile(frameTextureCacheRef.current, projectile))
    })

    props.impactEffects.forEach(effect => {
      if (!isPointInsideViewport(effect.x, effect.y, viewportBounds, effect.radius)) {
        return
      }
      nextEntities.push(buildImpactEffect(effect))
    })

    props.activeSkillEffects.forEach(effect => {
      if (!isPointInsideViewport(effect.x, effect.y, viewportBounds, effect.spell.range)) {
        return
      }

      const skillEffect = buildSkillEffect(frameTextureCacheRef.current, effect)
      if (skillEffect) {
        nextEntities.push(skillEffect)
      }
    })

    props.burnZones.forEach(zone => {
      const passive = resolvePassiveVisual(zone.passiveId)
      if (!passive || !isPointInsideViewport(zone.x, zone.y, viewportBounds, zone.size)) {
        return
      }

      const burnEffect = buildBurnEffect(
        frameTextureCacheRef.current,
        passive.imageSrc,
        zone.x,
        zone.y + zone.size / 2,
        zone.size,
        zone.y + zone.size - 12,
        true,
        passive.frameCount,
        passive.frameWidth
      )
      if (burnEffect) {
        nextEntities.push(burnEffect)
      }
    })

    props.burnStatuses.forEach(status => {
      let burnEffect = null

      if (status.targetType === 'player') {
        const localTarget = props.localPlayer && status.targetId === props.localPlayer.id
          ? props.localPlayer
          : null
        const remoteTarget = props.remotePlayers.find(player => player.id === status.targetId)
        const target = localTarget || remoteTarget
        const passive = resolvePassiveVisual(status.passiveId)
        if (!target || !passive) {
          return
        }
        const feetX = target.x + target.character.colliderWidth / 2
        const feetY = target.y + target.character.colliderHeight + 4
        burnEffect = buildBurnEffect(
          frameTextureCacheRef.current,
          passive.imageSrc,
          feetX,
          feetY,
          64,
          feetY + 40,
          true,
          passive.frameCount,
          passive.frameWidth
        )
      } else {
        const target = props.dummies.find(dummy => dummy.id === status.targetId)
        const passive = resolvePassiveVisual(status.passiveId)
        if (!target || !passive) {
          return
        }
        burnEffect = buildBurnEffect(
          frameTextureCacheRef.current,
          passive.imageSrc,
          target.x,
          target.y + props.dummyColliderSize / 2 + 4,
          64,
          target.y + props.dummyColliderSize + 40,
          true,
          passive.frameCount,
          passive.frameWidth
        )
      }

      if (burnEffect) {
        nextEntities.push(burnEffect)
      }
    })

    const aimingArrow = buildAimingArrow(props.aimingArrowData)
    if (aimingArrow) {
      nextOverlay.push(aimingArrow)
    }

    entities.sortableChildren = true
    replaceChildren(entities, nextEntities)
    replaceChildren(overlay, nextOverlay)
  }, [
    props.dummies,
    props.dummyColliderSize,
    props.dummyMaxHp,
    props.remotePlayers,
    props.localPlayer,
    props.projectiles,
    props.impactEffects,
    props.activeSkillEffects,
    props.burnStatuses,
    props.burnZones,
    props.aimingArrowData,
    props.cameraX,
    props.cameraY,
    assetsReadyVersion,
  ])

  return <div ref={hostRef} className="arena-pixi-root" />
}
