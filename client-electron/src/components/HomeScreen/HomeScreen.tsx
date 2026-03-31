import './HomeScreen.css'

interface Props {
  nickname: string
  coins: number
  onEnterArena: () => void
  onLogout: () => void
}

export function HomeScreen({ nickname, coins, onEnterArena, onLogout }: Props) {
  return (
    <div className="home-screen">
      <div className="home-screen__glow home-screen__glow--left" />
      <div className="home-screen__glow home-screen__glow--right" />

      <aside className="home-screen__profile">
        <button type="button" className="home-screen__logout" onClick={onLogout}>
          Sair
        </button>
        <span className="home-screen__profile-label">Invocador</span>
        <strong className="home-screen__profile-name">{nickname}</strong>

        <div className="home-screen__coins">
          <span className="home-screen__coins-label">Coins</span>
          <strong className="home-screen__coins-value">{coins}</strong>
        </div>
      </aside>

      <main className="home-screen__center">
        <span className="home-screen__eyebrow">Dragon Arena</span>
        <h1 className="home-screen__title">Seu portal para a batalha esta pronto</h1>
        <p className="home-screen__subtitle">
          Revise seu perfil, junte suas moedas e entre quando quiser.
        </p>

        <button type="button" className="home-screen__cta" onClick={onEnterArena}>
          Entrar na arena
        </button>
      </main>
    </div>
  )
}
