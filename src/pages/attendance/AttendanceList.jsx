import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { LEAVE_TYPES, WEEKDAYS, daysInMonth, weekday, isWeekend, pad, todayStr, fmtMinutes } from "../../config/constants"
import { calcPaidLeave } from "../../config/leaveCalc"
import DateMultiPicker from "../../components/DateMultiPicker"
import { Pencil, Trash2, Plus, Save, ChevronLeft, ChevronRight, ClipboardList, CalendarX2, ArrowLeftRight, Train, Receipt, Check, X, Banknote, ListChecks } from "lucide-react"

const mkTrans = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, claim_date: "", route: "", round_trip: true, amount: "", note: "" })
const mkComm = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, entry_date: "", seq_number: "", student_name: "", tuition_amount: "", commission_rate: "", commission_amount: 0 })
const EXPENSE_CATS = ["教材费", "办公用品", "餐费", "打印费", "通信费", "其他"]

export default function AttendanceList({ user, t, tk }) {
  const now = new Date()
  const [y, sY] = useState(now.getFullYear())
  const [m, sM] = useState(now.getMonth() + 1)
  const days = daysInMonth(y, m)
  const isAdmin = user.role === "admin"

  // ====== Tab ======
  const [tab, setTab] = useState("leave")

  // ====== 勤怠 ======
  const [recs, sRecs] = useState({})
  const [ed, sEd] = useState(false)
  const [dr, sDr] = useState({})
  const [ld, sLd] = useState(true)
  const [sv, sSv] = useState(false)

  // ====== 假期 ======
  const [leaveReqs, setLeaveReqs] = useState([])
  const [leaveShow, setLeaveShow] = useState(false)
  const [leaveSub, setLeaveSub] = useState(false)
  const [leaveFm, setLeaveFm] = useState({ leave_type: "有休", dates: [], reason: "", is_half_day: false })
  const [leaveEditId, setLeaveEditId] = useState(null)
  const [bal, sBal] = useState({ currentGrant: 0, carryOver: 0, used: 0, balance: 0, totalAvailable: 0 })
  const [compBal, setCompBal] = useState(0)
  const [showTL, setShowTL] = useState(false)
  const [leaveHistMode, setLeaveHistMode] = useState(false)

  // ====== 换休 ======
  const [swapReqs, setSwapReqs] = useState([])
  const [swapShow, setSwapShow] = useState(false)
  const [swapSub, setSwapSub] = useState(false)
  const [swapFm, setSwapFm] = useState({ swap_type: "休日出勤", original_dates: [], swap_date: "", compensation_type: "換休", reason: "" })
  const [swapEditId, setSwapEditId] = useState(null)
  const [swapHistMode, setSwapHistMode] = useState(false)

  // ====== 共用: admin历史录入 ======
  const [allEmps, setAllEmps] = useState([])
  const [selEmp, setSelEmp] = useState("")
  // admin 查看哪个员工的请假/换休列表（默认自己）
  const [leaveViewEmp, setLeaveViewEmp] = useState("")

  // ====== 交通费 + 签单提成 ======
  const [transRows, setTransRows] = useState([])
  const [commRows, setCommRows] = useState([])
  const [editingKeys, setEditingKeys] = useState(new Set())
  const [expRecs, setExpRecs] = useState([])
  const [expShow, setExpShow] = useState(false)
  const [expSub, setExpSub] = useState(false)
  const [expEditId, setExpEditId] = useState(null)
  const [expFm, setExpFm] = useState({ claim_date: todayStr(), category: "教材费", amount: "", note: "" })

  // ==================== 数据加载 ====================
  const load = useCallback(async () => {
    sLd(true)
    const from = `${y}-${pad(m)}-01`, to = `${y}-${pad(m)}-${pad(days)}`
    const [attData, trData, cmData, lvData, swData, usedReqs, compReqs, expData] = await Promise.all([
      sbGet(`attendance_records?employee_id=eq.${user.id}&work_date=gte.${from}&work_date=lte.${to}&order=work_date`, tk),
      sbGet(`transportation_claims?employee_id=eq.${user.id}&claim_date=gte.${from}&claim_date=lte.${to}&order=claim_date&select=*`, tk),
      user.has_commission ? sbGet(`commission_entries?employee_id=eq.${user.id}&entry_date=gte.${from}&entry_date=lte.${to}&order=entry_date,seq_number&select=*`, tk) : Promise.resolve([]),
      sbGet(`leave_requests?employee_id=eq.${(isAdmin && leaveViewEmp) ? leaveViewEmp : user.id}&order=leave_date.desc&select=*`, tk),
      sbGet(`day_swap_requests?employee_id=eq.${user.id}&order=created_at.desc&select=*`, tk),
      sbGet(`leave_requests?employee_id=eq.${user.id}&status=eq.承認&leave_type=eq.有休&select=leave_date,is_half_day`, tk),
      sbGet(`day_swap_requests?employee_id=eq.${user.id}&swap_type=eq.休日出勤&compensation_type=eq.換休&status=eq.承認&select=id,swap_date`, tk),
      sbGet(`expense_claims?employee_id=eq.${user.id}&order=claim_date.desc&select=*`, tk),
    ])

    const mp = {}; (attData || []).forEach((r) => { mp[r.work_date] = r }); sRecs(mp)

    const trLoaded = (trData || []).map(r => ({ ...r, _key: r.id, _isNew: false, _dirty: false, amount: String(r.amount || "") }))
    setTransRows([...trLoaded, ...Array.from({ length: 2 }, mkTrans)])

    const cmLoaded = (cmData || []).map(r => ({ ...r, _key: r.id, _isNew: false, _dirty: false, seq_number: String(r.seq_number || ""), tuition_amount: String(r.tuition_amount || ""), commission_rate: String(r.commission_rate || ""), commission_amount: Number(r.commission_amount || 0) }))
    setCommRows([...cmLoaded, ...Array.from({ length: 2 }, mkComm)])

    setLeaveReqs(lvData || [])
    sBal(calcPaidLeave(user.hire_date, usedReqs || []))
    setCompBal((compReqs || []).filter(c => !c.swap_date).length)

    setSwapReqs(swData || [])
    setExpRecs(expData || [])

    if (isAdmin && !allEmps.length) {
      const emps = await sbGet("employees?is_active=eq.true&order=name&select=id,name", tk)
      setAllEmps(emps || [])
    }

    setEditingKeys(new Set())
    sLd(false)
  }, [y, m, days, user.id, tk, user.has_commission, isAdmin, leaveViewEmp])

  useEffect(() => { load() }, [load])

  const chg = (d) => { let nm = m + d, ny = y; if (nm > 12) { nm = 1; ny++ } else if (nm < 1) { nm = 12; ny-- } sY(ny); sM(nm); sEd(false) }

  // ==================== 勤怠编辑 ====================
  const startEd = () => {
    const d = {}
    for (let i = 1; i <= days; i++) {
      const ds = `${y}-${pad(m)}-${pad(i)}`; const r = recs[ds]
      d[ds] = { ci: r?.clock_in?.slice(0, 5) || "", co: r?.clock_out?.slice(0, 5) || "", bs: r?.break_start?.slice(0, 5) || "", be: r?.break_end?.slice(0, 5) || "", nt: r?.note || "" }
    }
    sDr(d); sEd(true)
  }

  const saveAtt = async () => {
    sSv(true)
    const rows = [], dels = []
    for (let i = 1; i <= days; i++) {
      const ds = `${y}-${pad(m)}-${pad(i)}`; const d = dr[ds]; const existing = recs[ds]
      if (!d) continue
      const hasData = d.ci || d.co || d.nt
      if (hasData) rows.push({ employee_id: user.id, work_date: ds, clock_in: d.ci ? d.ci + ":00" : null, clock_out: d.co ? d.co + ":00" : null, break_start: d.bs ? d.bs + ":00" : null, break_end: d.be ? d.be + ":00" : null, note: d.nt || null })
      else if (existing) dels.push(existing.id)
    }
    if (rows.length) await sbPost("attendance_records", rows, tk, "?on_conflict=employee_id,work_date")
    for (const id of dels) await sbDel(`attendance_records?id=eq.${id}`, tk)
    await load(); sEd(false); sSv(false)
  }

  // ==================== 假期申请 ====================
  const resetLeaveForm = () => { setLeaveFm({ leave_type: "有休", dates: [], reason: "", is_half_day: false }); setLeaveEditId(null); setLeaveShow(false) }

  const submitLeave = async () => {
    if (!leaveFm.dates.length) return
    setLeaveSub(true)
    const targetId = leaveHistMode && selEmp ? selEmp : user.id
    if (leaveEditId) {
      await sbPatch(`leave_requests?id=eq.${leaveEditId}`, { leave_type: leaveFm.leave_type, leave_date: leaveFm.dates[0], reason: leaveFm.reason || null, is_half_day: leaveFm.is_half_day }, tk)
    } else {
      for (const date of leaveFm.dates) {
        const rec = { employee_id: targetId, leave_type: leaveFm.leave_type, leave_date: date, reason: leaveFm.reason || null, is_half_day: leaveFm.is_half_day }
        if (leaveHistMode) { rec.status = "承認"; rec.approved_at = new Date().toISOString() }
        await sbPost("leave_requests", rec, tk)
      }
    }
    await load(); resetLeaveForm(); setLeaveHistMode(false); setSelEmp(""); setLeaveSub(false)
  }

  const startLeaveEdit = (r) => {
    setLeaveFm({ leave_type: r.leave_type, dates: [r.leave_date], reason: r.reason || "", is_half_day: r.is_half_day || false })
    setLeaveEditId(r.id); setLeaveShow(true); setTab("leave")
  }

  const delLeave = async (id, status) => {
    const msg = status === "申請中" ? "确定要取消这条申请吗？" : "确定要删除这条已批准的休假记录吗？此操作不可撤销。"
    if (!confirm(msg)) return
    await sbDel(`leave_requests?id=eq.${id}`, tk); await load()
  }

  // ==================== 换休管理 ====================
  const resetSwapForm = () => { setSwapFm({ swap_type: "休日出勤", original_dates: [], swap_date: "", compensation_type: "換休", reason: "" }); setSwapEditId(null); setSwapShow(false) }

  const submitSwap = async () => {
    if (!swapFm.original_dates.length) return
    setSwapSub(true)
    const targetId = swapHistMode && selEmp ? selEmp : user.id
    if (swapEditId) {
      const patch = { swap_type: swapFm.swap_type, original_date: swapFm.original_dates[0], swap_date: swapFm.swap_date || null, compensation_type: swapFm.swap_type === "休日出勤" ? swapFm.compensation_type : null, reason: swapFm.reason || null }
      if (swapFm.swap_type === "休日出勤" && swapFm.compensation_type === "換休") {
        const d = new Date(swapFm.original_dates[0]); d.setDate(d.getDate() + 60); patch.deadline = d.toISOString().split("T")[0]
      } else { patch.deadline = null }
      await sbPatch(`day_swap_requests?id=eq.${swapEditId}`, patch, tk)
    } else {
      for (const date of swapFm.original_dates) {
        const payload = { employee_id: targetId, swap_type: swapFm.swap_type, original_date: date, swap_date: swapFm.original_dates.length === 1 ? (swapFm.swap_date || null) : null, compensation_type: swapFm.swap_type === "休日出勤" ? swapFm.compensation_type : null, reason: swapFm.reason || null }
        if (swapFm.swap_type === "休日出勤" && swapFm.compensation_type === "換休") {
          const d = new Date(date); d.setDate(d.getDate() + 60); payload.deadline = d.toISOString().split("T")[0]
        }
        if (swapHistMode) { payload.status = "承認"; payload.approved_at = new Date().toISOString() }
        await sbPost("day_swap_requests", payload, tk)
      }
    }
    await load(); resetSwapForm(); setSwapHistMode(false); setSelEmp(""); setSwapSub(false)
  }

  const startSwapEdit = (r) => {
    setSwapFm({ swap_type: r.swap_type, original_dates: [r.original_date], swap_date: r.swap_date || "", compensation_type: r.compensation_type || "換休", reason: r.reason || "" })
    setSwapEditId(r.id); setSwapShow(true); setTab("swap")
  }

  const delSwap = async (id) => { if (!confirm("确定要取消这条申请吗？")) return; await sbDel(`day_swap_requests?id=eq.${id}`, tk); await load() }

  // ==================== 交通费（逐行保存） ====================
  const updateTrans = (key, field, value) => setTransRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value, _dirty: true } : r))
  const addTransRows = () => setTransRows(prev => [...prev, ...Array.from({ length: 2 }, mkTrans)])
  const removeTrans = (key) => setTransRows(prev => prev.filter(r => r._key !== key))
  const delTrans = async (id) => { if (!confirm("确定删除？")) return; await sbDel(`transportation_claims?id=eq.${id}`, tk); await load() }
  const toggleEdit = (key) => setEditingKeys(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const cancelEdit = (key) => { setEditingKeys(prev => { const n = new Set(prev); n.delete(key); return n }); load() }

  const saveTransRow = async (key) => {
    const r = transRows.find(r => r._key === key)
    if (!r) return
    sSv(true)
    if (r._isNew) {
      await sbPost("transportation_claims", { employee_id: user.id, claim_date: r.claim_date, route: r.route || null, round_trip: r.round_trip, amount: parseFloat(r.amount), note: r.note || null }, tk)
    } else {
      await sbPatch(`transportation_claims?id=eq.${r.id}`, { claim_date: r.claim_date, route: r.route || null, round_trip: r.round_trip, amount: parseFloat(r.amount), note: r.note || null }, tk)
    }
    await load(); sSv(false)
  }

  // ==================== 签单提成（逐行保存） ====================
  const updateComm = (key, field, value) => {
    setCommRows(prev => prev.map(r => {
      if (r._key !== key) return r
      const next = { ...r, [field]: value, _dirty: true }
      next.commission_amount = Math.round((parseFloat(next.tuition_amount) || 0) * (parseFloat(next.commission_rate) || 0) / 100)
      return next
    }))
  }
  const addCommRows = () => setCommRows(prev => [...prev, ...Array.from({ length: 2 }, mkComm)])
  const removeComm = (key) => setCommRows(prev => prev.filter(r => r._key !== key))
  const delComm = async (id) => { if (!confirm("确定删除？")) return; await sbDel(`commission_entries?id=eq.${id}`, tk); await load() }

  const saveCommRow = async (key) => {
    const r = commRows.find(r => r._key === key)
    if (!r) return
    sSv(true)
    if (r._isNew) {
      await sbPost("commission_entries", { employee_id: user.id, entry_date: r.entry_date, seq_number: parseInt(r.seq_number) || 1, student_name: r.student_name, tuition_amount: parseFloat(r.tuition_amount), commission_rate: parseFloat(r.commission_rate) || 0, commission_amount: r.commission_amount || 0 }, tk)
    } else {
      await sbPatch(`commission_entries?id=eq.${r.id}`, { entry_date: r.entry_date, seq_number: parseInt(r.seq_number) || 1, student_name: r.student_name, tuition_amount: parseFloat(r.tuition_amount), commission_rate: parseFloat(r.commission_rate) || 0, commission_amount: r.commission_amount || 0 }, tk)
    }
    await load(); sSv(false)
  }

  // ==================== 报销登记（逐条保存） ====================
  const resetExpForm = () => { setExpFm({ claim_date: todayStr(), category: "教材费", amount: "", note: "" }); setExpEditId(null); setExpShow(false) }

  const submitExp = async () => {
    if (!expFm.amount) return
    setExpSub(true)
    const body = { claim_date: expFm.claim_date, category: expFm.category, amount: Number(expFm.amount), note: expFm.note || null }
    if (expEditId) { await sbPatch(`expense_claims?id=eq.${expEditId}`, body, tk); setExpEditId(null) }
    else { await sbPost("expense_claims", { employee_id: user.id, ...body }, tk) }
    await load(); resetExpForm(); setExpSub(false)
  }

  const startExpEdit = (r) => { setExpFm({ claim_date: r.claim_date, category: r.category, amount: String(r.amount), note: r.note || "" }); setExpEditId(r.id); setExpShow(true); setTab("expense") }
  const delExp = async (id) => { if (!confirm("确认删除？")) return; await sbDel(`expense_claims?id=eq.${id}`, tk); await load() }

  // ==================== 统计 ====================
  const tw = Object.values(recs).reduce((s, r) => s + Number(r.work_minutes || 0), 0)
  const to = Object.values(recs).reduce((s, r) => s + Math.max(Number(r.work_minutes || 0) - 480, 0), 0)
  const wds = Object.values(recs).filter((r) => r.clock_in).length
  const totalTrans = transRows.filter(r => !r._isNew).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const totalComm = commRows.filter(r => !r._isNew).reduce((s, r) => s + (r.commission_amount || 0), 0)
  const totalExp = expRecs.reduce((s, r) => s + Number(r.amount || 0), 0)

  const swapApproved = swapReqs.filter(r => r.status === "承認")
  const unusedComp = swapApproved.filter(r => r.swap_type === "休日出勤" && r.compensation_type === "換休" && !r.swap_date).length
  const leavePending = leaveReqs.filter(r => r.status === "申請中").length
  const swapPending = swapReqs.filter(r => r.status === "申請中").length

  // ==================== 样式 ====================
  const iS = { padding: "5px 6px", borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }
  const roS = { fontSize: 12, fontFamily: "monospace", color: t.tx, padding: "5px 6px" }
  const fmS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }
  const smallBtn = (color, bg) => ({ padding: "3px 8px", borderRadius: 5, border: `1px solid ${color}33`, background: bg || "transparent", color, fontSize: 10, fontWeight: 600, cursor: sv ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 3, opacity: sv ? 0.5 : 1 })

  const tI = (ds, f) => (
    <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5}
      value={dr[ds]?.[f] || ""} onChange={(e) => {
        let v = e.target.value.replace(/[^\d:]/g, "")
        if (v.length === 2 && !v.includes(":")) v += ":"
        sDr((p) => ({ ...p, [ds]: { ...p[ds], [f]: v } }))
      }}
      style={{ padding: "4px 5px", borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.ac, fontSize: 12, fontFamily: "monospace", width: 60, textAlign: "center", boxSizing: "border-box" }} />
  )

  const statusBadge = (s) => {
    const c = s === "承認" ? t.gn : s === "却下" ? t.rd : t.wn
    return { padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: c, background: `${c}18` }
  }

  // ==================== Admin历史录入组件 ====================
  const HistModeUI = ({ histMode, setHistMode, editId }) => (
    <>
      {isAdmin && !editId && (
        <button type="button" onClick={() => setHistMode(p => !p)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${histMode ? "#8B5CF6" : t.bd}`, background: histMode ? "#8B5CF620" : "transparent", color: histMode ? "#8B5CF6" : t.ts, fontSize: 10, cursor: "pointer" }}>
          {histMode ? "切回普通申请" : "历史录入模式"}
        </button>
      )}
    </>
  )

  const HistEmpSelect = ({ histMode }) => histMode ? (
    <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: "#8B5CF610", border: "1px solid #8B5CF630" }}>
      <div style={{ fontSize: 10, color: "#8B5CF6", marginBottom: 6, fontWeight: 600 }}>管理者历史录入模式 — 记录将自动设为已批准</div>
      <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>选择社员</label>
      <select value={selEmp} onChange={(e) => setSelEmp(e.target.value)} style={fmS}>
        <option value="">请选择社员</option>
        {allEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </div>
  ) : null

  // ==================== Tab 定义 ====================
  const tabs = [
    { key: "leave", label: "假期申请", icon: CalendarX2, badge: leavePending },
    { key: "swap", label: "换休管理", icon: ArrowLeftRight, badge: swapPending },
    { key: "summary", label: "报销一览", icon: ListChecks },
    { key: "transport", label: "交通費", icon: Train },
    { key: "expense", label: "报销登记", icon: Banknote },
    ...(user.has_commission ? [{ key: "commission", label: "签单提成", icon: Receipt }] : []),
  ]

  // ==================== 主渲染 ====================
  return (
    <div>
      {/* ====== 顶栏 ====== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ClipboardList size={20} strokeWidth={1.8} color={t.ac} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>勤怠一览</h2>
            <p style={{ fontSize: 11, color: t.tm, marginTop: 2 }}>{user.name}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => chg(-1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "flex", alignItems: "center" }}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.tx, minWidth: 100, textAlign: "center" }}>{y}年{m}月</span>
          <button onClick={() => chg(1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "flex", alignItems: "center" }}><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* ====== 统计卡片 ====== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(95px,1fr))", gap: 8, marginBottom: 16 }}>
        {[
          { l: "出勤", v: `${wds}天`, c: t.ac },
          { l: "劳动时长", v: fmtMinutes(tw), c: t.gn },
          { l: "固定外加班", v: fmtMinutes(to), c: to / 60 > 20 ? t.rd : t.wn },
          { l: "有休余额", v: `${bal.balance}天`, c: t.ac, sub: `本年${bal.currentGrant}+繰越${bal.carryOver}-已用${bal.used}`, click: () => setShowTL(p => !p) },
          { l: "代休余额", v: `${compBal + unusedComp}天`, c: "#8B5CF6" },
          { l: "交通费", v: `¥${totalTrans.toLocaleString()}`, c: "#8B5CF6" },
          { l: "报销", v: `¥${totalExp.toLocaleString()}`, c: t.wn },
          ...(user.has_commission ? [{ l: "签单提成", v: `¥${totalComm.toLocaleString()}`, c: "#EC4899" }] : []),
        ].map((c, i) => (
          <div key={i} onClick={c.click} style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}`, cursor: c.click ? "pointer" : "default" }}>
            <div style={{ fontSize: 10, color: t.tm }}>{c.l}{c.click && <span style={{ color: t.ac, marginLeft: 4 }}>▾</span>}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.c, marginTop: 2 }}>{c.v}</div>
            {c.sub && <div style={{ fontSize: 9, color: t.td, marginTop: 2 }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* ====== 有休时间线 ====== */}
      {showTL && bal.timeline?.length > 0 && (
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: t.tx, margin: "0 0 12px" }}>有休付与时间线</h3>
          <div style={{ fontSize: 10, color: t.tm, marginBottom: 10 }}>入职日: {user.hire_date || "未设定"}</div>
          {bal.timeline.map((item, i) => {
            const sc = item.status === "当前" ? t.ac : item.status === "繰越中" ? "#8B5CF6" : item.status === "已过期" ? t.rd : t.td
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${t.bl}` }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: sc, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: item.status === "当前" ? 700 : 400, color: item.status === "未到达" ? t.td : t.tx }}>{item.label} — {item.days}天</div>
                  <div style={{ fontSize: 10, color: t.tm }}>付与: {item.grantDate} → 期限: {item.expiresDate}</div>
                </div>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 600, color: sc, background: `${sc}18` }}>{item.status}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ====== 勤怠编辑按钮 ====== */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, gap: 8 }}>
        {!ed ? <button onClick={startEd} style={{ padding: "7px 18px", borderRadius: 7, border: `1px solid ${t.ac}44`, background: `${t.ac}11`, color: t.ac, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>编辑勤怠</button> : <>
          <button onClick={() => sEd(false)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer" }}>取消</button>
          <button onClick={saveAtt} disabled={sv} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 12, fontWeight: 600, cursor: sv ? "wait" : "pointer", opacity: sv ? 0.7 : 1 }}>{sv ? "保存中..." : "保存勤怠"}</button>
        </>}
      </div>

      {/* ====== 勤怠表 ====== */}
      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", maxHeight: "55vh", marginBottom: 20 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed", width: "100%", minWidth: ed ? 604 : 784 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}><tr style={{ background: t.bgH }}>
              {(ed
                ? [["日期",56],["星期",48],["出勤",90],["休息",90],["休息结束",90],["退勤",90],["备注",140]]
                : [["日期",56],["星期",48],["出勤",90],["休息",90],["休息结束",90],["退勤",90],["劳动时长",90],["固定外加班",100],["备注",130]]
              ).map(([h, w], i) => (
                <th key={i} style={{ padding: "8px 6px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}`, whiteSpace: "nowrap", width: w }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                const ds = `${y}-${pad(m)}-${pad(day)}`; const r = recs[ds]; const w = weekday(y, m, day); const we = w === 0 || w === 6
                const lt = LEAVE_TYPES.find((l) => l.v === (ed ? dr[ds]?.nt : r?.note))
                const wm = Number(r?.work_minutes || 0); const ot = Math.max(wm - 480, 0); const isT = ds === todayStr()
                const mono = { fontFamily: "monospace", fontSize: 12 }
                if (ed) return (
                  <tr key={day} style={{ background: isT ? t.tb : we ? t.we : "transparent", borderBottom: `1px solid ${t.bl}` }}>
                    <td style={{ padding: "5px 6px", color: we ? t.rd : t.tx, fontWeight: 600, textAlign: "center" }}>{day}</td>
                    <td style={{ padding: "5px 4px", color: we ? t.rd : t.ts, fontSize: 11, textAlign: "center" }}>{WEEKDAYS[w]}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>{tI(ds, "ci")}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>{tI(ds, "bs")}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>{tI(ds, "be")}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>{tI(ds, "co")}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>
                      <select value={dr[ds]?.nt || ""} onChange={(e) => sDr((p) => ({ ...p, [ds]: { ...p[ds], nt: e.target.value } }))} style={{ padding: 3, borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 10 }}>
                        <option value="">—</option>{LEAVE_TYPES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
                      </select>
                    </td>
                  </tr>
                )
                return (
                  <tr key={day} style={{ background: isT ? t.tb : we ? t.we : "transparent", borderBottom: `1px solid ${t.bl}` }}>
                    <td style={{ padding: "7px 6px", color: we ? t.rd : t.tx, fontWeight: 600, textAlign: "center" }}>{day}</td>
                    <td style={{ padding: "7px 4px", color: we ? t.rd : t.ts, fontSize: 11, textAlign: "center" }}>{WEEKDAYS[w]}</td>
                    <td style={{ padding: "7px 6px", color: t.ac, textAlign: "center", ...mono }}>{r?.clock_in?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", color: t.ts, textAlign: "center", ...mono }}>{r?.break_start?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", color: t.ts, textAlign: "center", ...mono }}>{r?.break_end?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", color: t.ac, textAlign: "center", ...mono }}>{r?.clock_out?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", textAlign: "center", ...mono, color: t.tx }}>{wm > 0 ? fmtMinutes(wm) : ""}</td>
                    <td style={{ padding: "7px 6px", textAlign: "center", ...mono, color: ot > 0 ? t.wn : t.td }}>{ot > 0 ? fmtMinutes(ot) : ""}</td>
                    <td style={{ padding: "7px 6px", textAlign: "center" }}>{lt && <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, color: lt.c, background: lt.bg + "33" }}>{lt.l}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>}

      {/* ====== Tab 切换栏 ====== */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map(tb => {
          const Icon = tb.icon
          const active = tab === tb.key
          return (
            <button key={tb.key} onClick={() => setTab(tb.key)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${active ? t.ac : t.bd}`, background: active ? `${t.ac}12` : "transparent", color: active ? t.ac : t.ts, fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, position: "relative" }}>
              <Icon size={14} />
              {tb.label}
              {tb.badge > 0 && <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: t.wn, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{tb.badge}</span>}
            </button>
          )
        })}
      </div>

      {/* ====== 假期申请 Tab ====== */}
      {tab === "leave" && (
        <div>
          {isAdmin && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: `#8B5CF608`, border: `1px solid #8B5CF625` }}>
              <span style={{ fontSize: 11, color: "#8B5CF6", fontWeight: 600 }}>管理者 · 查看历史记录</span>
              <select value={leaveViewEmp} onChange={(e) => setLeaveViewEmp(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 11, minWidth: 160 }}>
                <option value="">本人 ({user.name})</option>
                {allEmps.filter(e => e.id !== user.id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {leaveViewEmp && <span style={{ fontSize: 10, color: t.tm }}>当前查看：{allEmps.find(e => e.id === leaveViewEmp)?.name} 的有休记录</span>}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => {
              if (leaveShow) { resetLeaveForm(); return }
              setLeaveShow(true)
              if (isAdmin && leaveViewEmp) { setLeaveHistMode(true); setSelEmp(leaveViewEmp) }
            }} style={{ padding: "8px 18px", borderRadius: 8, border: leaveShow ? `1px solid ${t.bd}` : "none", background: leaveShow ? "transparent" : t.ac, color: leaveShow ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{leaveShow ? "✕ 关闭" : leaveViewEmp ? `+ 给 ${allEmps.find(e => e.id === leaveViewEmp)?.name} 录入历史` : "+ 新申请"}</button>
          </div>

          {leaveShow && (
            <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: 0 }}>{leaveEditId ? "编辑申请" : leaveHistMode ? "历史录入" : "新申请"}</h3>
                <HistModeUI histMode={leaveHistMode} setHistMode={setLeaveHistMode} editId={leaveEditId} />
              </div>
              <HistEmpSelect histMode={leaveHistMode} />
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>类型</label>
                <select value={leaveFm.leave_type} onChange={(e) => setLeaveFm(p => ({ ...p, leave_type: e.target.value }))} style={fmS}>{LEAVE_TYPES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}</select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{leaveEditId ? "日期" : "选择日期（点击选取，可多选）"}</label>
                {leaveEditId ? (
                  <input type="date" value={leaveFm.dates[0] || ""} onChange={(e) => setLeaveFm(p => ({ ...p, dates: [e.target.value] }))} style={fmS} />
                ) : (
                  <DateMultiPicker selected={leaveFm.dates} onChange={(dates) => setLeaveFm(p => ({ ...p, dates }))} t={t} />
                )}
              </div>
              <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 10, color: t.ts }}>半天休</label>
                <button type="button" onClick={() => setLeaveFm(p => ({ ...p, is_half_day: !p.is_half_day }))} style={{ width: 40, height: 22, borderRadius: 11, border: "none", background: leaveFm.is_half_day ? t.ac : t.bd, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 3, left: leaveFm.is_half_day ? 21 : 3, transition: "left 0.2s" }} />
                </button>
                <span style={{ fontSize: 10, color: t.tm }}>{leaveFm.is_half_day ? "0.5天" : "1天"}</span>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由</label>
                <input placeholder="例：私事、身体不适" value={leaveFm.reason} onChange={(e) => setLeaveFm(p => ({ ...p, reason: e.target.value }))} style={fmS} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={submitLeave} disabled={leaveSub || !leaveFm.dates.length || (leaveHistMode && !selEmp)} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (leaveSub || !leaveFm.dates.length) ? "not-allowed" : "pointer", opacity: (leaveSub || !leaveFm.dates.length || (leaveHistMode && !selEmp)) ? 0.5 : 1 }}>{leaveSub ? "提交中..." : leaveEditId ? "保存修改" : `提交申请（${leaveFm.dates.length}天）`}</button>
                {leaveEditId && <button onClick={resetLeaveForm} style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>取消编辑</button>}
              </div>
            </div>
          )}

          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
            {!leaveReqs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无申请记录</div> : leaveReqs.map((r) => {
              const lt = LEAVE_TYPES.find((l) => l.v === r.leave_type)
              const isPending = r.status === "申請中"
              return (
                <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: lt?.c, background: (lt?.bg || "#eee") + "33" }}>{r.leave_type}</span>
                    <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{r.leave_date}{r.is_half_day && <span style={{ fontSize: 9, color: t.ac, marginLeft: 4 }}>半天</span>}</span>
                    {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {(isPending || isAdmin) && (
                      <button onClick={() => startLeaveEdit(r)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 10, cursor: "pointer" }}>编辑</button>
                    )}
                    {(isPending || isAdmin) && (
                      <button onClick={() => delLeave(r.id, r.status)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>{isPending ? "取消" : "删除"}</button>
                    )}
                    <span style={statusBadge(r.status)}>{r.status}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ====== 换休管理 Tab ====== */}
      {tab === "swap" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => { if (swapShow) resetSwapForm(); else setSwapShow(true) }} style={{ padding: "8px 18px", borderRadius: 8, border: swapShow ? `1px solid ${t.bd}` : "none", background: swapShow ? "transparent" : t.ac, color: swapShow ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{swapShow ? "✕ 关闭" : "+ 新申请"}</button>
          </div>

          {swapShow && (
            <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: 0 }}>{swapEditId ? "编辑申请" : swapHistMode ? "历史录入" : "换休申请"}</h3>
                <HistModeUI histMode={swapHistMode} setHistMode={setSwapHistMode} editId={swapEditId} />
              </div>
              <HistEmpSelect histMode={swapHistMode} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>类型</label>
                  <select value={swapFm.swap_type} onChange={(e) => setSwapFm(p => ({ ...p, swap_type: e.target.value }))} style={fmS}>
                    <option value="休日出勤">休日出勤（定休日/祝日上班）</option>
                    <option value="出勤日休息">出勤日休息（工作日临时休息）</option>
                  </select>
                </div>
                {swapFm.swap_type === "休日出勤" && (
                  <div>
                    <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>补偿方式</label>
                    <select value={swapFm.compensation_type} onChange={(e) => setSwapFm(p => ({ ...p, compensation_type: e.target.value }))} style={fmS}>
                      <option value="換休">換休（换一天休息）</option>
                      <option value="加班">加班（算加班费）</option>
                    </select>
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>
                  {swapEditId ? (swapFm.swap_type === "休日出勤" ? "出勤日期" : "休息日期") : (swapFm.swap_type === "休日出勤" ? "出勤日期（点击选取，可多选）" : "休息日期（点击选取，可多选）")}
                </label>
                {swapEditId ? (
                  <input type="date" value={swapFm.original_dates[0] || ""} onChange={(e) => setSwapFm(p => ({ ...p, original_dates: [e.target.value] }))} style={fmS} />
                ) : (
                  <DateMultiPicker selected={swapFm.original_dates} onChange={(dates) => setSwapFm(p => ({ ...p, original_dates: dates }))} t={t} />
                )}
              </div>
              {(swapEditId || swapFm.original_dates.length === 1) && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{swapFm.swap_type === "休日出勤" ? "换休日期（可留空=待定）" : "补班日期（可留空=待定）"}</label>
                  <input type="date" value={swapFm.swap_date} onChange={(e) => setSwapFm(p => ({ ...p, swap_date: e.target.value }))} style={fmS} />
                </div>
              )}
              {!swapEditId && swapFm.original_dates.length > 1 && (
                <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: `${t.ac}10`, fontSize: 10, color: t.ac }}>
                  多日期模式：将为每个日期创建独立申请，换休/补班日期均设为待定，可在批准后单独编辑
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由</label>
                <input placeholder="例：旺季需要出勤" value={swapFm.reason} onChange={(e) => setSwapFm(p => ({ ...p, reason: e.target.value }))} style={fmS} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={submitSwap} disabled={swapSub || !swapFm.original_dates.length || (swapHistMode && !selEmp)} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (swapSub || !swapFm.original_dates.length) ? "not-allowed" : "pointer", opacity: (swapSub || !swapFm.original_dates.length || (swapHistMode && !selEmp)) ? 0.5 : 1 }}>{swapSub ? "提交中..." : swapEditId ? "保存修改" : `提交申请（${swapFm.original_dates.length}天）`}</button>
                {swapEditId && <button onClick={resetSwapForm} style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>取消编辑</button>}
              </div>
            </div>
          )}

          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
            {!swapReqs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无换休记录</div> : swapReqs.map((r) => {
              const isPending = r.status === "申請中"
              return (
                <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.swap_type === "休日出勤" ? "#8B5CF6" : "#F59E0B", background: r.swap_type === "休日出勤" ? "#8B5CF620" : "#F59E0B20" }}>{r.swap_type}</span>
                    {r.swap_type === "休日出勤" && <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.compensation_type === "換休" ? "#8B5CF6" : t.rd, background: r.compensation_type === "換休" ? "#8B5CF610" : `${t.rd}10` }}>{r.compensation_type}</span>}
                    <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{r.original_date}</span>
                    <span style={{ fontSize: 10, color: t.tm }}>→</span>
                    <span style={{ fontSize: 12, color: r.swap_date ? t.tx : t.td, fontFamily: "monospace" }}>{r.swap_date || "待定"}</span>
                    {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isPending && <>
                      <button onClick={() => startSwapEdit(r)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 10, cursor: "pointer" }}>编辑</button>
                      <button onClick={() => delSwap(r.id)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>取消</button>
                    </>}
                    <span style={statusBadge(r.status)}>{r.status}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ====== 报销一览 Tab ====== */}
{tab === "summary" && (
  <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.bd}` }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>{y}年{m}月 报销汇总</div>
      <div style={{ fontSize: 11, color: t.tm, marginTop: 2 }}>{user.name}</div>
    </div>

    {/* 交通费明细 */}
    <div style={{ padding: "12px 20px", borderBottom: `1px solid ${t.bl}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#8B5CF6", marginBottom: 8 }}>交通費</div>
      {transRows.filter(r => !r._isNew).length === 0
        ? <div style={{ fontSize: 11, color: t.td }}>本月无记录</div>
        : transRows.filter(r => !r._isNew).map(r => (
          <div key={r._key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 11 }}>
            <div style={{ display: "flex", gap: 8, color: t.ts }}>
              <span style={{ fontFamily: "monospace" }}>{r.claim_date}</span>
              <span>{r.route}</span>
              <span style={{ color: t.td }}>{r.round_trip ? "往返" : "单程"}</span>
            </div>
            <span style={{ fontWeight: 600, color: "#8B5CF6" }}>¥{Number(r.amount || 0).toLocaleString()}</span>
          </div>
        ))
      }
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, marginTop: 8, borderTop: `1px dashed ${t.bl}`, fontSize: 12, fontWeight: 700, color: "#8B5CF6" }}>小计: ¥{totalTrans.toLocaleString()}</div>
    </div>

    {/* 签单提成明细 */}
    {user.has_commission && (
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${t.bl}` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#EC4899", marginBottom: 8 }}>签单提成</div>
        {commRows.filter(r => !r._isNew).length === 0
          ? <div style={{ fontSize: 11, color: t.td }}>本月无记录</div>
          : commRows.filter(r => !r._isNew).map(r => (
            <div key={r._key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 11 }}>
              <div style={{ display: "flex", gap: 8, color: t.ts }}>
                <span style={{ fontFamily: "monospace" }}>{r.entry_date}</span>
                <span>{r.student_name}</span>
                <span style={{ color: t.td }}>¥{Number(r.tuition_amount || 0).toLocaleString()} × {r.commission_rate}%</span>
              </div>
              <span style={{ fontWeight: 600, color: "#EC4899" }}>¥{r.commission_amount.toLocaleString()}</span>
            </div>
          ))
        }
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, marginTop: 8, borderTop: `1px dashed ${t.bl}`, fontSize: 12, fontWeight: 700, color: "#EC4899" }}>小计: ¥{totalComm.toLocaleString()}</div>
      </div>
    )}

    {/* 合计 */}
    <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>本月报销合计</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: t.gn }}>¥{(totalTrans + totalComm).toLocaleString()}</span>
    </div>
  </div>
)}
      
      {/* ====== 交通費 Tab ====== */}
      {tab === "transport" && (
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: t.bgH }}>{["日期", "路线", "往返", "金额", "备注", ""].map((h, i) => <th key={i} style={{ padding: "8px 8px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}` }}>{h}</th>)}</tr></thead>
            <tbody>{transRows.map(r => {
              const isEd = r._isNew || editingKeys.has(r._key)
              const canConfirm = r._isNew && r.claim_date && parseFloat(r.amount) > 0
              const isEditingExisting = !r._isNew && editingKeys.has(r._key)
              return (
                <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{isEd ? <input type="date" value={r.claim_date} onChange={e => updateTrans(r._key, "claim_date", e.target.value)} style={{ ...iS, width: 130 }} /> : <span style={roS}>{r.claim_date}</span>}</td>
                  <td style={{ padding: "6px 8px" }}>{isEd ? <input type="text" value={r.route || ""} onChange={e => updateTrans(r._key, "route", e.target.value)} placeholder="新宿→高田馬場" style={{ ...iS, width: "100%", fontFamily: "inherit" }} /> : <span style={{ fontSize: 11, color: t.tx }}>{r.route}</span>}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", width: 50 }}>{isEd ? <input type="checkbox" checked={r.round_trip} onChange={e => updateTrans(r._key, "round_trip", e.target.checked)} /> : <span style={{ fontSize: 11, color: t.ts }}>{r.round_trip ? "往返" : "单程"}</span>}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{isEd ? <input type="number" value={r.amount} onChange={e => updateTrans(r._key, "amount", e.target.value)} placeholder="0" style={{ ...iS, width: 80, textAlign: "right" }} /> : <span style={{ fontSize: 12, fontWeight: 600, color: "#8B5CF6" }}>¥{Number(r.amount || 0).toLocaleString()}</span>}</td>
                  <td style={{ padding: "6px 8px" }}>{isEd ? <input type="text" value={r.note || ""} onChange={e => updateTrans(r._key, "note", e.target.value)} style={{ ...iS, width: "100%", fontFamily: "inherit", fontSize: 10 }} /> : <span style={{ fontSize: 10, color: t.ts }}>{r.note}</span>}</td>
                  <td style={{ padding: "6px 8px", width: 80 }}>
                    {canConfirm && (
                      <div style={{ display: "flex", gap: 3 }}>
                        <button onClick={() => saveTransRow(r._key)} disabled={sv} style={smallBtn(t.gn)}><Check size={11} /> 确认</button>
                        <button onClick={() => removeTrans(r._key)} style={{ background: "none", border: "none", color: t.td, cursor: "pointer", padding: 2 }}><Trash2 size={11} /></button>
                      </div>
                    )}
                    {isEditingExisting && (
                      <div style={{ display: "flex", gap: 3 }}>
                        <button onClick={() => saveTransRow(r._key)} disabled={sv} style={smallBtn(t.gn)}><Check size={11} /></button>
                        <button onClick={() => cancelEdit(r._key)} style={smallBtn(t.ts)}><X size={11} /></button>
                      </div>
                    )}
                    {!r._isNew && !editingKeys.has(r._key) && (
                      <div style={{ display: "flex", gap: 3 }}>
                        <button onClick={() => toggleEdit(r._key)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 4, color: t.ts, cursor: "pointer", padding: "2px 4px", display: "flex", alignItems: "center" }}><Pencil size={11} /></button>
                        <button onClick={() => delTrans(r.id)} style={{ background: "none", border: "none", color: t.rd, cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}><Trash2 size={11} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}</tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${t.bd}` }}>
              <td style={{ padding: "10px 8px" }}><button onClick={addTransRows} style={{ background: "none", border: `1px dashed ${t.bd}`, borderRadius: 6, padding: "4px 12px", color: t.ac, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus size={12} /> 添加</button></td>
              <td colSpan={2}></td>
              <td style={{ padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "#8B5CF6", textAlign: "center" }}>¥{totalTrans.toLocaleString()}</td>
              <td colSpan={2}></td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {/* ====== 报销登记 Tab ====== */}
      {tab === "expense" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => { if (expShow) resetExpForm(); else setExpShow(true) }} style={{ padding: "8px 18px", borderRadius: 8, border: expShow ? `1px solid ${t.bd}` : "none", background: expShow ? "transparent" : t.ac, color: expShow ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{expShow ? "✕ 关闭" : "+ 新报销"}</button>
          </div>

          {expShow && (
            <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>{expEditId ? "编辑报销" : "报销登记"}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>日期</label><input type="date" value={expFm.claim_date} onChange={(e) => setExpFm(p => ({ ...p, claim_date: e.target.value }))} style={fmS} /></div>
                <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>类目</label><select value={expFm.category} onChange={(e) => setExpFm(p => ({ ...p, category: e.target.value }))} style={fmS}>{EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>金额（円）</label><input type="number" value={expFm.amount} onChange={(e) => setExpFm(p => ({ ...p, amount: e.target.value }))} style={fmS} /></div>
                <div><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>备注</label><input placeholder="可选" value={expFm.note} onChange={(e) => setExpFm(p => ({ ...p, note: e.target.value }))} style={fmS} /></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={submitExp} disabled={expSub || !expFm.amount} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (expSub || !expFm.amount) ? "not-allowed" : "pointer", opacity: (expSub || !expFm.amount) ? 0.5 : 1 }}>{expSub ? "保存中..." : expEditId ? "更新" : "登记"}</button>
                {expEditId && <button onClick={resetExpForm} style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>取消</button>}
              </div>
            </div>
          )}

          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
            {!expRecs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无报销记录</div> : expRecs.map(r => (
              <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{r.claim_date}</span>
                  <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: t.ac, background: `${t.ac}15` }}>{r.category}</span>
                  {r.note && <span style={{ fontSize: 11, color: t.ts }}>{r.note}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>¥{Number(r.amount || 0).toLocaleString()}</span>
                  <button onClick={() => startExpEdit(r)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 4, color: t.ts, cursor: "pointer", padding: "2px 4px", display: "flex", alignItems: "center" }}><Pencil size={11} /></button>
                  <button onClick={() => delExp(r.id)} style={{ background: "none", border: "none", color: t.rd, cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* ====== 签单提成 Tab ====== */}
      {tab === "commission" && user.has_commission && (
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 550 }}>
            <thead><tr style={{ background: t.bgH }}>{["日期", "第N个", "学生名字", "学费", "提成率(%)", "提成金额", ""].map((h, i) => <th key={i} style={{ padding: "8px 8px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}` }}>{h}</th>)}</tr></thead>
            <tbody>{commRows.map(r => {
              const isEd = r._isNew || editingKeys.has(r._key)
              const canConfirm = r._isNew && r.entry_date && r.student_name && parseFloat(r.tuition_amount) > 0
              const isEditingExisting = !r._isNew && editingKeys.has(r._key)
              return (
                <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{isEd ? <input type="date" value={r.entry_date} onChange={e => updateComm(r._key, "entry_date", e.target.value)} style={{ ...iS, width: 130 }} /> : <span style={roS}>{r.entry_date}</span>}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{isEd ? <input type="number" value={r.seq_number} onChange={e => updateComm(r._key, "seq_number", e.target.value)} placeholder="1" style={{ ...iS, width: 45, textAlign: "center" }} /> : <span style={{ fontSize: 12 }}>{r.seq_number}</span>}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{isEd ? <input type="text" value={r.student_name} onChange={e => updateComm(r._key, "student_name", e.target.value)} placeholder="学生姓名" style={{ ...iS, width: 100, fontFamily: "inherit" }} /> : <span style={{ fontSize: 11 }}>{r.student_name}</span>}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{isEd ? <input type="number" value={r.tuition_amount} onChange={e => updateComm(r._key, "tuition_amount", e.target.value)} placeholder="0" style={{ ...iS, width: 90, textAlign: "right" }} /> : <span style={{ fontSize: 12 }}>¥{Number(r.tuition_amount || 0).toLocaleString()}</span>}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{isEd ? <input type="number" value={r.commission_rate} onChange={e => updateComm(r._key, "commission_rate", e.target.value)} placeholder="0" style={{ ...iS, width: 55, textAlign: "right" }} /> : <span style={{ fontSize: 12 }}>{r.commission_rate}%</span>}</td>
                  <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "#EC4899", textAlign: "center" }}>{r.commission_amount > 0 ? `¥${r.commission_amount.toLocaleString()}` : ""}</td>
                  <td style={{ padding: "6px 8px", width: 80 }}>
                    {canConfirm && (
                      <div style={{ display: "flex", gap: 3 }}>
                        <button onClick={() => saveCommRow(r._key)} disabled={sv} style={smallBtn(t.gn)}><Check size={11} /> 确认</button>
                        <button onClick={() => removeComm(r._key)} style={{ background: "none", border: "none", color: t.td, cursor: "pointer", padding: 2 }}><Trash2 size={11} /></button>
                      </div>
                    )}
                    {isEditingExisting && (
                      <div style={{ display: "flex", gap: 3 }}>
                        <button onClick={() => saveCommRow(r._key)} disabled={sv} style={smallBtn(t.gn)}><Check size={11} /></button>
                        <button onClick={() => cancelEdit(r._key)} style={smallBtn(t.ts)}><X size={11} /></button>
                      </div>
                    )}
                    {!r._isNew && !editingKeys.has(r._key) && (
                      <div style={{ display: "flex", gap: 3 }}>
                        <button onClick={() => toggleEdit(r._key)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 4, color: t.ts, cursor: "pointer", padding: "2px 4px", display: "flex", alignItems: "center" }}><Pencil size={11} /></button>
                        <button onClick={() => delComm(r.id)} style={{ background: "none", border: "none", color: t.rd, cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}><Trash2 size={11} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}</tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${t.bd}` }}>
              <td colSpan={5} style={{ padding: "10px 8px" }}><button onClick={addCommRows} style={{ background: "none", border: `1px dashed ${t.bd}`, borderRadius: 6, padding: "4px 12px", color: t.ac, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus size={12} /> 添加</button></td>
              <td style={{ padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "#EC4899", textAlign: "center" }}>¥{totalComm.toLocaleString()}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
