import './Dummy.css'

export interface DummyData {
  id: string
  x: number
  y: number
  hp: number
}

interface Props {
  dummy: DummyData
  maxHp: number
  size: number
}

export function Dummy({ dummy, maxHp, size }: Props) {
  const pct = Math.max(0, (dummy.hp / maxHp) * 100)
  
  const barColor =
    pct > 60 ? '#4caf50' :
    pct > 30 ? '#ff9800' :
               '#f44336'

  return (
    <div
      className="dummy"
      style={{
        left: dummy.x - size / 2,
        top: dummy.y - size / 2,
        width: size,
        height: size,
      }}
    >
      <div className="dummy__overhead">
        <span className="dummy__name">Target Dummy</span>
        <div className="dummy__hp-track">
          <div
            className="dummy__hp-fill"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      </div>
      <div className={`dummy__body ${dummy.hp === 0 ? 'dummy--dead' : ''}`} />
    </div>
  )
}
