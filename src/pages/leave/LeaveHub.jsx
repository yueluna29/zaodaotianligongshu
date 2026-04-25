import { useState, useEffect, useCallback } from "react"
import {
  CalendarDays, CalendarPlus, Briefcase, Users, ShieldAlert,
  Clock, CheckCircle2, AlertCircle, FileClock, Info,
  History, X, Send, Activity, Pencil, RefreshCw,
} from "lucide-react"
import { isSuperAdmin } from "../../config/constants"
import { sbGet, sbPost, sbRpc } from "../../api/supabase"
import DateMultiPicker from "../../components/DateMultiPicker"

const POOL_LABEL = { "年假": "带薪年假", "红日补休": "红日补休", "代休": "代休余额" }

const MOCK_ME = {
  name: "Luna",
  balances: {
    paid: {
      total: 15, used: 2, remain: 13, mandatory: 3, carryOver: 5,
      timeline: [
        { month: "入职6个月",  days: 10, date: "2024-10-01", status: "past" },
        { month: "1年半",      days: 11, date: "2025-10-01", status: "past" },
        { month: "2年半",      days: 12, date: "2026-10-01", status: "next" },
        { month: "3年半",      days: 14, date: "2027-10-01", status: "future" },
      ],
    },
    redDay: {
      earned: 3, used: 1, remain: 2,
      details: [
        { id: 1, date: "2026-01-01", name: "元日",          rule: "定休日 (水曜)",  calc: "+1" },
        { id: 2, date: "2026-02-11", name: "建国記念の日",  rule: "定休日 (水曜)",  calc: "+1" },
        { id: 3, date: "2026-03-20", name: "春分の日",      rule: "工作日出勤",     calc: "+1" },
      ],
    },
    comp: {
      earned: 2, used: 1, remain: 1, expiringIn: 5,
      details: [
        { id: 1, sourceDate: "2026-04-10 (土)", reason: "周末展会支援",   deadline: "2026-05-10", daysLeft: 5,  status: "warning" },
        { id: 2, sourceDate: "2026-03-15 (日)", reason: "服务器紧急维护", deadline: "2026-04-15", daysLeft: -3, status: "expired" },
      ],
    },
  },
  history: [
    { id: 1, date: "2026-04-18", type: "年假 (全天)",   pool: "年假", status: "已通过" },
    { id: 2, date: "2026-03-20", type: "红日补休 (全天)", pool: "红日", status: "已通过" },
    { id: 3, date: "2026-05-01", type: "年假 (半天)",   pool: "年假", status: "申请中" },
  ],
}

const MOCK_TEAM = [
  { id: "E01", name: "Luna",  paid: 13, mandatory: 3, redDay: 2, comp: 1, usedTotal: 3 },
  { id: "E02", name: "Ryan",  paid: 20, mandatory: 0, redDay: 0, comp: 0, usedTotal: 8 },
  { id: "E03", name: "Peter", paid: 5,  mandatory: 5, redDay: 1, comp: 2, usedTotal: 0 },
]

