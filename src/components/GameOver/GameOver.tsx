import './GameOver.css'

interface Props {
  playerName: string
  onRestart: () => void
}

export function GameOver({ playerName, onRestart }: Props) {
  return (
    <div className="gameover">
      <div className="gameover__bg" />
      <div className="gameover__card">
        <h1 className="gameover__title">Você morreu</h1>
        <p className="gameover__sub">{playerName} foi derrotado na arena.</p>
        <button
          id="restart-btn"
          className="gameover__btn"
          onClick={onRestart}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
