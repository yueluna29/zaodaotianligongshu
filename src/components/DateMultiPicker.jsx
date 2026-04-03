import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

const WDAYS = ["日", "月", "火", "水", "木", "金", "土"]
const pad = (n) => String(n).padStart(2, "0")

export default function DateMultiPicker({ selected = [], onChange, t }) {
  const now = new Date()
  const [y, sY] = useState(now.getFullYear())
  const [m, sM] = useState(now.getMonth() + 1)

  const daysInMonth = new Date(y, m, 0).getDate()
  const firstDay = new Date(y, m - 1, 1).getDay()

  const chg = (d) => {
    let nm = m + d, ny = y
    if (nm > 12) { nm = 1; ny++ }
    else if (nm < 1) { nm = 12; ny-- }
    sY(ny); sM(nm)
  }

  const toggle = (dateStr) => {
    if (selected.includes(dateStr)) {
      onChange(selected.filter(d => d !== dateStr))
    } else {
      onChange([...selected, dateStr].sort())
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button type="button" onClick={() => chg(-1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>{y}年{m}月</span>
        <button type="button" onClick={() => chg(1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {WDAYS.map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: i === 0 || i === 6 ? t.rd : t.tm, padding: 4 }}>{w}</div>
        ))}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`e-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1
          const ds = `${y}-${pad(m)}-${pad(d)}`
          const wd = new Date(y, m - 1, d).getDay()
          const isWe = wd === 0 || wd === 6
          const isSel = selected.includes(ds)
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(ds)}
              style={{
                width: "100%", borderRadius: 8,
                border: isSel ? `2px solid ${t.ac}` : `1px solid ${t.bl}`,
                background: isSel ? `${t.ac}20` : "transparent",
                color: isSel ? t.ac : isWe ? t.rd : t.tx,
                fontSize: 12, fontWeight: isSel ? 700 : 400,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {d}
            </button>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: t.ac, fontWeight: 600 }}>
          已选 {selected.length} 天
          <button type="button" onClick={() => onChange([])} style={{ background: "none", border: "none", color: t.rd, fontSize: 10, marginLeft: 8, cursor: "pointer", textDecoration: "underline" }}>清空</button>
        </div>
      )}
    </div>
  )
}
