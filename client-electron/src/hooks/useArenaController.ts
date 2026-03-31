import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameLoop } from './useGameLoop'
import { useMousePosition } from './useMousePosition'
import { usePlayerMovement } from './usePlayerMovement'
import { ResolvedCharacterConfig, ResolvedSpellConfig, VisualCharacterConfig } from '../config/visualConfig'
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH, getClosest4WayDirection } from '../config/spriteMap'

interface UseArenaControllerParams {
  inputEnabled: boolean
  character: ResolvedCharacterConfig | null
  fallbackVisual: VisualCharacterConfig
  bootstrapPlayer?: {
    x: number
    y: number
    direction: 'up' | 'right' | 'down' | 'left'
  }
  authoritativePosition: { x: number, y: number } | null
  mapWidth: number
  mapHeight: number
  tileSize: number
  hp: number
  hasAuthoritativePlayerState: boolean
  autoAttackCD: number
  skillCooldowns: Record<string, number>
  respawnSeconds: number
  emitMove: (inputX: number, inputY: number, direction: 'up' | 'right' | 'down' | 'left', animRow: number) => void
  emitRespawn: () => void
  emitShoot: (targetX: number, targetY: number) => void
  emitUseSkill: (skillId: string, x: number, y: number) => void
  onReturnToSelect: (respawnAvailableAt?: number) => void
}

