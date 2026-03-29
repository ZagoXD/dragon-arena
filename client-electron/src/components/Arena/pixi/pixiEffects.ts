import { Container, Graphics } from 'pixi.js'
import { AimingArrowView, ImpactEffectView } from './pixiTypes'

export function buildAimingArrow(aimingArrowData: AimingArrowView | null) {
  if (!aimingArrowData) {
    return null
  }

  const container = new Container()
  container.x = aimingArrowData.originX
  container.y = aimingArrowData.originY
  container.rotation = aimingArrowData.angle
  container.zIndex = aimingArrowData.originY + 140

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
