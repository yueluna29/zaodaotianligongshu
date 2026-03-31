import { useState, useEffect } from "react"
import { sbGet } from "../../api/supabase"
import { LEAVE_TYPES, daysInMonth, pad, workingDays } from "../../config/constants"

export default function MonthlyReport({ t, tk }) {
  const now = new Date(); const [y, sY] = useState(now.getFullYear()); const [m, sM] = useState(now.getMonth() + 1)
  const [data, sData] = useState([]); const [ld, sLd] = useState(true); const days = daysInMonth(y, m)

  useEffect(() => {
    (async () => {
      sLd(true)
      const from = `${y}-${pad(m)}-01`, to = `${y}-${pad(m)}-${pad(days)}`, ym = `${y}-${pad(m)}`
      const [emps, atts, comms] = await Promise.all([
        sbGet("employees?is_active=eq.true&order=name", tk),
        sbGet(`attendance_records?work_date=gte.${from}&work_date=lte.${to}&select=*`, tk),
        sbGet(`commissions?year_month=eq.${ym}&select=*`, tk),
      ])
      const rows = (emps || []).map((emp) => {
        const ma = (atts || []).filter((a) => a.employee_id === emp.id)
        const wd = ma.filter((a) => a.clock_in).length
        const tw = ma.reduce((s, a) => s + Number(a.work_minutes || 0), 0) / 60
        const to = ma.reduce((s, a) => s + Math.max(Number(a.work_minutes || 0) - 480, 0), 0) / 60
        const targetH = workingDays(y, m) * 8
        const lv = ma.filter((a) => a.note && LEAVE_TYPES.some((l) => l.v === a.note)).length
        const mc = (comms || []).filter((c) => c.employee_id === emp.id)
        const tcc = mc.reduce((s, c) => s + Number(c.contract_amount || 0), 0)
        const ca = mc.reduce((s, c) => s + Number(c.commission_amount || 0), 0)
        return { ...emp, wd, tw: tw.toFixed(1), to: to.toFixed(1), fo: Math.min(to, 20).toFixed(1), eo: Math.max(to - 20, 0).toFixed(1), danger: to > 40, targetH, lv, tcc, ca: Math.round(ca) }
      })
      sData(rows); sLd(false)
    })()
  }, [y, m, days, tk])

  const chg = (d) => { let nm = m + d, ny = y; if (nm > 12) { nm = 1; ny++ } else if (nm < 1) { nm = 12; ny-- } sY(ny); sM(nm) }

  const exportCSV = () => {
    const hdr = ["社员名", "出勤日数", "目标(h)", "实绩(h)", "加班(h)", "固定20h", "超过(h)", "休假日数", "签单额", "提成额"]
    const rows = data.map((r) => [r.name || r.email, r.wd, r.tw, r.to, r.fo, r.eo, r.lv, r.tcc, r.ca])
    const csv = "\uFEFF" + [hdr, ...rows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `勤怠报告_${y}年${m}月.csv`; a.click()
  }

  if (ld) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div><h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>📊 月度报告</h2><p style={{ fontSize: 11, color: t.tm, marginTop: 2 }}>※社劳士报告用</p></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={exportCSV} style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📥 CSV导出</button>
          <button onClick={() => chg(-1)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.bb}`, background: "transparent", color: t.ts, cursor: "pointer" }}>◀</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{y}年{m}月</span>
          <button onClick={() => chg(1)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.bb}`, background: "transparent", color: t.ts, cursor: "pointer" }}>▶</button>
        </div>
      </div>

      <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 800 }}>
          <thead><tr style={{ background: t.bgH }}>
            {["社员名", "出勤", "目标(h)", "实绩(h)", "加班", "固定20h", "超过", "⚠", "休假", "签单额", "提成"].map((h, i) => (
              <th key={i} style={{ padding: "9px 8px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: i === 0 ? "left" : "right", borderBottom: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${t.bl}`, background: r.danger ? `${t.rd}08` : "transparent" }}>
                <td style={{ padding: "9px 8px", color: t.tx, fontWeight: 500 }}>{r.name || r.email}</td>
                <td style={{ padding: "9px 8px", color: t.ts, textAlign: "right" }}>{r.wd}</td>
                <td style={{ padding: "9px 8px", color: t.td, textAlign: "right", fontFamily: "monospace" }}>{r.targetH}</td>
                <td style={{ padding: "9px 8px", color: t.ts, textAlign: "right", fontFamily: "monospace" }}>{r.tw}</td>
                <td style={{ padding: "9px 8px", color: t.wn, textAlign: "right", fontFamily: "monospace" }}>{r.to}</td>
                <td style={{ padding: "9px 8px", color: t.ts, textAlign: "right", fontFamily: "monospace" }}>{r.fo}</td>
                <td style={{ padding: "9px 8px", color: parseFloat(r.eo) > 0 ? t.rd : t.td, textAlign: "right", fontFamily: "monospace", fontWeight: parseFloat(r.eo) > 0 ? 700 : 400 }}>{r.eo}</td>
                <td style={{ padding: "9px 8px", textAlign: "right" }}>{r.danger && <span style={{ color: t.rd, fontWeight: 700, fontSize: 13 }}>🚨</span>}</td>
                <td style={{ padding: "9px 8px", color: t.ac, textAlign: "right" }}>{r.lv}</td>
                <td style={{ padding: "9px 8px", color: t.ts, textAlign: "right", fontFamily: "monospace" }}>¥{r.tcc.toLocaleString()}</td>
                <td style={{ padding: "9px 8px", color: t.gn, textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>¥{r.ca.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
