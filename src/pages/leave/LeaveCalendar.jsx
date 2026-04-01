import { useState, useEffect, useMemo } from "react"
import { sbGet } from "../../api/supabase"
import { LEAVE_TYPES, WEEKDAYS, daysInMonth, weekday, isWeekend, pad } from "../../config/constants"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

export default function LeaveCalendar({ t, tk }) {
  const now = new Date()
  const [y, sY] = useState(now.getFullYear())
  const [m, sM] = useState(now.getMonth() + 1)
  const [emps, sE] = useState([])
  const [reqs, sR] = useState([])
  const [holidays, sH] = useState({})
  const [scheds, setScheds] = useState({})
  const [swaps, setSwaps] = useState([])
  const [ld, sLd] = useState(true)
  const [mode, sMode] = useState("table")
  const days = daysInMonth(y, m)

  useEffect(() => {
    (async () => {
      sLd(true)
      const from = `${y}-${pad(m)}-01`
      const to = `${y}-${pad(m)}-${pad(days)}`
      const [e, r, h, sc, sw] = await Promise.all([
        sbGet("employees?is_active=eq.true&order=name", tk),
        sbGet(`leave_requests?status=eq.承認&leave_date=gte.${from}&leave_date=lte.${to}&select=*`, tk),
        sbGet(`japanese_holidays?holiday_date=gte.${from}&holiday_date=lte.${to}&select=*`, tk),
        sbGet("work_schedules?select=*", tk),
        sbGet(`day_swap_requests?status=eq.承認&original_date=gte.${from}&original_date=lte.${to}&select=*`, tk),
      ])
      sE(e || [])
      sR(r || [])
      const hm = {}
      ;(h || []).forEach((hd) => { hm[hd.holiday_date] = hd.name })
      sH(hm)
      // 排班按 employee_id -> day_of_week 索引
      const sm = {}
      ;(sc || []).forEach((s) => {
        if (!sm[s.employee_id]) sm[s.employee_id] = {}
        sm[s.employee_id][s.day_of_week] = { start: s.start_time?.slice(0, 5), end: s.end_time?.slice(0, 5) }
      })
      setScheds(sm)
      setSwaps(sw || [])
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
    reqs.forEach((r) => { mp[`${r.employee_id}-${r.leave_date}`] = r })
    return mp
  }, [reqs])

  const swapMap = useMemo(() => {
    const mp = {}
    swaps.forEach((s) => { mp[`${s.employee_id}-${s.original_date}`] = s })
    return mp
  }, [swaps])

  if (ld) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

  // ========== 表格版 ==========
  const TableView = () => (
    <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: 700 }}>
        <thead>
          <tr style={{ background: t.bgH }}>
            <th style={{ padding: "6px 10px", color: t.tm, fontWeight: 500, textAlign: "left", position: "sticky", left: 0, background: t.bgS, zIndex: 1, borderBottom: `1px solid ${t.bd}`, minWidth: 80 }}>社员</th>
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
              const ds = `${y}-${pad(m)}-${pad(d)}`
              const we = isWeekend(y, m, d)
              const isH = !!holidays[ds]
              return (
                <th key={d} style={{ padding: "3px 1px", color: (we || isH) ? t.rd : t.tm, textAlign: "center", minWidth: 32, borderBottom: `1px solid ${t.bd}`, background: isH ? `${t.rd}10` : we ? t.we : "transparent" }} title={holidays[ds] || ""}>
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
                const lvReq = rm[`${emp.id}-${ds}`]
                const lv = lvReq?.leave_type
                const lt = LEAVE_TYPES.find((l) => l.v === lv)
                const we = isWeekend(y, m, d)
                const isH = !!holidays[ds]
                const wdNum = weekday(y, m, d)
                const isDayOff = emp.days_off && emp.days_off.includes(wdNum) && !we
                const sched = scheds[emp.id]?.[wdNum]
                const swap = swapMap[`${emp.id}-${ds}`]

                // 有请假记录
                if (lt) {
                  return (
                    <td key={d} style={{ padding: "2px 1px", textAlign: "center", background: isH ? `${t.rd}08` : we ? t.we : "transparent" }}>
                      <div style={{ width: 28, minHeight: 24, borderRadius: 4, background: lt.c, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff", fontWeight: 700, flexDirection: "column", lineHeight: 1.2 }}>
                        {lt.l[0]}
                        {lvReq?.is_half_day && <span style={{ fontSize: 6 }}>半</span>}
                      </div>
                    </td>
                  )
                }

                // 换休出勤日
                if (swap && swap.swap_type === "休日出勤") {
                  return (
                    <td key={d} style={{ padding: "2px 1px", textAlign: "center", background: `#8B5CF608` }}>
                      <div style={{ width: 28, minHeight: 24, borderRadius: 4, background: "#8B5CF6", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff", fontWeight: 700 }}>出勤</div>
                    </td>
                  )
                }

                // 定休日或周末
                if (we || isDayOff || isH) {
                  return (
                    <td key={d} style={{ padding: "2px 1px", textAlign: "center", background: isH ? `${t.rd}08` : we ? t.we : `${t.tm}08` }}>
                      <div style={{ fontSize: 7, color: t.td }}>休</div>
                    </td>
                  )
                }

                // 正常工作日：显示排班时间
                if (sched) {
                  return (
                    <td key={d} style={{ padding: "2px 1px", textAlign: "center" }}>
                      <div style={{ fontSize: 7, color: t.ac, fontWeight: 600, lineHeight: 1.4 }}>
                        {sched.start}<br />{sched.end}
                      </div>
                    </td>
                  )
                }

                // 工作日但无排班数据
                return (
                  <td key={d} style={{ padding: "2px 1px", textAlign: "center" }}>
                    <div style={{ fontSize: 7, color: t.td }}>—</div>
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
                const lvReq = rm[`${emp.id}-${ds}`]
                return lvReq ? { name: emp.name, type: lvReq.leave_type, isHalf: lvReq.is_half_day } : null
              })
              .filter(Boolean)
            const dayWorkers = emps.filter((emp) => {
              const isDayOff = emp.days_off && emp.days_off.includes(wdNum)
              return !we && !isH && !isDayOff && scheds[emp.id]?.[wdNum] && !rm[`${emp.id}-${ds}`]
            })
            const daySwaps = emps.filter((emp) => {
              const swap = swapMap[`${emp.id}-${ds}`]
              return swap && swap.swap_type === "休日出勤"
            })

            return (
              <div key={d} style={{ minHeight: 70, borderRadius: 6, border: `1px solid ${t.bl}`, padding: "3px 5px", background: isH ? `${t.rd}08` : we ? t.we : "transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: (we || isH) ? t.rd : t.tx }}>{d}</span>
                  {isH && <span style={{ fontSize: 7, color: t.rd }} title={holidays[ds]}>●</span>}
                </div>
                {/* 出勤的人 */}
                {dayWorkers.slice(0, 2).map((emp, i) => {
                  const sc = scheds[emp.id]?.[wdNum]
                  return (
                    <div key={`w-${i}`} style={{ fontSize: 8, padding: "1px 3px", borderRadius: 2, background: `${t.ac}15`, color: t.ac, marginBottom: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {emp.name?.slice(0, 3)} {sc?.start}
                    </div>
                  )
                })}
                {dayWorkers.length > 2 && <div style={{ fontSize: 7, color: t.tm }}>+{dayWorkers.length - 2}出勤</div>}
                {/* 换休出勤 */}
                {daySwaps.map((emp, i) => (
                  <div key={`s-${i}`} style={{ fontSize: 8, padding: "1px 3px", borderRadius: 2, background: "#8B5CF620", color: "#8B5CF6", marginBottom: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {emp.name?.slice(0, 3)} 出勤
                  </div>
                ))}
                {/* 请假的人 */}
                {dayLeaves.slice(0, 2).map((l, i) => {
                  const lt = LEAVE_TYPES.find((x) => x.v === l.type)
                  return (
                    <div key={`l-${i}`} style={{ fontSize: 8, padding: "1px 3px", borderRadius: 2, background: lt?.c || t.tm, color: "#fff", marginBottom: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {l.name?.slice(0, 3)} {lt?.l?.[0]}{l.isHalf ? "半" : ""}
                    </div>
                  )
                })}
                {dayLeaves.length > 2 && <div style={{ fontSize: 7, color: t.tm }}>+{dayLeaves.length - 2}休</div>}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarDays size={20} strokeWidth={1.8} color={t.tx} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>出勤/休假日历</h2>
          <button onClick={() => sMode("table")} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${mode === "table" ? t.ac : t.bd}`, background: mode === "table" ? `${t.ac}15` : "transparent", color: mode === "table" ? t.ac : t.ts, fontSize: 10, cursor: "pointer" }}>表格</button>
          <button onClick={() => sMode("grid")} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${mode === "grid" ? t.ac : t.bd}`, background: mode === "grid" ? `${t.ac}15` : "transparent", color: mode === "grid" ? t.ac : t.ts, fontSize: 10, cursor: "pointer" }}>月历</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => chg(-1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "flex", alignItems: "center" }}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{y}年{m}月</span>
          <button onClick={() => chg(1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "flex", alignItems: "center" }}><ChevronRight size={14} /></button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: t.ac }} />
          <span style={{ fontSize: 10, color: t.ts }}>出勤</span>
        </div>
        {LEAVE_TYPES.slice(0, 4).map((lt) => (
          <div key={lt.v} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: lt.c }} />
            <span style={{ fontSize: 10, color: t.ts }}>{lt.l}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: "#8B5CF6" }} />
          <span style={{ fontSize: 10, color: t.ts }}>休日出勤</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 8, background: t.rd }} />
          <span style={{ fontSize: 10, color: t.ts }}>祝日</span>
        </div>
      </div>

      {mode === "table" ? <TableView /> : <GridView />}
    </div>
  )
}