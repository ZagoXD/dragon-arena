import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { getCachedFrameTexture, getResolvedTexture } from './pixiTextureCache'
import { ActiveSkillEffectView, AimingArrowView, ImpactEffectView } from './pixiTypes'

export function buildAimingArrow(aimingArrowData: AimingArrowView | null) {
  if (!aimingArrowData) {
    return null
  }

  const container = new Container()
  container.x = aimingArrowData.originX
  container.y = aimingArrowData.originY
  container.rotation = aimingArrowData.angle
  container.zIndex = aimingArrowData.originY + 140

  if (aimingArrowData.style === 'beam' || aimingArrowData.style === 'beam_constant') {
    const isConstantBeam = aimingArrowData.style === 'beam_constant'
    const startWidth = isConstantBeam ? aimingArrowData.width : 2
    const endWidth = Math.max(startWidth + 2, aimingArrowData.endWidth ?? aimingArrowData.width)
    const fill = new Graphics()
    fill.poly([
      0, -startWidth / 2,
      aimingArrowData.dist, -endWidth / 2,
      aimingArrowData.dist, endWidth / 2,
      0, startWidth / 2,
    ])
    fill.fill({ color: 0xffa347, alpha: 0.22 })
    fill.stroke({ width: 2, color: 0xffdd9c, alpha: 0.5, join: 'round' })

    const core = new Graphics()
    core.poly([
      0, -(isConstantBeam ? startWidth * 0.18 : 0.5),
      aimingArrowData.dist, -endWidth * 0.18,
      aimingArrowData.dist, endWidth * 0.18,
      0, isConstantBeam ? startWidth * 0.18 : 0.5,
    ])
    core.fill({ color: 0xfff0bf, alpha: 0.88 })

    if (isConstantBeam) {
      container.addChild(fill, core)
      return container
    }

    const originPulse = new Graphics()
    originPulse.circle(0, 0, 7)
    originPulse.fill({ color: 0xffd38a, alpha: 0.22 })
    originPulse.stroke({ width: 2, color: 0xfff0bf, alpha: 0.55 })
    container.addChild(fill, core, originPulse)
    return container
  }

  const shaftWidth = Math.max(12, aimingArrowData.width)
  const glowWidth = shaftWidth + 8
  const tipLength = Math.max(18, shaftWidth * 1.8)
  const trailLength = Math.max(0, aimingArrowData.dist - tipLength)

  const glow = new Graphics()
  glow.roundRect(0, -glowWidth / 2, trailLength, glowWidth, glowWidth / 2)
  glow.fill({ color: 0xffd27a, alpha: 0.12 })

  const body = new Graphics()
  body.roundRect(0, -shaftWidth / 2, trailLength, shaftWidth, shaftWidth / 2)
  body.fill({ color: 0xfbf3cf, alpha: 0.38 })
  body.stroke({ width: 2, color: 0xfff8df, alpha: 0.75 })

  const core = new Graphics()
  core.roundRect(0, -Math.max(2, shaftWidth * 0.14), trailLength, Math.max(4, shaftWidth * 0.28), 3)
  core.fill({ color: 0xfff7b3, alpha: 0.95 })

  const guideMarks = new Graphics()
  const markCount = Math.max(2, Math.floor(trailLength / 56))
  for (let index = 1; index <= markCount; index += 1) {
    const x = (trailLength / (markCount + 1)) * index
    guideMarks.moveTo(x, -shaftWidth * 0.42)
    guideMarks.lineTo(x + 7, 0)
    guideMarks.lineTo(x, shaftWidth * 0.42)
  }
  guideMarks.stroke({ width: 2, color: 0xffe8a3, alpha: 0.42, cap: 'round', join: 'round' })

  const tipGlow = new Graphics()
  tipGlow.poly([
    aimingArrowData.dist + tipLength * 0.18, 0,
    trailLength, -glowWidth * 0.82,
    trailLength, glowWidth * 0.82,
  ])
  tipGlow.fill({ color: 0xffc96d, alpha: 0.18 })

  const tip = new Graphics()
  tip.poly([
    aimingArrowData.dist, 0,
    trailLength, -shaftWidth * 0.9,
    trailLength, shaftWidth * 0.9,
  ])
  tip.fill({ color: 0xfff4c4, alpha: 0.96 })
  tip.stroke({ width: 2, color: 0xfff8df, alpha: 0.9, join: 'round' })

  const originPulse = new Graphics()
  originPulse.circle(0, 0, shaftWidth * 0.82)
  originPulse.fill({ color: 0xffcc73, alpha: 0.12 })
  originPulse.stroke({ width: 2, color: 0xffe7ad, alpha: 0.45 })

  const originCore = new Graphics()
  originCore.circle(0, 0, shaftWidth * 0.28)
  originCore.fill({ color: 0xfff7d6, alpha: 0.95 })

  container.addChild(glow, body, core, guideMarks, tipGlow, tip, originPulse, originCore)
  return container
}

