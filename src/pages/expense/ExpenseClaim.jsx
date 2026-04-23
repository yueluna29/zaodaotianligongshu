import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { todayStr, fmtDateW } from "../../config/constants"

const CATEGORIES = ["教材费", "办公用品", "餐费", "打印费", "通信费", "其他"]

export default function ExpenseClaim({ user, t, tk }) {
  const [recs, sRecs] = useState([]); const [ld, sLd] = useState(true); const [show, sShow] = useState(false); const [sub, sSub] = useState(false); const [editId, sEditId] = useState(null)
  const [fm, sFm] = useState({ claim_date: todayStr(), category: "教材费", amount: "", note: "" })

  const load = useCallback(async () => { sLd(true); const d = await sbGet(`expense_claims?employee_id=eq.${user.id}&order=claim_date.desc&select=*`, tk); sRecs(d || []); sLd(false) }, [user.id, tk])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!fm.amount) return; sSub(true)
    const body = { claim_date: fm.claim_date, category: fm.category, amount: Number(fm.amount), note: fm.note || null }
    if (editId) { await sbPatch(`expense_claims?id=eq.${editId}`, body, tk); sEditId(null) }
    else { await sbPost("expense_claims", { employee_id: user.id, ...body }, tk) }
    await load(); sShow(false); sSub(false); sFm({ claim_date: todayStr(), category: "教材费", amount: "", note: "" })
  }

  const startEdit = (r) => { sFm({ claim_date: r.claim_date, category: r.category, amount: String(r.amount), note: r.note || "" }); sEditId(r.id); sShow(true) }
  const del = async (id) => { if (confirm("确认删除？")) { await sbDel(`expense_claims?id=eq.${id}`, tk); await load() } }
  const total = recs.reduce((s, r) => s + Number(r.amount || 0), 0)
  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box", minHeight: 40 }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>🧾 报销登记</h2>
        <button onClick={() => { sShow(!show); sEditId(null); sFm({ claim_date: todayStr(), category: "教材费", amount: "", note: "" }) }} style={{ padding: "8px 18px", borderRadius: 8, border: show ? `1px solid ${t.bd}` : "none", background: show ? "transparent" : t.ac, color: show ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{show ? "✕ 关闭" : "+ 新报销"}</button>
      </div>
      <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}`, marginBottom: 16 }}><div style={{ fontSize: 10, color: t.tm }}>报销合计</div><div style={{ fontSize: 26, fontWeight: 700, color: t.ac, marginTop: 4 }}>¥{total.toLocaleString()}</div></div>

      {show && (
        <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>{editId ? "✏️ 编辑" : "📝 报销登记"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>日期</label><input type="date" value={fm.claim_date} onChange={(e) => sFm((p) => ({ ...p, claim_date: e.target.value }))} style={iS} /></div>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>类目</label><select value={fm.category} onChange={(e) => sFm((p) => ({ ...p, category: e.target.value }))} style={iS}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>金额（円）</label><input type="number" value={fm.amount} onChange={(e) => sFm((p) => ({ ...p, amount: e.target.value }))} style={iS} /></div>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>备注</label><input placeholder="可选" value={fm.note} onChange={(e) => sFm((p) => ({ ...p, note: e.target.value }))} style={iS} /></div>
          </div>
          <button onClick={submit} disabled={sub || !fm.amount} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: sub ? "wait" : "pointer", opacity: (sub || !fm.amount) ? 0.5 : 1 }}>{sub ? "保存中..." : (editId ? "更新" : "登记")}</button>
        </div>
      )}

      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
          {!recs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无报销记录</div> : recs.map((r) => (
            <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{fmtDateW(r.claim_date)}</span>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: t.ac, background: `${t.ac}15` }}>{r.category}</span>
                {r.note && <span style={{ fontSize: 11, color: t.ts }}>{r.note}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>¥{Number(r.amount || 0).toLocaleString()}</span>
                <button onClick={() => startEdit(r)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 10, cursor: "pointer" }}>✏️</button>
                <button onClick={() => del(r.id)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>🗑</button>
              </div>
            </div>
          ))}
        </div>}
    </div>
  )
}
