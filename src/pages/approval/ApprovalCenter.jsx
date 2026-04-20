import { useState, useEffect, useCallback, useMemo } from "react"
import { sbGet, sbPatch } from "../../api/supabase"
import { LEAVE_TYPES } from "../../config/constants"
import { Palmtree, ArrowLeftRight, CheckCircle, Train, ChevronDown, ChevronRight } from "lucide-react"

const BUCKET_MS = 10 * 60 * 1000

const leaveGroupKey = (r) => {
  const bucket = Math.floor(new Date(r.created_at).getTime() / BUCKET_MS)
  return `${r.employee_id}|${r.leave_type}|${r.reason || ""}|${r.is_half_day ? 1 : 0}|${bucket}`
}
const swapGroupKey = (r) => {
  const bucket = Math.floor(new Date(r.created_at).getTime() / BUCKET_MS)
  return `${r.employee_id}|${r.swap_type}|${r.compensation_type || ""}|${r.reason || ""}|${bucket}`
}

const groupBy = (items, keyFn) => {
  const map = new Map()
  for (const r of items) {
    const k = keyFn(r)
    if (!map.has(k)) map.set(k, { key: k, items: [] })
    map.get(k).items.push(r)
  }
  for (const g of map.values()) g.items.sort((a, b) => (a.leave_date || a.original_date || "").localeCompare(b.leave_date || b.original_date || ""))
  return [...map.values()]
}

const fmtRange = (dates) => {
  if (dates.length === 1) return dates[0]
  return `${dates[0]} ~ ${dates[dates.length - 1]}`
}

