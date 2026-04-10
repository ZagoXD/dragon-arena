import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  joinMode: 'training' | 'match'
  matchId?: string | null
  reportModalOpen: boolean
  characterId?: string
  onAuthenticated: (payload: AuthSuccessPayload) => void
  onAuthFailure: (message: string) => void
  onArenaChatMessage: (message: ArenaChatMessage) => void
  onMatchEnded: (payload: { result: 'victory' | 'defeat' | 'draw', reason: 'time_limit' | 'disconnect', yourKills: number, yourDeaths: number, opponentKills: number, opponentDeaths: number }) => void
  onOpenReportModal: (target?: { nickname?: string, tag?: string }) => void
  replyTarget: { userId: number, label: string } | null
  onReturnToHome: () => void
}

export function Arena({
  playerUserId,
  playerName,
  authIntent,
  joinMode,
  matchId = null,
  reportModalOpen,
  characterId = 'meteor',
  onAuthenticated,
  onAuthFailure,
  onArenaChatMessage,
  onMatchEnded,
  onOpenReportModal,
  replyTarget,
  onReturnToHome,
}: Props) {
  const { t } = useTranslation()
  const [inArenaCharacterId, setInArenaCharacterId] = useState(characterId)
  const fallbackVisual = CHARACTER_VISUALS[inArenaCharacterId] || CHARACTER_VISUALS.meteor
  const [pixiReady, setPixiReady] = useState(false)
  const [pixiInstanceKey, setPixiInstanceKey] = useState(0)
  const [showLeavePrompt, setShowLeavePrompt] = useState(false)
  const [matchRemainingMs, setMatchRemainingMs] = useState(0)
  const [arenaChatMessages, setArenaChatMessages] = useState<ArenaChatMessage[]>([])
  const [chatInputActive, setChatInputActive] = useState(false)
  const [characterSelectOpen, setCharacterSelectOpen] = useState(false)
  const [characterChangeBusy, setCharacterChangeBusy] = useState(false)
  const [characterChangeError, setCharacterChangeError] = useState<string | null>(null)
  const localPlayerIdRef = useRef<string | undefined>(undefined)
  const lockActionRef = useRef<((dir: 'up' | 'right' | 'down' | 'left', durationMs: number) => void) | null>(null)
  const setDirectionRef = useRef<((dir: 'up' | 'right' | 'down' | 'left') => void) | null>(null)
  const previousHpRef = useRef<number | null>(null)

  const getCharacterPortraitStyle = useCallback((nextCharacterId: string) => {
    const nextCharacter = CHARACTER_VISUALS[nextCharacterId]
    if (!nextCharacter) {
      return undefined
    }

    const portraitSize = 100
    const sheetWidth = portraitSize * 4
    const currentRow = nextCharacter.idleRows[0] ?? 0
    const bgPosX = -(2 * portraitSize)
    const bgPosY = -(currentRow * portraitSize)

    return {
      width: `${portraitSize}px`,
      height: `${portraitSize}px`,
      backgroundImage: `url(${nextCharacter.imageSrc})`,
      backgroundSize: `${sheetWidth}px auto`,
      backgroundPosition: `${bgPosX}px ${bgPosY}px`,
    }
  }, [])

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

  useEffect(() => {
    setInArenaCharacterId(characterId)
  }, [characterId])

  const effectiveAuthIntent = useMemo(() => (
    authIntent ?? {
      mode: 'login' as const,
      identifier: playerName,
      password: '',
    }
  ), [authIntent, playerName])

  const {
    socketId,
    mapData,
    bootstrap,
    instanceInfo,
    character,
    tileSize,
    mapWidth,
    mapHeight,
    dummyColliderSize,
    dummyMaxHp,
    respawnSeconds,
    hp,
    shieldHp,
    shieldMaxHp,
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
    emitChangeCharacter,
  } = useArenaNetworkState({
    authIntent: effectiveAuthIntent,
    characterId: inArenaCharacterId,
    joinOptions: {
      mode: joinMode,
      matchId,
    },
    onAutoAttackStarted: handleAutoAttackStarted,
    onSkillUsed: handleSkillUsed,
    onAuthSucceeded: handleAuthSucceeded,
    onAuthFailed: handleAuthFailed,
    onArenaChatMessage: (message) => {
      setArenaChatMessages(prev => [...prev.slice(-40), message])
      onArenaChatMessage(message)
    },
    onMatchEnded: (payload) => {
      onMatchEnded({
        result: payload.result,
        reason: payload.reason,
        yourKills: payload.yourKills,
        yourDeaths: payload.yourDeaths,
        opponentKills: payload.opponentKills,
        opponentDeaths: payload.opponentDeaths,
      })
    },
    onCharacterChanged: (payload) => {
      setInArenaCharacterId(payload.characterId)
      setCharacterChangeBusy(false)
      setCharacterChangeError(null)
      setCharacterSelectOpen(false)
    },
    onCharacterChangeRejected: (_code, reason) => {
      setCharacterChangeBusy(false)
      setCharacterChangeError(reason)
    },
  })

  const displayPlayerName = bootstrap?.player?.name || playerName

  const controller = useArenaController({
    inputEnabled: pixiReady && Boolean(bootstrap && character && mapData) && !chatInputActive && !reportModalOpen && !characterSelectOpen,
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
    onReturnToSelect: () => {
      setCharacterChangeError(null)
      setCharacterSelectOpen(true)
    },
  })

  localPlayerIdRef.current = socketId
  lockActionRef.current = controller.player.lockAction
  setDirectionRef.current = controller.player.setDirection

  useEffect(() => {
    const previousHp = previousHpRef.current
    if (previousHp !== null && previousHp <= 0 && hp > 0) {
      setPixiReady(false)
      setPixiInstanceKey(prev => prev + 1)
      setCharacterSelectOpen(false)
      setCharacterChangeBusy(false)
      setCharacterChangeError(null)
    }
    previousHpRef.current = hp
  }, [hp])

  const handleSelectArenaCharacter = useCallback((nextCharacterId: string) => {
    if (characterChangeBusy || nextCharacterId === inArenaCharacterId) {
      setCharacterSelectOpen(false)
      setCharacterChangeError(null)
      return
    }

    setCharacterChangeBusy(true)
    setCharacterChangeError(null)
    emitChangeCharacter(nextCharacterId)
  }, [characterChangeBusy, emitChangeCharacter, inArenaCharacterId])

  useEffect(() => {
    if (instanceInfo?.mode !== 'match' || typeof instanceInfo.matchEndsAtMs !== 'number' || typeof instanceInfo.serverTimeMs !== 'number') {
      setMatchRemainingMs(0)
      return
    }

    const serverOffsetMs = instanceInfo.serverTimeMs - Date.now()
    const updateRemaining = () => {
      setMatchRemainingMs(Math.max(0, instanceInfo.matchEndsAtMs! - (Date.now() + serverOffsetMs)))
    }

    updateRemaining()
    const interval = window.setInterval(updateRemaining, 250)
    return () => window.clearInterval(interval)
  }, [instanceInfo])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (chatInputActive || reportModalOpen) {
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
  }, [chatInputActive, controller.showScoreboard, reportModalOpen])

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
          shieldHp,
          shieldMaxHp,
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

        {arenaReady && !characterSelectOpen && (
          <HUD
            playerName={displayPlayerName}
            character={character}
            hp={hp}
            shieldHp={shieldHp}
            shieldMaxHp={shieldMaxHp}
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

        {arenaReady && joinMode === 'match' && !characterSelectOpen && (
          <div className="arena-match-timer">
            {t('arena.matchTimer', {
              time: new Date(matchRemainingMs).toISOString().slice(14, 19),
            })}
          </div>
        )}

        {arenaReady && !characterSelectOpen && (
          <ArenaChatBox
            messages={arenaChatMessages}
            localUserId={playerUserId}
            replyTarget={replyTarget}
            onSend={(body) => {
              const trimmed = body.trim()
              if (trimmed.toLowerCase() === '/report') {
                onOpenReportModal()
                return
              }

              if (trimmed.toLowerCase().startsWith('/report ')) {
                const target = trimmed.slice('/report '.length).trim()
                const hashIndex = target.lastIndexOf('#')
                if (hashIndex > 0 && hashIndex < target.length - 1) {
                  onOpenReportModal({
                    nickname: target.slice(0, hashIndex),
                    tag: target.slice(hashIndex),
                  })
                } else {
                  onOpenReportModal()
                }
                return
              }

              emitArenaChat(body)
            }}
            onInputActiveChange={setChatInputActive}
          />
        )}

        {controller.respawnTimer !== null && !characterSelectOpen && (
          <div className="death-overlay">
            <div className="death-content">
              <h1>{t('arena.diedTitle')}</h1>
              <p>{t('arena.respawningIn', { seconds: controller.respawnTimer })}</p>
              <button
                type="button"
                className="death-return-button"
                onClick={() => {
                  setCharacterChangeError(null)
                  setCharacterSelectOpen(true)
                }}
              >
                {t('arena.changeCharacter')}
              </button>
              <p className="death-hint">{t('arena.deadHint')}</p>
            </div>
          </div>
        )}

        {characterSelectOpen && hp <= 0 && (
          <div className="arena-character-overlay">
            <div className="arena-character-overlay__card">
              <span className="arena-character-overlay__eyebrow">{t('arena.changeCharacterEyebrow')}</span>
              <h2>{t('arena.changeCharacterTitle')}</h2>
              <p>{t('arena.changeCharacterText')}</p>
              {characterChangeError && <p className="arena-character-overlay__error">{characterChangeError}</p>}
              <div className="arena-character-overlay__list">
                {Object.values(CHARACTER_VISUALS).map(option => (
                  <button
                    key={option.id}
                    type="button"
                    className={`arena-character-overlay__option ${option.id === inArenaCharacterId ? 'is-active' : ''}`}
                    disabled={characterChangeBusy}
                    onClick={() => handleSelectArenaCharacter(option.id)}
                  >
                    <div
                      className="arena-character-overlay__portrait"
                      style={getCharacterPortraitStyle(option.id)}
                    />
                    <strong>{option.name}</strong>
                    <span>
                      {option.id === inArenaCharacterId
                        ? t('arena.currentCharacter')
                        : t('arena.selectCharacter')}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="arena-character-overlay__cancel"
                disabled={characterChangeBusy}
                onClick={() => {
                  setCharacterSelectOpen(false)
                  setCharacterChangeError(null)
                }}
              >
                {characterChangeBusy ? t('arena.changingCharacter') : t('arena.leaveCancel')}
              </button>
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
