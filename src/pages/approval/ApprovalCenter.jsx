import { useState, useEffect, useCallback, useMemo } from "react"
import { sbGet, sbPatch } from "../../api/supabase"
import { LEAVE_TYPES, fmtDateW } from "../../config/constants"
import { Palmtree, ArrowLeftRight, CheckCircle, Train, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Check, X, Clock, Calendar, FileText, CheckCircle2, XCircle, AlertCircle } from "lucide-react"

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
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectSub, setRejectSub] = useState(false)
  const [donePage, setDonePage] = useState({ leave: 0, swap: 0, trans: 0 })
  const PAGE_SIZE = 5

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
  const doneL = lr.filter((r) => r.status !== "申請中")
  const doneS = sw.filter((r) => r.status !== "申請中")
  const doneTc = tcr.filter((r) => r.status !== "申請中")

  const leaveTypeCounts = useMemo(() => {
    const m = {}
    for (const r of pendL) {
      if (r.leave_type === "振替") continue
      m[r.leave_type] = (m[r.leave_type] || 0) + 1
    }
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

  // ========== 子组件 ==========
  const Avatar = ({ name }) => (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      background: `${t.ac}20`, color: t.ac,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: 15, flexShrink: 0,
    }}>{(name || "?").slice(0, 1)}</div>
  )

  const leaveBadge = (r) => {
    const lt = LEAVE_TYPES.find((l) => l.v === r.leave_type)
    const color = lt?.c || t.tx
    const bg = (lt?.bg || t.bl)
    return (
      <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, color, background: bg, border: `1px solid ${color}33`, whiteSpace: "nowrap" }}>
        {r.leave_type}{r.is_half_day && "・半天"}
      </span>
    )
  }
  const swapBadge = (r) => {
    const swapColor = r.swap_type === "休日出勤" ? "#8B5CF6" : "#F59E0B"
    const compColor = r.compensation_type === "換休" ? "#8B5CF6" : t.rd
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, color: swapColor, background: `${swapColor}18`, border: `1px solid ${swapColor}40`, whiteSpace: "nowrap" }}>{r.swap_type}</span>
        {r.compensation_type && <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, color: compColor, background: `${compColor}15`, border: `1px solid ${compColor}40`, whiteSpace: "nowrap" }}>{r.compensation_type}</span>}
      </span>
    )
  }

  const StatusPill = ({ status }) => {
    const ok = status === "承認"
    const c = ok ? t.gn : t.rd
    const Icon = ok ? CheckCircle2 : XCircle
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: c, fontWeight: 600, fontSize: 13 }}>
        <Icon size={16} />{ok ? "已通过" : "已驳回"}
      </span>
    )
  }

  const CardHeader = ({ name, dept, time, isPending, status }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
        <Avatar name={name} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: t.tx }}>{name}</span>
            {dept && <span style={{ fontSize: 12, color: t.ts }}>{dept}</span>}
          </div>
          <div style={{ fontSize: 11, color: t.tm, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} /> {time}
          </div>
        </div>
      </div>
      {!isPending && <StatusPill status={status} />}
    </div>
  )

  const DetailPanel = ({ children }) => (
    <div style={{ background: t.bl, borderRadius: 12, padding: 14 }}>{children}</div>
  )

  const DateLine = ({ text }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.tx }}>
      <Calendar size={15} color={t.tm} />
      <span style={{ fontWeight: 500, fontFamily: "monospace" }}>{text}</span>
    </div>
  )

  const ReasonLine = ({ text }) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: t.ts, marginTop: 8 }}>
      <FileText size={15} color={t.tm} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{text}</span>
    </div>
  )

  const ActionButtons = ({ onOk, onNo, okLabel = "通过", noLabel = "驳回" }) => (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
      <button onClick={onNo} style={{
        padding: "8px 18px", borderRadius: 8, border: `1px solid ${t.rd}`, background: "transparent", color: t.rd,
        fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
      }}><X size={15} /> {noLabel}</button>
      <button onClick={onOk} style={{
        padding: "8px 20px", borderRadius: 8, border: "none", background: t.gn, color: "#fff",
        fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
        boxShadow: `0 2px 4px ${t.gn}40`,
      }}><Check size={15} /> {okLabel}</button>
    </div>
  )

  const RejectionBlock = ({ reason }) => (
    <div style={{ background: `${t.rd}10`, border: `1px solid ${t.rd}30`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: t.rd }}>
      <strong>驳回意见：</strong>{reason}
    </div>
  )

  const ApproverLine = ({ name, time }) => (
    <div style={{ fontSize: 11, color: t.tm, textAlign: "right" }}>审批人：{name} · {time}</div>
  )

  const cardShell = (isPending) => ({
    background: t.bgC,
    borderRadius: 16,
    border: `1px solid ${isPending ? t.bd : t.bl}`,
    padding: 20,
    marginBottom: 14,
    boxShadow: isPending ? "0 2px 8px rgba(0,0,0,0.03)" : "none",
    opacity: isPending ? 1 : 0.85,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  })

  // ========== 单条休假/换休卡片 ==========
  const renderSingleCard = ({ rec, badge, dateText, isPending, onOk, onNo, approverName }) => {
    const name = emps[rec.employee_id]?.name || "?"
    const dept = emps[rec.employee_id]?.department
    const time = isPending ? `提交于 ${fmtRelTime(rec.created_at)}` : `提交于 ${fmtRelTime(rec.created_at)}`
    return (
      <div style={cardShell(isPending)}>
        <CardHeader name={name} dept={dept} time={time} isPending={isPending} status={rec.status} />
        <DetailPanel>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>{badge}</div>
          <DateLine text={dateText} />
          {rec.reason && <ReasonLine text={rec.reason} />}
        </DetailPanel>
        {isPending && <ActionButtons onOk={onOk} onNo={onNo} />}
        {!isPending && rec.status === "却下" && rec.rejection_reason && <RejectionBlock reason={rec.rejection_reason} />}
        {!isPending && approverName && <ApproverLine name={approverName} time={fmtAbs(rec.approved_at)} />}
      </div>
    )
  }

  // ========== 批次卡片 ==========
  const renderBatchCard = ({ group, badgeOf, getDate, onBatchOk, onBatchNo, onItemOk, onItemNo }) => {
    const { key, items } = group
    const first = items[0]
    const latest = items.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b)
    const name = emps[first.employee_id]?.name || "?"
    const dept = emps[first.employee_id]?.department
    const dates = items.map((r) => r.leave_date || r.original_date)
    const isOpen = expanded.has(key)
    return (
      <div style={cardShell(true)}>
        <CardHeader name={name} dept={dept} time={`提交于 ${fmtRelTime(latest.created_at)}`} isPending={true} />
        <DetailPanel>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            {badgeOf(first)}
            <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, color: t.rd, background: `${t.rd}15`, border: `1px solid ${t.rd}40` }}>
              {items.length} 天连休
            </span>
          </div>
          <DateLine text={fmtRange(dates)} />
          {first.reason && <ReasonLine text={first.reason} />}
        </DetailPanel>
        <ActionButtons onOk={() => onBatchOk(items.map((i) => i.id))} onNo={() => onBatchNo(items.map((i) => i.id))} okLabel="通过全部" noLabel="驳回全部" />

        <div style={{ borderTop: `1px dashed ${t.bd}`, paddingTop: 12 }}>
          <button onClick={() => toggleExpand(key)} style={{
            width: "100%", background: "none", border: "none", color: t.ac, fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer",
          }}>
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {isOpen ? "收起明细" : `展开所有 ${items.length} 条明细（支持单条处理）`}
          </button>
          {isOpen && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it) => (
                <div key={it.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
                  background: t.bgC, padding: "10px 14px", borderRadius: 8, border: `1px solid ${t.bd}`,
                }}>
                  <span style={{ fontSize: 13, color: t.tx, fontFamily: "monospace" }}>{getDate(it)}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => onItemNo(it.id)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${t.rd}`, background: "transparent", color: t.rd, fontSize: 11, cursor: "pointer", fontWeight: 500 }}>驳回</button>
                    <button onClick={() => onItemOk(it.id)} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: t.gn, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>通过</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ========== 交通费卡片 ==========
  const renderTransCard = (r, isPending) => {
    const name = emps[r.employee_id]?.name || "?"
    const dept = emps[r.employee_id]?.department
    const approverName = r.approved_by ? emps[r.approved_by]?.name : null
    return (
      <div key={r.id} style={cardShell(isPending)}>
        <CardHeader name={name} dept={dept} time={`提交于 ${fmtRelTime(r.created_at)}`} isPending={isPending} status={r.status} />
        <DetailPanel>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: t.ts, marginBottom: 2 }}>原金额</div>
              <div style={{ fontSize: 15, color: t.ts, textDecoration: "line-through", fontFamily: "monospace" }}>¥{Number(r.previous_amount).toLocaleString()}</div>
            </div>
            <div style={{ color: t.ac, fontSize: 18 }}>→</div>
            <div>
              <div style={{ fontSize: 11, color: t.ac, fontWeight: 600, marginBottom: 2 }}>申请金额</div>
              <div style={{ fontSize: 20, color: t.tx, fontWeight: 700, fontFamily: "monospace" }}>¥{Number(r.requested_amount).toLocaleString()}</div>
            </div>
            <div style={{ marginLeft: "auto", paddingLeft: 16, borderLeft: `1px solid ${t.bd}`, minWidth: 140 }}>
              <div style={{ fontSize: 11, color: t.ts, marginBottom: 2 }}>生效日期</div>
              <div style={{ fontSize: 13, color: t.tx, display: "flex", alignItems: "center", gap: 5 }}>
                <Calendar size={13} color={t.tm} /> {fmtDateW(r.effective_from)}
              </div>
            </div>
          </div>
          {r.reason && <ReasonLine text={r.reason} />}
        </DetailPanel>
        {isPending && <ActionButtons onOk={() => approveTrans(r)} onNo={() => openReject("trans", r.id)} okLabel="通过并更新" />}
        {!isPending && r.status === "却下" && r.rejection_reason && <RejectionBlock reason={r.rejection_reason} />}
        {!isPending && approverName && <ApproverLine name={approverName} time={fmtAbs(r.approved_at)} />}
      </div>
    )
  }

  // ========== 筛选 chip ==========
  const filterBar = (counts, active, onPick, total) => {
    const keys = Object.keys(counts)
    if (!keys.length) return null
    return (
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 16, paddingBottom: 4, flexWrap: "wrap" }}>
        <button onClick={() => onPick(null)} style={{
          padding: "6px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
          background: !active ? `${t.ac}15` : t.bgC, color: !active ? t.ac : t.ts,
          border: `1px solid ${!active ? t.ac : t.bd}`, fontWeight: !active ? 600 : 400, whiteSpace: "nowrap",
        }}>全部 {total}</button>
        {keys.map((k) => {
          const on = active === k
          return (
            <button key={k} onClick={() => onPick(on ? null : k)} style={{
              padding: "6px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              background: on ? `${t.ac}15` : t.bgC, color: on ? t.ac : t.ts,
              border: `1px solid ${on ? t.ac : t.bd}`, fontWeight: on ? 600 : 400, whiteSpace: "nowrap",
            }}>{k} {counts[k]}</button>
          )
        })}
      </div>
    )
  }

  // ========== tab 定义 ==========
  const tabsDef = [
    { key: "leave", label: "休假申请", icon: Palmtree, badge: pendL.length },
    { key: "swap", label: "换休申请", icon: ArrowLeftRight, badge: pendS.length },
    { key: "trans", label: "交通费变更", icon: Train, badge: pendTc.length },
  ]

  // ========== 区块渲染 ==========
  const EmptyPending = ({ label }) => (
    <div style={{ background: `${t.gn}10`, padding: 32, borderRadius: 14, textAlign: "center", color: t.gn, border: `1px dashed ${t.gn}40` }}>
      <CheckCircle2 size={30} style={{ margin: "0 auto 10px", opacity: 0.85 }} />
      <div style={{ fontSize: 13 }}>暂无待审批的{label}</div>
    </div>
  )

  const SectionTitle = ({ icon: Icon, text, color }) => (
    <h3 style={{ fontSize: 14, fontWeight: 600, color: color || t.ts, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
      {Icon && <Icon size={16} color={color || t.wn} />} {text}
    </h3>
  )

  const Pager = ({ total, page, onPage }) => {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (totalPages <= 1) return null
    const safePage = Math.min(page, totalPages - 1)
    const from = safePage * PAGE_SIZE + 1
    const to = Math.min(total, (safePage + 1) * PAGE_SIZE)
    const btn = (disabled) => ({
      padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgC,
      color: disabled ? t.td : t.ts, fontSize: 12, fontWeight: 500,
      cursor: disabled ? "not-allowed" : "pointer",
      display: "inline-flex", alignItems: "center", gap: 4,
    })
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 8, flexWrap: "wrap" }}>
        <button disabled={safePage === 0} onClick={() => onPage(safePage - 1)} style={btn(safePage === 0)}>
          <ChevronLeft size={14} /> 上一页
        </button>
        <span style={{ fontSize: 12, color: t.ts, minWidth: 80, textAlign: "center" }}>
          第 <strong style={{ color: t.ac }}>{safePage + 1}</strong> / {totalPages} 页 · 共 {total} 条
        </span>
        <button disabled={safePage >= totalPages - 1} onClick={() => onPage(safePage + 1)} style={btn(safePage >= totalPages - 1)}>
          下一页 <ChevronRight size={14} />
        </button>
      </div>
    )
  }

  const slicePage = (arr, page) => arr.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const setPage = (key, p) => setDonePage((prev) => ({ ...prev, [key]: Math.max(0, p) }))

  const totalPending = pendL.length + pendS.length + pendTc.length

  return (
    <div>
      {/* 标题栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <CheckCircle size={22} strokeWidth={1.8} color={t.tx} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: t.tx, margin: 0 }}>承认中心</h2>
        {totalPending > 0 && (
          <span style={{ fontSize: 12, fontWeight: 500, background: t.wn, color: "#fff", padding: "3px 12px", borderRadius: 12 }}>
            待审批 {totalPending}
          </span>
        )}
      </div>

      {/* Tab 栏 */}
      <div style={{ display: "flex", gap: 24, marginBottom: 20, borderBottom: `2px solid ${t.bd}`, flexWrap: "wrap" }}>
        {tabsDef.map((tb) => {
          const Icon = tb.icon
          const active = tab === tb.key
          return (
            <div key={tb.key} onClick={() => setTab(tb.key)} style={{
              paddingBottom: 12, cursor: "pointer", position: "relative",
              color: active ? t.ac : t.ts, fontWeight: active ? 700 : 500,
              fontSize: 14, display: "flex", alignItems: "center", gap: 6,
            }}>
              <Icon size={16} />
              {tb.label}
              {tb.badge > 0 && (
                <span style={{
                  marginLeft: 4, background: active ? t.ac : t.tm, color: "#fff",
                  fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 10,
                }}>{tb.badge}</span>
              )}
              {active && <div style={{ position: "absolute", bottom: -2, left: 0, right: 0, height: 2, background: t.ac, borderRadius: 2 }} />}
            </div>
          )
        })}
      </div>

      {/* 休假 tab */}
      {tab === "leave" && (
        <div>
          <SectionTitle icon={AlertCircle} text={`待审批事项（${pendL.length}件）`} color={t.ts} />
          {pendL.length > 0 ? (
            <>
              {filterBar(leaveTypeCounts, leaveTypeFilter, setLeaveTypeFilter, pendL.length)}
              <div style={{ marginBottom: 32 }}>
                {leaveGroups.map((g) => g.items.length >= 2
                  ? <div key={g.key}>{renderBatchCard({
                      group: g,
                      badgeOf: leaveBadge,
                      getDate: (r) => fmtDateW(r.leave_date),
                      onBatchOk: approveLeaves,
                      onBatchNo: (ids) => openReject("leave", ids),
                      onItemOk: approveLeaves,
                      onItemNo: (id) => openReject("leave", id),
                    })}</div>
                  : <div key={g.items[0].id}>{renderSingleCard({
                      rec: g.items[0],
                      badge: leaveBadge(g.items[0]),
                      dateText: fmtDateW(g.items[0].leave_date),
                      isPending: true,
                      onOk: () => approveLeaves(g.items[0].id),
                      onNo: () => openReject("leave", g.items[0].id),
                    })}</div>
                )}
                {leaveGroups.length === 0 && (
                  <div style={{ padding: "14px 16px", borderRadius: 10, color: t.tm, fontSize: 13, textAlign: "center", background: t.bl }}>该类型暂无待审批</div>
                )}
              </div>
            </>
          ) : <div style={{ marginBottom: 32 }}><EmptyPending label="休假申请" /></div>}

          {doneL.length > 0 && (
            <>
              <SectionTitle text={`最近已处理（${doneL.length}件）`} color={t.ts} />
              {slicePage(doneL, donePage.leave).map((r) => <div key={r.id}>{renderSingleCard({
                rec: r,
                badge: leaveBadge(r),
                dateText: fmtDateW(r.leave_date),
                isPending: false,
                approverName: r.approved_by ? emps[r.approved_by]?.name : null,
              })}</div>)}
              <Pager total={doneL.length} page={donePage.leave} onPage={(p) => setPage("leave", p)} />
            </>
          )}
        </div>
      )}

      {/* 换休 tab */}
      {tab === "swap" && (
        <div>
          <SectionTitle icon={AlertCircle} text={`待审批事项（${pendS.length}件）`} color={t.ts} />
          {pendS.length > 0 ? (
            <>
              {filterBar(swapTypeCounts, swapTypeFilter, setSwapTypeFilter, pendS.length)}
              <div style={{ marginBottom: 32 }}>
                {swapGroups.map((g) => g.items.length >= 2
                  ? <div key={g.key}>{renderBatchCard({
                      group: g,
                      badgeOf: swapBadge,
                      getDate: (r) => `${fmtDateW(r.original_date)} → ${r.swap_date ? fmtDateW(r.swap_date) : "待定"}`,
                      onBatchOk: approveSwaps,
                      onBatchNo: (ids) => openReject("swap", ids),
                      onItemOk: approveSwaps,
                      onItemNo: (id) => openReject("swap", id),
                    })}</div>
                  : <div key={g.items[0].id}>{renderSingleCard({
                      rec: g.items[0],
                      badge: swapBadge(g.items[0]),
                      dateText: `${fmtDateW(g.items[0].original_date)} → ${g.items[0].swap_date ? fmtDateW(g.items[0].swap_date) : "待定"}`,
                      isPending: true,
                      onOk: () => approveSwaps(g.items[0].id),
                      onNo: () => openReject("swap", g.items[0].id),
                    })}</div>
                )}
                {swapGroups.length === 0 && (
                  <div style={{ padding: "14px 16px", borderRadius: 10, color: t.tm, fontSize: 13, textAlign: "center", background: t.bl }}>该类型暂无待审批</div>
                )}
              </div>
            </>
          ) : <div style={{ marginBottom: 32 }}><EmptyPending label="换休申请" /></div>}

          {doneS.length > 0 && (
            <>
              <SectionTitle text={`最近已处理（${doneS.length}件）`} color={t.ts} />
              {slicePage(doneS, donePage.swap).map((r) => <div key={r.id}>{renderSingleCard({
                rec: r,
                badge: swapBadge(r),
                dateText: `${fmtDateW(r.original_date)} → ${r.swap_date ? fmtDateW(r.swap_date) : "待定"}`,
                isPending: false,
                approverName: r.approved_by ? emps[r.approved_by]?.name : null,
              })}</div>)}
              <Pager total={doneS.length} page={donePage.swap} onPage={(p) => setPage("swap", p)} />
            </>
          )}
        </div>
      )}

      {/* 交通费 tab */}
      {tab === "trans" && (
        <div>
          <SectionTitle icon={AlertCircle} text={`待审批事项（${pendTc.length}件）`} color={t.ts} />
          {pendTc.length > 0 ? (
            <div style={{ marginBottom: 32 }}>
              {pendTc.map((r) => renderTransCard(r, true))}
            </div>
          ) : <div style={{ marginBottom: 32 }}><EmptyPending label="交通费变更" /></div>}

          {doneTc.length > 0 && (
            <>
              <SectionTitle text={`最近已处理（${doneTc.length}件）`} color={t.ts} />
              {slicePage(doneTc, donePage.trans).map((r) => renderTransCard(r, false))}
              <Pager total={doneTc.length} page={donePage.trans} onPage={(p) => setPage("trans", p)} />
            </>
          )}
        </div>
      )}

      {/* 驳回 Modal */}
      {rejectModal && (
        <>
          <div onClick={closeReject} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 90 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 480, maxWidth: "92vw", background: t.bgC, borderRadius: 18, padding: 24, zIndex: 100, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <h3 style={{ margin: "0 0 6px", color: t.tx, fontSize: 17, fontWeight: 700 }}>
              驳回申请 {rejectModal.ids.length > 1 && <span style={{ color: t.rd, fontSize: 13 }}>（批量 {rejectModal.ids.length} 条）</span>}
            </h3>
            <div style={{ fontSize: 12, color: t.ts, marginBottom: 16 }}>
              {rejectModal.ids.length === 1 ? "请填写驳回理由，申请人能看到" : "同一理由将应用到所有选中的记录"}
            </div>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4}
              placeholder="填写驳回理由（选填，将反馈给员工）"
              style={{
                width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx,
                fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", resize: "none", marginBottom: 20,
              }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={closeReject} disabled={rejectSub} style={{ padding: "9px 20px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.tx, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>取消</button>
              <button onClick={confirmReject} disabled={rejectSub} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: t.rd, color: "#fff", fontSize: 13, fontWeight: 600, cursor: rejectSub ? "wait" : "pointer", opacity: rejectSub ? 0.7 : 1 }}>{rejectSub ? "提交中..." : "确认驳回"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
