import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { pad } from "../../config/constants"

export default function CommissionEntry({ user, t, tk }) {
  const now = new Date(); const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  const [recs, sRecs] = useState([]); const [ld, sLd] = useState(true); const [show, sShow] = useState(false); const [sub, sSub] = useState(false); const [editId, sEditId] = useState(null)
  const [fm, sFm] = useState({ student_name: "", student_affiliation: "", contract_amount: "", commission_percentage: "" })

  const load = useCallback(async () => { sLd(true); const d = await sbGet(`commissions?employee_id=eq.${user.id}&order=created_at.desc&select=*`, tk); sRecs(d || []); sLd(false) }, [user.id, tk])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!fm.student_name || !fm.contract_amount) return; sSub(true)
    const body = { student_name: fm.student_name, student_affiliation: fm.student_affiliation || null, contract_amount: Number(fm.contract_amount), commission_percentage: Number(fm.commission_percentage) || Number(user.commission_rate) * 100 }
    if (editId) { await sbPatch(`commissions?id=eq.${editId}`, body, tk); sEditId(null) }
    else { await sbPost("commissions", { employee_id: user.id, year_month: ym, ...body }, tk) }
    await load(); sShow(false); sSub(false); sFm({ student_name: "", student_affiliation: "", contract_amount: "", commission_percentage: "" })
  }

  const startEdit = (r) => { sFm({ student_name: r.student_name, student_affiliation: r.student_affiliation || "", contract_amount: String(r.contract_amount), commission_percentage: String(r.commission_percentage || "") }); sEditId(r.id); sShow(true) }
  const del = async (id) => { if (confirm("确认删除？")) { await sbDel(`commissions?id=eq.${id}`, tk); await load() } }
  const total = recs.filter((r) => r.year_month === ym).reduce((s, r) => s + Number(r.commission_amount || 0), 0)
  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>💰 签单录入</h2>
        <button onClick={() => { sShow(!show); sEditId(null); sFm({ student_name: "", student_affiliation: "", contract_amount: "", commission_percentage: "" }) }} style={{ padding: "8px 18px", borderRadius: 8, border: show ? `1px solid ${t.bd}` : "none", background: show ? "transparent" : t.ac, color: show ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{show ? "✕ 关闭" : "+ 新录入"}</button>
      </div>

      <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}`, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: t.tm }}>本月提成合计</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: t.gn, marginTop: 4 }}>¥{Math.round(total).toLocaleString()}</div>
      </div>

      {show && (
        <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>{editId ? "✏️ 编辑" : "📝 签单录入"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>学生名</label><input value={fm.student_name} onChange={(e) => sFm((p) => ({ ...p, student_name: e.target.value }))} style={iS} /></div>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>学生所属</label><input placeholder="例：早稲田大学" value={fm.student_affiliation} onChange={(e) => sFm((p) => ({ ...p, student_affiliation: e.target.value }))} style={iS} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>签单金额（円）</label><input type="number" value={fm.contract_amount} onChange={(e) => sFm((p) => ({ ...p, contract_amount: e.target.value }))} style={iS} /></div>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>提成率（%）</label><input type="number" placeholder={`默认: ${(Number(user.commission_rate) * 100).toFixed(0)}%`} value={fm.commission_percentage} onChange={(e) => sFm((p) => ({ ...p, commission_percentage: e.target.value }))} style={iS} /></div>
          </div>
          {fm.contract_amount && <div style={{ fontSize: 12, color: t.gn, marginBottom: 12 }}>提成额: ¥{Math.round(Number(fm.contract_amount) * (Number(fm.commission_percentage) || Number(user.commission_rate) * 100) / 100).toLocaleString()}</div>}
          <button onClick={submit} disabled={sub || !fm.student_name || !fm.contract_amount} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: sub ? "wait" : "pointer", opacity: (sub || !fm.student_name || !fm.contract_amount) ? 0.5 : 1 }}>{sub ? "保存中..." : (editId ? "更新" : "录入")}</button>
        </div>
      )}

      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
          {!recs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无录入记录</div> : recs.map((r) => (
            <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>{r.student_name}</span>{r.student_affiliation && <span style={{ fontSize: 10, color: t.ts }}>{r.student_affiliation}</span>}<span style={{ fontSize: 11, color: t.tm, fontFamily: "monospace" }}>{r.year_month}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 12, color: t.ts }}>¥{Number(r.contract_amount || 0).toLocaleString()} × {Number(r.commission_percentage || 0).toFixed(0)}%</div><div style={{ fontSize: 13, fontWeight: 700, color: t.gn }}>¥{Math.round(Number(r.commission_amount || 0)).toLocaleString()}</div></div>
                <button onClick={() => startEdit(r)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 10, cursor: "pointer" }}>✏️</button>
                <button onClick={() => del(r.id)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>🗑</button>
              </div>
            </div>
          ))}
        </div>}
    </div>
  )
}
