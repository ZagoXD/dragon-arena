import { useState, useCallback } from 'react'
import { NameScreen } from './components/NameScreen/NameScreen'
import { SelectScreen } from './components/SelectScreen/SelectScreen'
import { Arena } from './components/Arena/Arena'
import { GameOver } from './components/GameOver/GameOver'
import { LoadingScreen } from './components/LoadingScreen/LoadingScreen'
import './App.css'

type Screen = 'name' | 'loading' | 'select' | 'arena' | 'gameover'

function App() {
  const [screen, setScreen] = useState<Screen>('name')
  const [playerName, setPlayerName] = useState('')
  const [characterId, setCharacterId] = useState<string>('charizard')
  
  // Connectivity Test State
  const [loadingStatus, setLoadingStatus] = useState('Initializing...')
  const [retryCount, setRetryCount] = useState(0)
  const [connError, setConnError] = useState<string | null>(null)

  const testConnection = useCallback(async () => {
    const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'ws://localhost:3001').replace('http', 'ws')
    setScreen('loading')
    setConnError(null)
    
    for (let i = 1; i <= 6; i++) {
       setRetryCount(i)
       setLoadingStatus(`Connecting to Dragon Arena Server...`)
       
       try {
         await new Promise((resolve, reject) => {
           const ws = new WebSocket(SERVER_URL)
           const timeout = setTimeout(() => {
             ws.close()
             reject(new Error('Connection timeout'))
           }, 3500)

           ws.onopen = () => {
             clearTimeout(timeout)
             setTimeout(() => { ws.close(); resolve(true); }, 100)
           }
           ws.onerror = () => {
             clearTimeout(timeout)
             reject(new Error('Server unreachable'))
           }
         })
         
         // SUCCESS!
         setLoadingStatus('Success! Entering Arena...')
         setTimeout(() => setScreen('select'), 500)
         return 
       } catch (err) {
         if (i === 6) {
           setConnError('Could not establish connection to the Dragon Arena C++ server. Please check if the backend is running and reachable.')
         } else {
           await new Promise(r => setTimeout(r, i * 500)) // Exponential-ish backoff
         }
       }
    }
  }, [])

  // Called when the user submits their name
  const handleNameEnter = (name: string) => {
    setPlayerName(name)
    testConnection()
  }

  // Called when the user picks a character
  const handleSelectCharacter = (id: string) => {
    setCharacterId(id)
    setScreen('arena')
  }

  const handleGameOver = () => {
    setScreen('gameover')
  }

  const handleRestart = () => {
    setScreen('name')
  }

  return (
    <>
      {screen === 'name' && (
        <NameScreen onStart={handleNameEnter} />
      )}
      {screen === 'loading' && (
        <LoadingScreen 
          status={loadingStatus} 
          retryCount={retryCount} 
          error={connError} 
          onRetry={testConnection} 
        />
      )}
      {screen === 'select' && (
        <SelectScreen 
          playerName={playerName} 
          onSelect={handleSelectCharacter} 
        />
      )}
      {screen === 'arena' && (
        <Arena 
          playerName={playerName} 
          characterId={characterId}
          onGameOver={handleGameOver} 
        />
      )}
      {screen === 'gameover' && (
        <GameOver 
          playerName={playerName} 
          onRestart={handleRestart} 
        />
      )}
    </>
  )
}

export default App