export function buildSkillEffect(
  frameTextureCache: Map<string, Texture>,
  effect: ActiveSkillEffectView
) {
  if (effect.spell.effectKind !== 'beam' || effect.warmupMs > 0) {
    return null
  }

  const texture = getResolvedTexture(effect.spell.imageSrc)
  if (!texture) {
    return null
  }

  const frameWidth = effect.spell.frameWidth || effect.spell.frameSize
  const frameHeight = effect.spell.frameHeight || effect.spell.frameSize
  const frameCount = effect.spell.frameCount || 1
  const elapsedMs = effect.activeDurationMs - effect.life
  const activeDurationMs = Math.max(1, effect.activeDurationMs)
  const progress = Math.min(0.999, Math.max(0, elapsedMs / activeDurationMs))
  const frameIndex = Math.min(frameCount - 1, Math.floor(progress * frameCount))

  const frameTexture = getCachedFrameTexture(
    frameTextureCache,
    `skill:${effect.spell.imageSrc}:${frameIndex}:${frameWidth}:${frameHeight}`,
    texture,
    0,
    frameIndex * frameHeight,
    frameWidth,
    frameHeight
  )

  if (!frameTexture) {
    return null
  }

  const container = new Container()
  container.x = effect.x
  container.y = effect.y
  container.rotation = effect.angle + Math.PI / 2
  container.zIndex = effect.y + 110

  const sprite = new Sprite(frameTexture)
  sprite.anchor.set(0.5, 1)
  sprite.width = frameWidth
  sprite.height = frameHeight * 1.5
  sprite.alpha = 0.98
  sprite.roundPixels = true

  container.addChild(sprite)
  return container
}

export function buildImpactEffect(effect: ImpactEffectView) {
  const container = new Container()
  container.x = effect.x
  container.y = effect.y
  container.zIndex = effect.y + 120

  const progress = effect.maxLife > 0 ? effect.life / effect.maxLife : 0
  const alpha = Math.max(0, Math.min(1, progress))
  const radius = effect.radius * (1.15 - progress * 0.5)

  const ring = new Graphics()
  ring.circle(0, 0, radius)
  ring.stroke({ width: Math.max(2, radius * 0.15), color: effect.color, alpha: alpha * 0.8 })

  const core = new Graphics()
  core.circle(0, 0, Math.max(4, radius * 0.4))
  core.fill({ color: effect.color, alpha: alpha * 0.2 })

  const sparks = new Graphics()
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6
    const inner = radius * 0.4
    const outer = radius * 0.95
    sparks.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
    sparks.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
  }
  sparks.stroke({ width: 2, color: effect.color, alpha: alpha * 0.55 })

  container.addChild(core, ring, sparks)
  return container
}

export function buildBurnEffect(
  frameTextureCache: Map<string, Texture>,
  imageSrc: string,
  x: number,
  y: number,
  size: number,
  zIndex: number,
  anchoredToFeet = true
) {
  let texture = getResolvedTexture(imageSrc)
  if (!texture) {
    return null
  }

  const frameCount = 5
  const frameSize = 64
  const frameIndex = Math.floor(performance.now() / 120) % frameCount
  texture = getCachedFrameTexture(
    frameTextureCache,
    `burn:${imageSrc}:${frameIndex}`,
    texture,
    0,
    frameIndex * frameSize,
    frameSize,
    frameSize
  )
  if (!texture) {
    return null
  }

  const sprite = new Sprite(texture)
  sprite.anchor.set(0.5, anchoredToFeet ? 1 : 0.5)
  sprite.x = x
  sprite.y = y
  sprite.width = size
  sprite.height = size
  sprite.alpha = 0.96
  sprite.roundPixels = true
  sprite.zIndex = zIndex
  return sprite
}
