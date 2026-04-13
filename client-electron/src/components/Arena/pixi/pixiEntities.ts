import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import { getSpellFrame } from '../../../config/spriteMap'
import { getCharacterFramePosition, ResolvedCharacterConfig } from '../../../config/visualConfig'
import { NetPlayer } from '../../../hooks/useSocket'
import { getCachedFrameTexture, getResolvedTexture } from './pixiTextureCache'
import { DummyView, ProjectileView } from './pixiTypes'
import dummyImgSrc from '../../../assets/dummy/dummy.png'
import faintedDummyImgSrc from '../../../assets/dummy/fainted_dummy.png'

const DUMMY_FRAME_SIZE = 64
const DUMMY_ALIVE_FRAME_COUNT = 3

export const PIXI_STATIC_ASSET_URLS = [dummyImgSrc, faintedDummyImgSrc]

function buildShadow(width: number, height: number, alpha = 0.22) {
  const shadow = new Graphics()
  shadow.ellipse(0, 0, width / 2, height / 2)
  shadow.fill({ color: 0x000000, alpha })
  return shadow
}

function getVerticalRelativeRotation(angle: number) {
  return Math.atan2(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)))
}

export function buildPlayer(
  frameTextureCache: Map<string, Texture>,
  character: ResolvedCharacterConfig,
  x: number,
  y: number,
  direction: NetPlayer['direction'],
  animRow: number,
  isDashing?: boolean,
  dashAngle?: number,
  opacity = 1
) {
  const container = new Container()
  container.x = x
  container.y = y

  const dashVisual = character.skills[0]
  const isMeteorDash = Boolean(isDashing && character.id === 'meteor' && dashVisual)
  const isDashSingleRotated = Boolean(
    isMeteorDash
    && (dashVisual.renderMode === 'single_rotated' || dashVisual.renderMode === 'character_override')
  )
  const activeImage = isMeteorDash ? dashVisual.imageSrc : character.imageSrc

  const frameWidth = isMeteorDash ? dashVisual.frameSize : character.frameWidth
  const frameHeight = isMeteorDash ? dashVisual.frameSize : character.frameHeight
  const renderScale = isMeteorDash
    ? (isDashSingleRotated ? 1.0 : 2.0)
    : character.renderScale
  const renderedWidth = frameWidth * renderScale
  const renderedHeight = frameHeight * renderScale
  const horizontalOffset = (renderedWidth - character.colliderWidth) / 2
  const verticalOffset = renderedHeight - character.colliderHeight
  container.zIndex = y + character.colliderHeight + (isDashing ? 60 : 0)

  const fallbackDashAngle =
    direction === 'right' ? 0 :
    direction === 'down' ? Math.PI / 2 :
    direction === 'left' ? Math.PI :
    -Math.PI / 2

  let spriteTexture = getResolvedTexture(activeImage)
  if (!spriteTexture) {
    return container
  }
  if (!isMeteorDash || !isDashSingleRotated) {
    const isDirectionalDash = isMeteorDash && !isDashSingleRotated
    const { col: dashCol, row: dashRow } = getSpellFrame(dashAngle ?? fallbackDashAngle)
    const framePosition = getCharacterFramePosition(character, animRow)
    const actualRow = isDirectionalDash ? dashRow : framePosition.row
    const actualCol = isDirectionalDash ? dashCol : framePosition.col
    spriteTexture = getCachedFrameTexture(
      frameTextureCache,
      `player:${activeImage}:${actualCol}:${actualRow}:${frameWidth}:${frameHeight}`,
      spriteTexture,
      actualCol * frameWidth,
      actualRow * frameHeight,
      frameWidth,
      frameHeight
    )
    if (!spriteTexture) {
      return container
    }
  }

  const sprite = new Sprite(spriteTexture)
  sprite.width = renderedWidth
  sprite.height = renderedHeight
  sprite.anchor.set(0.5)
  sprite.x = renderedWidth / 2 - horizontalOffset
  sprite.y = renderedHeight / 2 - verticalOffset
  sprite.roundPixels = true
  if (isDashSingleRotated) {
    sprite.rotation = dashAngle ?? fallbackDashAngle
  }
  sprite.alpha = opacity

  const shadow = buildShadow(
    Math.max(26, character.colliderWidth * (isDashing ? 1.15 : 0.9)),
    Math.max(10, character.colliderHeight * 0.28),
    isDashing ? 0.3 : 0.22
  )
  shadow.x = character.colliderWidth / 2
  shadow.y = character.colliderHeight - 4

  if (isDashing) {
    const aura = new Graphics()
    aura.ellipse(0, 0, character.colliderWidth * 0.72, character.colliderHeight * 0.42)
    aura.fill({ color: 0xffa040, alpha: 0.12 })
    aura.stroke({ width: 2, color: 0xffc36b, alpha: 0.45 })
    aura.x = character.colliderWidth / 2
    aura.y = character.colliderHeight * 0.55
    aura.alpha = opacity
    container.addChild(aura)
  }

  container.addChild(shadow, sprite)
  return container
}

