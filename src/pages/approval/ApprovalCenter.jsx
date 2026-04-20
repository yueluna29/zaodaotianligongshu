import { useState, useEffect, useCallback, useMemo } from "react"
import { sbGet, sbPatch } from "../../api/supabase"
import { LEAVE_TYPES, fmtDateW } from "../../config/constants"
import { Palmtree, ArrowLeftRight, CheckCircle, Train, ChevronDown, ChevronRight, Check, X } from "lucide-react"

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
  if (dates.length === 1) return fmtDateW(dates[0])
  return `${fmtDateW(dates[0])} → ${fmtDateW(dates[dates.length - 1])}`
}

const fmtRelTime = (iso) => {
  if (!iso) return ""
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0) return "刚刚"
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString("zh-CN")
}

const fmtAbs = (iso) => {
  if (!iso) return ""
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export default function ApprovalCenter({ user, t, tk }) {
  const [lr, sLr] = useState([])
  const [sw, sSw] = useState([])
  const [tcr, sTcr] = useState([])
  const [emps, sEmps] = useState({})
  const [ld, sLd] = useState(true)
  const [tab, setTab] = useState("leave")
  const [leaveTypeFilter, setLeaveTypeFilter] = useState(null)
  const [swapTypeFilter, setSwapTypeFilter] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [rejectModal, setRejectModal] = useState(null) // { kind: 'leave'|'swap'|'trans', ids, trec? }
  const [rejectReason, setRejectReason] = useState("")
  const [rejectSub, setRejectSub] = useState(false)

  const load = useCallback(async () => {
    sLd(true)
    const [r, s, tc, e] = await Promise.all([
      sbGet("leave_requests?order=created_at.desc&select=*", tk),
      sbGet("day_swap_requests?order=created_at.desc&select=*", tk),
      sbGet("transport_change_requests?order=created_at.desc&select=*", tk),
      sbGet("employees?select=id,name,email,department", tk),
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

  const approveLeaves = async (ids) => {
    const list = Array.isArray(ids) ? ids : [ids]
    if (!list.length) return
    await sbPatch(`leave_requests?id=in.(${list.join(",")})`, { status: "承認", approved_at: new Date().toISOString(), approved_by: user.id, rejection_reason: null }, tk)
    await load()
  }
  const approveSwaps = async (ids) => {
    const list = Array.isArray(ids) ? ids : [ids]
    if (!list.length) return
    await sbPatch(`day_swap_requests?id=in.(${list.join(",")})`, { status: "承認", approved_at: new Date().toISOString(), approved_by: user.id, rejection_reason: null }, tk)
    await load()
  }
  const approveTrans = async (r) => {
    await sbPatch(`employees?id=eq.${r.employee_id}`, { transport_amount: r.requested_amount, transport_method: "固定" }, tk)
    await sbPatch(`transport_change_requests?id=eq.${r.id}`, { status: "承認", approved_at: new Date().toISOString(), approved_by: user.id, rejection_reason: null }, tk)
    await load()
  }

  const openReject = (kind, ids, extra = {}) => {
    setRejectModal({ kind, ids: Array.isArray(ids) ? ids : [ids], ...extra })
    setRejectReason("")
  }
  const closeReject = () => { setRejectModal(null); setRejectReason(""); setRejectSub(false) }
  const confirmReject = async () => {
    if (!rejectModal) return
    setRejectSub(true)
    const { kind, ids } = rejectModal
    const body = { status: "却下", approved_at: new Date().toISOString(), approved_by: user.id, rejection_reason: rejectReason.trim() || null }
    const table = kind === "leave" ? "leave_requests" : kind === "swap" ? "day_swap_requests" : "transport_change_requests"
    await sbPatch(`${table}?id=in.(${ids.join(",")})`, body, tk)
    await load()
    closeReject()
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

  // ========== 渲染组件 ==========
  const leaveBadge = (r) => {
    const lt = LEAVE_TYPES.find((l) => l.v === r.leave_type)
    return <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: lt?.c, background: (lt?.bg || "#eee") + "55" }}>{r.leave_type}{r.is_half_day && "・半天"}</span>
  }
  const swapBadge = (r) => (
    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.swap_type === "休日出勤" ? "#8B5CF6" : "#F59E0B", background: r.swap_type === "休日出勤" ? "#8B5CF620" : "#F59E0B20" }}>{r.swap_type}</span>
      {r.compensation_type && <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.compensation_type === "換休" ? "#8B5CF6" : t.rd, background: r.compensation_type === "換休" ? "#8B5CF610" : `${t.rd}10` }}>{r.compensation_type}</span>}
    </span>
  )

  const Avatar = ({ name }) => (
    <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${t.ac}18`, color: t.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
      {(name || "?").slice(0, 1)}
    </div>
  )

  const StatusPill = ({ status }) => {
    const ok = status === "承認"
    const label = ok ? "✓ 已通过" : "✕ 已驳回"
    const c = ok ? t.gn : t.rd
    return <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, color: c, background: `${c}15` }}>{label}</span>
  }

  const PendingActions = ({ onOk, onNo }) => (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      <button onClick={onNo} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${t.rd}55`, background: "transparent", color: t.rd, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
        <X size={12} /> 驳回
      </button>
      <button onClick={onOk} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
        <Check size={12} /> 通过
      </button>
    </div>
  )

  // 单条卡片（pending or done）
  const renderSingleCard = ({ rec, badge, dateLine, isPending, onOk, onNo, approverName }) => {
    const name = emps[rec.employee_id]?.name || "?"
    const dept = emps[rec.employee_id]?.department
    return (
      <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${isPending ? `${t.wn}33` : t.bd}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Avatar name={name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>{name}</span>
              {dept && <span style={{ fontSize: 11, color: t.tm }}>・ {dept}</span>}
              {badge}
              <span style={{ marginLeft: "auto", fontSize: 10, color: t.tm, whiteSpace: "nowrap" }}>提交于 {fmtRelTime(rec.created_at)}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: t.tm, flexShrink: 0 }}>时间：</span>
              <span style={{ fontSize: 12, color: t.ts, fontFamily: "monospace" }}>{dateLine}</span>
            </div>
            {rec.reason && (
              <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: t.tm, flexShrink: 0 }}>事由：</span>
                <span style={{ fontSize: 12, color: t.ts }}>{rec.reason}</span>
              </div>
            )}
            {!isPending && rec.status === "却下" && rec.rejection_reason && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: `${t.rd}10`, color: t.rd, fontSize: 11, lineHeight: 1.5 }}>
                <strong>驳回意见：</strong>{rec.rejection_reason}
              </div>
            )}
            {!isPending && approverName && (
              <div style={{ marginTop: 6, fontSize: 10, color: t.tm }}>审批人：{approverName}・{fmtAbs(rec.approved_at)}</div>
            )}
          </div>
          {isPending ? <PendingActions onOk={onOk} onNo={onNo} /> : <StatusPill status={rec.status} />}
        </div>
      </div>
    )
  }

  // 批量卡片
  const renderBatchCard = ({ group, badgeOf, getDate, onBatchOk, onBatchNo, onItemOk, onItemNo }) => {
    const { key, items } = group
    const first = items[0]
    const latest = items.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b)
    const name = emps[first.employee_id]?.name || "?"
    const dept = emps[first.employee_id]?.department
    const dates = items.map(getDate)
    const isOpen = expanded.has(key)
    return (
      <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.wn}33`, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Avatar name={name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => toggleExpand(key)} aria-label="展开" style={{ display: "flex", alignItems: "center", border: "none", background: "transparent", color: t.tm, cursor: "pointer", padding: 0 }}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>{name}</span>
              {dept && <span style={{ fontSize: 11, color: t.tm }}>・ {dept}</span>}
              {badgeOf(first)}
              <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, color: t.ac, background: `${t.ac}15` }}>{items.length}天</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: t.tm, whiteSpace: "nowrap" }}>提交于 {fmtRelTime(latest.created_at)}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: t.tm, flexShrink: 0 }}>时间：</span>
              <span style={{ fontSize: 12, color: t.ts, fontFamily: "monospace" }}>{fmtRange(dates)}</span>
            </div>
            {first.reason && (
              <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: t.tm, flexShrink: 0 }}>事由：</span>
                <span style={{ fontSize: 12, color: t.ts }}>{first.reason}</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => onBatchNo(items.map(i => i.id))} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${t.rd}55`, background: "transparent", color: t.rd, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <X size={12} /> 驳回全部
            </button>
            <button onClick={() => onBatchOk(items.map(i => i.id))} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <Check size={12} /> 通过全部
            </button>
          </div>
        </div>
        {isOpen && (
          <div style={{ borderTop: `1px solid ${t.bl}`, background: `${t.ac}03` }}>
            {items.map((it) => (
              <div key={it.id} style={{ padding: "8px 16px 8px 64px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, borderBottom: `1px solid ${t.bl}` }}>
                <span style={{ fontSize: 12, color: t.ts, fontFamily: "monospace" }}>{getDate(it)}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onItemNo(it.id)} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.rd}55`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>驳回</button>
                  <button onClick={() => onItemOk(it.id)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", background: t.gn, color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>通过</button>
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

  // 交通费变更卡片（单条）
  const renderTransCard = (r, isPending) => {
    const name = emps[r.employee_id]?.name || "?"
    const dept = emps[r.employee_id]?.department
    const approverName = r.approved_by ? emps[r.approved_by]?.name : null
    return (
      <div key={r.id} style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${isPending ? `${t.wn}33` : t.bd}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Avatar name={name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>{name}</span>
              {dept && <span style={{ fontSize: 11, color: t.tm }}>・ {dept}</span>}
              <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: "#8B5CF6", background: "#8B5CF620" }}>固定交通费</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: t.tm, whiteSpace: "nowrap" }}>提交于 {fmtRelTime(r.created_at)}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: t.tm, flexShrink: 0 }}>变更：</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: t.ts }}>¥{Number(r.previous_amount).toLocaleString()} → <strong style={{ color: t.ac }}>¥{Number(r.requested_amount).toLocaleString()}</strong></span>
              <span style={{ fontSize: 10, color: t.tm, marginLeft: 8 }}>{fmtDateW(r.effective_from)} 起</span>
            </div>
            {r.reason && (
              <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: t.tm, flexShrink: 0 }}>事由：</span>
                <span style={{ fontSize: 12, color: t.ts }}>{r.reason}</span>
              </div>
            )}
            {!isPending && r.status === "却下" && r.rejection_reason && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: `${t.rd}10`, color: t.rd, fontSize: 11, lineHeight: 1.5 }}>
                <strong>驳回意见：</strong>{r.rejection_reason}
              </div>
            )}
            {!isPending && approverName && (
              <div style={{ marginTop: 6, fontSize: 10, color: t.tm }}>审批人：{approverName}・{fmtAbs(r.approved_at)}</div>
            )}
          </div>
          {isPending ? (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => openReject("trans", r.id)} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${t.rd}55`, background: "transparent", color: t.rd, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><X size={12} /> 驳回</button>
              <button onClick={() => approveTrans(r)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Check size={12} /> 通过并更新</button>
            </div>
          ) : <StatusPill status={r.status} />}
        </div>
      </div>
    )
  }

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
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {leaveGroups.map((g) => g.items.length >= 2
                  ? renderBatchCard({
                      group: g,
                      badgeOf: leaveBadge,
                      getDate: (r) => fmtDateW(r.leave_date),
                      onBatchOk: approveLeaves,
                      onBatchNo: (ids) => openReject("leave", ids),
                      onItemOk: approveLeaves,
                      onItemNo: (id) => openReject("leave", id),
                    })
                  : <div key={g.items[0].id}>{renderSingleCard({
                      rec: g.items[0],
                      badge: leaveBadge(g.items[0]),
                      dateLine: fmtDateW(g.items[0].leave_date),
                      isPending: true,
                      onOk: () => approveLeaves(g.items[0].id),
                      onNo: () => openReject("leave", g.items[0].id),
                    })}</div>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {doneL.map((r) => <div key={r.id}>{renderSingleCard({
                  rec: r,
                  badge: leaveBadge(r),
                  dateLine: fmtDateW(r.leave_date),
                  isPending: false,
                  approverName: r.approved_by ? emps[r.approved_by]?.name : null,
                })}</div>)}
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
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {swapGroups.map((g) => g.items.length >= 2
                  ? renderBatchCard({
                      group: g,
                      badgeOf: swapBadge,
                      getDate: (r) => `${fmtDateW(r.original_date)} → ${r.swap_date ? fmtDateW(r.swap_date) : "待定"}`,
                      onBatchOk: approveSwaps,
                      onBatchNo: (ids) => openReject("swap", ids),
                      onItemOk: approveSwaps,
                      onItemNo: (id) => openReject("swap", id),
                    })
                  : <div key={g.items[0].id}>{renderSingleCard({
                      rec: g.items[0],
                      badge: swapBadge(g.items[0]),
                      dateLine: `${fmtDateW(g.items[0].original_date)} → ${g.items[0].swap_date ? fmtDateW(g.items[0].swap_date) : "待定"}`,
                      isPending: true,
                      onOk: () => approveSwaps(g.items[0].id),
                      onNo: () => openReject("swap", g.items[0].id),
                    })}</div>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {doneS.map((r) => <div key={r.id}>{renderSingleCard({
                  rec: r,
                  badge: swapBadge(r),
                  dateLine: `${fmtDateW(r.original_date)} → ${r.swap_date ? fmtDateW(r.swap_date) : "待定"}`,
                  isPending: false,
                  approverName: r.approved_by ? emps[r.approved_by]?.name : null,
                })}</div>)}
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
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {pendTc.map((r) => renderTransCard(r, true))}
              </div>
            </>
          ) : (
            <div style={{ padding: "14px 16px", borderRadius: 8, background: `${t.gn}10`, border: `1px solid ${t.gn}30`, color: t.gn, fontSize: 12, marginBottom: 20 }}>暂无待审批的交通费变更</div>
          )}
          {doneTc.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: t.ts, margin: "0 0 8px" }}>最近已处理（{doneTc.length}件）</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {doneTc.map((r) => renderTransCard(r, false))}
              </div>
            </>
          )}
        </div>
      )}

      {rejectModal && (
        <>
          <div onClick={closeReject} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 90 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 440, maxWidth: "92vw", background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 12, padding: 20, zIndex: 100, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.tx, marginBottom: 6 }}>驳回申请</div>
            <div style={{ fontSize: 11, color: t.tm, marginBottom: 12 }}>
              {rejectModal.ids.length === 1 ? "请填写驳回理由，申请人能看到" : `将驳回 ${rejectModal.ids.length} 条记录，同一理由应用到全部`}
            </div>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} placeholder="例：与重要课程冲突，请协调后重提"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={closeReject} disabled={rejectSub} style={{ padding: "7px 16px", borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer" }}>取消</button>
              <button onClick={confirmReject} disabled={rejectSub} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.rd, color: "#fff", fontSize: 12, fontWeight: 600, cursor: rejectSub ? "wait" : "pointer", opacity: rejectSub ? 0.7 : 1 }}>{rejectSub ? "提交中..." : "确认驳回"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
