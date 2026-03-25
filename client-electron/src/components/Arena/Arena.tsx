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
import { CHARACTERS } from '../../config/characters'
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

/**
 * Arena: scrollable map with camera, HP tracking, projectiles, and dummies.
 */
export function Arena({ playerName, characterId = 'charizard', onGameOver }: Props) {
  const character = CHARACTERS[characterId] || CHARACTERS['charizard']
  const spell = character.autoAttack
  const renderedWidth = character.frameWidth * character.renderScale
  const renderedHeight = character.frameHeight * character.renderScale
  
  // ── 1. UI State ───────────────────────────────────────────
  const [scale, setScale] = useState(() =>
    Math.min(window.innerWidth / VIEWPORT_WIDTH, window.innerHeight / VIEWPORT_HEIGHT)
  )
  useEffect(() => {
    const compute = () => setScale(Math.min(window.innerWidth / VIEWPORT_WIDTH, window.innerHeight / VIEWPORT_HEIGHT))
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  // ── 2. Entity State (HP, Dummies, Projectiles) ─────────────
  const [hp, setHp] = useState<number>(character.maxHp)
  const [dummies, setDummies] = useState<DummyData[]>([])
  const [projectiles, setProjectiles] = useState<ProjectileData[]>([])
  const [showScoreboard, setShowScoreboard] = useState(false)
  const [respawnTimer, setRespawnTimer] = useState<number | null>(null)

  // ── 3. Movement Hook ──────────────────────────────────────
  const player = usePlayerMovement({
    mapWidth: 2048,   // Replaced on server join
    mapHeight: 1280,  // Replaced on server join
    speed: character.movementSpeed,
    renderedWidth,
    renderedHeight,
    idleRows: character.idleRows,
    walkRows: character.walkRows,
    hp
  })

  // ── 4. Refs for Game Loop (Prevents Stale Closures) ────────
  const playerRef = useRef(player)
  const hpRef = useRef(hp)
  const dummiesRef = useRef(dummies)
  const projectilesRef = useRef(projectiles)
  
  // Update refs on every render
  playerRef.current = player
  hpRef.current = hp
  dummiesRef.current = dummies
  projectilesRef.current = projectiles

  // ── 5. Socket Callbacks ───────────────────────────────────
  const onCurrentDummies = useCallback((data: DummyData[]) => {
    setDummies(data)
  }, [])
  
  const onDummyDamaged = useCallback((id: string, newHp: number) => {
    setDummies(prev => prev.map(d => d.id === id ? { ...d, hp: newHp } : d))
  }, [])

  const onOtherShot = useCallback((data: { playerId: string, originX: number, originY: number, angle: number }) => {
    // We look up the shooter's character to know which spell to show
    const otherPlayersMap = otherPlayersRef.current || {}
    const other = otherPlayersMap[data.playerId]
    if (!other) return 
    
    const otherChar = CHARACTERS[other.characterId]
    if (!otherChar) return

    const newProjectile: ProjectileData = {
      id: `proj_${Date.now()}_${Math.random()}`,
      ownerId: data.playerId, // Track who shot it
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
    if (x !== undefined && y !== undefined) {
      player.setPosition(x, y)
    }
    if (newHp <= 0) {
      setRespawnTimer(5)
    }
  }, [player])

  const onSelfMoved = useCallback((x: number, y: number) => {
    // Only snap if distance > 10 pixels to avoid micro-jitter
    const dx = playerRef.current.x - x;
    const dy = playerRef.current.y - y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
       playerRef.current.setPosition(x, y);
    }
  }, [])

  // Auto-respawn logic
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

  // Tab key for scoreboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        setShowScoreboard(true)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setShowScoreboard(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // ── 6. Multiplayer Hook ───────────────────────────────────
  const { 
    socketId, mapData, otherPlayers, kills, deaths, 
    emitMove, emitShoot, emitDamage, emitDummyDamage, emitHitPlayer, emitRespawn 
  } = useSocket(
    playerName, 
    characterId, 
    character.maxHp,
    onCurrentDummies,
    onDummyDamaged,
    onSelfDamaged,
    onSelfMoved,
    onOtherShot
  )

  // Stable ref for otherPlayers
  const otherPlayersRef = useRef(otherPlayers)
  otherPlayersRef.current = otherPlayers

  // Stable ref for local socketId to avoid stale closures in the loop
  const socketIdRef = useRef(socketId)
  socketIdRef.current = socketId

  // ── 7. Debug / API ────────────────────────────────────────
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

  // ── 8. Camera Logic ───────────────────────────────────────
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

  // ── 9. User Input (Attack) ────────────────────────────────
  const isMouseDownRef = useRef(false)
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => { if (e.button === 0) isMouseDownRef.current = true }
    const onMouseUp = (e: MouseEvent) => { if (e.button === 0) isMouseDownRef.current = false }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // ── 10. Game Loop (Update & Collision) ────────────────────
  const castRef = useRef({ active: false, timer: 0, cooldownTimer: 0, originX: 0, originY: 0, angle: 0 })
  const lastSyncRef = useRef(0)

  useGameLoop((deltaMs) => {
    const deltaSec = deltaMs / 1000

    // Sync position
    lastSyncRef.current += deltaMs
    if (lastSyncRef.current > 33 && hpRef.current > 0) {
      lastSyncRef.current = 0
      emitMove(playerRef.current.x, playerRef.current.y, playerRef.current.direction, playerRef.current.animRow)
    }

    // Cooldown Processing
    if (castRef.current.cooldownTimer > 0) {
      castRef.current.cooldownTimer -= deltaMs
      const spellIcon = document.getElementById('action-bar-spell-1')
      if (spellIcon) {
        const pct = Math.max(0, (castRef.current.cooldownTimer / spell.cooldownMs) * 100)
        spellIcon.style.setProperty('--cooldown-pct', `${pct}%`)
      }
    } else {
      const spellIcon = document.getElementById('action-bar-spell-1')
      if (spellIcon && spellIcon.style.getPropertyValue('--cooldown-pct') !== '0%') {
        spellIcon.style.setProperty('--cooldown-pct', '0%')
      }
    }

    // Spawning Attack
    if (isMouseDownRef.current && !castRef.current.active && castRef.current.cooldownTimer <= 0 && hpRef.current > 0) {
      // The visual center of the 128x128 character sprite (which is offset 64px up from the physics box)
      const originX = playerRef.current.x + 32
      const originY = playerRef.current.y
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

    // Process Casting
    if (castRef.current.active) {
      castRef.current.timer -= deltaMs
      if (castRef.current.timer <= 0) {
        castRef.current.active = false
        const newProjectile: ProjectileData = {
          id: `proj_${Date.now()}_${Math.random()}`,
          ownerId: socketIdRef.current, // Use ref to avoid stale closure
          x: castRef.current.originX, y: castRef.current.originY, angle: castRef.current.angle,
          distance: 0, spell, isLocal: true
        }
        projectilesRef.current.push(newProjectile)
        setProjectiles([...projectilesRef.current])
        emitShoot(castRef.current.originX, castRef.current.originY, castRef.current.angle)
      }
    }

    // Movement & Collision (Ref-based for synchronisity)
    if (projectilesRef.current.length > 0) {
      // 1. Move them all
      projectilesRef.current = projectilesRef.current.map(proj => {
        const dx = Math.cos(proj.angle) * proj.spell.speed * deltaSec
        const dy = Math.sin(proj.angle) * proj.spell.speed * deltaSec
        return { ...proj, x: proj.x + dx, y: proj.y + dy, distance: proj.distance + proj.spell.speed * deltaSec }
      })

      // 2. Filter / Detect Hits
      projectilesRef.current = projectilesRef.current.filter(proj => {
        if (proj.distance > proj.spell.range) {
          return false
        }

        // Dummies Hit
        const hitDummy = dummiesRef.current.find(d => {
          if (d.hp <= 0) return false
          const dist = Math.hypot(d.x - proj.x, d.y - proj.y)
          return dist < (DUMMY_SIZE / 2 + proj.spell.frameSize / 2)
        })
        if (hitDummy) {
          if (proj.isLocal) emitDummyDamage(hitDummy.id, proj.spell.damage)
          return false
        }

        // Other Players Hit
        const otherPlayersList = Object.values(otherPlayersRef.current) as NetPlayer[]
        const hitOther = otherPlayersList.find(p => {
          if (p.hp <= 0 || p.id === proj.ownerId) return false
          const char = CHARACTERS[p.characterId]
          const rad = char ? (char.frameWidth * char.renderScale) / 2 : 60
          const dist = Math.hypot(p.x + rad - proj.x, p.y + rad - proj.y)
          return dist < (rad + proj.spell.frameSize / 2)
        })
        if (hitOther) {
          if (proj.isLocal) emitHitPlayer(hitOther.id, proj.spell.damage)
          return false
        }

        // Self Hit (Visual Only)
        const selfRad = (character.frameWidth * character.renderScale) / 2
        const distToSelf = Math.hypot(playerRef.current.x + selfRad - proj.x, playerRef.current.y + selfRad - proj.y)
        if (hpRef.current > 0 && distToSelf < (selfRad + proj.spell.frameSize / 2)) {
          if (proj.ownerId && proj.ownerId !== socketIdRef.current) {
            return false
          }
        }

        return true
      })

      // 3. Sync to state for rendering
      // We always sync once per tick if projectiles exist
      setProjectiles([...projectilesRef.current])
    }
  })

  // ── 11. Render ────────────────────────────────────────────
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
              />
            )
          ))}

          {hp > 0 && (
            <Player
              playerName={playerName} character={character}
              x={player.x} y={player.y} direction={player.direction} animRow={player.animRow} hp={hp}
            />
          )}

          {projectiles.map(proj => <Projectile key={proj.id} projectile={proj} />)}
          
          <MapRenderer mapData={mapData} renderLayer="foreground" />
        </div>

        <HUD 
          playerName={playerName} character={character} hp={hp} 
          playerPos={{ x: player.x, y: player.y }} dummies={dummies}
          otherPlayers={Object.values(otherPlayers) as NetPlayer[]}
          mapWidth={mapWidth} mapHeight={mapHeight}
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
              <h2>Dragon Arena Scoreboard</h2>
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Kills</th>
                    <th>Deaths</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="local-player-row">
                    <td>{playerName} (You)</td>
                    <td>{kills}</td>
                    <td>{deaths}</td>
                  </tr>
                  {Object.values(otherPlayers).map(p => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.kills}</td>
                      <td>{p.deaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="scoreboard-hint">Release TAB to close</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