export default function LeaveHub({ user, t, tk }) {
  const isAdmin = user?.role === "admin"
  const isSA = isSuperAdmin(user)
  const canManage = isAdmin || isSA
  const [view, setView] = useState("my_dashboard")
  const [adjustModal, setAdjustModal] = useState(null)
  const [detailModal, setDetailModal] = useState(null)
  const [teamRows, setTeamRows] = useState(null)
  const [teamLoading, setTeamLoading] = useState(false)
  const [adjFm, setAdjFm] = useState({ sign: "+", days: "", reason: "" })
  const [adjSub, setAdjSub] = useState(false)
  const [adjError, setAdjError] = useState("")

  const loadTeam = useCallback(async () => {
    if (!canManage) return
    setTeamLoading(true)
    const emps = await sbGet(
      `employees?is_active=eq.true&employment_type=in.(正社員,契約社員,正社员)&order=name&select=id,name,employment_type`,
      tk
    )
    const summaries = await Promise.all(
      (emps || []).map((e) => sbRpc("get_leave_summary", { p_employee_id: e.id }, tk))
    )
    setTeamRows((emps || []).map((e, i) => ({ id: e.id, name: e.name, summary: summaries[i] })))
    setTeamLoading(false)
  }, [canManage, tk])

  useEffect(() => {
    if (view === "admin_team" && canManage && teamRows === null) loadTeam()
  }, [view, canManage, teamRows, loadTeam])

  const openAdjust = (emp, pool) => {
    setAdjFm({ sign: "+", days: "", reason: "" })
    setAdjError("")
    setAdjustModal({ emp, pool })
  }

  const submitAdjust = async () => {
    if (!adjustModal) return
    const days = parseFloat(adjFm.days)
    if (!days || days <= 0) { setAdjError("天数必须大于 0"); return }
    if (!adjFm.reason.trim()) { setAdjError("理由必填"); return }
    setAdjSub(true); setAdjError("")
    const signed = adjFm.sign === "+" ? days : -days
    const today = new Date().toISOString().slice(0, 10)
    const res = await sbPost("leave_balance_adjustments", {
      employee_id: adjustModal.emp.id,
      pool_type: adjustModal.pool,
      adjustment_days: signed,
      reason: adjFm.reason.trim(),
      adjusted_by: user.id,
      effective_date: today,
    }, tk)
    setAdjSub(false)
    if (res?.code || res?.message) { setAdjError(res.message || "保存失败"); return }
    setAdjustModal(null)
    setTeamRows(null)
    if (view === "admin_team") loadTeam()
  }

  const card = {
    background: t.bgC,
    border: `1px solid ${t.bd}`,
    borderRadius: 18,
    boxShadow: `0 10px 40px -15px ${t.ac}22`,
  }
  const inputS = {
    padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.bd}`,
    background: t.bgI, color: t.tx, fontSize: 13, fontFamily: "inherit",
  }

  return (
    <div>
      <div style={{ ...card, padding: "12px 18px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: t.ac, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <CalendarDays size={18} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.tx, letterSpacing: "-0.01em" }}>假期管理 Hub</div>
            <div style={{ fontSize: 10, color: t.tm, marginTop: 2 }}>{user?.name}</div>
          </div>
        </div>

        <div style={{ display: "flex", background: t.bgI, padding: 4, borderRadius: 12, border: `1px solid ${t.bd}`, flexWrap: "wrap" }}>
          <NavTab t={t} label="我的假期"     icon={<Activity size={13} />}     active={view === "my_dashboard"} onClick={() => setView("my_dashboard")} />
          <NavTab t={t} label="休假申请"     icon={<CalendarPlus size={13} />} active={view === "apply_leave"}  onClick={() => setView("apply_leave")} />
          <NavTab t={t} label="休息日加班"   icon={<Briefcase size={13} />}    active={view === "apply_work"}   onClick={() => setView("apply_work")} />
          {canManage && (
            <>
              <div style={{ width: 1, background: t.bd, margin: "4px 6px" }} />
              <NavTab t={t} label="红日出勤" icon={<ShieldAlert size={13} />} active={view === "admin_red"}  onClick={() => setView("admin_red")} />
              <NavTab t={t} label="团队台账" icon={<Users size={13} />}       active={view === "admin_team"} onClick={() => setView("admin_team")} />
            </>
          )}
        </div>
      </div>

      {view === "my_dashboard" && <ViewMyDashboard t={t} card={card} canManage={canManage} onAdjust={(pool) => openAdjust({ id: user.id, name: user.name }, pool)} onOpenDetail={setDetailModal} />}
      {view === "apply_leave"  && <ViewApplyLeave  t={t} tk={tk} card={card} inputS={inputS} />}
      {view === "apply_work"   && <ViewApplyWork   t={t} card={card} inputS={inputS} />}
      {view === "admin_red"    && canManage && <ViewAdminRedDays t={t} card={card} inputS={inputS} />}
      {view === "admin_team"   && canManage && <ViewAdminTeam    t={t} card={card} rows={teamRows} loading={teamLoading} onRefresh={loadTeam} onAdjust={openAdjust} />}

      {adjustModal && canManage && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,.45)", backdropFilter: "blur(4px)" }} onClick={() => !adjSub && setAdjustModal(null)} />
          <div style={{ ...card, background: t.bgC, width: "100%", maxWidth: 440, padding: 22, position: "relative", zIndex: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.tx }}>余额池调整</h3>
              <button onClick={() => !adjSub && setAdjustModal(null)} style={{ padding: 6, borderRadius: "50%", border: `1px solid ${t.bd}`, background: t.bgI, color: t.ts, cursor: "pointer", display: "flex" }}><X size={14} /></button>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, background: t.bgI, padding: 12, borderRadius: 10, border: `1px solid ${t.bl}` }}>
                <div style={{ color: t.tm, fontSize: 10, marginBottom: 4 }}>目标员工</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: t.tx }}>{adjustModal.emp.name}</div>
              </div>
              <div style={{ flex: 1, background: t.bgI, padding: 12, borderRadius: 10, border: `1px solid ${t.bl}` }}>
                <div style={{ color: t.tm, fontSize: 10, marginBottom: 4 }}>目标余额池</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: t.ac }}>{POOL_LABEL[adjustModal.pool] || adjustModal.pool}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <select value={adjFm.sign} onChange={(e) => setAdjFm((p) => ({ ...p, sign: e.target.value }))} style={{ ...inputS, flex: 1 }}>
                <option value="+">增加 (+)</option>
                <option value="-">减少 (-)</option>
              </select>
              <input type="number" min="0" step="0.5" placeholder="天数" value={adjFm.days} onChange={(e) => setAdjFm((p) => ({ ...p, days: e.target.value }))} style={{ ...inputS, flex: 1 }} />
            </div>

            <textarea placeholder="操作理由（必填，例如：前期系统故障补偿）" rows={3} value={adjFm.reason} onChange={(e) => setAdjFm((p) => ({ ...p, reason: e.target.value }))} style={{ ...inputS, width: "100%", resize: "none", boxSizing: "border-box", marginBottom: 12 }} />

            {adjError && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: `${t.rd}15`, color: t.rd, fontSize: 11, fontWeight: 600 }}>{adjError}</div>}

            <button onClick={submitAdjust} disabled={adjSub} style={{ width: "100%", padding: 12, borderRadius: 10, background: t.ac, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: adjSub ? "wait" : "pointer", opacity: adjSub ? 0.6 : 1, fontFamily: "inherit" }}>
              {adjSub ? "保存中…" : "确认并记录"}
            </button>
          </div>
        </div>
      )}

      {detailModal === "redDay" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,.45)", backdropFilter: "blur(4px)" }} onClick={() => setDetailModal(null)} />
          <div style={{ ...card, background: t.bgC, width: "100%", maxWidth: 520, padding: 22, position: "relative", zIndex: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 7 }}><ShieldAlert size={16} color={t.rd} /> 红日补休 · 获得明细</h3>
              <button onClick={() => setDetailModal(null)} style={{ padding: 6, borderRadius: "50%", border: `1px solid ${t.bd}`, background: t.bgI, color: t.ts, cursor: "pointer", display: "flex" }}><X size={14} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
              {MOCK_ME.balances.redDay.details.map((d) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: t.bgI, borderRadius: 10, border: `1px solid ${t.bl}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: t.tx, display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace" }}>
                      {d.date} <span style={{ color: t.rd, fontFamily: "inherit" }}>{d.name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: t.tm, marginTop: 4 }}>条件: {d.rule}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: t.rd, fontSize: 14, background: `${t.rd}15`, padding: "4px 10px", borderRadius: 7 }}>
                    {d.calc} 天
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {detailModal === "compDay" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,.45)", backdropFilter: "blur(4px)" }} onClick={() => setDetailModal(null)} />
          <div style={{ ...card, background: t.bgC, width: "100%", maxWidth: 560, padding: 22, position: "relative", zIndex: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 7 }}><FileClock size={16} color={t.gn} /> 代休余额 · 明细 & 倒计时</h3>
              <button onClick={() => setDetailModal(null)} style={{ padding: 6, borderRadius: "50%", border: `1px solid ${t.bd}`, background: t.bgI, color: t.ts, cursor: "pointer", display: "flex" }}><X size={14} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
              {MOCK_ME.balances.comp.details.map((d) => {
                const expired = d.status === "expired"
                const warn = d.daysLeft <= 7 && !expired
                return (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", background: t.bgI, borderRadius: 10, border: `1px solid ${warn ? `${t.rd}40` : t.bl}`, opacity: expired ? 0.55 : 1 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12, color: t.tx, marginBottom: 4 }}>来源: {d.sourceDate}</div>
                      <div style={{ fontSize: 11, color: t.ts }}>事由: {d.reason}</div>
                      <div style={{ fontSize: 10, color: t.tm, marginTop: 4 }}>Deadline: <span style={{ fontFamily: "monospace" }}>{d.deadline}</span></div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {expired ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.tm, display: "inline-flex", alignItems: "center", gap: 4 }}><X size={13} /> 已失效</span>
                      ) : (
                        <div style={{ background: warn ? `${t.rd}15` : `${t.gn}15`, color: warn ? t.rd : t.gn, padding: "7px 12px", borderRadius: 9, display: "flex", flexDirection: "column", alignItems: "center", border: `1px solid ${warn ? t.rd : t.gn}30` }}>
                          <span style={{ fontSize: 9, fontWeight: 700 }}>剩余时间</span>
                          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1, marginTop: 2 }}>{d.daysLeft} 天</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NavTab({ t, label, icon, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9,
      border: "none", background: active ? t.sa : "transparent", fontSize: 12,
      fontWeight: active ? 700 : 500, color: active ? t.sat : t.ts, cursor: "pointer",
      fontFamily: "inherit", transition: "all .15s",
    }}>
      {icon} {label}
    </button>
  )
}