export function buildPlayerOverhead(
  playerName: string,
  role: string | undefined,
  character: ResolvedCharacterConfig,
  x: number,
  y: number,
  hp: number,
  shieldHp: number,
  shieldMaxHp: number,
  isLocalPlayer: boolean
) {
  const container = new Container()
  container.x = x
  container.y = y
  container.zIndex = 999999

  const renderedHeight = character.frameHeight * character.renderScale
  const verticalOffset = renderedHeight - character.colliderHeight
  const effectiveShieldMax = Math.max(0, shieldMaxHp)
  const effectiveShield = Math.max(0, Math.min(shieldHp, effectiveShieldMax))
  const totalPool = Math.max(1, character.maxHp + effectiveShieldMax)
  const hpPercentage = Math.max(0, hp / totalPool)
  const totalVisiblePercentage = Math.max(0, (hp + effectiveShield) / totalPool)
  const barColor = isLocalPlayer ? 0x4caf50 : 0xf44336

  const overheadY = -verticalOffset - 14
  const hpWidth = 88
  const showAdminBadge = (role || '').toLowerCase() === 'admin'
  const overheadShiftY = showAdminBadge ? 16 : 0

  const nameLabel = new Text({
    text: playerName,
    style: {
      fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
      fontSize: 12,
      fontWeight: '700',
      fill: 0xf6f1e7,
      stroke: { color: 0x11141b, width: 2 },
    },
  })
  nameLabel.anchor.set(0.5, 1)
  nameLabel.x = character.colliderWidth / 2
  nameLabel.y = overheadY - overheadShiftY

  const adminLabel = showAdminBadge ? new Text({
    text: 'Admin',
    style: {
      fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
      fontSize: 11,
      fontWeight: '700',
      fill: 0xff5659,
      stroke: { color: 0x280609, width: 2 },
    },
  }) : null
  if (adminLabel) {
    adminLabel.anchor.set(0.5, 1)
    adminLabel.x = character.colliderWidth / 2
    adminLabel.y = overheadY - overheadShiftY - 16
  }

  const hpTrack = new Graphics()
  hpTrack.roundRect(0, 0, hpWidth, 8, 4)
  hpTrack.fill(0x1b1b1b)
  hpTrack.stroke({ width: 1, color: 0xffffff, alpha: 0.18 })
  hpTrack.x = character.colliderWidth / 2 - hpWidth / 2
  hpTrack.y = overheadY - overheadShiftY + 4

  const shieldFill = new Graphics()
  shieldFill.roundRect(0, 0, Math.max(0, hpWidth * totalVisiblePercentage), 8, 4)
  shieldFill.fill(0xdbe2ea)
  shieldFill.x = character.colliderWidth / 2 - hpWidth / 2
  shieldFill.y = overheadY - overheadShiftY + 4

  const hpFill = new Graphics()
  hpFill.roundRect(0, 0, Math.max(0, hpWidth * hpPercentage), 8, 4)
  hpFill.fill(barColor)
  hpFill.x = character.colliderWidth / 2 - hpWidth / 2
  hpFill.y = overheadY - overheadShiftY + 4

  if (adminLabel) {
    container.addChild(adminLabel, nameLabel, hpTrack, shieldFill, hpFill)
  } else {
    container.addChild(nameLabel, hpTrack, shieldFill, hpFill)
  }
  return container
}

export function buildDummy(dummy: DummyView, maxHp: number, size: number) {
  const container = new Container()
  container.x = dummy.x
  container.y = dummy.y
  container.zIndex = dummy.y + size / 2

  const pct = Math.max(0, dummy.hp / maxHp)
  const barColor = 0xf44336
  const hpWidth = 88

  const nameLabel = new Text({
    text: 'Target Dummy',
    style: {
      fontFamily: 'monospace',
      fontSize: 12,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3 },
    },
  })
  nameLabel.anchor.set(0.5, 1)
  nameLabel.y = -size / 2 - 16

  const hpTrack = new Graphics()
  hpTrack.roundRect(-hpWidth / 2, -size / 2 - 8, hpWidth, 8, 4)
  hpTrack.fill(0x1b1b1b)
  hpTrack.stroke({ width: 1, color: 0xffffff, alpha: 0.18 })

  const hpFill = new Graphics()
  hpFill.roundRect(-hpWidth / 2, -size / 2 - 8, Math.max(0, hpWidth * pct), 8, 4)
  hpFill.fill(barColor)

  const shadow = buildShadow(size * 0.86, size * 0.22, 0.2)
  shadow.y = size / 2 - 4

  const spriteSource = dummy.hp === 0 ? faintedDummyImgSrc : dummyImgSrc
  let spriteTexture = getResolvedTexture(spriteSource)
  if (spriteTexture && dummy.hp > 0) {
    const frameIndex = Math.floor(performance.now() / 180) % DUMMY_ALIVE_FRAME_COUNT
    const frameY = frameIndex * DUMMY_FRAME_SIZE
    spriteTexture = new Texture({
      source: spriteTexture.source,
      frame: new Rectangle(0, frameY, DUMMY_FRAME_SIZE, DUMMY_FRAME_SIZE),
    })
  }

  if (spriteTexture) {
    const sprite = new Sprite(spriteTexture)
    sprite.anchor.set(0.5)
    sprite.width = size
    sprite.height = size
    sprite.roundPixels = true
    sprite.y = dummy.hp === 0 ? 2 : 0
    if (dummy.hp > 0) {
      container.addChild(shadow)
    }
    container.addChild(nameLabel, hpTrack, hpFill, sprite)
    return container
  }

  const fallbackBody = new Graphics()
  fallbackBody.roundRect(-size / 2, -size / 2, size, size, 8)
  fallbackBody.fill(dummy.hp === 0 ? 0x2a2a2a : 0x8d99ae)
  fallbackBody.stroke({ width: 3, color: 0xe63946, alpha: dummy.hp === 0 ? 0.35 : 1 })

  if (dummy.hp > 0) {
    container.addChild(shadow)
  }
  container.addChild(nameLabel, hpTrack, hpFill, fallbackBody)
  return container
}

