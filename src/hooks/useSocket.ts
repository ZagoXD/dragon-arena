import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { Direction } from '../config/spriteMap'

const SOCKET_URL = 'http://localhost:3001'

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
}

export function useSocket(
  playerName: string, 
  characterId: string, 
  maxHp: number, 
  onCurrentDummies: (dummies: any[]) => void,
  onDummyDamaged: (id: string, hp: number) => void,
  onSelfDamaged: (newHp: number) => void,
  onOtherShot?: (data: { playerId: string, originX: number, originY: number, angle: number }) => void
) {
  const socketIdRef = useRef<string | undefined>(undefined)
  const [socketId, setSocketId] = useState<string | undefined>(undefined)
  const socketRef = useRef<Socket | null>(null)
  const [otherPlayers, setOtherPlayers] = useState<Record<string, NetPlayer>>({})
  const [kills, setKills] = useState(0)
  const [deaths, setDeaths] = useState(0)
  
  // Keep callback stable via ref
  const onOtherShotRef = useRef(onOtherShot)
  onOtherShotRef.current = onOtherShot

  useEffect(() => {
    // Force new connection to prevent multiplexing issues in different tabs
    const socket: Socket = io(SOCKET_URL, {
      forceNew: true,
      transports: ['websocket'] // usually faster and more direct
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socketIdRef.current = socket.id
      setSocketId(socket.id)
      console.log('useSocket connect: id is', socket.id)
      socket.emit('join', { name: playerName, characterId, maxHp })
    })

    socket.on('currentPlayers', (players: Record<string, NetPlayer>) => {
      const others = { ...players }
      if (socket.id) delete others[socket.id]
      setOtherPlayers(others)
    })

    socket.on('currentDummies', (data: any[]) => {
      onCurrentDummies(data)
    })

    socket.on('dummyDamaged', (data: { id: string, hp: number }) => {
      onDummyDamaged(data.id, data.hp)
    })

    socket.on('playerJoined', (player: NetPlayer) => {
      if (player.id === socketIdRef.current) return
      setOtherPlayers(prev => ({ ...prev, [player.id]: player }))
    })

    socket.on('playerMoved', (data: any) => {
      setOtherPlayers(prev => {
        if (!prev[data.id]) return prev
        return { ...prev, [data.id]: { ...prev[data.id], ...data } }
      })
    })

    socket.on('playerDamaged', (data: any) => {
      if (data.id === socketIdRef.current) {
        // This is damage to the local player — update their HP
        onSelfDamaged(data.hp)
      } else {
        setOtherPlayers(prev => {
          if (!prev[data.id]) return prev
          return { ...prev, [data.id]: { ...prev[data.id], hp: data.hp } }
        })
      }
    })

    socket.on('playerScored', (data: any) => {
      if (data.victimId === socketIdRef.current) {
        setDeaths(data.targetDeaths)
      }
      if (data.attackerId === socketIdRef.current) {
        setKills(data.attackerKills)
      }

      setOtherPlayers(prev => {
        const next = { ...prev }
        if (next[data.victimId]) {
          next[data.victimId] = { ...next[data.victimId], kills: data.targetKills, deaths: data.targetDeaths }
        }
        if (data.attackerId && next[data.attackerId]) {
          next[data.attackerId] = { ...next[data.attackerId], kills: data.attackerKills, deaths: data.attackerDeaths }
        }
        return next
      })
    })

    socket.on('playerLeft', (id: string) => {
      setOtherPlayers(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    })

    socket.on('playerShot', (data: any) => {
      if (data.playerId === socketIdRef.current) return
      console.log('useSocket: received playerShot', data)
      onOtherShotRef.current?.(data)
    })

    return () => {
      socket.disconnect()
    }
  }, [playerName, characterId, maxHp])

  const emitMove = (x: number, y: number, direction: Direction, animRow: number) => {
    socketRef.current?.emit('move', { x, y, direction, animRow })
  }

  const emitShoot = (originX: number, originY: number, angle: number) => {
    socketRef.current?.emit('shoot', { originX, originY, angle })
  }

  const emitDamage = (amount: number) => {
    socketRef.current?.emit('takeDamage', { amount })
  }

  const emitRespawn = () => {
    socketRef.current?.emit('respawn')
  }

  const emitDummyDamage = (dummyId: string, damage: number) => {
    socketRef.current?.emit('dummyDamage', { dummyId, damage })
  }

  const emitHitPlayer = (targetId: string, damage: number) => {
    socketRef.current?.emit('hitPlayer', { targetId, attackerId: socketIdRef.current, damage })
  }

  return {
    socketId,
    otherPlayers,
    kills,
    deaths,
    emitMove,
    emitShoot,
    emitDamage,
    emitDummyDamage,
    emitHitPlayer,
    emitRespawn,
    socket: socketRef.current
  }
}