function ViewMyDashboard({ t, card, canManage, onAdjust, onOpenDetail }) {
  const { paid, redDay, comp } = MOCK_ME.balances

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>

        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.ac, fontWeight: 700, fontSize: 13 }}>
              <Clock size={15} strokeWidth={2.4} /> 带薪年假
            </div>
            {canManage && <button onClick={() => onAdjust("年假")} style={{ padding: 5, borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tm, cursor: "pointer", display: "flex" }}><Pencil size={11} /></button>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: t.tx, lineHeight: 1 }}>{paid.remain}</span>
            <span style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>天 剩余</span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, color: t.ts, marginBottom: 12, flexWrap: "wrap" }}>
            <span>累计发放: {paid.total}</span>
            <span>已使用: {paid.used}</span>
            <span>上年结转: {paid.carryOver}</span>
          </div>
          <div style={{ background: paid.mandatory > 0 ? `${t.wn}15` : `${t.gn}15`, borderRadius: 8, padding: "7px 11px", border: `1px solid ${paid.mandatory > 0 ? t.wn : t.gn}30`, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: paid.mandatory > 0 ? t.wn : t.gn }}>
              {paid.mandatory > 0 ? `義務残: 还需 ${paid.mandatory} 天` : "義務残: 已达标"}
            </span>
            {paid.mandatory <= 0 && <CheckCircle2 size={13} color={t.gn} />}
          </div>

          <div style={{ paddingTop: 14, borderTop: `1px dashed ${t.bd}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.ts, marginBottom: 14 }}>付与阶梯时间线</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "0 4px", position: "relative" }}>
              {paid.timeline.map((node, i) => {
                const isLast = i === paid.timeline.length - 1
                const lineColor = node.status === "past" ? t.ac : t.bd
                const dotBg    = node.status === "past" ? t.ac : t.bgC
                const dotBorder = node.status === "past" ? t.ac : node.status === "next" ? t.ac : t.bd
                const dotColor = node.status === "past" ? "#fff" : node.status === "next" ? t.ac : t.ts
                return (
                  <div key={i} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                    {!isLast && <div style={{ position: "absolute", top: 11, left: "50%", right: "-50%", height: 2, background: lineColor, zIndex: 1 }} />}
                    <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: dotBg, border: `2px solid ${dotBorder}`, color: dotColor, fontSize: 10, fontWeight: 700, zIndex: 2, position: "relative", boxShadow: node.status === "next" ? `0 0 0 4px ${t.ac}20` : "none" }}>{node.days}</div>
                    <div style={{ textAlign: "center", marginTop: 7 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: node.status === "next" ? t.ac : t.ts }}>{node.month}</div>
                      <div style={{ fontSize: 9, color: t.tm, marginTop: 2, fontFamily: "monospace" }}>{node.date}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.rd, fontWeight: 700, fontSize: 13 }}>
              <ShieldAlert size={15} strokeWidth={2.4} /> 红日补休
            </div>
            {canManage && <button onClick={() => onAdjust("红日补休")} style={{ padding: 5, borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tm, cursor: "pointer", display: "flex" }}><Pencil size={11} /></button>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: t.tx, lineHeight: 1 }}>{redDay.remain}</span>
            <span style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>天 剩余</span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, color: t.ts, marginBottom: 12 }}>
            <span>累计获得: {redDay.earned}</span>
            <span>已使用: {redDay.used}</span>
          </div>
          <button onClick={() => onOpenDetail("redDay")} style={{ width: "100%", padding: "6px 0", borderRadius: 8, fontSize: 10, color: t.ts, background: t.bgI, border: `1px solid ${t.bd}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", fontFamily: "inherit" }}>
            <Info size={11} /> 查看获得明细
          </button>
        </div>

        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.gn, fontWeight: 700, fontSize: 13 }}>
              <FileClock size={15} strokeWidth={2.4} /> 代休余额
            </div>
            {canManage && <button onClick={() => onAdjust("代休")} style={{ padding: 5, borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tm, cursor: "pointer", display: "flex" }}><Pencil size={11} /></button>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: t.tx, lineHeight: 1 }}>{comp.remain}</span>
            <span style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>天 未消化</span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, color: t.ts, marginBottom: 12 }}>
            <span>累计获得: {comp.earned}</span>
            <span>已使用: {comp.used}</span>
          </div>
          <div style={{ background: `${t.rd}15`, borderRadius: 8, padding: "7px 11px", border: `1px solid ${t.rd}30`, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <AlertCircle size={13} color={t.rd} />
            <span style={{ fontSize: 10, fontWeight: 700, color: t.rd }}>有 1 天将在 {comp.expiringIn} 天后过期！</span>
          </div>
          <button onClick={() => onOpenDetail("compDay")} style={{ width: "100%", padding: "6px 0", borderRadius: 8, fontSize: 10, color: t.ts, background: t.bgI, border: `1px solid ${t.bd}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", fontFamily: "inherit" }}>
            <Clock size={11} /> 查看 Deadlines
          </button>
        </div>
      </div>

      <div style={{ ...card, padding: 18 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}><History size={14} /> 本年度使用记录</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: t.bgI }}>
                <th style={{ padding: "10px 12px", textAlign: "left", color: t.tm, fontWeight: 600, borderBottom: `1px solid ${t.bd}` }}>日期</th>
                <th style={{ padding: "10px 12px", textAlign: "left", color: t.tm, fontWeight: 600, borderBottom: `1px solid ${t.bd}` }}>假期类型</th>
                <th style={{ padding: "10px 12px", textAlign: "left", color: t.tm, fontWeight: 600, borderBottom: `1px solid ${t.bd}` }}>扣除额度池</th>
                <th style={{ padding: "10px 12px", textAlign: "left", color: t.tm, fontWeight: 600, borderBottom: `1px solid ${t.bd}` }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_ME.history.map((h, i) => {
                const poolColor = h.pool === "年假" ? t.ac : h.pool === "红日" ? t.rd : t.gn
                return (
                  <tr key={h.id} style={{ background: i % 2 === 0 ? "transparent" : t.bgI }}>
                    <td style={{ padding: "10px 12px", color: t.tx, fontWeight: 600, fontFamily: "monospace" }}>{h.date}</td>
                    <td style={{ padding: "10px 12px", color: t.ts }}>{h.type}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: `${poolColor}18`, color: poolColor, padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700 }}>{h.pool}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: h.status === "已通过" ? t.gn : t.wn, fontWeight: 700, fontSize: 11 }}>
                        {h.status === "已通过" ? <CheckCircle2 size={13} /> : <Clock size={13} />} {h.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ViewApplyLeave({ t, tk, card, inputS }) {
  const mandatoryLeft = MOCK_ME.balances.paid.mandatory
  const [pool, setPool] = useState("paid")
  const [dates, setDates] = useState([])
  const [halfMode, setHalfMode] = useState("full")

  const PoolOption = ({ value, color, title, sub, badge }) => {
    const active = pool === value
    return (
      <label style={{ display: "flex", alignItems: "center", padding: 13, borderRadius: 11, border: `1px solid ${active ? color : t.bd}`, background: active ? `${color}10` : t.bgI, cursor: "pointer", transition: "all .15s" }}>
        <input type="radio" name="pool" checked={active} onChange={() => setPool(value)} style={{ marginRight: 11, accentColor: color, transform: "scale(1.1)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
            {title} {badge && <span style={{ fontSize: 9, background: t.wn, color: "#fff", padding: "2px 6px", borderRadius: 4 }}>{badge}</span>}
          </div>
          <div style={{ fontSize: 10, color: t.tm, marginTop: 2 }}>{sub}</div>
        </div>
      </label>
    )
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", ...card, padding: 26 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: t.tx, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}><CalendarPlus color={t.ac} size={20} /> 提交休假申请</h2>

      {mandatoryLeft > 0 && (
        <div style={{ background: `${t.wn}12`, border: `1px solid ${t.wn}40`, borderRadius: 11, padding: 14, marginBottom: 20, display: "flex", gap: 11 }}>
          <AlertCircle color={t.wn} size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 700, color: t.wn, fontSize: 12, marginBottom: 3 }}>義務残提醒</div>
            <div style={{ fontSize: 11, color: t.ts, lineHeight: 1.5 }}>
              你今年还有 <strong style={{ color: t.wn }}>{mandatoryLeft} 天</strong> 待消化的带薪假。建议优先选择「年假」池子把它用掉。
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>选择休假日期（可多选，点格子选取）</label>
          <DateMultiPicker selected={dates} onChange={setDates} t={t} tk={tk} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <select value={halfMode} onChange={(e) => setHalfMode(e.target.value)} style={{ ...inputS, width: "fit-content" }}>
              <option value="full">以上日期皆为 全天休假</option>
              <option value="am">以上日期皆为 上午半天</option>
              <option value="pm">以上日期皆为 下午半天</option>
            </select>
            <span style={{ fontSize: 11, color: t.tm }}>已选 <strong style={{ color: t.ac }}>{dates.length}</strong> 天</span>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>扣除额度池</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <PoolOption value="paid" color={t.ac} title="带薪年假" sub="剩余: 13 天" badge={mandatoryLeft > 0 ? "优先" : null} />
            <PoolOption value="red"  color={t.rd} title="红日补休" sub="剩余: 2 天" />
            <PoolOption value="comp" color={t.gn} title="代休 (休息日加班补偿)" sub="剩余: 1 天 (14天内有过期风险)" />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>理由（选填）</label>
          <textarea rows={3} placeholder="处理私事" style={{ ...inputS, width: "100%", resize: "none", boxSizing: "border-box" }} />
        </div>

        <button disabled={!dates.length} style={{ padding: 13, borderRadius: 11, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: dates.length ? "pointer" : "not-allowed", marginTop: 4, fontFamily: "inherit", opacity: dates.length ? 1 : 0.5 }}>
          <Send size={14} /> 提交申请{dates.length > 0 && `（共 ${dates.length} 天）`}
        </button>
      </div>
    </div>
  )
}

function ViewApplyWork({ t, card, inputS }) {
  const [compMethod, setCompMethod] = useState("pool")

  const CompOption = ({ value, title, sub, expand }) => {
    const active = compMethod === value
    return (
      <label style={{ display: "flex", alignItems: "flex-start", padding: 13, borderRadius: 11, border: `1px solid ${active ? t.ac : t.bd}`, background: active ? `${t.ac}10` : t.bgI, cursor: "pointer" }}>
        <input type="radio" name="comp" checked={active} onChange={() => setCompMethod(value)} style={{ marginRight: 11, marginTop: 2, accentColor: t.ac, transform: "scale(1.1)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: t.tx }}>{title}</div>
          <div style={{ fontSize: 10, color: t.tm, marginTop: 2 }}>{sub}</div>
          {active && expand}
        </div>
      </label>
    )
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", ...card, padding: 26 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: t.tx, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}><Briefcase color={t.gn} size={20} /> 提交休息日出勤申请</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>预计出勤日</label>
          <input type="date" style={{ ...inputS, width: "100%", boxSizing: "border-box" }} />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>选择补偿方式</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <CompOption value="pool" title="换休（未定）→ 存入代休池" sub="获得 1 天代休余额，日后再决定哪天休。" />
            <CompOption
              value="swap"
              title="换休（指定日期）"
              sub="直接配对，指定将来某天休息。"
              expand={<input type="date" style={{ ...inputS, marginTop: 8, width: "100%", boxSizing: "border-box", borderColor: t.ac }} />}
            />
            <CompOption value="pay" title="作为加班费发放" sub="不进代休池，直接换算成加班费发了。" />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>工作内容/理由</label>
          <textarea rows={3} placeholder="为应对突发活动等" style={{ ...inputS, width: "100%", resize: "none", boxSizing: "border-box" }} />
        </div>

        <button style={{ padding: 13, borderRadius: 11, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", marginTop: 4, fontFamily: "inherit" }}>
          <Send size={14} /> 提交申请
        </button>
      </div>
    </div>
  )
}

function ViewAdminRedDays({ t, card, inputS }) {
  const rows = [
    { holiday: "5/3 宪法纪念日", emp: "Luna",  base: "工作日 (周三)", actual: "打卡出勤了",            verdict: { txt: "+1 红日补休获得", color: t.rd } },
    { holiday: "5/3 宪法纪念日", emp: "Ryan",  base: "休息日 (周日)", actual: "在家睡觉",              verdict: { txt: "无变动",          color: t.tm } },
    { holiday: "5/4 绿之日",     emp: "Peter", base: "工作日 (周四)", actual: "没来打卡 (正常休节假日)", verdict: { txt: "无变动 (红日正常休息)", color: t.tm } },
  ]

  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: t.tx, margin: 0, display: "flex", alignItems: "center", gap: 7 }}><ShieldAlert color={t.rd} size={18} /> 节假日出勤一览（自动生成）</h2>
          <p style={{ fontSize: 11, color: t.tm, margin: "4px 0 0" }}>系统根据排班表和打卡记录，自动推算红日子的出勤和补休状态，零手工操作。</p>
        </div>
        <select style={inputS}>
          <option>2026年 5月 (黄金周)</option>
          <option>2026年 4月</option>
        </select>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 720 }}>
          <thead>
            <tr style={{ background: t.bgI }}>
              <th style={{ padding: 11, textAlign: "left", color: t.ts, borderBottom: `2px solid ${t.bd}` }}>节假日名称 (日期)</th>
              <th style={{ padding: 11, textAlign: "left", color: t.ts, borderBottom: `2px solid ${t.bd}` }}>员工姓名</th>
              <th style={{ padding: 11, textAlign: "left", color: t.ts, borderBottom: `2px solid ${t.bd}` }}>原定排班</th>
              <th style={{ padding: 11, textAlign: "left", color: t.ts, borderBottom: `2px solid ${t.bd}` }}>实际打卡/操作</th>
              <th style={{ padding: 11, textAlign: "left", color: t.ts, borderBottom: `2px solid ${t.bd}` }}>系统判定结果</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${t.bl}`, background: i % 2 === 0 ? "transparent" : t.bgI }}>
                <td style={{ padding: 11, fontWeight: 600, color: t.tx }}>{r.holiday}</td>
                <td style={{ padding: 11, fontWeight: 600, color: t.tx }}>{r.emp}</td>
                <td style={{ padding: 11, color: t.tm }}>{r.base}</td>
                <td style={{ padding: 11, color: t.tx }}>{r.actual}</td>
                <td style={{ padding: 11 }}>
                  <span style={{ background: r.verdict.color === t.tm ? "transparent" : `${r.verdict.color}15`, color: r.verdict.color, padding: r.verdict.color === t.tm ? 0 : "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>
                    {r.verdict.txt}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ViewAdminTeam({ t, card, rows, loading, onRefresh, onAdjust }) {
  const Cell = ({ value, color, onClick }) => (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${color}10`, padding: "4px 10px", borderRadius: 8, border: `1px solid ${color}25` }}>
      <span style={{ fontWeight: 700, fontSize: 13, color: t.tx }}>{value}</span>
      <button onClick={onClick} style={{ padding: 3, borderRadius: 5, color, background: "transparent", border: "none", cursor: "pointer", display: "flex" }}><Pencil size={11} /></button>
    </div>
  )

  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: t.tx, margin: 0, display: "flex", alignItems: "center", gap: 7 }}><Users color={t.ac} size={18} /> 团队假期台账</h2>
          <p style={{ fontSize: 11, color: t.tm, margin: "4px 0 0" }}>点击铅笔图标手动调整余额，会写入该员工的调整记录表。</p>
        </div>
        <button onClick={onRefresh} disabled={loading} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.ts, fontSize: 11, fontWeight: 600, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={12} /> {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {rows === null && <div style={{ textAlign: "center", padding: 30, color: t.tm, fontSize: 12 }}>加载中…</div>}
      {rows && rows.length === 0 && <div style={{ textAlign: "center", padding: 30, color: t.tm, fontSize: 12 }}>暂无在职正/契社员</div>}

      {rows && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 760 }}>
            <thead>
              <tr style={{ background: t.bgI }}>
                <th style={{ padding: 11, textAlign: "left",   color: t.ts, borderBottom: `2px solid ${t.bd}` }}>员工姓名</th>
                <th style={{ padding: 11, textAlign: "center", color: t.ac, borderBottom: `2px solid ${t.bd}` }}>年假剩余</th>
                <th style={{ padding: 11, textAlign: "center", color: t.wn, borderBottom: `2px solid ${t.bd}` }}>義務残</th>
                <th style={{ padding: 11, textAlign: "center", color: t.rd, borderBottom: `2px solid ${t.bd}` }}>红日补休</th>
                <th style={{ padding: 11, textAlign: "center", color: t.gn, borderBottom: `2px solid ${t.bd}` }}>代休剩余</th>
                <th style={{ padding: 11, textAlign: "right",  color: t.ts, borderBottom: `2px solid ${t.bd}` }}>本年已用合计</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const s = row.summary || {}
                const paid    = s.paid_leave || {}
                const red     = s.holiday_comp || {}
                const comp    = s.comp_leave || {}
                const mandRem = paid.mandatory_remaining ?? 0
                const usedAll = (Number(paid.used) || 0) + (Number(red.used) || 0) + (Number(comp.used) || 0)
                return (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${t.bl}`, background: i % 2 === 0 ? "transparent" : t.bgI }}>
                    <td style={{ padding: 11, fontWeight: 700, color: t.tx }}>{row.name}</td>
                    <td style={{ padding: 11, textAlign: "center" }}><Cell value={paid.balance ?? 0} color={t.ac} onClick={() => onAdjust({ id: row.id, name: row.name }, "年假")} /></td>
                    <td style={{ padding: 11, textAlign: "center" }}>
                      {mandRem > 0
                        ? <span style={{ background: `${t.wn}15`, color: t.wn, padding: "4px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>剩余 {mandRem} 天</span>
                        : <span style={{ color: t.gn, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={13} /> 已达标</span>
                      }
                    </td>
                    <td style={{ padding: 11, textAlign: "center" }}><Cell value={red.balance  ?? 0} color={t.rd} onClick={() => onAdjust({ id: row.id, name: row.name }, "红日补休")} /></td>
                    <td style={{ padding: 11, textAlign: "center" }}><Cell value={comp.balance ?? 0} color={t.gn} onClick={() => onAdjust({ id: row.id, name: row.name }, "代休")} /></td>
                    <td style={{ padding: 11, textAlign: "right", fontWeight: 700, color: t.tm }}>{usedAll} 天</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
