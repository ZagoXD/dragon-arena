import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HUD } from '../HUD/HUD'
import { ArenaAuthIntent, ArenaChatMessage, AuthSuccessPayload, AutoAttackStartedEvent, NetPlayer, SkillUsedEvent } from '../../hooks/useSocket'
import { useArenaNetworkState } from '../../hooks/useArenaNetworkState'
import { CHARACTER_VISUALS } from '../../config/visualConfig'
import { getClosest4WayDirection, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../../config/spriteMap'
import { useArenaController } from '../../hooks/useArenaController'
import { PixiArenaView } from './PixiArenaView'
import { ArenaChatBox } from '../ArenaChatBox/ArenaChatBox'
import './Arena.css'

interface Props {
  playerUserId: number | null
  playerName: string
  authIntent: ArenaAuthIntent | null
  characterId?: string
  onAuthenticated: (payload: AuthSuccessPayload) => void
  onAuthFailure: (message: string) => void
  onArenaChatMessage: (message: ArenaChatMessage) => void
  replyTarget: { userId: number, label: string } | null
  onReturnToHome: () => void
  onReturnToSelect: (respawnAvailableAt?: number) => void
}

export function Arena({
  playerUserId,
  playerName,
  authIntent,
  characterId = 'charizard',
  onAuthenticated,
  onAuthFailure,
  onArenaChatMessage,
  replyTarget,
  onReturnToHome,
  onReturnToSelect,
}: Props) {
  const { t } = useTranslation()
  const fallbackVisual = CHARACTER_VISUALS[characterId] || CHARACTER_VISUALS.charizard
  const [pixiReady, setPixiReady] = useState(false)
  const [pixiInstanceKey, setPixiInstanceKey] = useState(0)
  const [showLeavePrompt, setShowLeavePrompt] = useState(false)
  const [arenaChatMessages, setArenaChatMessages] = useState<ArenaChatMessage[]>([])
  const [chatInputActive, setChatInputActive] = useState(false)
  const localPlayerIdRef = useRef<string | undefined>(undefined)
  const lockActionRef = useRef<((dir: 'up' | 'right' | 'down' | 'left', durationMs: number) => void) | null>(null)
  const setDirectionRef = useRef<((dir: 'up' | 'right' | 'down' | 'left') => void) | null>(null)
  const previousHpRef = useRef<number | null>(null)

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

  const handleSkillUsed = useCallback((event: SkillUsedEvent) => {
    if (!localPlayerIdRef.current || event.id !== localPlayerIdRef.current) {
      return
    }

    if (typeof event.angle !== 'number') {
      return
    }

    const angle = event.angle
      const direction = getClosest4WayDirection(angle)
      setDirectionRef.current?.(direction)
      const totalLockMs =
        event.skillId === 'flamethrower' || event.skillId === 'seed_bite'
          ? event.castTimeMs + event.effectDurationMs
          : event.castTimeMs

      if (totalLockMs > 0) {
      lockActionRef.current?.(direction, totalLockMs)
    }
  }, [])

  const handleAuthSucceeded = useCallback((payload: AuthSuccessPayload) => {
    onAuthenticated(payload)
  }, [onAuthenticated])

  const handleAuthFailed = useCallback((code: string, reason: string) => {
    onAuthFailure(reason || code || t('app.authFailed'))
  }, [onAuthFailure, t])

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
    movementSpeed,
    authoritativePosition,
    localDashState,
    impactEffects,
    activeSkillEffects,
    burnStatuses,
    burnZones,
    emitMove,
    emitShoot,
    emitUseSkill,
    emitArenaChat,
  } = useArenaNetworkState({
    authIntent: authIntent ?? {
      mode: 'login',
      identifier: playerName,
      password: '',
    },
    characterId,
    onAutoAttackStarted: handleAutoAttackStarted,
    onSkillUsed: handleSkillUsed,
    onAuthSucceeded: handleAuthSucceeded,
    onAuthFailed: handleAuthFailed,
    onArenaChatMessage: (message) => {
      setArenaChatMessages(prev => [...prev.slice(-40), message])
      onArenaChatMessage(message)
    },
  })

  const displayPlayerName = bootstrap?.player?.name || playerName

  const controller = useArenaController({
    inputEnabled: pixiReady && Boolean(bootstrap && character && mapData) && !chatInputActive,
    character,
    speed: movementSpeed || character?.movementSpeed || 0,
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
    emitShoot,
    emitUseSkill,
    onReturnToSelect,
  })

  localPlayerIdRef.current = socketId
  lockActionRef.current = controller.player.lockAction
  setDirectionRef.current = controller.player.setDirection

  useEffect(() => {
    const previousHp = previousHpRef.current
    if (previousHp !== null && previousHp <= 0 && hp > 0) {
      setPixiReady(false)
      setPixiInstanceKey(prev => prev + 1)
    }
    previousHpRef.current = hp
  }, [hp])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (chatInputActive) {
        return
      }

      if (controller.showScoreboard) {
        return
      }

      event.preventDefault()
      setShowLeavePrompt(current => !current)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [chatInputActive, controller.showScoreboard])

  const arenaReady = Boolean(bootstrap && character && mapData && pixiReady)

  if (!bootstrap || !character || !mapData) {
    return (
      <div className="arena-shell">
        <div
          className="arena-viewport"
          style={{ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, transform: `scale(${controller.scale})` }}
        >
          <div className="arena-loading-overlay">
            <div className="arena-loading-card">
              <div className="arena-loading-spinner" />
              <h2>{t('arena.preparingTitle')}</h2>
              <p>{t('arena.preparingDesc')}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const localPlayer =
    hp > 0
      ? {
          id: socketId || 'local',
          name: displayPlayerName,
          role: bootstrap?.player?.role,
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
          key={pixiInstanceKey}
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
          activeSkillEffects={activeSkillEffects}
          burnStatuses={burnStatuses}
          burnZones={burnZones}
          aimingArrowData={controller.aimingArrowData}
          onReadyChange={setPixiReady}
        />

        {!arenaReady && (
          <div className="arena-loading-overlay">
            <div className="arena-loading-card">
              <div className="arena-loading-spinner" />
              <h2>{t('arena.loadingTitle')}</h2>
              <p>{t('arena.loadingDesc')}</p>
            </div>
          </div>
        )}

        {arenaReady && (
          <HUD
            playerName={displayPlayerName}
            character={character}
            hp={hp}
            movementSpeed={movementSpeed || character.movementSpeed}
            playerPos={{ x: controller.player.x, y: controller.player.y }}
            dummies={dummies}
            otherPlayers={Object.values(otherPlayers) as NetPlayer[]}
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            skillCooldowns={skillCooldowns}
            autoAttackCooldown={autoAttackCD}
          />
        )}

        {arenaReady && (
          <ArenaChatBox
            messages={arenaChatMessages}
            localUserId={playerUserId}
            replyTarget={replyTarget}
            onSend={emitArenaChat}
            onInputActiveChange={setChatInputActive}
          />
        )}

        {controller.respawnTimer !== null && (
          <div className="death-overlay">
            <div className="death-content">
              <h1>{t('arena.diedTitle')}</h1>
              <p>{t('arena.respawningIn', { seconds: controller.respawnTimer })}</p>
              <button
                type="button"
                className="death-return-button"
                onClick={() => onReturnToSelect(controller.respawnAvailableAt ?? undefined)}
              >
                {t('arena.backToSelect')}
              </button>
              <p className="death-hint">{t('arena.deadHint')}</p>
            </div>
          </div>
        )}

        {controller.showScoreboard && (
          <div className="scoreboard-overlay">
            <div className="scoreboard-content">
              <h2>{t('arena.scoreboardTitle')}</h2>
              <table className="scoreboard-table">
                <thead>
                  <tr>
                    <th>{t('arena.player')}</th>
                    <th>{t('arena.dragon')}</th>
                    <th>{t('arena.kills')}</th>
                    <th>{t('arena.deaths')}</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreboardEntries.map(score => (
                    <tr key={score.id} className={score.isLocal ? 'local-player' : ''}>
                      <td>{score.name} {score.isLocal ? t('arena.you') : ''}</td>
                      <td>{bootstrap.characters[score.characterId]?.name || score.characterId}</td>
                      <td>{score.kills}</td>
                      <td>{score.deaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="scoreboard-hint">{t('arena.releaseTab')}</p>
            </div>
          </div>
        )}

        {showLeavePrompt && (
          <div className="arena-confirm-overlay">
            <div className="arena-confirm-card">
              <span className="arena-confirm-eyebrow">{t('arena.leaveEyebrow')}</span>
              <h2>{t('arena.leaveTitle')}</h2>
              <p>{t('arena.leaveText')}</p>
              <div className="arena-confirm-actions">
                <button
                  type="button"
                  className="arena-confirm-button arena-confirm-button--secondary"
                  onClick={() => setShowLeavePrompt(false)}
                >
                  {t('arena.leaveCancel')}
                </button>
                <button
                  type="button"
                  className="arena-confirm-button arena-confirm-button--primary"
                  onClick={onReturnToHome}
                >
                  {t('arena.leaveConfirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