export function buildProjectile(frameTextureCache: Map<string, Texture>, projectile: ProjectileView) {
  let texture = getResolvedTexture(projectile.spell.imageSrc)
  if (!texture) {
    return new Container()
  }
  const usesDirectionalSheet = projectile.spell.renderMode === 'character_override'
  const frameWidth = projectile.spell.frameWidth || projectile.spell.frameSize
  const frameHeight = projectile.spell.frameHeight || projectile.spell.frameSize
  const frameCount = projectile.spell.frameCount || 1

  if (usesDirectionalSheet) {
    const { col, row } = getSpellFrame(projectile.angle)
    texture = getCachedFrameTexture(
      frameTextureCache,
      `projectile:${projectile.spell.imageSrc}:${col}:${row}:${projectile.spell.frameSize}`,
      texture,
      col * projectile.spell.frameSize,
      row * projectile.spell.frameSize,
      projectile.spell.frameSize,
      projectile.spell.frameSize
    )
    if (!texture) {
      return new Container()
    }
  } else if (frameCount > 1) {
    const frameIndex = Math.floor(performance.now() / 120) % frameCount
    texture = getCachedFrameTexture(
      frameTextureCache,
      `projectile:${projectile.spell.imageSrc}:frame:${frameIndex}:${frameWidth}:${frameHeight}`,
      texture,
      0,
      frameIndex * frameHeight,
      frameWidth,
      frameHeight
    )
    if (!texture) {
      return new Container()
    }
  }

  const sprite = new Sprite(texture)
  sprite.anchor.set(0.5)
  sprite.x = projectile.x
  sprite.y = projectile.y
  sprite.width = frameWidth
  sprite.height = frameHeight
  sprite.roundPixels = true
  sprite.zIndex = projectile.y + frameHeight / 2 + 80
  if (!usesDirectionalSheet) {
    sprite.rotation = projectile.spell.id === 'fire_blast'
      ? getVerticalRelativeRotation(projectile.angle)
      : projectile.angle + (projectile.spell.rotationOffsetRad || 0)
    if (projectile.spell.id === 'fire_blast') {
      sprite.scale.x = Math.cos(projectile.angle) < 0 ? -1 : 1
    }
  }
  sprite.alpha = 0.98

  const container = new Container()
  const trail = new Graphics()
  const trailColor =
    projectile.spell.id === 'ember' ? 0xff7a00 :
    projectile.spell.id === 'fire_blast' ? 0xff9432 :
    0xffd166
  for (let index = 1; index <= 2; index += 1) {
    const distanceBack = index * frameWidth * 0.22
    trail.ellipse(
      -Math.cos(projectile.angle) * distanceBack,
      -Math.sin(projectile.angle) * distanceBack,
      frameWidth * (0.16 - index * 0.03),
      frameHeight * (0.1 - index * 0.02)
    )
    trail.fill({ color: trailColor, alpha: 0.18 / index })
  }
  trail.x = projectile.x
  trail.y = projectile.y

  const glow = new Graphics()
  glow.ellipse(0, 0, frameWidth * 0.22, frameHeight * 0.12)
  glow.fill({
    color:
      projectile.spell.id === 'ember' ? 0xff8a00 :
      projectile.spell.id === 'fire_blast' ? 0xff9c3f :
      0xffd166,
    alpha: projectile.spell.id === 'dragon_dive' ? 0.16 : 0.22,
  })
  glow.x = projectile.x
  glow.y = projectile.y + frameHeight * 0.18
  glow.rotation = projectile.angle

  container.zIndex = sprite.zIndex
  container.addChild(trail, glow, sprite)
  return container
}
