import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPatch } from "../../api/supabase"
import { LEAVE_TYPES } from "../../config/constants"
import { Palmtree, Train, ArrowLeftRight, CheckCircle, ClipboardList } from "lucide-react"

export default function ApprovalCenter({ t, tk }) {
  const [lr, sLr] = useState([])
  const [tc, sTc] = useState([])
  const [sw, sSw] = useState([])
  const [emps, sEmps] = useState({})
  const [ld, sLd] = useState(true)

  const load = useCallback(async () => {
    sLd(true)
    const [r, tr, s, e] = await Promise.all([
      sbGet("leave_requests?order=created_at.desc&select=*", tk),
      sbGet("transportation_claims?order=created_at.desc&select=*", tk),
      sbGet("day_swap_requests?order=created_at.desc&select=*", tk),
      sbGet("employees?select=id,name,email", tk),
    ])
    const em = {}; (e || []).forEach((emp) => { em[emp.id] = emp })
    sLr(r || []); sTc(tr || []); sSw(s || []); sEmps(em); sLd(false)
  }, [tk])

  useEffect(() => { load() }, [load])

  const actL = async (id, s) => { await sbPatch(`leave_requests?id=eq.${id}`, { status: s, approved_at: new Date().toISOString() }, tk); await load() }
  const actT = async (id, s) => { await sbPatch(`transportation_claims?id=eq.${id}`, { status: s }, tk); await load() }
  const actS = async (id, s) => { await sbPatch(`day_swap_requests?id=eq.${id}`, { status: s, approved_at: new Date().toISOString() }, tk); await load() }

  const pendL = lr.filter((r) => r.status === "申請中")
  const pendT = tc.filter((r) => r.status === "申请中")
  const pendS = sw.filter((r) => r.status === "申請中")

  if (ld) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

  const Row = ({ name, badge, date, detail, isPending, onOk, onNo, status, okLabel, noLabel }) => (
    <div style={{ background: t.bgC, borderRadius: 10, padding: "12px 16px", border: `1px solid ${isPending ? `${t.wn}33` : t.bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>{name}</span>{badge}
        <span style={{ fontSize: 12, color: t.ts, fontFamily: "monospace" }}>{date}</span>
        {detail && <span style={{ fontSize: 11, color: t.tm }}>{detail}</span>}
      </div>
      {isPending ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onOk} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: t.gn, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{okLabel || "批准"}</button>
          <button onClick={onNo} style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${t.rd}44`, background: "transparent", color: t.rd, fontSize: 11, cursor: "pointer" }}>{noLabel || "驳回"}</button>
        </div>
      ) : (
        <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: status === "承認" || status === "已批准" ? t.gn : t.rd, background: (status === "承認" || status === "已批准" ? `${t.gn}` : `${t.rd}`) + "15" }}>{status}</span>
      )}
    </div>
  )

  const totalPend = pendL.length + pendT.length + pendS.length

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 16px" }}>
        <CheckCircle size={20} strokeWidth={1.8} color={t.tx} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>承认中心</h2>
        <span style={{ fontSize: 12, fontWeight: 400, color: t.wn }}>待审批: {totalPend}件</span>
      </div>

      {totalPend === 0 && lr.length === 0 && tc.length === 0 && sw.length === 0 && <div style={{ textAlign: "center", padding: 24, color: t.tm, fontSize: 12 }}>暂无申请</div>}

      {pendL.length > 0 && <>
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px" }}>
          <Palmtree size={14} strokeWidth={1.8} color={t.ts} />
          <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: 0 }}>休假申请（待审批）</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {pendL.map((r) => {
            const lt = LEAVE_TYPES.find((l) => l.v === r.leave_type)
            return <Row key={r.id} name={emps[r.employee_id]?.name || "?"} badge={<span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: lt?.c, background: (lt?.bg || "#eee") + "33" }}>{r.leave_type}{r.is_half_day && "（半天）"}</span>} date={r.leave_date} detail={r.reason} isPending onOk={() => actL(r.id, "承認")} onNo={() => actL(r.id, "却下")} />
          })}
        </div>
      </>}

      {pendS.length > 0 && <>
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px" }}>
          <ArrowLeftRight size={14} strokeWidth={1.8} color={t.ts} />
          <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: 0 }}>换休申请（待审批）</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {pendS.map((r) => (
            <Row key={r.id}
              name={emps[r.employee_id]?.name || "?"}
              badge={
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.swap_type === "休日出勤" ? "#8B5CF6" : "#F59E0B", background: r.swap_type === "休日出勤" ? "#8B5CF620" : "#F59E0B20" }}>{r.swap_type}</span>
                  {r.compensation_type && <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.compensation_type === "換休" ? "#8B5CF6" : t.rd, background: r.compensation_type === "換休" ? "#8B5CF610" : `${t.rd}10` }}>{r.compensation_type}</span>}
                </span>
              }
              date={`${r.original_date} → ${r.swap_date || "待定"}`}
              detail={r.reason}
              isPending
              onOk={() => actS(r.id, "承認")}
              onNo={() => actS(r.id, "却下")}
            />
          ))}
        </div>
      </>}

      {pendT.length > 0 && <>
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px" }}>
          <Train size={14} strokeWidth={1.8} color={t.ts} />
          <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: 0 }}>交通费申请（待审批）</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {pendT.map((r) => <Row key={r.id} name={emps[r.employee_id]?.name || "?"} badge={<span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: t.ac, background: `${t.ac}15` }}>¥{Number(r.amount || 0).toLocaleString()}</span>} date={r.claim_date} detail={r.route} isPending onOk={() => actT(r.id, "已批准")} onNo={() => actT(r.id, "已驳回")} />)}
        </div>
      </>}

      {sw.filter((r) => r.status !== "申請中").length > 0 && <>
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px" }}>
          <ArrowLeftRight size={14} strokeWidth={1.8} color={t.ts} />
          <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: 0 }}>已处理换休</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {sw.filter((r) => r.status !== "申請中").slice(0, 20).map((r) => (
            <Row key={r.id}
              name={emps[r.employee_id]?.name || "?"}
              badge={
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.swap_type === "休日出勤" ? "#8B5CF6" : "#F59E0B", background: r.swap_type === "休日出勤" ? "#8B5CF620" : "#F59E0B20" }}>{r.swap_type}</span>
                  {r.compensation_type && <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.compensation_type === "換休" ? "#8B5CF6" : t.rd, background: r.compensation_type === "換休" ? "#8B5CF610" : `${t.rd}10` }}>{r.compensation_type}</span>}
                </span>
              }
              date={`${r.original_date} → ${r.swap_date || "待定"}`}
              detail={r.reason}
              status={r.status}
            />
          ))}
        </div>
      </>}

      {lr.filter((r) => r.status !== "申請中").length > 0 && <>
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px" }}>
          <ClipboardList size={14} strokeWidth={1.8} color={t.ts} />
          <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: 0 }}>已处理休假</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {lr.filter((r) => r.status !== "申請中").slice(0, 20).map((r) => {
            const lt = LEAVE_TYPES.find((l) => l.v === r.leave_type)
            return <Row key={r.id} name={emps[r.employee_id]?.name || "?"} badge={<span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: lt?.c, background: (lt?.bg || "#eee") + "33" }}>{r.leave_type}{r.is_half_day && "（半天）"}</span>} date={r.leave_date} detail={r.reason} status={r.status} />
          })}
        </div>
      </>}
    </div>
  )
}