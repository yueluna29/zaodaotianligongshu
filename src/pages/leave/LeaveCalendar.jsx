import { useState, useEffect, useMemo } from "react"
import { sbGet } from "../../api/supabase"
import { LEAVE_TYPES, WEEKDAYS, daysInMonth, pad } from "../../config/constants"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfWeek = (d) => { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0, 0, 0, 0); return r }
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const parseTime = (s) => { if (!s) return 0; const [h, m] = s.split(":").map(Number); return h + m / 60 }

export default function LeaveCalendar({ t, tk }) {
  const [mode, sMode] = useState("day") // "day" | "week" | "month"
  const [cursor, sCursor] = useState(new Date())
  const [emps, sE] = useState([])
  const [reqs, sR] = useState([])
  const [holidays, sH] = useState({})
  const [scheds, setScheds] = useState({})
  const [swaps, setSwaps] = useState([])
  const [ld, sLd] = useState(true)
  const [mobile, setMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768)
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // 计算当前视图的日期范围
  const range = useMemo(() => {
    if (mode === "day") {
      return { from: toDateStr(cursor), to: toDateStr(cursor), days: [new Date(cursor)] }
    }
    if (mode === "week") {
      const s = startOfWeek(cursor)
      const ds = Array.from({ length: 7 }, (_, i) => addDays(s, i))
      return { from: toDateStr(ds[0]), to: toDateStr(ds[6]), days: ds }
    }
    // month
    const y = cursor.getFullYear(), m = cursor.getMonth() + 1
    const dim = daysInMonth(y, m)
    const ds = Array.from({ length: dim }, (_, i) => new Date(y, m - 1, i + 1))
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(dim)}`, days: ds }
  }, [mode, cursor])

  useEffect(() => {
    (async () => {
      sLd(true)
      const { from, to } = range
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
      ;(h || []).forEach((hd) => {
        if (!hm[hd.holiday_date]) hm[hd.holiday_date] = []
        hm[hd.holiday_date].push({ name: hd.name, country: hd.country || "JP" })
      })
      sH(hm)
      const sm = {}
      ;(sc || []).forEach((s) => {
        if (!sm[s.employee_id]) sm[s.employee_id] = {}
        sm[s.employee_id][s.day_of_week] = { start: s.start_time?.slice(0, 5), end: s.end_time?.slice(0, 5) }
      })
      setScheds(sm)
      setSwaps(sw || [])
      sLd(false)
    })()
  }, [range, tk])

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

  // 某员工某天的状态
  const getStatus = (emp, date) => {
    const ds = toDateStr(date)
    const wd = date.getDay()
    const lvReq = rm[`${emp.id}-${ds}`]
    const swap = swapMap[`${emp.id}-${ds}`]
    const sched = scheds[emp.id]?.[wd]
    const isDayOff = emp.days_off && emp.days_off.includes(wd)
    const we = wd === 0 || wd === 6
    const isH = (holidays[ds] || []).length > 0
    if (lvReq) return { kind: "leave", lvReq }
    if (swap && swap.swap_type === "休日出勤") return { kind: "swap-work", swap }
    if (we || isH || isDayOff) return { kind: "off" }
    if (sched) return { kind: "work", sched }
    return { kind: "unset" }
  }

  // 节日颜色/标签
  const holidayColor = (country) => country === "CN" ? t.wn : t.rd
  const countryBadge = (country) => country === "CN" ? "中" : "日"

  // 导航
  const shift = (dir) => {
    const n = new Date(cursor)
    if (mode === "day") n.setDate(n.getDate() + dir)
    else if (mode === "week") n.setDate(n.getDate() + 7 * dir)
    else n.setMonth(n.getMonth() + dir)
    sCursor(n)
  }
  const goToday = () => sCursor(new Date())

  const labelOfCursor = () => {
    if (mode === "day") return `${cursor.getFullYear()}年${cursor.getMonth() + 1}月${cursor.getDate()}日 (${WEEKDAYS[cursor.getDay()]})`
    if (mode === "week") {
      const s = startOfWeek(cursor), e = addDays(s, 6)
      return `${s.getMonth() + 1}月${s.getDate()}日 ~ ${e.getMonth() + 1}月${e.getDate()}日`
    }
    return `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
  }

  // ========== 今日视图（时间轴） ==========
  const DayView = () => {
    const d = range.days[0]
    const ds = toDateStr(d)
    const hList = holidays[ds] || []
    const HOURS = Array.from({ length: 17 }, (_, i) => i + 7) // 7-23
    const HOUR_W = mobile ? 32 : 48
    const NAME_W = mobile ? 90 : 160
    const rows = emps.map((emp) => ({ emp, s: getStatus(emp, d) }))
    const working = rows.filter((r) => r.s.kind === "work" || r.s.kind === "swap-work")
    const onLeave = rows.filter((r) => r.s.kind === "leave")
    const resting = rows.length - working.length - onLeave.length
    const isToday = ds === toDateStr(new Date())

    return (
      <div>
        {/* 概览 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
          <StatCard t={t} label="出勤" value={working.length} total={rows.length} color={t.ac} />
          <StatCard t={t} label="请假" value={onLeave.length} color={t.rd} />
          <StatCard t={t} label="休息" value={resting} color={t.tm} />
          {hList.map((h, i) => {
            const c = holidayColor(h.country)
            return (
              <div key={i} style={{ padding: "12px 14px", borderRadius: 10, background: `${c}10`, border: `1px solid ${c}30` }}>
                <div style={{ fontSize: 10, color: c, fontWeight: 600 }}>祝日 · {h.country === "CN" ? "中国" : "日本"}</div>
                <div style={{ fontSize: 13, color: c, marginTop: 2, fontWeight: 500 }}>{h.name}</div>
              </div>
            )
          })}
        </div>

        {/* 时间轴 */}
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto" }}>
          <div style={{ minWidth: NAME_W + HOURS.length * HOUR_W }}>
            {/* 小时表头 */}
            <div style={{ display: "flex", borderBottom: `1px solid ${t.bd}`, background: t.bgH, position: "sticky", top: 0, zIndex: 2 }}>
              <div style={{ width: NAME_W, padding: "10px 14px", fontSize: 11, color: t.tm, fontWeight: 500, borderRight: `1px solid ${t.bd}` }}>社员 <span style={{ color: t.td }}>({rows.length})</span></div>
              <div style={{ display: "flex", flex: 1 }}>
                {HOURS.map((h) => (
                  <div key={h} style={{ width: HOUR_W, textAlign: "center", padding: "10px 0", fontSize: 10, color: t.tm, borderLeft: `1px dashed ${t.bl}` }}>{h}:00</div>
                ))}
              </div>
            </div>

            {/* 员工行 */}
            {rows.map(({ emp, s }) => (
              <div key={emp.id} style={{ display: "flex", borderBottom: `1px solid ${t.bl}`, minHeight: 46, background: isToday ? "transparent" : "transparent" }}>
                <div style={{ width: NAME_W, padding: "12px 14px", fontSize: 12, color: t.tx, fontWeight: 500, borderRight: `1px solid ${t.bl}`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <span>{emp.name || emp.email}</span>
                  {emp.department && <span style={{ fontSize: 9, color: t.tm, marginTop: 2 }}>{emp.department}</span>}
                </div>
                <div style={{ position: "relative", flex: 1, height: 46 }}>
                  {/* 网格线 */}
                  {HOURS.map((h) => (
                    <div key={h} style={{ position: "absolute", left: (h - 7) * HOUR_W, top: 0, bottom: 0, borderLeft: `1px dashed ${t.bl}` }} />
                  ))}
                  {/* 当前时间指示（仅今天） */}
                  {isToday && (() => {
                    const now = new Date()
                    const nowH = now.getHours() + now.getMinutes() / 60
                    if (nowH < 7 || nowH > 23) return null
                    return <div style={{ position: "absolute", left: (nowH - 7) * HOUR_W, top: 0, bottom: 0, borderLeft: `2px solid ${t.rd}`, opacity: 0.7 }} />
                  })()}
                  {/* 班次条 */}
                  {s.kind === "work" && s.sched && (() => {
                    const sh = parseTime(s.sched.start), eh = parseTime(s.sched.end)
                    return (
                      <div style={{ position: "absolute", left: (sh - 7) * HOUR_W + 2, top: 6, bottom: 6, width: (eh - sh) * HOUR_W - 4, borderRadius: 6, background: `${t.ac}22`, border: `1px solid ${t.ac}`, padding: "0 10px", display: "flex", alignItems: "center", fontSize: 11, color: t.ac, fontWeight: 600 }}>
                        {s.sched.start} – {s.sched.end}
                      </div>
                    )
                  })()}
                  {s.kind === "swap-work" && (
                    <div style={{ position: "absolute", left: 4, top: 6, bottom: 6, right: 4, borderRadius: 6, background: "#8B5CF622", border: "1px solid #8B5CF6", padding: "0 10px", display: "flex", alignItems: "center", fontSize: 11, color: "#8B5CF6", fontWeight: 600 }}>休日出勤</div>
                  )}
                  {s.kind === "leave" && (() => {
                    const lt = LEAVE_TYPES.find((l) => l.v === s.lvReq.leave_type)
                    return (
                      <div style={{ position: "absolute", left: 4, top: 6, bottom: 6, right: 4, borderRadius: 6, background: `${lt?.c || t.tm}20`, border: `1px solid ${lt?.c || t.tm}`, padding: "0 10px", display: "flex", alignItems: "center", fontSize: 11, color: lt?.c || t.tm, fontWeight: 600 }}>
                        {lt?.l || s.lvReq.leave_type}{s.lvReq.is_half_day ? " (半休)" : ""}
                      </div>
                    )
                  })()}
                  {s.kind === "off" && (
                    <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 11, color: t.td }}>休</div>
                  )}
                  {s.kind === "unset" && (
                    <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 11, color: t.td }}>—</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ========== 周视图 ==========
  const WeekView = () => {
    const todayDs = toDateStr(new Date())
    return (
      <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: mobile ? 560 : 760 }}>
          <thead>
            <tr style={{ background: t.bgH }}>
              <th style={{ padding: mobile ? "8px 8px" : "10px 14px", textAlign: "left", fontSize: 11, color: t.tm, fontWeight: 500, borderBottom: `1px solid ${t.bd}`, minWidth: mobile ? 80 : 140, position: "sticky", left: 0, background: t.bgH, zIndex: 1 }}>社员</th>
              {range.days.map((d, i) => {
                const ds = toDateStr(d)
                const we = d.getDay() === 0 || d.getDay() === 6
                const hList = holidays[ds] || []
                const isH = hList.length > 0
                const isToday = ds === todayDs
                return (
                  <th key={i} style={{ padding: "8px 4px", textAlign: "center", fontWeight: 500, borderBottom: `1px solid ${t.bd}`, background: isToday ? `${t.ac}10` : (isH ? `${t.rd}08` : we ? t.we : "transparent") }}>
                    <div style={{ fontSize: 9, color: (we || isH) ? t.rd : t.tm }}>{WEEKDAYS[d.getDay()]}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: isToday ? t.ac : (we || isH) ? t.rd : t.tx, marginTop: 2 }}>{d.getDate()}</div>
                    {hList.map((h, j) => (
                      <div key={j} style={{ fontSize: 8, color: holidayColor(h.country), marginTop: 2, fontWeight: 600 }}>
                        {h.name}<span style={{ opacity: 0.6 }}>·{countryBadge(h.country)}</span>
                      </div>
                    ))}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {emps.map((emp) => (
              <tr key={emp.id} style={{ borderBottom: `1px solid ${t.bl}` }}>
                <td style={{ padding: mobile ? "8px 8px" : "10px 14px", fontSize: mobile ? 11 : 12, color: t.tx, fontWeight: 500, position: "sticky", left: 0, background: t.bgC, zIndex: 1, borderRight: `1px solid ${t.bl}` }}>
                  {emp.name || emp.email}
                  {emp.department && !mobile && <div style={{ fontSize: 9, color: t.tm, marginTop: 2 }}>{emp.department}</div>}
                </td>
                {range.days.map((d, i) => {
                  const s = getStatus(emp, d)
                  let cell
                  if (s.kind === "leave") {
                    const lt = LEAVE_TYPES.find((l) => l.v === s.lvReq.leave_type)
                    cell = <div style={{ padding: "6px 4px", borderRadius: 6, background: `${lt?.c || t.tm}18`, color: lt?.c || t.tm, fontSize: 10, fontWeight: 600, textAlign: "center" }}>{lt?.l || s.lvReq.leave_type}{s.lvReq.is_half_day ? "半" : ""}</div>
                  } else if (s.kind === "swap-work") {
                    cell = <div style={{ padding: "6px 4px", borderRadius: 6, background: "#8B5CF618", color: "#8B5CF6", fontSize: 10, fontWeight: 600, textAlign: "center" }}>休出</div>
                  } else if (s.kind === "off") {
                    cell = <div style={{ textAlign: "center", fontSize: 10, color: t.td }}>休</div>
                  } else if (s.kind === "work") {
                    cell = (
                      <div style={{ padding: "5px 4px", borderRadius: 6, background: `${t.ac}15`, border: `1px solid ${t.ac}30`, fontSize: 10, color: t.ac, fontWeight: 600, textAlign: "center", lineHeight: 1.35 }}>
                        <div>{s.sched.start}</div>
                        <div>{s.sched.end}</div>
                      </div>
                    )
                  } else {
                    cell = <div style={{ textAlign: "center", fontSize: 10, color: t.td }}>—</div>
                  }
                  return <td key={i} style={{ padding: mobile ? "4px 3px" : "6px 5px", verticalAlign: "middle", minWidth: mobile ? 60 : 86 }}>{cell}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ========== 月视图 ==========
  const MonthView = () => {
    const y = cursor.getFullYear(), m = cursor.getMonth() + 1
    const firstDayOfWeek = new Date(y, m - 1, 1).getDay()
    const todayDs = toDateStr(new Date())

    const jumpToDay = (d) => { sCursor(new Date(d)); sMode("day") }

    return (
      <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 8 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: i === 0 || i === 6 ? t.rd : t.tm, padding: 4 }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {Array.from({ length: firstDayOfWeek }, (_, i) => <div key={`e-${i}`} />)}
          {range.days.map((d) => {
            const ds = toDateStr(d)
            const we = d.getDay() === 0 || d.getDay() === 6
            const hList = holidays[ds] || []
            const isH = hList.length > 0
            const isToday = ds === todayDs
            const rows = emps.map((emp) => ({ emp, s: getStatus(emp, d) }))
            const working = rows.filter((r) => r.s.kind === "work")
            const swapping = rows.filter((r) => r.s.kind === "swap-work")
            const leaves = rows.filter((r) => r.s.kind === "leave")

            return (
              <div key={ds} onClick={() => jumpToDay(d)} style={{ minHeight: mobile ? 64 : 120, borderRadius: mobile ? 6 : 8, border: `1px solid ${isToday ? t.ac : t.bl}`, padding: mobile ? "3px 3px" : "5px 6px", background: isToday ? `${t.ac}08` : isH ? `${t.rd}06` : we ? t.we : "transparent", cursor: "pointer", transition: "background 0.15s", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: mobile ? 1 : 3 }}>
                  <span style={{ fontSize: mobile ? 11 : 12, fontWeight: 700, color: isToday ? t.ac : (we || isH) ? t.rd : t.tx }}>{d.getDate()}</span>
                  {mobile && (leaves.length + working.length + swapping.length) > 0 && <span style={{ width: 5, height: 5, borderRadius: 5, background: leaves.length ? t.rd : t.ac }} />}
                </div>
                {hList.map((h, i) => {
                  const c = holidayColor(h.country)
                  return (
                    <div key={`h-${i}`} style={{ fontSize: mobile ? 8 : 9, fontWeight: 600, color: c, marginBottom: mobile ? 1 : 3, padding: mobile ? "1px 2px" : "1px 4px", borderRadius: 3, background: `${c}12`, borderLeft: `2px solid ${c}`, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${h.name} (${h.country === "CN" ? "中国" : "日本"})`}>
                      {h.name}{!mobile && <span style={{ opacity: 0.55, marginLeft: 2 }}>·{countryBadge(h.country)}</span>}
                    </div>
                  )
                })}
                {mobile ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {working.length > 0 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: `${t.ac}15`, color: t.ac, fontWeight: 600 }}>勤{working.length}</span>}
                    {swapping.length > 0 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "#8B5CF615", color: "#8B5CF6", fontWeight: 600 }}>出{swapping.length}</span>}
                    {leaves.length > 0 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: `${t.rd}15`, color: t.rd, fontWeight: 600 }}>休{leaves.length}</span>}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {working.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, padding: "2px 5px", borderRadius: 3, background: `${t.ac}15`, color: t.ac, fontWeight: 600 }}>
                        <span style={{ width: 4, height: 4, borderRadius: 4, background: t.ac }} />出勤 {working.length}
                      </div>
                    )}
                    {swapping.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, padding: "2px 5px", borderRadius: 3, background: "#8B5CF615", color: "#8B5CF6", fontWeight: 600 }}>
                        <span style={{ width: 4, height: 4, borderRadius: 4, background: "#8B5CF6" }} />休出 {swapping.length}
                      </div>
                    )}
                    {leaves.slice(0, 3).map((l, i) => {
                      const lt = LEAVE_TYPES.find((x) => x.v === l.s.lvReq.leave_type)
                      const c = lt?.c || t.tm
                      return (
                        <div key={i} style={{ padding: "2px 5px", borderRadius: 4, background: `${c}15`, borderLeft: `2px solid ${c}`, lineHeight: 1.25 }}>
                          <div style={{ fontSize: 9, fontWeight: 600, color: t.tx, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{l.emp.name}</div>
                          <div style={{ fontSize: 8, color: c, fontWeight: 600 }}>{lt?.l || l.s.lvReq.leave_type}{l.s.lvReq.is_half_day ? "(半)" : ""}</div>
                        </div>
                      )
                    })}
                    {leaves.length > 3 && <div style={{ fontSize: 8, color: t.tm, paddingLeft: 4 }}>+{leaves.length - 3} 人请假</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ==================== 主渲染 ====================
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CalendarDays size={20} strokeWidth={1.8} color={t.tx} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>出勤/休假日历</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {[["day", "今日"], ["week", "周视图"], ["month", "月历"]].map(([v, l]) => (
            <button key={v} onClick={() => sMode(v)} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${mode === v ? t.ac : t.bd}`, background: mode === v ? `${t.ac}15` : "transparent", color: mode === v ? t.ac : t.ts, fontSize: 11, fontWeight: mode === v ? 600 : 400, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => shift(-1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "flex", alignItems: "center" }}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: mobile ? 13 : 14, fontWeight: 600, color: t.tx, minWidth: mobile ? 120 : 180, textAlign: "center" }}>{labelOfCursor()}</span>
          <button onClick={() => shift(1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "flex", alignItems: "center" }}><ChevronRight size={14} /></button>
          <button onClick={goToday} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 11, cursor: "pointer" }}>今天</button>
        </div>
        {!mobile && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Legend t={t} color={t.ac} label="出勤" />
            <Legend t={t} color="#8B5CF6" label="休日出勤" />
            {LEAVE_TYPES.slice(0, 4).map((lt) => <Legend key={lt.v} color={lt.c} label={lt.l} t={t} />)}
            <Legend t={t} color={t.rd} label="日本祝日" round />
            <Legend t={t} color={t.wn} label="中国节日" round />
          </div>
        )}
      </div>

      {ld ? (
        <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>
      ) : mode === "day" ? <DayView /> : mode === "week" ? <WeekView /> : <MonthView />}
    </div>
  )
}

function StatCard({ t, label, value, total, color }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: `${color}08`, border: `1px solid ${color}25` }}>
      <div style={{ fontSize: 10, color: t.tm, fontWeight: 500, letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4, lineHeight: 1 }}>
        {value}{total !== undefined && <span style={{ fontSize: 11, color: t.tm, fontWeight: 400 }}> / {total}</span>}
      </div>
    </div>
  )
}

function Legend({ t, color, label, round }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: round ? 8 : 2, background: color }} />
      <span style={{ fontSize: 10, color: t.ts }}>{label}</span>
    </div>
  )
}
