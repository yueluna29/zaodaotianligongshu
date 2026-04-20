import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { pad, todayStr, fmtYen, isHourly } from "../../config/constants"

export default function WorkEntries({ user, t, tk }) {
  const now = new Date()
  const [y, sY] = useState(now.getFullYear()); const [m, sM] = useState(now.getMonth() + 1)
  const [recs, sRecs] = useState([]); const [rates, sRates] = useState([]); const [ld, sLd] = useState(true)
  const [show, sShow] = useState(false); const [sub, sSub] = useState(false); const [editId, sEditId] = useState(null)
  const [fm, sFm] = useState({ work_date: todayStr(), business_type: "", start_time: "09:00", end_time: "10:00", note: "" })

  // 管理者模式：查看所有人
  const isA = user.role === "admin"
  const [selectedEmp, sSelectedEmp] = useState(isA ? null : user.id)
  const [allEmps, sAllEmps] = useState([])

  const load = useCallback(async () => {
    sLd(true)
    const from = `${y}-${pad(m)}-01`, to = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`
    const empFilter = selectedEmp ? `employee_id=eq.${selectedEmp}&` : ""

    const [entries, payRates] = await Promise.all([
      sbGet(`work_entries?${empFilter}work_date=gte.${from}&work_date=lte.${to}&order=work_date.desc,start_time.desc&select=*`, tk),
      sbGet(selectedEmp ? `pay_rates?employee_id=eq.${selectedEmp}&select=*` : "pay_rates?select=*", tk),
    ])
    sRecs(entries || []); sRates(payRates || [])

    if (isA && !allEmps.length) {
      const emps = await sbGet("employees?is_active=eq.true&order=name&select=id,name,employment_type", tk)
      sAllEmps((emps || []).filter((e) => isHourly(e.employment_type)))
    }
    sLd(false)
  }, [y, m, selectedEmp, tk, isA])

  useEffect(() => { load() }, [load])

  const chg = (d) => { let nm = m + d, ny = y; if (nm > 12) { nm = 1; ny++ } else if (nm < 1) { nm = 12; ny-- } sY(ny); sM(nm) }

  const myRates = rates.filter((r) => r.employee_id === (selectedEmp || user.id))
  const bizTypes = [...new Set(myRates.map((r) => r.business_type))]

  const getRate = (bizType) => {
    const r = myRates.find((r) => r.business_type === bizType)
    return r ? Number(r.hourly_rate) : 0
  }

  const submit = async () => {
    if (!fm.business_type || !fm.start_time || !fm.end_time) return; sSub(true)
    const rate = getRate(fm.business_type)
    const body = { work_date: fm.work_date, business_type: fm.business_type, start_time: fm.start_time + ":00", end_time: fm.end_time + ":00", hourly_rate: rate, note: fm.note || null }
    if (editId) { await sbPatch(`work_entries?id=eq.${editId}`, body, tk); sEditId(null) }
    else { await sbPost("work_entries", { employee_id: user.id, ...body }, tk) }
    await load(); sShow(false); sSub(false); sFm({ work_date: todayStr(), business_type: bizTypes[0] || "", start_time: "09:00", end_time: "10:00", note: "" })
  }

  const startEdit = (r) => {
    sFm({ work_date: r.work_date, business_type: r.business_type, start_time: r.start_time?.slice(0, 5) || "09:00", end_time: r.end_time?.slice(0, 5) || "10:00", note: r.note || "" })
    sEditId(r.id); sShow(true)
  }
  const del = async (id) => { if (confirm("确认删除？")) { await sbDel(`work_entries?id=eq.${id}`, tk); await load() } }

  // 月度汇总
  const summary = {}
  recs.forEach((r) => {
    const key = r.business_type
    if (!summary[key]) summary[key] = { minutes: 0, amount: 0 }
    summary[key].minutes += Number(r.work_minutes || 0)
    summary[key].amount += Number(r.subtotal || 0)
  })
  const totalAmount = Object.values(summary).reduce((s, v) => s + v.amount, 0)
  const totalMinutes = Object.values(summary).reduce((s, v) => s + v.minutes, 0)

  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>⏱ 工时管理</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isA && allEmps.length > 0 && (
            <select value={selectedEmp || ""} onChange={(e) => sSelectedEmp(e.target.value || null)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 11 }}>
              <option value="">全部</option>
              {allEmps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employment_type})</option>)}
            </select>
          )}
          <button onClick={() => chg(-1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bb}`, background: "transparent", color: t.ts, cursor: "pointer" }}>◀</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{y}年{m}月</span>
          <button onClick={() => chg(1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bb}`, background: "transparent", color: t.ts, cursor: "pointer" }}>▶</button>
        </div>
      </div>

      {/* 月度汇总卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 16 }}>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}><div style={{ fontSize: 10, color: t.tm }}>总工时</div><div style={{ fontSize: 22, fontWeight: 700, color: t.ac, marginTop: 4 }}>{(totalMinutes / 60).toFixed(1)}h</div></div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}><div style={{ fontSize: 10, color: t.tm }}>总金额</div><div style={{ fontSize: 22, fontWeight: 700, color: t.gn, marginTop: 4 }}>{fmtYen(totalAmount)}</div></div>
        {Object.entries(summary).map(([biz, v]) => (
          <div key={biz} style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}><div style={{ fontSize: 10, color: t.tm }}>{biz}</div><div style={{ fontSize: 16, fontWeight: 700, color: t.tx, marginTop: 4 }}>{(v.minutes / 60).toFixed(1)}h</div><div style={{ fontSize: 10, color: t.gn }}>{fmtYen(v.amount)}</div></div>
        ))}
      </div>

      {/* 新增按钮（仅非管理者或管理者选了自己） */}
      {(!isA || selectedEmp === user.id) && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={() => { sShow(!show); sEditId(null); sFm({ work_date: todayStr(), business_type: bizTypes[0] || "", start_time: "09:00", end_time: "10:00", note: "" }) }} style={{ padding: "8px 18px", borderRadius: 8, border: show ? `1px solid ${t.bd}` : "none", background: show ? "transparent" : t.ac, color: show ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{show ? "✕ 关闭" : "+ 新条目"}</button>
        </div>
      )}

      {show && (
        <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>{editId ? "✏️ 编辑" : "📝 工时录入"}</h3>
          {bizTypes.length === 0 && <div style={{ padding: 12, background: `${t.wn}12`, borderRadius: 8, marginBottom: 12, fontSize: 12, color: t.wn }}>尚未设定费率，请联系管理者先设定业务类型和时薪</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>日期</label><input type="date" value={fm.work_date} onChange={(e) => sFm((p) => ({ ...p, work_date: e.target.value }))} style={iS} /></div>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>业务类型</label><select value={fm.business_type} onChange={(e) => sFm((p) => ({ ...p, business_type: e.target.value }))} style={iS}>{bizTypes.map((b) => <option key={b} value={b}>{b} (¥{getRate(b).toLocaleString()}/h)</option>)}</select></div>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>备注</label><input placeholder="可选" value={fm.note} onChange={(e) => sFm((p) => ({ ...p, note: e.target.value }))} style={iS} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>开始时间</label><input type="text" inputMode="numeric" placeholder="09:00" maxLength={5} value={fm.start_time} onChange={(e) => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; sFm((p) => ({ ...p, start_time: v })) }} style={iS} /></div>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>结束时间</label><input type="text" inputMode="numeric" placeholder="10:00" maxLength={5} value={fm.end_time} onChange={(e) => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; sFm((p) => ({ ...p, end_time: v })) }} style={iS} /></div>
          </div>
          {fm.business_type && fm.start_time && fm.end_time && (() => {
            const [sh, sm] = fm.start_time.split(":").map(Number); const [eh, em] = fm.end_time.split(":").map(Number)
            const mins = (eh * 60 + em) - (sh * 60 + sm); const rate = getRate(fm.business_type)
            return mins > 0 ? <div style={{ fontSize: 12, color: t.gn, marginBottom: 12 }}>{(mins / 60).toFixed(1)}h × ¥{rate.toLocaleString()} = {fmtYen(mins / 60 * rate)}</div> : null
          })()}
          <button onClick={submit} disabled={sub || !fm.business_type || bizTypes.length === 0} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: sub ? "wait" : "pointer", opacity: (sub || !fm.business_type) ? 0.5 : 1 }}>{sub ? "保存中..." : (editId ? "更新" : "录入")}</button>
        </div>
      )}

      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
          {!recs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无工时记录</div> : recs.map((r) => (
            <div key={r.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{r.work_date}</span>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: "#7C3AED", background: "#7C3AED15" }}>{r.business_type}</span>
                <span style={{ fontSize: 11, color: t.ts, fontFamily: "monospace" }}>{r.start_time?.slice(0, 5)}~{r.end_time?.slice(0, 5)}</span>
                <span style={{ fontSize: 10, color: t.tm }}>{r.work_minutes ? `${(r.work_minutes / 60).toFixed(1)}h` : ""}</span>
                {r.note && <span style={{ fontSize: 10, color: t.ts }}>{r.note}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: t.gn }}>{fmtYen(Number(r.subtotal || 0))}</span>
                {(!isA || selectedEmp === user.id) && <>
                  <button onClick={() => startEdit(r)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 10, cursor: "pointer" }}>✏️</button>
                  <button onClick={() => del(r.id)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>🗑</button>
                </>}
              </div>
            </div>
          ))}
        </div>}
    </div>
  )
}