export function useArenaController({
  inputEnabled,
  character,
  fallbackVisual,
  bootstrapPlayer,
  authoritativePosition,
  mapWidth,
  mapHeight,
  tileSize,
  hp,
  hasAuthoritativePlayerState,
  autoAttackCD,
  skillCooldowns,
  respawnSeconds,
  emitMove,
  emitRespawn,
  emitShoot,
  emitUseSkill,
  onReturnToSelect,
}: UseArenaControllerParams) {
  const [scale, setScale] = useState(() =>
    Math.min(window.innerWidth / VIEWPORT_WIDTH, window.innerHeight / VIEWPORT_HEIGHT)
  )
  const [showScoreboard, setShowScoreboard] = useState(false)
  const [aimingSkill, setAimingSkill] = useState<ResolvedSpellConfig | null>(null)
  const [aimingArrowData, setAimingArrowData] = useState<{
    angle: number
    dist: number
    width: number
    endWidth?: number
    style?: 'arrow' | 'beam' | 'beam_constant'
    originX: number
    originY: number
  } | null>(null)
  const [respawnTimer, setRespawnTimer] = useState<number | null>(null)
  const [respawnAvailableAt, setRespawnAvailableAt] = useState<number | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const mousePos = useMousePosition()
  const attackRequestPendingRef = useRef(false)
  const skillRequestPendingRef = useRef<Record<string, boolean>>({})
  const attackPendingTimeoutRef = useRef<number | null>(null)
  const skillPendingTimeoutsRef = useRef<Record<string, number>>({})
  const isMouseDownRef = useRef(false)

  const player = usePlayerMovement({
    enabled: inputEnabled,
    mapWidth,
    mapHeight,
    tileSize,
    speed: character?.movementSpeed ?? 0,
    colliderWidth: character?.colliderWidth ?? 64,
    colliderHeight: character?.colliderHeight ?? 64,
    idleRows: fallbackVisual.idleRows,
    walkRows: fallbackVisual.walkRows,
    hp,
  })

  const playerRef = useRef(player)
  const hpRef = useRef(hp)
  const aimingSkillRef = useRef(aimingSkill)
  const hasAppliedBootstrapPositionRef = useRef(false)
  playerRef.current = player
  hpRef.current = hp
  aimingSkillRef.current = aimingSkill

  useEffect(() => {
    const compute = () => setScale(Math.min(window.innerWidth / VIEWPORT_WIDTH, window.innerHeight / VIEWPORT_HEIGHT))
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  useEffect(() => {
    if (!bootstrapPlayer) return

    if (hasAppliedBootstrapPositionRef.current) return

    player.setPosition(bootstrapPlayer.x, bootstrapPlayer.y)
    player.setDirection(bootstrapPlayer.direction)
    hasAppliedBootstrapPositionRef.current = true
  }, [bootstrapPlayer, player.setDirection, player.setPosition])

  useEffect(() => {
    if (!authoritativePosition) return
    player.reconcilePosition(authoritativePosition.x, authoritativePosition.y)
  }, [authoritativePosition, player.reconcilePosition])

  useEffect(() => {
    if (!hasAuthoritativePlayerState) return
    if (hp > 0) {
      setRespawnTimer(null)
      setRespawnAvailableAt(null)
      return
    }
    if (respawnTimer === null) {
      setRespawnTimer(respawnSeconds)
      setRespawnAvailableAt(Date.now() + respawnSeconds * 1000)
    }
  }, [hasAuthoritativePlayerState, hp, respawnSeconds, respawnTimer])

  useEffect(() => {
    if (respawnTimer === null) return
    if (respawnTimer === 0) {
      setRespawnTimer(null)
      emitRespawn()
      return
    }
    const id = setInterval(() => setRespawnTimer(t => (t !== null ? t - 1 : null)), 1000)
    return () => clearInterval(id)
  }, [respawnTimer, emitRespawn])

  const camera = useMemo(() => {
    const px = player.x + (character?.colliderWidth ?? 64) / 2
    const py = player.y + (character?.colliderHeight ?? 64) / 2
    return {
      cameraX: Math.max(0, Math.min(mapWidth - VIEWPORT_WIDTH, px - VIEWPORT_WIDTH / 2)),
      cameraY: Math.max(0, Math.min(mapHeight - VIEWPORT_HEIGHT, py - VIEWPORT_HEIGHT / 2)),
    }
  }, [player.x, player.y, character, mapWidth, mapHeight])

  const cameraRef = useRef(camera)
  cameraRef.current = camera

  const fireActiveSkill = useCallback(() => {
    if (!inputEnabled) return
    const activeSkill = aimingSkillRef.current
    if (!activeSkill || !character) return

    const viewport = viewportRef.current
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const mouseLogicalX = (mousePos.current.x - rect.left) / scale
    const mouseLogicalY = (mousePos.current.y - rect.top) / scale
    const targetWorldX = mouseLogicalX + cameraRef.current.cameraX
    const targetWorldY = mouseLogicalY + cameraRef.current.cameraY

    const originX = playerRef.current.x + character.colliderWidth / 2
    const originY = playerRef.current.y + character.colliderHeight / 2
    const angle = Math.atan2(targetWorldY - originY, targetWorldX - originX)
    const usesFixedRange = activeSkill.id === 'flamethrower' || activeSkill.id === 'fire_blast'
    const resolvedTargetX = usesFixedRange
      ? originX + Math.cos(angle) * activeSkill.range
      : targetWorldX
    const resolvedTargetY = usesFixedRange
      ? originY + Math.sin(angle) * activeSkill.range
      : targetWorldY
    playerRef.current.setDirection(getClosest4WayDirection(angle))

    if (skillRequestPendingRef.current[activeSkill.id]) return
    skillRequestPendingRef.current[activeSkill.id] = true
    if (skillPendingTimeoutsRef.current[activeSkill.id]) {
      window.clearTimeout(skillPendingTimeoutsRef.current[activeSkill.id])
    }
    skillPendingTimeoutsRef.current[activeSkill.id] = window.setTimeout(() => {
      skillRequestPendingRef.current[activeSkill.id] = false
      delete skillPendingTimeoutsRef.current[activeSkill.id]
    }, 400)
    emitUseSkill(activeSkill.id, resolvedTargetX, resolvedTargetY)
    setAimingSkill(null)
  }, [character, emitUseSkill, inputEnabled, mousePos, scale])

  useEffect(() => {
    if (autoAttackCD <= 0) return
    attackRequestPendingRef.current = false
    if (attackPendingTimeoutRef.current !== null) {
      window.clearTimeout(attackPendingTimeoutRef.current)
      attackPendingTimeoutRef.current = null
    }
  }, [autoAttackCD])

  useEffect(() => {
    for (const skillId of Object.keys(skillCooldowns)) {
      if (skillCooldowns[skillId] <= 0) continue
      skillRequestPendingRef.current[skillId] = false
      if (skillPendingTimeoutsRef.current[skillId]) {
        window.clearTimeout(skillPendingTimeoutsRef.current[skillId])
        delete skillPendingTimeoutsRef.current[skillId]
      }
    }
  }, [skillCooldowns])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!inputEnabled) {
        return
      }
      if (e.button === 0) {
        if (aimingSkillRef.current) fireActiveSkill()
        else isMouseDownRef.current = true
      }
      if (e.button === 2) setAimingSkill(null)
    }

    const onMouseUp = (e: MouseEvent) => {
      if (!inputEnabled) {
        return
      }
      if (e.button === 0) isMouseDownRef.current = false
    }

    const onContext = (e: MouseEvent) => e.preventDefault()

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [fireActiveSkill, inputEnabled])

  useEffect(() => {
    if (!character) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!inputEnabled && e.key !== 'Escape') {
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        setShowScoreboard(true)
      }
      if (e.key === '1' && character.skills[0]) {
        const cd = skillCooldowns[character.skills[0].id] || 0
        if (cd <= 0) setAimingSkill(character.skills[0])
      }
      if (e.key === '2' && character.skills[1]) {
        const cd = skillCooldowns[character.skills[1].id] || 0
        if (cd <= 0) setAimingSkill(character.skills[1])
      }
      if (e.key === '3' && character.skills[2]) {
        const cd = skillCooldowns[character.skills[2].id] || 0
        if (cd <= 0) setAimingSkill(character.skills[2])
      }
      if (e.key === 'Escape') {
        if (aimingSkillRef.current) {
          setAimingSkill(null)
          return
        }

        if (hasAuthoritativePlayerState && hp <= 0) {
          onReturnToSelect(respawnAvailableAt ?? undefined)
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Tab') setShowScoreboard(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [character, skillCooldowns, hasAuthoritativePlayerState, hp, inputEnabled, onReturnToSelect, respawnAvailableAt])

  useGameLoop(() => {
    if (!character || !inputEnabled) return

    if (aimingSkillRef.current) {
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      const mouseLogicalX = (mousePos.current.x - rect.left) / scale
      const mouseLogicalY = (mousePos.current.y - rect.top) / scale
      const targetWorldX = mouseLogicalX + cameraRef.current.cameraX
      const targetWorldY = mouseLogicalY + cameraRef.current.cameraY

      const originX = playerRef.current.x + character.colliderWidth / 2
      const originY = playerRef.current.y + character.colliderHeight / 2
      const dx = targetWorldX - originX
      const dy = targetWorldY - originY
      const dist = aimingSkillRef.current.id === 'flamethrower'
        ? aimingSkillRef.current.range
        : Math.min(aimingSkillRef.current.range, Math.hypot(dx, dy))
      const angle = Math.atan2(dy, dx)
      const usesBeamStyle =
        aimingSkillRef.current.id === 'flamethrower' || aimingSkillRef.current.id === 'fire_blast'
      const aimingStyle =
        aimingSkillRef.current.id === 'fire_blast'
          ? 'beam_constant'
          : (aimingSkillRef.current.aimingStyle || 'arrow')

      setAimingArrowData({
        angle,
        dist,
        width: aimingSkillRef.current.aimingWidth || 32,
        endWidth: usesBeamStyle
          ? (aimingSkillRef.current.frameWidth || aimingSkillRef.current.aimingWidth || 129)
          : undefined,
        style: aimingStyle,
        originX,
        originY,
      })
    } else if (aimingArrowData) {
      setAimingArrowData(null)
    }

    if (hpRef.current > 0) {
      emitMove(playerRef.current.inputX, playerRef.current.inputY, playerRef.current.direction, playerRef.current.animRow)
    }

    if (
      isMouseDownRef.current &&
      !attackRequestPendingRef.current &&
      autoAttackCD <= 0 &&
      hpRef.current > 0 &&
      !aimingSkillRef.current
    ) {
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      const mouseLogicalX = (mousePos.current.x - rect.left) / scale
      const mouseLogicalY = (mousePos.current.y - rect.top) / scale
      const targetWorldX = mouseLogicalX + cameraRef.current.cameraX
      const targetWorldY = mouseLogicalY + cameraRef.current.cameraY
      attackRequestPendingRef.current = true
      if (attackPendingTimeoutRef.current !== null) {
        window.clearTimeout(attackPendingTimeoutRef.current)
      }
      attackPendingTimeoutRef.current = window.setTimeout(() => {
        attackRequestPendingRef.current = false
        attackPendingTimeoutRef.current = null
      }, 400)
      emitShoot(targetWorldX, targetWorldY)
    }
  })

  useEffect(() => {
    return () => {
      if (attackPendingTimeoutRef.current !== null) {
        window.clearTimeout(attackPendingTimeoutRef.current)
      }
      for (const timeoutId of Object.values(skillPendingTimeoutsRef.current)) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  return {
    player,
    scale,
    viewportRef,
    cameraX: camera.cameraX,
    cameraY: camera.cameraY,
    showScoreboard,
    aimingArrowData,
    respawnTimer,
    respawnAvailableAt,
  }
}
