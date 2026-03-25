import { DUMMY_MAX_HP, DUMMY_SIZE } from '../../config/spriteMap'
import './Dummy.css'

export interface DummyData {
  id: string
  x: number
  y: number
  hp: number
}

interface Props {
  dummy: DummyData
}

export function Dummy({ dummy }: Props) {
  const pct = Math.max(0, (dummy.hp / DUMMY_MAX_HP) * 100)
  
  const barColor =
    pct > 60 ? '#4caf50' :
    pct > 30 ? '#ff9800' :
               '#f44336'

  return (
    <div
      className="dummy"
      style={{
        left: dummy.x - DUMMY_SIZE / 2, // centered
        top: dummy.y - DUMMY_SIZE / 2,
        width: DUMMY_SIZE,
        height: DUMMY_SIZE,
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
