import { useState, useEffect, useCallback } from "react"
import {
  CalendarDays, CalendarPlus, Briefcase, Users, ShieldAlert,
  Clock, CheckCircle2, AlertCircle, FileClock, Info,
  History, X, Send, Activity, Pencil, RefreshCw,
} from "lucide-react"
import { isSuperAdmin, sortByName } from "../../config/constants"
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
  const [mobile, setMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768)
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])
  const [teamRows, setTeamRows] = useState(null)
  const [teamLoading, setTeamLoading] = useState(false)
  const [adjFm, setAdjFm] = useState({ sign: "+", days: "", reason: "" })
  const [adjSub, setAdjSub] = useState(false)
  const [adjError, setAdjError] = useState("")
  const [mySummary, setMySummary] = useState(null)
  const [myHistory, setMyHistory] = useState(null)
  const [myLoading, setMyLoading] = useState(false)

  const loadMy = useCallback(async () => {
    setMyLoading(true)
    const yearStart = `${new Date().getFullYear()}-01-01`
    const [summary, history] = await Promise.all([
      sbRpc("get_leave_summary", { p_employee_id: user.id }, tk),
      sbGet(
        `leave_requests?employee_id=eq.${user.id}&leave_date=gte.${yearStart}&order=leave_date.desc&select=id,leave_date,leave_type,pool_source,is_half_day,status,reason`,
        tk
      ),
    ])
    setMySummary(summary)
    setMyHistory(history || [])
    setMyLoading(false)
  }, [user.id, tk])

  useEffect(() => { loadMy() }, [loadMy])

  const loadTeam = useCallback(async () => {
    if (!canManage) return
    setTeamLoading(true)
    const empsRaw = await sbGet(
      `employees?is_active=eq.true&employment_type=in.(正社員,契約社員,正社员)&select=id,name,furigana,pinyin,employment_type,region`,
      tk
    )
    const emps = sortByName(empsRaw || [])
    const summaries = await Promise.all(
      emps.map((e) => sbRpc("get_leave_summary", { p_employee_id: e.id }, tk))
    )
    setTeamRows(emps.map((e, i) => ({ id: e.id, name: e.name, region: e.region, summary: summaries[i] })))
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
    if (adjustModal.emp.id === user.id) loadMy()
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

        {mobile && canManage ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", background: t.bgI, padding: 4, borderRadius: 12, border: `1px solid ${t.bd}`, flexWrap: "wrap", gap: 2 }}>
              <NavTab t={t} label="我的假期"   icon={<Activity size={13} />}     active={view === "my_dashboard"} onClick={() => setView("my_dashboard")} />
              <NavTab t={t} label="休假申请"   icon={<CalendarPlus size={13} />} active={view === "apply_leave"}  onClick={() => setView("apply_leave")} />
              <NavTab t={t} label="休息日出勤" icon={<Briefcase size={13} />}    active={view === "apply_work"}   onClick={() => setView("apply_work")} />
            </div>
            <div style={{ display: "flex", background: t.bgI, padding: 4, borderRadius: 12, border: `1px solid ${t.bd}`, flexWrap: "wrap", gap: 2 }}>
              <NavTab t={t} label="红日出勤" icon={<ShieldAlert size={13} />} active={view === "admin_red"}  onClick={() => setView("admin_red")} />
              <NavTab t={t} label="团队台账" icon={<Users size={13} />}       active={view === "admin_team"} onClick={() => setView("admin_team")} />
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", background: t.bgI, padding: 4, borderRadius: 12, border: `1px solid ${t.bd}`, flexWrap: "wrap" }}>
            <NavTab t={t} label="我的假期"     icon={<Activity size={13} />}     active={view === "my_dashboard"} onClick={() => setView("my_dashboard")} />
            <NavTab t={t} label="休假申请"     icon={<CalendarPlus size={13} />} active={view === "apply_leave"}  onClick={() => setView("apply_leave")} />
            <NavTab t={t} label="休息日出勤"   icon={<Briefcase size={13} />}    active={view === "apply_work"}   onClick={() => setView("apply_work")} />
            {canManage && (
              <>
                <div style={{ width: 1, background: t.bd, margin: "4px 6px" }} />
                <NavTab t={t} label="红日出勤" icon={<ShieldAlert size={13} />} active={view === "admin_red"}  onClick={() => setView("admin_red")} />
                <NavTab t={t} label="团队台账" icon={<Users size={13} />}       active={view === "admin_team"} onClick={() => setView("admin_team")} />
              </>
            )}
          </div>
        )}
      </div>

      {view === "my_dashboard" && <ViewMyDashboard t={t} card={card} canManage={canManage} summary={mySummary} history={myHistory} loading={myLoading} onRefresh={loadMy} onAdjust={(pool) => openAdjust({ id: user.id, name: user.name }, pool)} onOpenDetail={setDetailModal} />}
      {view === "apply_leave"  && <ViewApplyLeave  t={t} tk={tk} user={user} card={card} inputS={inputS} summary={mySummary} onSubmitted={loadMy} />}
      {view === "apply_work"   && <ViewApplyWork   t={t} tk={tk} user={user} card={card} inputS={inputS} onSubmitted={loadMy} />}
      {view === "admin_red"    && canManage && <ViewAdminRedDays t={t} tk={tk} card={card} inputS={inputS} />}
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
              {(mySummary?.holiday_comp?.details || []).length === 0 && (
                <div style={{ textAlign: "center", padding: 30, color: t.tm, fontSize: 12 }}>暂无获得记录</div>
              )}
              {(mySummary?.holiday_comp?.details || []).map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: t.bgI, borderRadius: 10, border: `1px solid ${t.bl}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: t.tx, display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace" }}>
                      {d.date} <span style={{ color: t.rd, fontFamily: "inherit" }}>{d.name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: t.tm, marginTop: 4 }}>定休日 weekday {d.day_off}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: t.rd, fontSize: 14, background: `${t.rd}15`, padding: "4px 10px", borderRadius: 7 }}>+1 天</div>
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
            {(() => {
              const allDetails = mySummary?.comp_leave?.details || []
              const balance = Math.max(0, Number(mySummary?.comp_leave?.balance ?? 0))
              const undated = allDetails.filter((d) => d.status === "未消化")
              const oldestFirst = [...undated].sort((a, b) => (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31"))
              const abateCount = Math.max(0, undated.length - balance)
              const abatedIds = new Set(oldestFirst.slice(0, abateCount).map((d) => d.id))

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
                  {allDetails.length === 0 && (
                    <div style={{ textAlign: "center", padding: 30, color: t.tm, fontSize: 12 }}>暂无代休记录</div>
                  )}
                  {allDetails.map((d) => {
                    const used = d.status === "已使用"
                    const expired = d.status === "已失效"
                    const abated = abatedIds.has(d.id)
                    const warn = !used && !expired && !abated && d.days_left !== null && d.days_left <= 7
                    const dim = used || expired || abated
                    return (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", background: t.bgI, borderRadius: 10, border: `1px solid ${warn ? `${t.rd}40` : t.bl}`, opacity: dim ? 0.6 : 1 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12, color: t.tx, marginBottom: 4 }}>出勤日: <span style={{ fontFamily: "monospace" }}>{d.earned_date}</span>{d.swap_date && <span style={{ color: t.tm, marginLeft: 6 }}>→ 休 <span style={{ fontFamily: "monospace", color: t.tx }}>{d.swap_date}</span></span>}</div>
                          {d.reason && <div style={{ fontSize: 11, color: t.ts }}>事由: {d.reason}</div>}
                          {d.deadline && <div style={{ fontSize: 10, color: t.tm, marginTop: 4 }}>Deadline: <span style={{ fontFamily: "monospace" }}>{d.deadline}</span></div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          {used && <span style={{ fontSize: 11, fontWeight: 700, color: t.gn, display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={13} /> 已使用</span>}
                          {expired && <span style={{ fontSize: 11, fontWeight: 700, color: t.tm, display: "inline-flex", alignItems: "center", gap: 4 }}><X size={13} /> 已失效</span>}
                          {abated && <span style={{ fontSize: 11, fontWeight: 700, color: t.tm, display: "inline-flex", alignItems: "center", gap: 4 }}><X size={13} /> 已抵消</span>}
                          {!used && !expired && !abated && (
                            <div style={{ background: warn ? `${t.rd}15` : `${t.gn}15`, color: warn ? t.rd : t.gn, padding: "7px 12px", borderRadius: 9, display: "flex", flexDirection: "column", alignItems: "center", border: `1px solid ${warn ? t.rd : t.gn}30` }}>
                              <span style={{ fontSize: 9, fontWeight: 700 }}>剩余时间</span>
                              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1, marginTop: 2 }}>{d.days_left ?? "—"} 天</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
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

function ViewMyDashboard({ t, card, canManage, summary, history, loading, onRefresh, onAdjust, onOpenDetail }) {
  if (loading && !summary) return <div style={{ ...card, padding: 30, textAlign: "center", color: t.tm, fontSize: 12 }}>加载中…</div>
  if (!summary) return <div style={{ ...card, padding: 30, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无数据</div>

  const paid = summary.paid_leave || {}
  const redDay = summary.holiday_comp || {}
  const comp = summary.comp_leave || {}
  const num = (v) => Number(v ?? 0)
  const mandRem = num(paid.mandatory_remaining)
  const compExpiringSoon = num(comp.expiring_soon)
  const poolColorOf = (p) => (p === "年假" ? t.ac : p === "红日补休" ? t.rd : p === "代休" ? t.gn : t.tm)
  const isApproved = (s) => s === "已通过" || s === "承認"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onRefresh} disabled={loading} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${t.bd}`, background: t.bgI, color: t.ts, fontSize: 10, fontWeight: 600, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={11} /> {loading ? "刷新中…" : "刷新"}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>

        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.ac, fontWeight: 700, fontSize: 13 }}>
              <Clock size={15} strokeWidth={2.4} /> 带薪年假
            </div>
            {canManage && <button onClick={() => onAdjust("年假")} style={{ padding: 5, borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tm, cursor: "pointer", display: "flex" }}><Pencil size={11} /></button>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: t.tx, lineHeight: 1 }}>{num(paid.balance)}</span>
            <span style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>天 剩余</span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, color: t.ts, marginBottom: 12, flexWrap: "wrap" }}>
            <span>本期发放: {num(paid.current_grant)}</span>
            <span>已使用: {num(paid.used)}</span>
            <span>结转: {num(paid.carry_over)}</span>
            {num(paid.manual_adjustment) !== 0 && <span>调整: {num(paid.manual_adjustment) > 0 ? "+" : ""}{num(paid.manual_adjustment)}</span>}
          </div>
          <div style={{ background: mandRem > 0 ? `${t.wn}15` : `${t.gn}15`, borderRadius: 8, padding: "7px 11px", border: `1px solid ${mandRem > 0 ? t.wn : t.gn}30`, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: mandRem > 0 ? t.wn : t.gn }}>
              {num(paid.mandatory_required) === 0 ? "義務残: 本期未达 10 天免" : mandRem > 0 ? `義務残: 还需 ${mandRem} 天（已用 ${num(paid.mandatory_used)} / ${num(paid.mandatory_required)}）` : "義務残: 已达标"}
            </span>
            {mandRem === 0 && num(paid.mandatory_required) > 0 && <CheckCircle2 size={13} color={t.gn} />}
          </div>

          {(paid.timeline || []).length > 0 && (
            <div style={{ paddingTop: 14, borderTop: `1px dashed ${t.bd}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.ts, marginBottom: 14 }}>当前在效批次</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {paid.timeline.map((node, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: t.bgI, borderRadius: 8, border: `1px solid ${t.bl}` }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: node.status === "当前" ? t.ac : t.ts }}>
                        {node.status} · <span style={{ fontFamily: "monospace" }}>{node.grant_date}</span>
                      </div>
                      <div style={{ fontSize: 9, color: t.tm, marginTop: 2 }}>失效 <span style={{ fontFamily: "monospace" }}>{node.expire_date}</span></div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.tx }}>
                      <span style={{ color: t.ac }}>{node.days}</span> <span style={{ color: t.tm, fontWeight: 500 }}>天 · 已用</span> <span style={{ color: t.rd }}>{node.used_from_this}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.rd, fontWeight: 700, fontSize: 13 }}>
              <ShieldAlert size={15} strokeWidth={2.4} /> 红日补休
            </div>
            {canManage && <button onClick={() => onAdjust("红日补休")} style={{ padding: 5, borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tm, cursor: "pointer", display: "flex" }}><Pencil size={11} /></button>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: t.tx, lineHeight: 1 }}>{num(redDay.balance)}</span>
            <span style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>天 剩余</span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, color: t.ts, marginBottom: 12, flexWrap: "wrap" }}>
            <span>累计获得: {num(redDay.total_earned)}</span>
            <span>已使用: {num(redDay.used)}</span>
            {num(redDay.manual_adjustment) !== 0 && <span>调整: {num(redDay.manual_adjustment) > 0 ? "+" : ""}{num(redDay.manual_adjustment)}</span>}
          </div>
          <button onClick={() => onOpenDetail("redDay")} style={{ width: "100%", padding: "6px 0", borderRadius: 8, fontSize: 10, color: t.ts, background: t.bgI, border: `1px solid ${t.bd}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", fontFamily: "inherit" }}>
            <Info size={11} /> 查看获得明细（{(redDay.details || []).length} 条）
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
            <span style={{ fontSize: 32, fontWeight: 700, color: t.tx, lineHeight: 1 }}>{num(comp.balance)}</span>
            <span style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>天 未消化</span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, color: t.ts, marginBottom: 12, flexWrap: "wrap" }}>
            <span>累计获得: {num(comp.total_earned)}</span>
            <span>已使用: {num(comp.used)}</span>
            {num(comp.expired) > 0 && <span style={{ color: t.tm }}>已失效: {num(comp.expired)}</span>}
            {num(comp.manual_adjustment) !== 0 && <span>调整: {num(comp.manual_adjustment) > 0 ? "+" : ""}{num(comp.manual_adjustment)}</span>}
          </div>
          {compExpiringSoon > 0 && num(comp.balance) > 0 && (
            <div style={{ background: `${t.rd}15`, borderRadius: 8, padding: "7px 11px", border: `1px solid ${t.rd}30`, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <AlertCircle size={13} color={t.rd} />
              <span style={{ fontSize: 10, fontWeight: 700, color: t.rd }}>有 {Math.min(compExpiringSoon, num(comp.balance))} 天将在 14 天内过期</span>
            </div>
          )}
          <button onClick={() => onOpenDetail("compDay")} style={{ width: "100%", padding: "6px 0", borderRadius: 8, fontSize: 10, color: t.ts, background: t.bgI, border: `1px solid ${t.bd}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", fontFamily: "inherit" }}>
            <Clock size={11} /> 查看 Deadlines（{(comp.details || []).length} 条）
          </button>
        </div>
      </div>

      <div style={{ ...card, padding: 18 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}><History size={14} /> 本年度使用记录</h3>
        {(history || []).length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: t.tm, fontSize: 12 }}>本年还没有休假记录</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: t.bgI }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: t.tm, fontWeight: 600, borderBottom: `1px solid ${t.bd}` }}>日期</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: t.tm, fontWeight: 600, borderBottom: `1px solid ${t.bd}` }}>类型</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: t.tm, fontWeight: 600, borderBottom: `1px solid ${t.bd}` }}>扣除池</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: t.tm, fontWeight: 600, borderBottom: `1px solid ${t.bd}` }}>状态</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => {
                  const pool = h.pool_source || (h.leave_type === "有休" ? "年假" : h.leave_type === "赤日休" || h.leave_type === "赤日補休" ? "红日补休" : h.leave_type)
                  const poolColor = poolColorOf(pool)
                  const ok = isApproved(h.status)
                  const isPending = h.status === "申请中" || h.status === "申請中"
                  return (
                    <tr key={h.id} style={{ background: i % 2 === 0 ? "transparent" : t.bgI }}>
                      <td style={{ padding: "10px 12px", color: t.tx, fontWeight: 600, fontFamily: "monospace" }}>{h.leave_date}</td>
                      <td style={{ padding: "10px 12px", color: t.ts }}>{h.leave_type}{h.is_half_day && " · 半天"}{h.reason && <span style={{ color: t.tm, marginLeft: 6 }}>· {h.reason}</span>}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {pool && <span style={{ background: `${poolColor}18`, color: poolColor, padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700 }}>{pool}</span>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: ok ? t.gn : isPending ? t.wn : t.rd, fontWeight: 700, fontSize: 11 }}>
                          {ok ? <CheckCircle2 size={13} /> : isPending ? <Clock size={13} /> : <X size={13} />} {ok ? "已通过" : isPending ? "申请中" : h.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ViewApplyLeave({ t, tk, user, card, inputS, summary, onSubmitted }) {
  const mandatoryLeft = Number(summary?.paid_leave?.mandatory_remaining ?? 0)
  const balPaid = Number(summary?.paid_leave?.balance ?? 0)
  const balRed  = Number(summary?.holiday_comp?.balance ?? 0)
  const balComp = Number(summary?.comp_leave?.balance ?? 0)
  const [pool, setPool] = useState("paid")
  const [dates, setDates] = useState([])
  const [halfMode, setHalfMode] = useState("full")
  const [leaveReason, setLeaveReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState("")
  const [submitOk, setSubmitOk] = useState("")

  const POOL_TO_DB = { paid: "年假", red: "红日补休", comp: "代休" }

  const handleSubmit = async () => {
    if (!user?.id) return
    setSubmitting(true); setSubmitErr(""); setSubmitOk("")
    const isHalf = halfMode !== "full"
    const poolDb = POOL_TO_DB[pool]
    const rows = dates.map((d) => ({
      employee_id: user.id,
      leave_type: poolDb,
      pool_source: poolDb,
      leave_date: d,
      is_half_day: isHalf,
      reason: leaveReason.trim(),
      status: "申请中",
    }))
    const res = await sbPost("leave_requests", rows, tk)
    setSubmitting(false)
    if (res?.code || res?.message) { setSubmitErr(res.message || "提交失败"); return }
    setSubmitOk(`已提交 ${dates.length} 条申请，等待审批`)
    setDates([]); setLeaveReason(""); setHalfMode("full")
    onSubmitted?.()
  }

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
            <PoolOption value="paid" color={t.ac} title="带薪年假" sub={`剩余: ${balPaid} 天`} badge={mandatoryLeft > 0 ? "优先" : null} />
            <PoolOption value="red"  color={t.rd} title="红日补休" sub={`剩余: ${balRed} 天`} />
            <PoolOption value="comp" color={t.gn} title="代休 (休息日加班补偿)" sub={`剩余: ${balComp} 天`} />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>理由 <span style={{ color: t.rd }}>*</span></label>
          <textarea rows={3} placeholder="处理私事" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} style={{ ...inputS, width: "100%", resize: "none", boxSizing: "border-box" }} />
        </div>

        {submitErr && <div style={{ padding: "10px 14px", borderRadius: 8, background: `${t.rd}15`, color: t.rd, fontSize: 12, fontWeight: 600 }}>{submitErr}</div>}
        {submitOk && <div style={{ padding: "10px 14px", borderRadius: 8, background: `${t.gn}15`, color: t.gn, fontSize: 12, fontWeight: 600 }}>{submitOk}</div>}

        {(() => {
          const ok = dates.length > 0 && leaveReason.trim().length > 0 && !submitting
          return (
            <button onClick={handleSubmit} disabled={!ok} style={{ padding: 13, borderRadius: 11, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: ok ? "pointer" : "not-allowed", marginTop: 4, fontFamily: "inherit", opacity: ok ? 1 : 0.5 }}>
              <Send size={14} /> {submitting ? "提交中…" : `提交申请${dates.length > 0 ? `（共 ${dates.length} 天）` : ""}`}
            </button>
          )
        })()}
      </div>
    </div>
  )
}

function ViewApplyWork({ t, tk, user, card, inputS, onSubmitted }) {
  const [compMethod, setCompMethod] = useState("pool")
  const [dates, setDates] = useState([])
  const [swapDate, setSwapDate] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState("")
  const [submitOk, setSubmitOk] = useState("")

  const handleSubmit = async () => {
    if (!user?.id) return
    setSubmitting(true); setSubmitErr(""); setSubmitOk("")
    const compType = compMethod === "pay" ? "加班" : "换休"
    const useSwapDate = compMethod === "swap" && dates.length === 1 && swapDate
    const rows = dates.map((d) => ({
      employee_id: user.id,
      swap_type: "休息日出勤",
      original_date: d,
      swap_date: useSwapDate ? swapDate : null,
      compensation_type: compType,
      reason: reason.trim(),
      status: "申请中",
    }))
    const res = await sbPost("day_swap_requests", rows, tk)
    setSubmitting(false)
    if (res?.code || res?.message) { setSubmitErr(res.message || "提交失败"); return }
    const word = compMethod === "pay" ? "加班记录" : "换休申请"
    setSubmitOk(`已提交 ${dates.length} 条${word}，等待审批`)
    setDates([]); setReason(""); setSwapDate(""); setCompMethod("pool")
    onSubmitted?.()
  }

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

  const canSubmit = dates.length > 0 && reason.trim().length > 0 && !submitting

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", ...card, padding: 26 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: t.tx, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}><Briefcase color={t.gn} size={20} /> 提交休息日出勤申请</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>预计出勤日（可多选，点格子选取）</label>
          <DateMultiPicker selected={dates} onChange={setDates} t={t} tk={tk} />
          {dates.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: t.tm }}>已选 <strong style={{ color: t.ac }}>{dates.length}</strong> 天</div>
          )}
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>选择补偿方式</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <CompOption value="pool" title="换休（未定）→ 存入代休池" sub="获得对应天数代休余额，日后再决定哪天休。" />
            <CompOption
              value="swap"
              title="换休（指定日期）"
              sub={dates.length > 1 ? "选了多日时，每条记录的换休日均设为待定，可在批准后单独编辑" : "直接配对，指定将来某天休息。"}
              expand={dates.length <= 1 ? (
                <input type="date" value={swapDate} onChange={(e) => setSwapDate(e.target.value)} style={{ ...inputS, marginTop: 8, width: "100%", boxSizing: "border-box", borderColor: t.ac }} />
              ) : null}
            />
            <CompOption value="pay" title="作为加班" sub="不进代休池" />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.ts, marginBottom: 7 }}>工作内容 / 理由 <span style={{ color: t.rd }}>*</span></label>
          <textarea rows={3} placeholder="为应对突发活动等" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputS, width: "100%", resize: "none", boxSizing: "border-box" }} />
        </div>

        <button disabled={!canSubmit} style={{ padding: 13, borderRadius: 11, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: canSubmit ? "pointer" : "not-allowed", marginTop: 4, fontFamily: "inherit", opacity: canSubmit ? 1 : 0.5 }}>
          <Send size={14} /> 提交申请{dates.length > 0 && `（共 ${dates.length} 天）`}
        </button>
      </div>
    </div>
  )
}

function ViewAdminRedDays({ t, tk, card, inputS }) {
  const today = new Date()
  const sixMonthsLater = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate())
  const fmt = (d) => d.toISOString().slice(0, 10)
  const [from, setFrom] = useState(fmt(today))
  const [to, setTo] = useState(fmt(sixMonthsLater))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")

  const load = useCallback(async () => {
    setLoading(true); setErr("")
    const res = await sbRpc("get_holiday_attendance_report", { p_start_date: from, p_end_date: to }, tk)
    if (res?.code || res?.message) { setErr(res.message || "加载失败"); setData([]); setLoading(false); return }
    setData(Array.isArray(res) ? res : [])
    setLoading(false)
  }, [from, to, tk])

  useEffect(() => { load() }, [load])

  const grouped = (() => {
    if (!data) return []
    const map = new Map()
    for (const r of data) {
      const key = r.holiday_date
      if (!map.has(key)) map.set(key, { date: r.holiday_date, name: r.holiday_name, applicants: [] })
      if (r.employee_id) {
        map.get(key).applicants.push({
          id: r.employee_id, name: r.employee_name, furigana: r.furigana, pinyin: r.pinyin,
          status: r.status, comp: r.compensation_type, half: r.is_half_day, sid: r.swap_request_id,
        })
      }
    }
    return Array.from(map.values())
      .map((row) => ({ ...row, applicants: sortByName(row.applicants) }))
      .sort((a, b) => a.date.localeCompare(b.date))
  })()

  const isApproved = (s) => s === "已通过" || s === "承認"

  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: t.tx, margin: 0, display: "flex", alignItems: "center", gap: 7 }}><ShieldAlert color={t.rd} size={18} /> 红日子出勤申请一览</h2>
          <p style={{ fontSize: 11, color: t.tm, margin: "4px 0 0" }}>红日子默认全员放假。这里只列「申请来上班」的人，没在名单上的就是不来。</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: t.ts }}>从</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputS, padding: "7px 10px" }} />
        <span style={{ fontSize: 11, color: t.ts }}>到</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputS, padding: "7px 10px" }} />
        <button onClick={load} disabled={loading} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.ts, fontSize: 11, fontWeight: 600, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={12} /> {loading ? "查询中…" : "查询"}
        </button>
      </div>

      {err && <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: `${t.rd}15`, color: t.rd, fontSize: 12, fontWeight: 600 }}>{err}</div>}

      {data === null && <div style={{ textAlign: "center", padding: 30, color: t.tm, fontSize: 12 }}>加载中…</div>}
      {data && grouped.length === 0 && <div style={{ textAlign: "center", padding: 30, color: t.tm, fontSize: 12 }}>该区间无红日子</div>}

      {grouped.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 720 }}>
            <thead>
              <tr style={{ background: t.bgI }}>
                <th style={{ padding: 11, textAlign: "left", color: t.ts, borderBottom: `2px solid ${t.bd}`, width: 130 }}>红日子日期</th>
                <th style={{ padding: 11, textAlign: "left", color: t.ts, borderBottom: `2px solid ${t.bd}`, width: 160 }}>节假日名</th>
                <th style={{ padding: 11, textAlign: "left", color: t.ts, borderBottom: `2px solid ${t.bd}` }}>出勤人员名单</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((row, i) => (
                <tr key={row.date} style={{ borderBottom: `1px solid ${t.bl}`, background: i % 2 === 0 ? "transparent" : t.bgI, verticalAlign: "top" }}>
                  <td style={{ padding: 11, fontWeight: 700, color: t.tx, fontFamily: "monospace" }}>{row.date}</td>
                  <td style={{ padding: 11, color: t.rd, fontWeight: 600 }}>{row.name}</td>
                  <td style={{ padding: 11 }}>
                    {row.applicants.length === 0 ? (
                      <span style={{ fontSize: 11, color: t.gn, fontWeight: 600, background: `${t.gn}12`, padding: "3px 9px", borderRadius: 5 }}>全员休息</span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {row.applicants.map((a) => {
                          const ok = isApproved(a.status)
                          const sColor = ok ? t.gn : t.wn
                          return (
                            <span key={a.sid} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: `${sColor}10`, border: `1px solid ${sColor}30`, fontSize: 11 }}>
                              <strong style={{ color: t.tx }}>{a.name}</strong>
                              <span style={{ color: sColor, fontWeight: 700 }}>· {ok ? "已通过" : "申请中"}</span>
                              {a.comp && <span style={{ color: t.tm }}>· {a.comp}</span>}
                              {a.half && <span style={{ color: t.tm }}>· 半天</span>}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ViewAdminTeam({ t, card, rows, loading, onRefresh, onAdjust }) {
  const [regionTab, setRegionTab] = useState("all")
  const Cell = ({ value, color, onClick }) => (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${color}10`, padding: "4px 10px", borderRadius: 8, border: `1px solid ${color}25` }}>
      <span style={{ fontWeight: 700, fontSize: 13, color: t.tx }}>{value}</span>
      <button onClick={onClick} style={{ padding: 3, borderRadius: 5, color, background: "transparent", border: "none", cursor: "pointer", display: "flex" }}><Pencil size={11} /></button>
    </div>
  )

  const counts = {
    all:  rows ? rows.length : 0,
    日本: rows ? rows.filter((r) => r.region === "日本").length : 0,
    中国: rows ? rows.filter((r) => r.region === "中国").length : 0,
    未分类: rows ? rows.filter((r) => !r.region).length : 0,
  }
  const filtered = !rows ? [] : regionTab === "all" ? rows : regionTab === "未分类" ? rows.filter((r) => !r.region) : rows.filter((r) => r.region === regionTab)

  const RegionTab = ({ k, label }) => {
    const active = regionTab === k
    return (
      <button onClick={() => setRegionTab(k)} style={{
        padding: "6px 14px", borderRadius: 8, border: `1px solid ${active ? t.ac : t.bd}`,
        background: active ? `${t.ac}12` : t.bgI, color: active ? t.ac : t.ts,
        fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
      }}>
        {label}
        <span style={{ background: active ? `${t.ac}25` : t.bd, color: active ? t.ac : t.tm, padding: "1px 7px", borderRadius: 9, fontSize: 10, fontWeight: 700 }}>{counts[k]}</span>
      </button>
    )
  }

  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: t.tx, margin: 0, display: "flex", alignItems: "center", gap: 7 }}><Users color={t.ac} size={18} /> 团队假期台账</h2>
          <p style={{ fontSize: 11, color: t.tm, margin: "4px 0 0" }}>点击铅笔图标手动调整余额，会写入该员工的调整记录表。</p>
        </div>
        <button onClick={onRefresh} disabled={loading} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.ts, fontSize: 11, fontWeight: 600, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={12} /> {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          <RegionTab k="all" label="全部" />
          <RegionTab k="日本" label="日本" />
          <RegionTab k="中国" label="中国" />
          {counts["未分类"] > 0 && <RegionTab k="未分类" label="未分类" />}
        </div>
      )}

      {rows === null && <div style={{ textAlign: "center", padding: 30, color: t.tm, fontSize: 12 }}>加载中…</div>}
      {rows && rows.length === 0 && <div style={{ textAlign: "center", padding: 30, color: t.tm, fontSize: 12 }}>暂无在职正/契社员</div>}
      {rows && rows.length > 0 && filtered.length === 0 && <div style={{ textAlign: "center", padding: 30, color: t.tm, fontSize: 12 }}>该地区无员工</div>}

      {rows && filtered.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 800 }}>
            <thead>
              <tr style={{ background: t.bgI }}>
                <th style={{ padding: 11, textAlign: "left",   color: t.ts, borderBottom: `2px solid ${t.bd}` }}>员工姓名</th>
                <th style={{ padding: 11, textAlign: "center", color: t.ts, borderBottom: `2px solid ${t.bd}` }}>地区</th>
                <th style={{ padding: 11, textAlign: "center", color: t.ac, borderBottom: `2px solid ${t.bd}` }}>年假剩余</th>
                <th style={{ padding: 11, textAlign: "center", color: t.wn, borderBottom: `2px solid ${t.bd}` }}>義務残</th>
                <th style={{ padding: 11, textAlign: "center", color: t.rd, borderBottom: `2px solid ${t.bd}` }}>红日补休</th>
                <th style={{ padding: 11, textAlign: "center", color: t.gn, borderBottom: `2px solid ${t.bd}` }}>代休剩余</th>
                <th style={{ padding: 11, textAlign: "right",  color: t.ts, borderBottom: `2px solid ${t.bd}` }}>本年已用合计</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const s = row.summary || {}
                const paid    = s.paid_leave || {}
                const red     = s.holiday_comp || {}
                const comp    = s.comp_leave || {}
                const mandRem = paid.mandatory_remaining ?? 0
                const usedAll = (Number(paid.used) || 0) + (Number(red.used) || 0) + (Number(comp.used) || 0)
                const regionColor = row.region === "日本" ? t.ac : row.region === "中国" ? t.rd : t.tm
                return (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${t.bl}`, background: i % 2 === 0 ? "transparent" : t.bgI }}>
                    <td style={{ padding: 11, fontWeight: 700, color: t.tx }}>{row.name}</td>
                    <td style={{ padding: 11, textAlign: "center" }}>
                      <span style={{ background: `${regionColor}15`, color: regionColor, padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700 }}>{row.region || "未分类"}</span>
                    </td>
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
