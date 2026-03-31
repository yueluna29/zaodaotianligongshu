import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbDel } from "../../api/supabase"
import { LEAVE_TYPES, WEEKDAYS, daysInMonth, weekday, isWeekend, pad, todayStr, fmtMinutes, workingDays } from "../../config/constants"

export default function AttendanceList({ user, t, tk }) {
  const now = new Date()
  const [y, sY] = useState(now.getFullYear())
  const [m, sM] = useState(now.getMonth() + 1)
  const [recs, sRecs] = useState({})
  const [ed, sEd] = useState(false)
  const [dr, sDr] = useState({})
  const [ld, sLd] = useState(true)
  const [sv, sSv] = useState(false)
  const days = daysInMonth(y, m)

  const load = useCallback(async () => {
    sLd(true)
    const from = `${y}-${pad(m)}-01`, to = `${y}-${pad(m)}-${pad(days)}`
    const d = await sbGet(`attendance_records?employee_id=eq.${user.id}&work_date=gte.${from}&work_date=lte.${to}&order=work_date`, tk)
    const mp = {}; d.forEach((r) => { mp[r.work_date] = r }); sRecs(mp); sLd(false)
  }, [y, m, days, user.id, tk])

  useEffect(() => { load() }, [load])

  const chg = (d) => { let nm = m + d, ny = y; if (nm > 12) { nm = 1; ny++ } else if (nm < 1) { nm = 12; ny-- } sY(ny); sM(nm); sEd(false) }

  const startEd = () => {
    const d = {}
    for (let i = 1; i <= days; i++) {
      const ds = `${y}-${pad(m)}-${pad(i)}`; const r = recs[ds]
      d[ds] = { ci: r?.clock_in?.slice(0, 5) || "", co: r?.clock_out?.slice(0, 5) || "", bs: r?.break_start?.slice(0, 5) || "", be: r?.break_end?.slice(0, 5) || "", nt: r?.note || "" }
    }
    sDr(d); sEd(true)
  }

  const saveAll = async () => {
    sSv(true)
    const rows = [], dels = []
    for (let i = 1; i <= days; i++) {
      const ds = `${y}-${pad(m)}-${pad(i)}`; const d = dr[ds]; const existing = recs[ds]
      if (!d) continue
      const hasData = d.ci || d.co || d.nt
      if (hasData) {
        rows.push({ employee_id: user.id, work_date: ds, clock_in: d.ci ? d.ci + ":00" : null, clock_out: d.co ? d.co + ":00" : null, break_start: d.bs ? d.bs + ":00" : null, break_end: d.be ? d.be + ":00" : null, note: d.nt || null })
      } else if (existing) {
        dels.push(existing.id)
      }
    }
    if (rows.length) await sbPost("attendance_records", rows, tk, "?on_conflict=employee_id,work_date")
    for (const id of dels) await sbDel(`attendance_records?id=eq.${id}`, tk)
    await load(); sEd(false); sSv(false)
  }

  const tw = Object.values(recs).reduce((s, r) => s + Number(r.work_minutes || 0), 0)
  const to = Object.values(recs).reduce((s, r) => s + Math.max(Number(r.work_minutes || 0) - 480, 0), 0)
  const wds = Object.values(recs).filter((r) => r.clock_in).length

  const tI = (ds, f) => (
    <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5}
      value={dr[ds]?.[f] || ""} onChange={(e) => {
        let v = e.target.value.replace(/[^\d:]/g, "")
        if (v.length === 2 && !v.includes(":")) v += ":"
        sDr((p) => ({ ...p, [ds]: { ...p[ds], [f]: v } }))
      }}
      style={{ padding: "4px 5px", borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.ac, fontSize: 12, fontFamily: "monospace", width: 60, textAlign: "center", boxSizing: "border-box" }} />
  )

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div><h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>勤怠一览</h2><p style={{ fontSize: 11, color: t.tm, marginTop: 2 }}>{user.name}</p></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => chg(-1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bb}`, background: "transparent", color: t.ts, cursor: "pointer" }}>◀</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.tx, minWidth: 100, textAlign: "center" }}>{y}年{m}月</span>
          <button onClick={() => chg(1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bb}`, background: "transparent", color: t.ts, cursor: "pointer" }}>▶</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
        {[{ l: "出勤", v: `${wds}天`, c: t.ac }, { l: "劳动时长", v: fmtMinutes(tw), c: t.gn }, { l: "固定外加班", v: fmtMinutes(to), c: to / 60 > 20 ? t.rd : t.wn }].map((c, i) => (
          <div key={i} style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}` }}>
            <div style={{ fontSize: 10, color: t.tm }}>{c.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.c, marginTop: 2 }}>{c.v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, gap: 8 }}>
        {!ed ? <button onClick={startEd} style={{ padding: "7px 18px", borderRadius: 7, border: `1px solid ${t.ac}44`, background: `${t.ac}11`, color: t.ac, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>编辑</button> : <>
          <button onClick={() => sEd(false)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer" }}>取消</button>
          <button onClick={saveAll} disabled={sv} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 12, fontWeight: 600, cursor: sv ? "wait" : "pointer", opacity: sv ? 0.7 : 1 }}>{sv ? "保存中..." : "保存"}</button>
        </>}
      </div>
      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", maxHeight: "75vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: ed ? 700 : 500 }}>
           <thead style={{ position: "sticky", top: 0, zIndex: 2 }}><tr style={{ background: t.bgH }}>
              {(ed ? ["日期", "星期", "出勤", "休息", "休息结束", "退勤", "备注"] : ["日期", "星期", "出勤", "休息", "休息结束", "退勤", "劳动时长", "固定外加班", "备注"]).map((h, i) => (
                <th key={i} style={{ padding: "8px 6px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "left", borderBottom: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                const ds = `${y}-${pad(m)}-${pad(day)}`; const r = recs[ds]; const w = weekday(y, m, day); const we = w === 0 || w === 6
                const lt = LEAVE_TYPES.find((l) => l.v === (ed ? dr[ds]?.nt : r?.note))
                const wm = Number(r?.work_minutes || 0); const ot = Math.max(wm - 480, 0); const isT = ds === todayStr()
                const mono = { fontFamily: "monospace", fontSize: 12 }
                if (ed) return (
                  <tr key={day} style={{ background: isT ? t.tb : we ? t.we : "transparent", borderBottom: `1px solid ${t.bl}` }}>
                    <td style={{ padding: "5px 6px", color: we ? t.rd : t.tx, fontWeight: 600 }}>{day}</td>
                    <td style={{ padding: "5px 4px", color: we ? t.rd : t.ts, fontSize: 11 }}>{WEEKDAYS[w]}</td>
                    <td style={{ padding: "3px 4px" }}>{tI(ds, "ci")}</td>
                    <td style={{ padding: "3px 4px" }}>{tI(ds, "bs")}</td>
                    <td style={{ padding: "3px 4px" }}>{tI(ds, "be")}</td>
                    <td style={{ padding: "3px 4px" }}>{tI(ds, "co")}</td>
                    <td style={{ padding: "3px 4px" }}>
                      <select value={dr[ds]?.nt || ""} onChange={(e) => sDr((p) => ({ ...p, [ds]: { ...p[ds], nt: e.target.value } }))} style={{ padding: 3, borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 10 }}>
                        <option value="">—</option>{LEAVE_TYPES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
                      </select>
                    </td>
                  </tr>
                )
                return (
                  <tr key={day} style={{ background: isT ? t.tb : we ? t.we : "transparent", borderBottom: `1px solid ${t.bl}` }}>
                    <td style={{ padding: "7px 6px", color: we ? t.rd : t.tx, fontWeight: 600 }}>{day}</td>
                    <td style={{ padding: "7px 4px", color: we ? t.rd : t.ts, fontSize: 11 }}>{WEEKDAYS[w]}</td>
                    <td style={{ padding: "7px 6px", color: t.ac, ...mono }}>{r?.clock_in?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", color: t.ts, ...mono }}>{r?.break_start?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", color: t.ts, ...mono }}>{r?.break_end?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", color: t.ac, ...mono }}>{r?.clock_out?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", ...mono, color: t.tx }}>{wm > 0 ? fmtMinutes(wm) : ""}</td>
                    <td style={{ padding: "7px 6px", ...mono, color: ot > 0 ? t.wn : t.td }}>{ot > 0 ? fmtMinutes(ot) : ""}</td>
                    <td style={{ padding: "7px 6px" }}>{lt && <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, color: lt.c, background: lt.bg + "33" }}>{lt.l}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>}
    </div>
  )
}
