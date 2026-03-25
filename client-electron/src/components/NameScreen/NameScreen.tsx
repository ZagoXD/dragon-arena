import { useRef, KeyboardEvent } from 'react'
import './NameScreen.css'

interface Props {
  onStart: (name: string) => void
}

export function NameScreen({ onStart }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    const name = inputRef.current?.value.trim() || 'Player'
    onStart(name)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="name-screen">
      <div className="name-screen__bg" />

      <div className="name-screen__card">
        <h1 className="name-screen__title">
          <span className="name-screen__title-dragon">Dragon</span>
          <span className="name-screen__title-arena"> Arena</span>
        </h1>

        <p className="name-screen__subtitle">Enter the battlefield</p>

        <div className="name-screen__form">
          <label className="name-screen__label" htmlFor="player-name">
            Your name
          </label>
          <input
            id="player-name"
            ref={inputRef}
            className="name-screen__input"
            type="text"
            maxLength={20}
            placeholder="Player"
            autoFocus
            onKeyDown={handleKeyDown}
          />
          <button
            id="start-btn"
            className="name-screen__btn"
            onClick={handleSubmit}
          >
            OK — Enter Arena
          </button>
        </div>
      </div>
    </div>
  )
}
