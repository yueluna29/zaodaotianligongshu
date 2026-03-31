import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost } from "../../api/supabase"
import { LEAVE_TYPES } from "../../config/constants"

export default function LeaveRequest({ user, t, tk }) {
  const [reqs, sReqs] = useState([])
  const [ld, sLd] = useState(true)
  const [show, sShow] = useState(false)
  const [fm, sFm] = useState({ leave_type: "有休", leave_date: "", reason: "" })
  const [sub, sSub] = useState(false)
  const [bal, sBal] = useState({ granted: 0, used: 0 })

  const load = useCallback(async () => {
    sLd(true)
    const [r, lb, lr] = await Promise.all([
      sbGet(`leave_requests?employee_id=eq.${user.id}&order=created_at.desc&select=*`, tk),
      sbGet(`leave_balances?employee_id=eq.${user.id}&select=*`, tk),
      sbGet(`leave_requests?employee_id=eq.${user.id}&status=eq.承認&leave_type=eq.有休&select=id`, tk),
    ])
    sReqs(r || [])
    const g = (lb || []).reduce((s, b) => s + Number(b.granted_days || 0) + Number(b.carried_over_days || 0), 0)
    sBal({ granted: g, used: (lr || []).length })
    sLd(false)
  }, [user.id, tk])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!fm.leave_date) return
    sSub(true)
    await sbPost("leave_requests", { employee_id: user.id, leave_type: fm.leave_type, leave_date: fm.leave_date, reason: fm.reason || null }, tk)
    await load()
    sShow(false); sSub(false)
    sFm({ leave_type: "有休", leave_date: "", reason: "" })
  }

  const sB = (s) => {
    const c = s === "承認" ? t.gn : s === "却下" ? t.rd : t.wn
    return { padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: c, background: `${c}18` }
  }

  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>🌴 假期管理</h2>
        <button onClick={() => sShow(!show)} style={{ padding: "8px 18px", borderRadius: 8, border: show ? `1px solid ${t.bd}` : "none", background: show ? "transparent" : t.ac, color: show ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{show ? "✕ 关闭" : "+ 新申请"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 20 }}>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}><div style={{ fontSize: 10, color: t.tm }}>有休余额</div><div style={{ fontSize: 26, fontWeight: 700, color: t.ac, marginTop: 4 }}>{bal.granted - bal.used}天</div><div style={{ fontSize: 10, color: t.td }}>付与{bal.granted} / 已用{bal.used}</div></div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}><div style={{ fontSize: 10, color: t.tm }}>申请中</div><div style={{ fontSize: 26, fontWeight: 700, color: t.wn, marginTop: 4 }}>{reqs.filter((r) => r.status === "申請中").length}件</div></div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}><div style={{ fontSize: 10, color: t.tm }}>已批准</div><div style={{ fontSize: 26, fontWeight: 700, color: t.gn, marginTop: 4 }}>{reqs.filter((r) => r.status === "承認").length}件</div></div>
      </div>

      {show && (
        <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>📝 申请表</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>类型</label><select value={fm.leave_type} onChange={(e) => sFm((p) => ({ ...p, leave_type: e.target.value }))} style={iS}>{LEAVE_TYPES.map((l) => <option key={l.v} value={l.v}>{l.i} {l.l}</option>)}</select></div>
            <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>日期</label><input type="date" value={fm.leave_date} onChange={(e) => sFm((p) => ({ ...p, leave_date: e.target.value }))} style={iS} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由</label><input placeholder="例：私事、身体不适" value={fm.reason} onChange={(e) => sFm((p) => ({ ...p, reason: e.target.value }))} style={iS} /></div>
          <button onClick={submit} disabled={sub || !fm.leave_date} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (sub || !fm.leave_date) ? "not-allowed" : "pointer", opacity: (sub || !fm.leave_date) ? 0.5 : 1 }}>{sub ? "提交中..." : "提交申请"}</button>
        </div>
      )}

      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
          {!reqs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无申请记录</div> : reqs.map((r) => {
            const lt = LEAVE_TYPES.find((l) => l.v === r.leave_type)
            return (
              <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: lt?.c, background: (lt?.bg || "#eee") + "33" }}>{lt?.i} {r.leave_type}</span>
                  <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{r.leave_date}</span>
                  {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
                </div>
                <span style={sB(r.status)}>{r.status}</span>
              </div>
            )
          })}
        </div>}
    </div>
  )
}
