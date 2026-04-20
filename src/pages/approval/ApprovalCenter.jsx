import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPatch } from "../../api/supabase"
import { LEAVE_TYPES } from "../../config/constants"
import { Palmtree, ArrowLeftRight, CheckCircle } from "lucide-react"

export default function ApprovalCenter({ t, tk }) {
  const [lr, sLr] = useState([])
  const [sw, sSw] = useState([])
  const [emps, sEmps] = useState({})
  const [ld, sLd] = useState(true)
  const [tab, setTab] = useState("leave") // "leave" | "swap"

  const load = useCallback(async () => {
    sLd(true)
    const [r, s, e] = await Promise.all([
      sbGet("leave_requests?order=created_at.desc&select=*", tk),
      sbGet("day_swap_requests?order=created_at.desc&select=*", tk),
      sbGet("employees?select=id,name,email", tk),
    ])
    const em = {}; (e || []).forEach((emp) => { em[emp.id] = emp })
    sLr(r || []); sSw(s || []); sEmps(em); sLd(false)
  }, [tk])

  useEffect(() => { load() }, [load])

  const actL = async (id, s) => { await sbPatch(`leave_requests?id=eq.${id}`, { status: s, approved_at: new Date().toISOString() }, tk); await load() }
  const actS = async (id, s) => { await sbPatch(`day_swap_requests?id=eq.${id}`, { status: s, approved_at: new Date().toISOString() }, tk); await load() }

  const pendL = lr.filter((r) => r.status === "申請中")
  const pendS = sw.filter((r) => r.status === "申請中")
  const doneL = lr.filter((r) => r.status !== "申請中").slice(0, 30)
  const doneS = sw.filter((r) => r.status !== "申請中").slice(0, 30)

  if (ld) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

  const Row = ({ name, badge, date, detail, isPending, onOk, onNo, status }) => (
    <div style={{ background: t.bgC, borderRadius: 10, padding: "12px 16px", border: `1px solid ${isPending ? `${t.wn}33` : t.bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>{name}</span>{badge}
        <span style={{ fontSize: 12, color: t.ts, fontFamily: "monospace" }}>{date}</span>
        {detail && <span style={{ fontSize: 11, color: t.tm }}>{detail}</span>}
      </div>
      {isPending ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onOk} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: t.gn, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>批准</button>
          <button onClick={onNo} style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${t.rd}44`, background: "transparent", color: t.rd, fontSize: 11, cursor: "pointer" }}>驳回</button>
        </div>
      ) : (
        <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: status === "承認" ? t.gn : t.rd, background: (status === "承認" ? `${t.gn}` : `${t.rd}`) + "15" }}>{status}</span>
      )}
    </div>
  )

  const leaveBadge = (r) => {
    const lt = LEAVE_TYPES.find((l) => l.v === r.leave_type)
    return <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: lt?.c, background: (lt?.bg || "#eee") + "33" }}>{r.leave_type}{r.is_half_day && "（半天）"}</span>
  }

  const swapBadge = (r) => (
    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.swap_type === "休日出勤" ? "#8B5CF6" : "#F59E0B", background: r.swap_type === "休日出勤" ? "#8B5CF620" : "#F59E0B20" }}>{r.swap_type}</span>
      {r.compensation_type && <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.compensation_type === "換休" ? "#8B5CF6" : t.rd, background: r.compensation_type === "換休" ? "#8B5CF610" : `${t.rd}10` }}>{r.compensation_type}</span>}
    </span>
  )

  const tabsDef = [
    { key: "leave", label: "休假申请", icon: Palmtree, badge: pendL.length },
    { key: "swap", label: "换休申请", icon: ArrowLeftRight, badge: pendS.length },
  ]

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 16px" }}>
        <CheckCircle size={20} strokeWidth={1.8} color={t.tx} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>承认中心</h2>
        <span style={{ fontSize: 12, fontWeight: 400, color: t.wn }}>待审批: {pendL.length + pendS.length}件</span>
      </div>

      {/* ====== 顶层 tab 切换 ====== */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${t.bd}`, flexWrap: "wrap" }}>
        {tabsDef.map(tb => {
          const Icon = tb.icon
          const active = tab === tb.key
          return (
            <button key={tb.key} onClick={() => setTab(tb.key)} style={{ padding: "10px 18px", border: "none", borderBottom: `3px solid ${active ? t.ac : "transparent"}`, background: "transparent", color: active ? t.ac : t.ts, fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: -1 }}>
              <Icon size={16} />
              {tb.label}
              {tb.badge > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: t.wn, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{tb.badge}</span>}
            </button>
          )
        })}
      </div>

      {tab === "leave" && (
        <div>
          {pendL.length > 0 ? (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: "0 0 8px" }}>待审批（{pendL.length}件）</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {pendL.map((r) => <Row key={r.id} name={emps[r.employee_id]?.name || "?"} badge={leaveBadge(r)} date={r.leave_date} detail={r.reason} isPending onOk={() => actL(r.id, "承認")} onNo={() => actL(r.id, "却下")} />)}
              </div>
            </>
          ) : (
            <div style={{ padding: "14px 16px", borderRadius: 8, background: `${t.gn}10`, border: `1px solid ${t.gn}30`, color: t.gn, fontSize: 12, marginBottom: 20 }}>暂无待审批的休假申请</div>
          )}
          {doneL.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: "0 0 8px" }}>最近已处理（{doneL.length}件）</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {doneL.map((r) => <Row key={r.id} name={emps[r.employee_id]?.name || "?"} badge={leaveBadge(r)} date={r.leave_date} detail={r.reason} status={r.status} />)}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "swap" && (
        <div>
          {pendS.length > 0 ? (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: "0 0 8px" }}>待审批（{pendS.length}件）</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {pendS.map((r) => <Row key={r.id} name={emps[r.employee_id]?.name || "?"} badge={swapBadge(r)} date={`${r.original_date} → ${r.swap_date || "待定"}`} detail={r.reason} isPending onOk={() => actS(r.id, "承認")} onNo={() => actS(r.id, "却下")} />)}
              </div>
            </>
          ) : (
            <div style={{ padding: "14px 16px", borderRadius: 8, background: `${t.gn}10`, border: `1px solid ${t.gn}30`, color: t.gn, fontSize: 12, marginBottom: 20 }}>暂无待审批的换休申请</div>
          )}
          {doneS.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: "0 0 8px" }}>最近已处理（{doneS.length}件）</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {doneS.map((r) => <Row key={r.id} name={emps[r.employee_id]?.name || "?"} badge={swapBadge(r)} date={`${r.original_date} → ${r.swap_date || "待定"}`} detail={r.reason} status={r.status} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
