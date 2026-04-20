import { useState, useEffect, useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { sbGet } from "../api/supabase"

const WDAYS = ["日", "月", "火", "水", "木", "金", "土"]
const pad = (n) => String(n).padStart(2, "0")

export default function DateMultiPicker({ selected = [], onChange, t, tk }) {
  const now = new Date()
  const [y, sY] = useState(now.getFullYear())
  const [m, sM] = useState(now.getMonth() + 1)
  const [holidays, setHolidays] = useState({})

  const daysInMonth = new Date(y, m, 0).getDate()
  const firstDay = new Date(y, m - 1, 1).getDay()
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  useEffect(() => {
    if (!tk) return
    let active = true
    const from = `${y}-${pad(m)}-01`
    const to = `${y}-${pad(m)}-${pad(daysInMonth)}`
    sbGet(`japanese_holidays?holiday_date=gte.${from}&holiday_date=lte.${to}&select=*`, tk).then((rows) => {
      if (!active) return
      const mp = {}
      ;(rows || []).forEach((h) => {
        if (!mp[h.holiday_date]) mp[h.holiday_date] = []
        mp[h.holiday_date].push({ name: h.name, country: h.country || "JP" })
      })
      setHolidays(mp)
    })
    return () => { active = false }
  }, [y, m, daysInMonth, tk])

  const chg = (d) => {
    let nm = m + d, ny = y
    if (nm > 12) { nm = 1; ny++ }
    else if (nm < 1) { nm = 12; ny-- }
    sY(ny); sM(nm)
  }

  const toggle = (dateStr) => {
    if (selected.includes(dateStr)) onChange(selected.filter(d => d !== dateStr))
    else onChange([...selected, dateStr].sort())
  }

  const holidayColor = (country) => country === "CN" ? t.wn : t.rd

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button type="button" onClick={() => chg(-1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{y}年{m}月</span>
        <button type="button" onClick={() => chg(1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 6 }}>
        {WDAYS.map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: i === 0 || i === 6 ? t.rd : t.tm, padding: "4px 0" }}>{w}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, gridAutoRows: "72px" }}>
        {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1
          const ds = `${y}-${pad(m)}-${pad(d)}`
          const wd = new Date(y, m - 1, d).getDay()
          const isWe = wd === 0 || wd === 6
          const isSel = selected.includes(ds)
          const isToday = ds === todayStr
          const hList = holidays[ds] || []
          const isH = hList.length > 0
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(ds)}
              style={{
                borderRadius: 8,
                border: isSel ? `2px solid ${t.ac}` : `1px solid ${isToday ? t.ac : t.bl}`,
                background: isSel ? `${t.ac}18` : isH ? `${t.rd}06` : isWe ? t.we : "transparent",
                color: isSel ? t.ac : (isWe || isH) ? t.rd : t.tx,
                cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start",
                padding: "4px 5px", overflow: "hidden",
                fontWeight: isSel ? 700 : 500,
              }}
            >
              <div style={{ fontSize: 13, textAlign: "left", fontWeight: isSel || isToday ? 700 : 500 }}>{d}</div>
              {hList.map((h, j) => {
                const c = holidayColor(h.country)
                return (
                  <div key={j} style={{ fontSize: 9, color: c, fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2, borderLeft: `2px solid ${c}`, paddingLeft: 3, textAlign: "left" }} title={`${h.name}（${h.country === "CN" ? "中国" : "日本"}）`}>
                    {h.name}
                  </div>
                )
              })}
            </button>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: t.ac, fontWeight: 600 }}>
          已选 {selected.length} 天
          <button type="button" onClick={() => onChange([])} style={{ background: "none", border: "none", color: t.rd, fontSize: 10, marginLeft: 8, cursor: "pointer", textDecoration: "underline" }}>清空</button>
        </div>
      )}
    </div>
  )
}
