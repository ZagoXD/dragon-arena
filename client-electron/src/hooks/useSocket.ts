import { useEffect, useRef, useState } from 'react'
import { Direction } from '../config/spriteMap'

export interface NetPlayer {
  id: string
  name: string
  characterId: string
  x: number
  y: number
  direction: Direction
  animRow: number
  hp: number
  maxHp: number
  kills: number
  deaths: number
  isDashing?: boolean
}

export function useSocket(
  playerName: string, 
  characterId: string, 
  maxHp: number, 
  onCurrentDummies: (dummies: any[]) => void,
  onDummyDamaged: (id: string, hp: number) => void,
  onSelfDamaged: (newHp: number, x?: number, y?: number) => void,
  onSelfMoved: (x: number, y: number) => void,
  onOtherShot?: (data: { playerId: string, originX: number, originY: number, angle: number }) => void
) {
  const socketIdRef = useRef<string | undefined>(undefined)
  const [socketId, setSocketId] = useState<string | undefined>(undefined)
  const [mapData, setMapData] = useState<any | null>(null)
  const [otherPlayers, setOtherPlayers] = useState<Record<string, NetPlayer>>({})
  const [kills, setKills] = useState(0)
  const [deaths, setDeaths] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  
  const onOtherShotRef = useRef(onOtherShot)
  onOtherShotRef.current = onOtherShot

  const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'ws://localhost:3001').replace('http', 'ws')

  useEffect(() => {
    const ws = new WebSocket(SERVER_URL)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('UseSocket: Connected to C++ Server')
      ws.send(JSON.stringify({
        event: 'join',
        name: playerName,
        characterId,
        maxHp
      }))
    }

    ws.onmessage = (msgEvent) => {
      const data = JSON.parse(msgEvent.data)
      const { event: eventName } = data
      
      switch (eventName) {
        case 'welcome':
          socketIdRef.current = data.id
          setSocketId(data.id)
          break

        case 'mapData': {
          const md = typeof data.map === 'string' ? JSON.parse(data.map) : data.map
          setMapData(md)
          ;(window as any).currentGameMapData = md
          break
        }

        case 'currentPlayers': {
          const players = { ...data.players }
          if (socketIdRef.current) delete players[socketIdRef.current]
          setOtherPlayers(players)
          break
        }
        
        case 'currentDummies':
          onCurrentDummies(data.dummies)
          break
        
        case 'playerJoined':
          if (data.player.id === socketIdRef.current) {
            onSelfDamaged(data.player.hp, data.player.x, data.player.y)
          } else {
            setOtherPlayers(prev => ({ ...prev, [data.player.id]: data.player }))
          }
          break

        case 'playerMoved':
          if (data.id === socketIdRef.current) {
            onSelfMoved(data.x, data.y)
          } else {
            setOtherPlayers(prev => {
              if (!prev[data.id]) return prev
              return { 
                ...prev, 
                [data.id]: { 
                  ...prev[data.id], 
                  x: data.x, 
                  y: data.y, 
                  direction: data.direction, 
                  animRow: data.animRow,
                  isDashing: data.isDashing
                } 
              }
            })
          }
          break
        
        case 'playerDamaged':
           if (data.id === socketIdRef.current) {
             onSelfDamaged(data.hp)
           } else {
             setOtherPlayers(prev => {
               if (!prev[data.id]) return prev
               return { ...prev, [data.id]: { ...prev[data.id], hp: data.hp } }
             })
           }
           break

        case 'dummyDamaged':
           onDummyDamaged(data.id, data.hp)
           break

        case 'playerScored':
          if (data.victimId === socketIdRef.current) setDeaths(data.targetDeaths)
          if (data.attackerId === socketIdRef.current) setKills(data.attackerKills)

          setOtherPlayers(prev => {
            const next = { ...prev }
            if (next[data.victimId]) {
              next[data.victimId] = { ...next[data.victimId], deaths: data.targetDeaths }
            }
            if (data.attackerId && next[data.attackerId]) {
              next[data.attackerId] = { ...next[data.attackerId], kills: data.attackerKills }
            }
            return next
          })
          break
        
        case 'playerRespawned':
          if (data.id === socketIdRef.current) {
             onSelfDamaged(data.hp, data.x, data.y)
          } else {
            setOtherPlayers(prev => {
              if (!prev[data.id]) return prev
              return { ...prev, [data.id]: { ...prev[data.id], hp: data.hp, x: data.x, y: data.y } }
            })
          }
          break

        case 'playerLeft':
          setOtherPlayers(prev => {
            const next = { ...prev }
            delete next[data.id]
            return next
          })
          break
        
        case 'playerShot':
          if (data.playerId !== socketIdRef.current) {
            onOtherShotRef.current?.(data)
          }
          break

        case 'skillUsed':
          // Optional: handle visual effect trigger
          break
      }
    }

    ws.onclose = () => console.log('UseSocket: Disconnected from C++ Server')
    return () => ws.close()
  }, [playerName, characterId, maxHp, SERVER_URL])

  const emitMove = (x: number, y: number, direction: Direction, animRow: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'move', x, y, direction, animRow }))
    }
  }

  const emitShoot = (originX: number, originY: number, angle: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'shoot', originX, originY, angle }))
    }
  }

  const emitDamage = (amount: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'takeDamage', amount }))
    }
  }

  const emitRespawn = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
       wsRef.current.send(JSON.stringify({ event: 'respawn' }))
    }
  }

  const emitDummyDamage = (dummyId: string, damage: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'dummyDamage', dummyId, damage }))
    }
  }

  const emitHitPlayer = (targetId: string, damage: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'hitPlayer', targetId, attackerId: socketIdRef.current, damage }))
    }
  }

  const emitUseSkill = (skillId: string, x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'useSkill', skillId, x, y }))
    }
  }

  return {
    socketId,
    mapData,
    otherPlayers,
    kills,
    deaths,
    emitMove,
    emitShoot,
    emitDamage,
    emitDummyDamage,
    emitHitPlayer,
    emitRespawn,
    emitUseSkill,
    isConnected: !!socketId
  }
}
