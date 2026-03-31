import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { todayStr } from "../../config/constants"

export default function TransportLog({ user, t, tk }) {
  const [recs, sRecs] = useState([]); const [ld, sLd] = useState(true); const [show, sShow] = useState(false); const [sub, sSub] = useState(false); const [editId, sEditId] = useState(null)
  const [fm, sFm] = useState({ claim_date: todayStr(), route: "", amount: "", round_trip: true })

  const load = useCallback(async () => { sLd(true); const d = await sbGet(`transportation_claims?employee_id=eq.${user.id}&order=claim_date.desc&select=*`, tk); sRecs(d || []); sLd(false) }, [user.id, tk])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!fm.route || !fm.amount) return; sSub(true)
    if (editId) { await sbPatch(`transportation_claims?id=eq.${editId}`, { claim_date: fm.claim_date, route: fm.route, amount: Number(fm.amount), round_trip: fm.round_trip }, tk); sEditId(null) }
    else { await sbPost("transportation_claims", { employee_id: user.id, claim_date: fm.claim_date, route: fm.route, amount: Number(fm.amount), round_trip: fm.round_trip, status: "記録済み" }, tk) }
    await load(); sShow(false); sSub(false); sFm({ claim_date: todayStr(), route: "", amount: "", round_trip: true })
  }

  const startEdit = (r) => { sFm({ claim_date: r.claim_date, route: r.route, amount: String(r.amount), round_trip: r.round_trip !== false }); sEditId(r.id); sShow(true) }
  const del = async (id) => { if (confirm("确认删除？")) { await sbDel(`transportation_claims?id=eq.${id}`, tk); await load() } }
  const total = recs.reduce((s, r) => s + Number(r.amount || 0), 0)
  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>🚃 交通费记录</h2>
        <button onClick={() => { sShow(!show); sEditId(null); sFm({ claim_date: todayStr(), route: "", amount: "", round_trip: true }) }} style={{ padding: "8px 18px", borderRadius: 8, border: show ? `1px solid ${t.bd}` : "none", background: show ? "transparent" : t.ac, color: show ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{show ? "✕ 关闭" : "+ 新记录"}</button>
      </div>
      <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}`, marginBottom: 16 }}><div style={{ fontSize: 10, color: t.tm }}>合计</div><div style={{ fontSize: 26, fontWeight: 700, color: t.ac, marginTop: 4 }}>¥{total.toLocaleString()}</div></div>

      {show && (
        <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>{editId ? "✏️ 编辑" : "📝 新记录"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>日期</label><input type="date" value={fm.claim_date} onChange={(e) => sFm((p) => ({ ...p, claim_date: e.target.value }))} style={iS} /></div>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>金额（円）</label><input type="number" value={fm.amount} onChange={(e) => sFm((p) => ({ ...p, amount: e.target.value }))} style={iS} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>路线</label><input placeholder="例：池袋→高田馬場" value={fm.route} onChange={(e) => sFm((p) => ({ ...p, route: e.target.value }))} style={iS} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.ts, marginBottom: 14, cursor: "pointer" }}><input type="checkbox" checked={fm.round_trip} onChange={(e) => sFm((p) => ({ ...p, round_trip: e.target.checked }))} />往返</label>
          <button onClick={submit} disabled={sub || !fm.route || !fm.amount} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: (sub || !fm.route || !fm.amount) ? 0.5 : 1 }}>{sub ? "保存中..." : (editId ? "更新" : "记录")}</button>
        </div>
      )}

      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
          {!recs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无记录</div> : recs.map((r) => (
            <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{r.claim_date}</span><span style={{ fontSize: 12, color: t.ts }}>{r.route}</span><span style={{ fontSize: 10, color: t.tm }}>{r.round_trip !== false ? "往返" : "单程"}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>¥{Number(r.amount || 0).toLocaleString()}</span>
                <button onClick={() => startEdit(r)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 10, cursor: "pointer" }}>✏️</button>
                <button onClick={() => del(r.id)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>🗑</button>
              </div>
            </div>
          ))}
        </div>}
    </div>
  )
}
