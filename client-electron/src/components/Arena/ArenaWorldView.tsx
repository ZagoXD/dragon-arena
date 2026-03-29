import { Player } from '../Player/Player'
import { Dummy, DummyData } from '../Dummy/Dummy'
import { Projectile, ProjectileData } from '../Projectile/Projectile'
import { MapRenderer } from '../MapRenderer/MapRenderer'
import { NetPlayer } from '../../hooks/useSocket'
import { ResolvedCharacterConfig } from '../../config/visualConfig'

interface RemotePlayerView {
  id: string
  name: string
  character: ResolvedCharacterConfig
  x: number
  y: number
  direction: NetPlayer['direction']
  animRow: number
  hp: number
  isDashing?: boolean
  dashAngle?: number
}

interface Props {
  mapData: any
  tileSize: number
  mapWidth: number
  mapHeight: number
  cameraX: number
  cameraY: number
  dummies: DummyData[]
  dummyMaxHp: number
  dummyColliderSize: number
  remotePlayers: RemotePlayerView[]
  localPlayer: {
    name: string
    character: ResolvedCharacterConfig
    x: number
    y: number
    direction: NetPlayer['direction']
    animRow: number
    hp: number
    isDashing?: boolean
    dashAngle?: number
  } | null
  projectiles: ProjectileData[]
  aimingArrowData: {
    angle: number
    dist: number
    width: number
    originX: number
    originY: number
  } | null
}

export function ArenaWorldView({
  mapData,
  tileSize,
  mapWidth,
  mapHeight,
  cameraX,
  cameraY,
  dummies,
  dummyMaxHp,
  dummyColliderSize,
  remotePlayers,
  localPlayer,
  projectiles,
  aimingArrowData,
}: Props) {
  return (
    <div
      className="arena-map"
      style={{ width: mapWidth, height: mapHeight, transform: `translate(${-cameraX}px, ${-cameraY}px)` }}
    >
      <MapRenderer mapData={mapData} tileSize={tileSize} renderLayer="background" />

      {dummies.map(dummy => (
        <Dummy key={dummy.id} dummy={dummy} maxHp={dummyMaxHp} size={dummyColliderSize} />
      ))}

      {remotePlayers.map(player => (
        <Player
          key={player.id}
          playerName={player.name}
          character={player.character}
          x={player.x}
          y={player.y}
          direction={player.direction}
          animRow={player.animRow}
          hp={player.hp}
          isDashing={player.isDashing}
          dashAngle={player.dashAngle}
        />
      ))}

      {localPlayer && (
        <Player
          playerName={localPlayer.name}
          character={localPlayer.character}
          x={localPlayer.x}
          y={localPlayer.y}
          direction={localPlayer.direction}
          animRow={localPlayer.animRow}
          hp={localPlayer.hp}
          isDashing={localPlayer.isDashing}
          dashAngle={localPlayer.dashAngle}
        />
      )}

      {projectiles.map(projectile => <Projectile key={projectile.id} projectile={projectile} />)}

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
            zIndex: 100,
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: -10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 0,
              height: 0,
              borderTop: '10px solid transparent',
              borderBottom: '10px solid transparent',
              borderLeft: '15px solid rgba(255, 255, 255, 0.6)',
            }}
          />
        </div>
      )}

      <MapRenderer mapData={mapData} tileSize={tileSize} renderLayer="foreground" />
    </div>
  )
}
