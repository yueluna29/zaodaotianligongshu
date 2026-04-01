import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost } from "../../api/supabase"

export default function DaySwapRequest({ user, t, tk }) {
  const [reqs, sReqs] = useState([])
  const [ld, sLd] = useState(true)
  const [show, sShow] = useState(false)
  const [sub, sSub] = useState(false)
  const [fm, sFm] = useState({
    swap_type: "休日出勤",
    original_date: "",
    swap_date: "",
    compensation_type: "換休",
    reason: ""
  })

  const load = useCallback(async () => {
    sLd(true)
    const r = await sbGet(
      `day_swap_requests?employee_id=eq.${user.id}&order=created_at.desc&select=*`, tk
    )
    sReqs(r || [])
    sLd(false)
  }, [user.id, tk])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!fm.original_date) return
    sSub(true)
    const payload = {
      employee_id: user.id,
      swap_type: fm.swap_type,
      original_date: fm.original_date,
      swap_date: fm.swap_date || null,
      compensation_type: fm.swap_type === "休日出勤" ? fm.compensation_type : null,
      reason: fm.reason || null,
    }
    // 如果是換休，算60天deadline
    if (fm.swap_type === "休日出勤" && fm.compensation_type === "換休") {
      const d = new Date(fm.original_date)
      d.setDate(d.getDate() + 60)
      payload.deadline = d.toISOString().split("T")[0]
    }
    await sbPost("day_swap_requests", payload, tk)
    await load()
    sShow(false); sSub(false)
    sFm({ swap_type: "休日出勤", original_date: "", swap_date: "", compensation_type: "換休", reason: "" })
  }

  const sB = (s) => {
    const c = s === "承認" ? t.gn : s === "却下" ? t.rd : t.wn
    return { padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: c, background: `${c}18` }
  }

  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }

  // 统计
  const approved = reqs.filter(r => r.status === "承認")
  const unusedComp = approved.filter(r => r.swap_type === "休日出勤" && r.compensation_type === "換休" && !r.swap_date).length
  const pending = reqs.filter(r => r.status === "申請中").length

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>🔄 换休管理</h2>
        <button onClick={() => sShow(!show)} style={{ padding: "8px 18px", borderRadius: 8, border: show ? `1px solid ${t.bd}` : "none", background: show ? "transparent" : t.ac, color: show ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{show ? "✕ 关闭" : "+ 新申请"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 20 }}>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>待消化換休</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#8B5CF6", marginTop: 4 }}>{unusedComp}天</div>
        </div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>申请中</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: t.wn, marginTop: 4 }}>{pending}件</div>
        </div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>已批准</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: t.gn, marginTop: 4 }}>{approved.length}件</div>
        </div>
      </div>

      {show && (
        <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>📝 换休申请</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>类型</label>
              <select value={fm.swap_type} onChange={(e) => sFm(p => ({ ...p, swap_type: e.target.value }))} style={iS}>
                <option value="休日出勤">休日出勤（定休日/祝日上班）</option>
                <option value="出勤日休息">出勤日休息（工作日临时休息）</option>
              </select>
            </div>
            {fm.swap_type === "休日出勤" && (
              <div>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>补偿方式</label>
                <select value={fm.compensation_type} onChange={(e) => sFm(p => ({ ...p, compensation_type: e.target.value }))} style={iS}>
                  <option value="換休">換休（换一天休息）</option>
                  <option value="加班">加班（算加班费）</option>
                </select>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{fm.swap_type === "休日出勤" ? "出勤日期" : "休息日期"}</label>
              <input type="date" value={fm.original_date} onChange={(e) => sFm(p => ({ ...p, original_date: e.target.value }))} style={iS} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{fm.swap_type === "休日出勤" ? "换休日期（可留空=待定）" : "补班日期（可留空=待定）"}</label>
              <input type="date" value={fm.swap_date} onChange={(e) => sFm(p => ({ ...p, swap_date: e.target.value }))} style={iS} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由</label>
            <input placeholder="例：旺季需要出勤" value={fm.reason} onChange={(e) => sFm(p => ({ ...p, reason: e.target.value }))} style={iS} />
          </div>
          <button onClick={submit} disabled={sub || !fm.original_date} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (sub || !fm.original_date) ? "not-allowed" : "pointer", opacity: (sub || !fm.original_date) ? 0.5 : 1 }}>{sub ? "提交中..." : "提交申请"}</button>
        </div>
      )}

      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
          {!reqs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无换休记录</div> : reqs.map((r) => (
            <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.swap_type === "休日出勤" ? "#8B5CF6" : "#F59E0B", background: r.swap_type === "休日出勤" ? "#8B5CF620" : "#F59E0B20" }}>
                  {r.swap_type}
                </span>
                {r.swap_type === "休日出勤" && (
                  <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.compensation_type === "換休" ? "#8B5CF6" : t.rd, background: r.compensation_type === "換休" ? "#8B5CF610" : `${t.rd}10` }}>
                    {r.compensation_type}
                  </span>
                )}
                <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{r.original_date}</span>
                <span style={{ fontSize: 10, color: t.tm }}>→</span>
                <span style={{ fontSize: 12, color: r.swap_date ? t.tx : t.td, fontFamily: "monospace" }}>{r.swap_date || "待定"}</span>
                {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
              </div>
              <span style={sB(r.status)}>{r.status}</span>
            </div>
          ))}
        </div>}
    </div>
  )
}