export default function ApprovalCenter({ t, tk }) {
  const [lr, sLr] = useState([])
  const [sw, sSw] = useState([])
  const [tcr, sTcr] = useState([])
  const [emps, sEmps] = useState({})
  const [ld, sLd] = useState(true)
  const [tab, setTab] = useState("leave")
  const [leaveTypeFilter, setLeaveTypeFilter] = useState(null)
  const [swapTypeFilter, setSwapTypeFilter] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())

  const load = useCallback(async () => {
    sLd(true)
    const [r, s, tc, e] = await Promise.all([
      sbGet("leave_requests?order=created_at.desc&select=*", tk),
      sbGet("day_swap_requests?order=created_at.desc&select=*", tk),
      sbGet("transport_change_requests?order=created_at.desc&select=*", tk),
      sbGet("employees?select=id,name,email", tk),
    ])
    const em = {}; (e || []).forEach((emp) => { em[emp.id] = emp })
    sLr(r || []); sSw(s || []); sTcr(tc || []); sEmps(em); sLd(false)
  }, [tk])

  useEffect(() => { load() }, [load])

  const toggleExpand = (k) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  const actL = async (ids, s) => {
    const list = Array.isArray(ids) ? ids : [ids]
    if (!list.length) return
    await sbPatch(`leave_requests?id=in.(${list.join(",")})`, { status: s, approved_at: new Date().toISOString() }, tk)
    await load()
  }
  const actS = async (ids, s) => {
    const list = Array.isArray(ids) ? ids : [ids]
    if (!list.length) return
    await sbPatch(`day_swap_requests?id=in.(${list.join(",")})`, { status: s, approved_at: new Date().toISOString() }, tk)
    await load()
  }
  const actTc = async (r, s) => {
    if (s === "承認") {
      await sbPatch(`employees?id=eq.${r.employee_id}`, { transport_amount: r.requested_amount, transport_method: "固定" }, tk)
    }
    await sbPatch(`transport_change_requests?id=eq.${r.id}`, { status: s, approved_at: new Date().toISOString() }, tk)
    await load()
  }

  const pendL = lr.filter((r) => r.status === "申請中")
  const pendS = sw.filter((r) => r.status === "申請中")
  const pendTc = tcr.filter((r) => r.status === "申請中")
  const doneL = lr.filter((r) => r.status !== "申請中").slice(0, 30)
  const doneS = sw.filter((r) => r.status !== "申請中").slice(0, 30)
  const doneTc = tcr.filter((r) => r.status !== "申請中").slice(0, 30)

  const leaveTypeCounts = useMemo(() => {
    const m = {}
    for (const r of pendL) m[r.leave_type] = (m[r.leave_type] || 0) + 1
    return m
  }, [pendL])
  const swapTypeCounts = useMemo(() => {
    const m = {}
    for (const r of pendS) {
      const k = r.compensation_type || r.swap_type
      m[k] = (m[k] || 0) + 1
    }
    return m
  }, [pendS])

  const filteredPendL = leaveTypeFilter ? pendL.filter((r) => r.leave_type === leaveTypeFilter) : pendL
  const filteredPendS = swapTypeFilter ? pendS.filter((r) => (r.compensation_type || r.swap_type) === swapTypeFilter) : pendS
  const leaveGroups = useMemo(() => groupBy(filteredPendL, leaveGroupKey), [filteredPendL])
  const swapGroups = useMemo(() => groupBy(filteredPendS, swapGroupKey), [filteredPendS])

  if (ld) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

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

  const singleRow = ({ name, badge, date, detail, isPending, onOk, onNo, status, key }) => (
    <div key={key} style={{ background: t.bgC, borderRadius: 10, padding: "12px 16px", border: `1px solid ${isPending ? `${t.wn}33` : t.bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
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

  const batchCard = ({ group, badgeOf, getDate, onBatchOk, onBatchNo, onItemOk, onItemNo }) => {
    const { key, items } = group
    const first = items[0]
    const name = emps[first.employee_id]?.name || "?"
    const dates = items.map(getDate)
    const isOpen = expanded.has(key)
    return (
      <div key={key} style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.wn}33`, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => toggleExpand(key)} aria-label="展开" style={{ display: "flex", alignItems: "center", border: "none", background: "transparent", color: t.tm, cursor: "pointer", padding: 0 }}>
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>{name}</span>
            {badgeOf(first)}
            <span style={{ fontSize: 12, color: t.ts, fontFamily: "monospace" }}>{fmtRange(dates)}</span>
            <span style={{ padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 600, color: t.ac, background: `${t.ac}15` }}>{items.length}天</span>
            {first.reason && <span style={{ fontSize: 11, color: t.tm }}>{first.reason}</span>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onBatchOk(items.map(i => i.id))} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: t.gn, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>批准全部</button>
            <button onClick={() => onBatchNo(items.map(i => i.id))} style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${t.rd}44`, background: "transparent", color: t.rd, fontSize: 11, cursor: "pointer" }}>驳回全部</button>
          </div>
        </div>
        {isOpen && (
          <div style={{ borderTop: `1px solid ${t.bl}`, background: `${t.ac}03` }}>
            {items.map((it) => (
              <div key={it.id} style={{ padding: "8px 16px 8px 42px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, borderBottom: `1px solid ${t.bl}` }}>
                <span style={{ fontSize: 12, color: t.ts, fontFamily: "monospace" }}>{getDate(it)}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onItemOk(it.id)} style={{ padding: "3px 10px", borderRadius: 5, border: "none", background: t.gn, color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>批准</button>
                  <button onClick={() => onItemNo(it.id)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.rd}44`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>驳回</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const filterBar = (counts, active, onPick, total) => {
    const keys = Object.keys(counts)
    if (!keys.length) return null
    return (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={() => onPick(null)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${!active ? t.ac : t.bd}`, background: !active ? `${t.ac}15` : "transparent", color: !active ? t.ac : t.ts, fontSize: 11, fontWeight: !active ? 600 : 400, cursor: "pointer" }}>全部 {total}</button>
        {keys.map((k) => (
          <button key={k} onClick={() => onPick(active === k ? null : k)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${active === k ? t.ac : t.bd}`, background: active === k ? `${t.ac}15` : "transparent", color: active === k ? t.ac : t.ts, fontSize: 11, fontWeight: active === k ? 600 : 400, cursor: "pointer" }}>{k} {counts[k]}</button>
        ))}
      </div>
    )
  }

  const tabsDef = [
    { key: "leave", label: "休假申请", icon: Palmtree, badge: pendL.length },
    { key: "swap", label: "换休申请", icon: ArrowLeftRight, badge: pendS.length },
    { key: "trans", label: "交通费变更", icon: Train, badge: pendTc.length },
  ]

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 16px" }}>
        <CheckCircle size={20} strokeWidth={1.8} color={t.tx} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>承认中心</h2>
        <span style={{ fontSize: 12, fontWeight: 400, color: t.wn }}>待审批: {pendL.length + pendS.length + pendTc.length}件</span>
      </div>

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
              {filterBar(leaveTypeCounts, leaveTypeFilter, setLeaveTypeFilter, pendL.length)}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {leaveGroups.map((g) => g.items.length >= 2
                  ? batchCard({
                      group: g,
                      badgeOf: leaveBadge,
                      getDate: (r) => r.leave_date,
                      onBatchOk: (ids) => actL(ids, "承認"),
                      onBatchNo: (ids) => actL(ids, "却下"),
                      onItemOk: (id) => actL(id, "承認"),
                      onItemNo: (id) => actL(id, "却下"),
                    })
                  : singleRow({
                      key: g.items[0].id,
                      name: emps[g.items[0].employee_id]?.name || "?",
                      badge: leaveBadge(g.items[0]),
                      date: g.items[0].leave_date,
                      detail: g.items[0].reason,
                      isPending: true,
                      onOk: () => actL(g.items[0].id, "承認"),
                      onNo: () => actL(g.items[0].id, "却下"),
                    })
                )}
                {leaveGroups.length === 0 && (
                  <div style={{ padding: "12px 16px", borderRadius: 8, color: t.tm, fontSize: 12, textAlign: "center" }}>该类型暂无待审批</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: "14px 16px", borderRadius: 8, background: `${t.gn}10`, border: `1px solid ${t.gn}30`, color: t.gn, fontSize: 12, marginBottom: 20 }}>暂无待审批的休假申请</div>
          )}
          {doneL.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: "0 0 8px" }}>最近已处理（{doneL.length}件）</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {doneL.map((r) => singleRow({ key: r.id, name: emps[r.employee_id]?.name || "?", badge: leaveBadge(r), date: r.leave_date, detail: r.reason, status: r.status }))}
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
              {filterBar(swapTypeCounts, swapTypeFilter, setSwapTypeFilter, pendS.length)}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {swapGroups.map((g) => g.items.length >= 2
                  ? batchCard({
                      group: g,
                      badgeOf: swapBadge,
                      getDate: (r) => `${r.original_date} → ${r.swap_date || "待定"}`,
                      onBatchOk: (ids) => actS(ids, "承認"),
                      onBatchNo: (ids) => actS(ids, "却下"),
                      onItemOk: (id) => actS(id, "承認"),
                      onItemNo: (id) => actS(id, "却下"),
                    })
                  : singleRow({
                      key: g.items[0].id,
                      name: emps[g.items[0].employee_id]?.name || "?",
                      badge: swapBadge(g.items[0]),
                      date: `${g.items[0].original_date} → ${g.items[0].swap_date || "待定"}`,
                      detail: g.items[0].reason,
                      isPending: true,
                      onOk: () => actS(g.items[0].id, "承認"),
                      onNo: () => actS(g.items[0].id, "却下"),
                    })
                )}
                {swapGroups.length === 0 && (
                  <div style={{ padding: "12px 16px", borderRadius: 8, color: t.tm, fontSize: 12, textAlign: "center" }}>该类型暂无待审批</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: "14px 16px", borderRadius: 8, background: `${t.gn}10`, border: `1px solid ${t.gn}30`, color: t.gn, fontSize: 12, marginBottom: 20 }}>暂无待审批的换休申请</div>
          )}
          {doneS.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: "0 0 8px" }}>最近已处理（{doneS.length}件）</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {doneS.map((r) => singleRow({ key: r.id, name: emps[r.employee_id]?.name || "?", badge: swapBadge(r), date: `${r.original_date} → ${r.swap_date || "待定"}`, detail: r.reason, status: r.status }))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "trans" && (
        <div>
          {pendTc.length > 0 ? (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: "0 0 8px" }}>待审批（{pendTc.length}件）</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {pendTc.map((r) => (
                  <div key={r.id} style={{ background: t.bgC, borderRadius: 10, padding: "12px 16px", border: `1px solid ${t.wn}33`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>{emps[r.employee_id]?.name || "?"}</span>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: t.ts }}>¥{Number(r.previous_amount).toLocaleString()} → <strong style={{ color: t.ac }}>¥{Number(r.requested_amount).toLocaleString()}</strong></span>
                      <span style={{ fontSize: 10, color: t.tm }}>{r.effective_from} 起</span>
                      {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => actTc(r, "承認")} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: t.gn, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>批准并更新</button>
                      <button onClick={() => actTc(r, "却下")} style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${t.rd}44`, background: "transparent", color: t.rd, fontSize: 11, cursor: "pointer" }}>驳回</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: "14px 16px", borderRadius: 8, background: `${t.gn}10`, border: `1px solid ${t.gn}30`, color: t.gn, fontSize: 12, marginBottom: 20 }}>暂无待审批的交通费变更</div>
          )}
          {doneTc.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: "0 0 8px" }}>最近已处理（{doneTc.length}件）</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {doneTc.map((r) => (
                  <div key={r.id} style={{ background: t.bgC, borderRadius: 10, padding: "12px 16px", border: `1px solid ${t.bd}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>{emps[r.employee_id]?.name || "?"}</span>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: t.ts }}>¥{Number(r.previous_amount).toLocaleString()} → ¥{Number(r.requested_amount).toLocaleString()}</span>
                      <span style={{ fontSize: 10, color: t.tm }}>{r.effective_from} 起</span>
                    </div>
                    <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.status === "承認" ? t.gn : t.rd, background: (r.status === "承認" ? `${t.gn}` : `${t.rd}`) + "15" }}>{r.status}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
