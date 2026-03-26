import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Player } from '../Player/Player'
import { HUD } from '../HUD/HUD'
import { Dummy, DummyData } from '../Dummy/Dummy'
import { Projectile, ProjectileData } from '../Projectile/Projectile'
import { MapRenderer } from '../MapRenderer/MapRenderer'
import { usePlayerMovement } from '../../hooks/usePlayerMovement'
import { useGameLoop } from '../../hooks/useGameLoop'
import { useMousePosition } from '../../hooks/useMousePosition'
import { useSocket, NetPlayer } from '../../hooks/useSocket'
import { CHARACTERS, SpellConfig } from '../../config/characters'
import {
  VIEWPORT_WIDTH,     VIEWPORT_HEIGHT,
  DUMMY_SIZE,
  getClosest4WayDirection
} from '../../config/spriteMap'
import './Arena.css'

interface Props {
  playerName: string
  characterId?: string
  onGameOver: () => void
}

export function Arena({ playerName, characterId = 'charizard', onGameOver }: Props) {
  const character = CHARACTERS[characterId] || CHARACTERS['charizard']
  const spell = character.autoAttack
  const renderedWidth = character.frameWidth * character.renderScale
  const renderedHeight = character.frameHeight * character.renderScale
  
  const [scale, setScale] = useState(() =>
    Math.min(window.innerWidth / VIEWPORT_WIDTH, window.innerHeight / VIEWPORT_HEIGHT)
  )
  useEffect(() => {
    const compute = () => setScale(Math.min(window.innerWidth / VIEWPORT_WIDTH, window.innerHeight / VIEWPORT_HEIGHT))
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  const [hp, setHp] = useState<number>(character.maxHp)
  const [dummies, setDummies] = useState<DummyData[]>([])
  const [projectiles, setProjectiles] = useState<ProjectileData[]>([])
  const [showScoreboard, setShowScoreboard] = useState(false)
  const [respawnTimer, setRespawnTimer] = useState<number | null>(null)
  
  const [aimingSkill, setAimingSkill] = useState<SpellConfig | null>(null)
  const [ skillCooldowns, setSkillCooldowns ] = useState<Record<string, number>>({})
  const [ autoAttackCD, setAutoAttackCD ] = useState(0)

  const [aimingArrowData, setAimingArrowData] = useState<{
    angle: number, dist: number, width: number, originX: number, originY: number
  } | null>(null)

  const player = usePlayerMovement({
    mapWidth: 2048,
    mapHeight: 1280,
    speed: character.movementSpeed,
    renderedWidth,
    renderedHeight,
    idleRows: character.idleRows,
    walkRows: character.walkRows,
    hp
  })

  const playerRef = useRef(player)
  const hpRef = useRef(hp)
  const dummiesRef = useRef(dummies)
  const projectilesRef = useRef(projectiles)
  
  playerRef.current = player
  hpRef.current = hp
  dummiesRef.current = dummies
  projectilesRef.current = projectiles

  const onCurrentDummies = useCallback((data: DummyData[]) => setDummies(data), [])
  const onDummyDamaged = useCallback((id: string, newHp: number) => {
    setDummies(prev => prev.map(d => d.id === id ? { ...d, hp: newHp } : d))
  }, [])

  const onOtherShot = useCallback((data: { playerId: string, originX: number, originY: number, angle: number }) => {
    const otherPlayersMap = otherPlayersRef.current || {}
    const other = otherPlayersMap[data.playerId]
    if (!other) return 
    const otherChar = CHARACTERS[other.characterId]
    if (!otherChar) return

    const newProjectile: ProjectileData = {
      id: `proj_${Date.now()}_${Math.random()}`,
      ownerId: data.playerId,
      x: data.originX,
      y: data.originY,
      angle: data.angle,
      distance: 0,
      spell: otherChar.autoAttack,
      isLocal: false
    }
    projectilesRef.current.push(newProjectile)
    setProjectiles([...projectilesRef.current])
  }, [])

  const onSelfDamaged = useCallback((newHp: number, x?: number, y?: number) => {
    setHp(newHp)
    if (x !== undefined && y !== undefined) player.setPosition(x, y)
    if (newHp <= 0) setRespawnTimer(5)
  }, [player])

  const onSelfMoved = useCallback((x: number, y: number) => {
    const dx = playerRef.current.x - x;
    const dy = playerRef.current.y - y;
    if (Math.abs(dx) > 15 || Math.abs(dy) > 15) playerRef.current.setPosition(x, y)
  }, [])

  useEffect(() => {
    if (respawnTimer === null) return
    if (respawnTimer === 0) {
      setRespawnTimer(null)
      emitRespawn()
      return
    }
    const id = setInterval(() => setRespawnTimer(t => (t !== null ? t - 1 : null)), 1000)
    return () => clearInterval(id)
  }, [respawnTimer])

  const { 
    socketId, mapData, otherPlayers, kills, deaths,
    emitMove, emitShoot, emitDamage, emitDummyDamage, emitHitPlayer, emitRespawn, emitUseSkill 
  } = useSocket(
    playerName, characterId, character.maxHp,
    onCurrentDummies, onDummyDamaged, onSelfDamaged, onSelfMoved, onOtherShot
  )

  const otherPlayersRef = useRef(otherPlayers)
  otherPlayersRef.current = otherPlayers
  const socketIdRef = useRef(socketId)
  socketIdRef.current = socketId

  const takeDamage = useCallback((amount: number) => {
    setHp(prev => {
      const next = Math.max(0, prev - amount)
      if (next === 0) onGameOver()
      return next
    })
    emitDamage(amount)
  }, [emitDamage, onGameOver])

  useEffect(() => {
    (window as any).__takeDamage = takeDamage
    return () => { delete (window as any).__takeDamage }
  }, [takeDamage])

  const mousePos = useMousePosition()

  const mapWidth = mapData ? mapData.width * 64 : 2048
  const mapHeight = mapData ? mapData.height * 64 : 1280

  const { cameraX, cameraY } = useMemo(() => {
    const px = player.x + 32
    const py = player.y + 32
    const cx = Math.max(0, Math.min(mapWidth - VIEWPORT_WIDTH, px - VIEWPORT_WIDTH / 2))
    const cy = Math.max(0, Math.min(mapHeight - VIEWPORT_HEIGHT, py - VIEWPORT_HEIGHT / 2))
    return { cameraX: cx, cameraY: cy }
  }, [player.x, player.y, renderedWidth, renderedHeight, mapWidth, mapHeight])

  const cameraRef = useRef({ cameraX, cameraY })
  cameraRef.current = { cameraX, cameraY }

  const isMouseDownRef = useRef(false)
  const aimingSkillRef = useRef(aimingSkill)
  aimingSkillRef.current = aimingSkill

  const handleSkillFire = () => {
    const activeSkill = aimingSkillRef.current
    if (!activeSkill) return

    const viewportClientLeft = (window.innerWidth - VIEWPORT_WIDTH * scale) / 2
    const viewportClientTop = (window.innerHeight - VIEWPORT_HEIGHT * scale) / 2
    const mouseLogicalX = (mousePos.current.x - viewportClientLeft) / scale
    const mouseLogicalY = (mousePos.current.y - viewportClientTop) / scale
    const targetWorldX = mouseLogicalX + cameraRef.current.cameraX
    const targetWorldY = mouseLogicalY + cameraRef.current.cameraY

    const originX = player.x + 32
    const originY = player.y + 32
    const angle = Math.atan2(targetWorldY - originY, targetWorldX - originX)
    player.setDirection(getClosest4WayDirection(angle))

    emitUseSkill(activeSkill.id, targetWorldX, targetWorldY)
    setSkillCooldowns(prev => ({ ...prev, [activeSkill.id]: activeSkill.cooldownMs }))
    setAimingSkill(null)
    
    if (activeSkill.id === 'dragon_dive') {
       player.setIsDashing(true)
       setTimeout(() => player.setIsDashing(false), 300)
    }
  }

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => { 
      if (e.button === 0) {
        if (aimingSkillRef.current) handleSkillFire()
        else isMouseDownRef.current = true 
      }
      if (e.button === 2) setAimingSkill(null)
    }
    const onMouseUp = (e: MouseEvent) => { if (e.button === 0) isMouseDownRef.current = false }
    const onContext = (e: MouseEvent) => e.preventDefault()
    
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [scale])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') { e.preventDefault(); setShowScoreboard(true) }
      if (e.key === '1' && character.skills[0]) {
        const cd = skillCooldowns[character.skills[0].id] || 0
        if (cd <= 0) setAimingSkill(character.skills[0])
      }
      if (e.key === 'Escape') setAimingSkill(null)
    }
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Tab') setShowScoreboard(false) }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [character, skillCooldowns])

  const castRef = useRef({ active: false, timer: 0, cooldownTimer: 0, originX: 0, originY: 0, angle: 0 })
  const lastSyncRef = useRef(0)

  useGameLoop((deltaMs) => {
    const deltaSec = deltaMs / 1000

    lastSyncRef.current += deltaMs
    if (lastSyncRef.current > 33 && hpRef.current > 0) {
      lastSyncRef.current = 0
      emitMove(playerRef.current.x, playerRef.current.y, playerRef.current.direction, playerRef.current.animRow)
    }

    if (aimingSkillRef.current) {
        const viewportClientLeft = (window.innerWidth - VIEWPORT_WIDTH * scale) / 2
        const viewportClientTop = (window.innerHeight - VIEWPORT_HEIGHT * scale) / 2
        const mouseLogicalX = (mousePos.current.x - viewportClientLeft) / scale
        const mouseLogicalY = (mousePos.current.y - viewportClientTop) / scale
        const targetWorldX = mouseLogicalX + cameraRef.current.cameraX
        const targetWorldY = mouseLogicalY + cameraRef.current.cameraY

        const originX = playerRef.current.x + 32
        const originY = playerRef.current.y + 32
        const dx = targetWorldX - originX
        const dy = targetWorldY - originY
        const dist = Math.min(aimingSkillRef.current.range, Math.hypot(dx, dy))
        const angle = Math.atan2(dy, dx)
        
        setAimingArrowData({ angle, dist, width: aimingSkillRef.current.aimingWidth || 32, originX, originY })
    } else {
        if (aimingArrowData) setAimingArrowData(null)
    }
    
    if (castRef.current.cooldownTimer > 0) {
      castRef.current.cooldownTimer -= deltaMs
    }
    setAutoAttackCD(Math.max(0, castRef.current.cooldownTimer))
    
    setSkillCooldowns(prev => {
      const next: Record<string, number> = {}
      let changed = false
      for (const id in prev) {
        if (prev[id] > 0) {
          next[id] = Math.max(0, prev[id] - deltaMs)
          changed = true
        }
      }
      return changed ? next : prev
    })

    if (isMouseDownRef.current && !castRef.current.active && castRef.current.cooldownTimer <= 0 && hpRef.current > 0 && !aimingSkillRef.current) {
      const originX = playerRef.current.x + 32
      const originY = playerRef.current.y + 32
      const viewportClientLeft = (window.innerWidth - VIEWPORT_WIDTH * scale) / 2
      const viewportClientTop = (window.innerHeight - VIEWPORT_HEIGHT * scale) / 2
      const mouseLogicalX = (mousePos.current.x - viewportClientLeft) / scale
      const mouseLogicalY = (mousePos.current.y - viewportClientTop) / scale
      const targetWorldX = mouseLogicalX + cameraRef.current.cameraX
      const targetWorldY = mouseLogicalY + cameraRef.current.cameraY
      const angle = Math.atan2(targetWorldY - originY, targetWorldX - originX)

      const facingDir = getClosest4WayDirection(angle)
      playerRef.current.lockAction(facingDir, spell.castTimeMs)

      castRef.current = {
        active: true, timer: spell.castTimeMs, cooldownTimer: spell.cooldownMs,
        originX, originY, angle
      }
    }

    if (castRef.current.active) {
      castRef.current.timer -= deltaMs
      if (castRef.current.timer <= 0) {
        castRef.current.active = false
        const newProjectile: ProjectileData = {
          id: `proj_${Date.now()}_${Math.random()}`,
          ownerId: socketIdRef.current,
          x: castRef.current.originX, y: castRef.current.originY, angle: castRef.current.angle,
          distance: 0, spell, isLocal: true
        }
        projectilesRef.current.push(newProjectile)
        setProjectiles([...projectilesRef.current])
        emitShoot(castRef.current.originX, castRef.current.originY, castRef.current.angle)
      }
    }

    if (projectilesRef.current.length > 0) {
      projectilesRef.current = projectilesRef.current.map(proj => {
        const dx = Math.cos(proj.angle) * proj.spell.speed * deltaSec
        const dy = Math.sin(proj.angle) * proj.spell.speed * deltaSec
        return { ...proj, x: proj.x + dx, y: proj.y + dy, distance: proj.distance + proj.spell.speed * deltaSec }
      })

      projectilesRef.current = projectilesRef.current.filter(proj => {
        if (proj.distance > proj.spell.range) return false
        const hitDummy = dummiesRef.current.find(d => {
          if (d.hp <= 0) return false
          const dist = Math.hypot(d.x - proj.x, d.y - proj.y)
          return dist < (DUMMY_SIZE / 2 + proj.spell.frameSize / 2)
        })
        if (hitDummy) {
          if (proj.isLocal) emitDummyDamage(hitDummy.id, proj.spell.damage)
          return false
        }
        const otherPlayersList = Object.values(otherPlayersRef.current) as NetPlayer[]
        const hitOther = otherPlayersList.find(p => {
          if (p.hp <= 0 || p.id === proj.ownerId) return false
          const char = CHARACTERS[p.characterId]
          const rad = (char?.frameWidth || 64) * (char?.renderScale || 1.0) / 2
          const dist = Math.hypot(p.x + rad - proj.x, p.y + rad - proj.y)
          return dist < (rad + proj.spell.frameSize / 2)
        })
        if (hitOther) {
          if (proj.isLocal) emitHitPlayer(hitOther.id, proj.spell.damage)
          return false
        }
        return true
      })
      setProjectiles([...projectilesRef.current])
    }
  })

  // Prepare scoreboard data
  const scoreboardData = useMemo(() => {
    const list = [
      { id: socketId || 'local', name: playerName, characterId, kills, deaths, isLocal: true },
      ...Object.values(otherPlayers).map(p => ({
        id: p.id,
        name: p.name,
        characterId: p.characterId,
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        isLocal: false
      }))
    ]
    return list.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
  }, [socketId, playerName, characterId, kills, deaths, otherPlayers])

  if (!mapData) {
    return (
      <div className="arena-shell" style={{ color: '#ffcc00', fontSize: '1.5rem', fontFamily: 'monospace' }}>
        Awaiting Map Data from Server...
      </div>
    )
  }

  return (
    <div className="arena-shell">
      <div
        className="arena-viewport"
        style={{ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, transform: `scale(${scale})` }}
      >
        <div
          className="arena-map"
          style={{ width: mapWidth, height: mapHeight, transform: `translate(${-cameraX}px, ${-cameraY}px)` }}
        >
          <MapRenderer mapData={mapData} renderLayer="background" />

          {dummies.map(d => <Dummy key={d.id} dummy={d} />)}
          
          {(Object.values(otherPlayers) as NetPlayer[]).map(p => (
            p.hp > 0 && (
              <Player
                key={p.id} playerName={p.name} character={CHARACTERS[p.characterId]}
                x={p.x} y={p.y} direction={p.direction} animRow={p.animRow} hp={p.hp}
                isDashing={p.isDashing}
              />
            )
          ))}

          {hp > 0 && (
            <Player
              playerName={playerName} character={character}
              x={player.x} y={player.y} direction={player.direction} animRow={player.animRow} hp={hp}
              isDashing={player.isDashing}
            />
          )}

          {projectiles.map(proj => <Projectile key={proj.id} projectile={proj} />)}

          {aimingArrowData && (
            <div 
              className="aiming-arrow"
              style={{
                position: 'absolute',
                left: aimingArrowData.originX,
                top: aimingArrowData.originY,
                width: aimingArrowData.dist,
                height: aimingArrowData.width,
                background: 'rgba(255, 255, 255, 0.2)',
                border: '2px solid rgba(255, 255, 255, 0.5)',
                boxShadow: '0 0 15px rgba(255, 255, 255, 0.3)',
                transformOrigin: '0 50%',
                transform: `translate(0, -50%) rotate(${aimingArrowData.angle}rad)`,
                borderRadius: '4px',
                pointerEvents: 'none',
                zIndex: 100
              }}
            >
              <div style={{
                position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)',
                width: 0, height: 0, borderTop: '10px solid transparent', borderBottom: '10px solid transparent',
                borderLeft: '15px solid rgba(255, 255, 255, 0.6)'
              }} />
            </div>
          )}
          
          <MapRenderer mapData={mapData} renderLayer="foreground" />
        </div>

        <HUD 
          playerName={playerName} character={character} hp={hp} 
          playerPos={{ x: player.x, y: player.y }} dummies={dummies}
          otherPlayers={Object.values(otherPlayers) as NetPlayer[]}
          mapWidth={mapWidth} mapHeight={mapHeight}
          skillCooldowns={skillCooldowns}
          autoAttackCooldown={autoAttackCD}
        />

        {respawnTimer !== null && (
          <div className="death-overlay">
            <div className="death-content">
              <h1>YOU DIED</h1>
              <p>Respawning in {respawnTimer}s...</p>
            </div>
          </div>
        )}

        {showScoreboard && (
          <div className="scoreboard-overlay">
            <div className="scoreboard-content">
              <h2>Dragon Arena - Scoreboard</h2>
              <table className="scoreboard-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Dragon</th>
                    <th>Kills</th>
                    <th>Deaths</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreboardData.map(p => (
                    <tr key={p.id} className={p.isLocal ? 'local-player' : ''}>
                      <td>{p.name} {p.isLocal ? '(You)' : ''}</td>
                      <td>{CHARACTERS[p.characterId]?.name || p.characterId}</td>
                      <td>{p.kills}</td>
                      <td>{p.deaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="scoreboard-hint">Release TAB to close</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
