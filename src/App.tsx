import { useState } from 'react'
import { NameScreen } from './components/NameScreen/NameScreen'
import { SelectScreen } from './components/SelectScreen/SelectScreen'
import { Arena } from './components/Arena/Arena'
import { GameOver } from './components/GameOver/GameOver'
import './App.css'

type Screen = 'name' | 'select' | 'arena' | 'gameover'

function App() {
  const [screen, setScreen] = useState<Screen>('name')
  const [playerName, setPlayerName] = useState('')
  const [characterId, setCharacterId] = useState<string>('charizard')

  // Called when the user submits their name
  const handleNameEnter = (name: string) => {
    setPlayerName(name)
    setScreen('select')
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
