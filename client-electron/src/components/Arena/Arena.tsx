import { useCallback, useRef } from 'react'
import { HUD } from '../HUD/HUD'
import { AutoAttackStartedEvent, NetPlayer } from '../../hooks/useSocket'
import { useArenaNetworkState } from '../../hooks/useArenaNetworkState'
import { CHARACTER_VISUALS } from '../../config/visualConfig'
import { getClosest4WayDirection, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../../config/spriteMap'
import { useArenaController } from '../../hooks/useArenaController'
import { PixiArenaView } from './PixiArenaView'
import './Arena.css'

interface Props {
  playerName: string
  characterId?: string
  onReturnToSelect: (respawnAvailableAt?: number) => void
}

export function Arena({ playerName, characterId = 'charizard', onReturnToSelect }: Props) {
  const fallbackVisual = CHARACTER_VISUALS[characterId] || CHARACTER_VISUALS.charizard
  const localPlayerIdRef = useRef<string | undefined>(undefined)
  const lockActionRef = useRef<((dir: 'up' | 'right' | 'down' | 'left', durationMs: number) => void) | null>(null)
  const setDirectionRef = useRef<((dir: 'up' | 'right' | 'down' | 'left') => void) | null>(null)

  const handleAutoAttackStarted = useCallback((event: AutoAttackStartedEvent) => {
    if (!localPlayerIdRef.current || event.playerId !== localPlayerIdRef.current) {
      return
    }

    const direction = getClosest4WayDirection(event.angle)
    setDirectionRef.current?.(direction)
    if (event.castTimeMs > 0) {
      lockActionRef.current?.(direction, event.castTimeMs)
    }
  }, [])

  const {
    socketId,
    mapData,
    bootstrap,
    character,
    tileSize,
    mapWidth,
    mapHeight,
    dummyColliderSize,
    dummyMaxHp,
    respawnSeconds,
    hp,
    hasAuthoritativePlayerState,
    dummies,
    projectiles,
    resolvedOtherPlayers,
    otherPlayers,
    scoreboardEntries,
    skillCooldowns,
    autoAttackCD,
    authoritativePosition,
    localDashState,
    impactEffects,
    emitMove,
    emitRespawn,
    emitShoot,
    emitUseSkill,
  } = useArenaNetworkState({
    playerName,
    characterId,
    onAutoAttackStarted: handleAutoAttackStarted,
  })

  const controller = useArenaController({
    character,
    fallbackVisual,
    bootstrapPlayer: bootstrap?.player,
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
  })

  localPlayerIdRef.current = socketId
  lockActionRef.current = controller.player.lockAction
  setDirectionRef.current = controller.player.setDirection

  if (!bootstrap || !character) {
    return (
      <div className="arena-shell" style={{ color: '#ffcc00', fontSize: '1.5rem', fontFamily: 'monospace' }}>
        Awaiting authoritative gameplay bootstrap...
      </div>
    )
  }

  if (!mapData) {
    return (
      <div className="arena-shell" style={{ color: '#ffcc00', fontSize: '1.5rem', fontFamily: 'monospace' }}>
        Awaiting map data from server...
      </div>
    )
  }

  const localPlayer =
    hp > 0
      ? {
          name: playerName,
          character,
          x: controller.player.x,
          y: controller.player.y,
          direction: controller.player.direction,
          animRow: controller.player.animRow,
          hp,
          isDashing: localDashState.isDashing || controller.player.isDashing,
          dashAngle: localDashState.dashAngle,
        }
      : null

  return (
    <div className="arena-shell">
      <div
        className="arena-viewport"
        ref={controller.viewportRef}
        style={{ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, transform: `scale(${controller.scale})` }}
      >
        <PixiArenaView
          mapData={mapData}
          tileSize={tileSize}
          mapWidth={mapWidth}
          mapHeight={mapHeight}
          cameraX={controller.cameraX}
          cameraY={controller.cameraY}
          dummies={dummies}
          dummyMaxHp={dummyMaxHp}
          dummyColliderSize={dummyColliderSize}
          remotePlayers={resolvedOtherPlayers}
          localPlayer={localPlayer}
          projectiles={projectiles}
          impactEffects={impactEffects}
          aimingArrowData={controller.aimingArrowData}
        />

        <HUD
          playerName={playerName}
          character={character}
          hp={hp}
          playerPos={{ x: controller.player.x, y: controller.player.y }}
          dummies={dummies}
          otherPlayers={Object.values(otherPlayers) as NetPlayer[]}
          mapWidth={mapWidth}
          mapHeight={mapHeight}
          skillCooldowns={skillCooldowns}
          autoAttackCooldown={autoAttackCD}
        />

        {controller.respawnTimer !== null && (
          <div className="death-overlay">
            <div className="death-content">
              <h1>YOU DIED</h1>
              <p>Respawning in {controller.respawnTimer}s...</p>
              <button
                type="button"
                className="death-return-button"
                onClick={() => onReturnToSelect(controller.respawnAvailableAt ?? undefined)}
              >
                Back To Character Select
              </button>
              <p className="death-hint">Press ESC while dead to change character</p>
            </div>
          </div>
        )}

        {controller.showScoreboard && (
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
                  {scoreboardEntries.map(score => (
                    <tr key={score.id} className={score.isLocal ? 'local-player' : ''}>
                      <td>{score.name} {score.isLocal ? '(You)' : ''}</td>
                      <td>{bootstrap.characters[score.characterId]?.name || score.characterId}</td>
                      <td>{score.kills}</td>
                      <td>{score.deaths}</td>
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
