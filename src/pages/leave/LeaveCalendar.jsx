import { useState, useEffect, useMemo } from "react"
import { sbGet } from "../../api/supabase"
import { LEAVE_TYPES, WEEKDAYS, daysInMonth, weekday, isWeekend, pad } from "../../config/constants"

export default function LeaveCalendar({ t, tk }) {
  const now = new Date()
  const [y, sY] = useState(now.getFullYear())
  const [m, sM] = useState(now.getMonth() + 1)
  const [emps, sE] = useState([])
  const [reqs, sR] = useState([])
  const [holidays, sH] = useState({})
  const [ld, sLd] = useState(true)
  const [mode, sMode] = useState("table")
  const days = daysInMonth(y, m)

  useEffect(() => {
    (async () => {
      sLd(true)
      const from = `${y}-${pad(m)}-01`
      const to = `${y}-${pad(m)}-${pad(days)}`
      const [e, r, h] = await Promise.all([
        sbGet("employees?is_active=eq.true&order=name", tk),
        sbGet(`leave_requests?status=eq.承認&leave_date=gte.${from}&leave_date=lte.${to}&select=*`, tk),
        sbGet(`japanese_holidays?holiday_date=gte.${from}&holiday_date=lte.${to}&select=*`, tk),
      ])
      sE(e || [])
      sR(r || [])
      const hm = {}
      ;(h || []).forEach((hd) => { hm[hd.holiday_date] = hd.name })
      sH(hm)
      sLd(false)
    })()
  }, [y, m, days, tk])

  const chg = (d) => {
    let nm = m + d, ny = y
    if (nm > 12) { nm = 1; ny++ }
    else if (nm < 1) { nm = 12; ny-- }
    sY(ny); sM(nm)
  }

  const rm = useMemo(() => {
    const mp = {}
    reqs.forEach((r) => { mp[`${r.employee_id}-${r.leave_date}`] = r.leave_type })
    return mp
  }, [reqs])

  if (ld) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

  // ========== 表格版 ==========
  const TableView = () => (
    <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: 700 }}>
        <thead>
          <tr style={{ background: t.bgH }}>
            <th style={{ padding: "6px 10px", color: t.tm, fontWeight: 500, textAlign: "left", position: "sticky", left: 0, background: t.bgS, zIndex: 1, borderBottom: `1px solid ${t.bd}` }}>社员</th>
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
              const ds = `${y}-${pad(m)}-${pad(d)}`
              const we = isWeekend(y, m, d)
              const isH = !!holidays[ds]
              return (
                <th key={d} style={{ padding: "3px 1px", color: (we || isH) ? t.rd : t.tm, textAlign: "center", minWidth: 22, borderBottom: `1px solid ${t.bd}`, background: isH ? `${t.rd}10` : we ? t.we : "transparent" }} title={holidays[ds] || ""}>
                  <div style={{ fontSize: 8 }}>{WEEKDAYS[weekday(y, m, d)]}</div>
                  <div>{d}</div>
                  {isH && <div style={{ width: 4, height: 4, borderRadius: 4, background: t.rd, margin: "1px auto 0" }} />}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {emps.map((emp) => (
            <tr key={emp.id} style={{ borderBottom: `1px solid ${t.bl}` }}>
              <td style={{ padding: "6px 10px", color: t.tx, fontWeight: 500, position: "sticky", left: 0, background: t.bgC, zIndex: 1, fontSize: 11 }}>
                {emp.name || emp.email}
                {emp.days_off && emp.days_off.length > 0 && (
                  <div style={{ fontSize: 7, color: t.td }}>休:{emp.days_off.map((d) => WEEKDAYS[d]).join("")}</div>
                )}
              </td>
              {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                const ds = `${y}-${pad(m)}-${pad(d)}`
                const lv = rm[`${emp.id}-${ds}`]
                const lt = LEAVE_TYPES.find((l) => l.v === lv)
                const we = isWeekend(y, m, d)
                const isH = !!holidays[ds]
                const isDayOff = emp.days_off && emp.days_off.includes(weekday(y, m, d)) && !we
                return (
                  <td key={d} style={{ padding: "3px 1px", textAlign: "center", background: isH ? `${t.rd}08` : we ? t.we : isDayOff ? `${t.tm}12` : "transparent" }}>
                    {lt ? (
                      <div style={{ width: 18, height: 18, borderRadius: 3, background: lt.c, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff", fontWeight: 700 }}>{lt.l[0]}</div>
                    ) : isDayOff ? (
                      <div style={{ width: 18, height: 18, borderRadius: 3, background: `${t.tm}20`, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: t.td, fontWeight: 700 }}>休</div>
                    ) : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // ========== 月历版 ==========
  const GridView = () => {
    const firstDayOfWeek = weekday(y, m, 1)
    return (
      <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 8 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: i === 0 || i === 6 ? t.rd : t.tm, padding: 4 }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {Array.from({ length: firstDayOfWeek }, (_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
            const ds = `${y}-${pad(m)}-${pad(d)}`
            const we = isWeekend(y, m, d)
            const isH = !!holidays[ds]
            const wdNum = weekday(y, m, d)
            const dayLeaves = emps
              .map((emp) => {
                const lv = rm[`${emp.id}-${ds}`]
                return lv ? { name: emp.name, type: lv } : null
              })
              .filter(Boolean)
            const dayOffs = emps.filter((emp) => emp.days_off && emp.days_off.includes(wdNum) && !we)
            return (
              <div key={d} style={{ minHeight: 64, borderRadius: 6, border: `1px solid ${t.bl}`, padding: "3px 5px", background: isH ? `${t.rd}08` : we ? t.we : "transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: (we || isH) ? t.rd : t.tx }}>{d}</span>
                  {isH && <span style={{ fontSize: 7, color: t.rd }} title={holidays[ds]}>●</span>}
                </div>
                {dayLeaves.slice(0, 3).map((l, i) => {
                  const lt = LEAVE_TYPES.find((x) => x.v === l.type)
                  return (
                    <div key={i} style={{ fontSize: 9, padding: "1px 3px", borderRadius: 2, background: lt?.c || t.tm, color: "#fff", marginBottom: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {l.name?.slice(0, 3)} {lt?.l?.[0]}
                    </div>
                  )
                })}
                {dayLeaves.length > 3 && (
                  <div style={{ fontSize: 8, color: t.tm }}>+{dayLeaves.length - 3}</div>
                )}
                {dayOffs.length > 0 && dayLeaves.length === 0 && (
                  <div style={{ fontSize: 8, color: t.td, marginTop: 1 }}>
                    {dayOffs.slice(0, 2).map((e) => e.name?.slice(0, 2)).join(" ")} 定休
                  </div>
                )}
                {dayOffs.length > 0 && dayLeaves.length > 0 && (
                  <div style={{ fontSize: 7, color: t.td }}>+{dayOffs.length}定休</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ========== 主渲染 ==========
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>📅 休假日历</h2>
          <button onClick={() => sMode("table")} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${mode === "table" ? t.ac : t.bd}`, background: mode === "table" ? `${t.ac}15` : "transparent", color: mode === "table" ? t.ac : t.ts, fontSize: 10, cursor: "pointer" }}>表格</button>
          <button onClick={() => sMode("grid")} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${mode === "grid" ? t.ac : t.bd}`, background: mode === "grid" ? `${t.ac}15` : "transparent", color: mode === "grid" ? t.ac : t.ts, fontSize: 10, cursor: "pointer" }}>月历</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => chg(-1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bb}`, background: "transparent", color: t.ts, cursor: "pointer" }}>◀</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{y}年{m}月</span>
          <button onClick={() => chg(1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bb}`, background: "transparent", color: t.ts, cursor: "pointer" }}>▶</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {LEAVE_TYPES.slice(0, 4).map((lt) => (
          <div key={lt.v} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: lt.c }} />
            <span style={{ fontSize: 10, color: t.ts }}>{lt.l}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 8, background: t.rd }} />
          <span style={{ fontSize: 10, color: t.ts }}>祝日</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: `${t.tm}30` }} />
          <span style={{ fontSize: 10, color: t.ts }}>定休</span>
        </div>
      </div>

      {mode === "table" ? <TableView /> : <GridView />}
    </div>
  )
}