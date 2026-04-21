import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { LEAVE_TYPES, WEEKDAYS, daysInMonth, weekday, isWeekend, pad, todayStr, fmtMinutes, isFullTime, fmtDateW } from "../../config/constants"
import { calcPaidLeave } from "../../config/leaveCalc"
import DateMultiPicker from "../../components/DateMultiPicker"
import { Pencil, Trash2, Plus, Save, ChevronLeft, ChevronRight, ClipboardList, CalendarX2, ArrowLeftRight, Train, Receipt, Check, X, Banknote, ListChecks, History, Users, Flag } from "lucide-react"

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
  // mainTab: 顶层 tab — work=勤务时间登记 / leave=假期管理 / expense=报销
  const [mainTab, setMainTab] = useState("work")
  const [tab, setTab] = useState("leave") // 子 tab

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

  // ====== 红日子休息记录 (赤日休) ======
  const [akaShow, setAkaShow] = useState(false)
  const [akaSub, setAkaSub] = useState(false)
  const [akaFm, setAkaFm] = useState({ dates: [], reason: "" })
  const [akaEditId, setAkaEditId] = useState(null)

  // ====== 换休 ======
  const [swapReqs, setSwapReqs] = useState([])
  const [swapShow, setSwapShow] = useState(false)
  const [swapSub, setSwapSub] = useState(false)
  const [swapFm, setSwapFm] = useState({ swap_type: "休日出勤", original_dates: [], swap_date: "", compensation_type: "換休", reason: "" })
  const [swapEditId, setSwapEditId] = useState(null)
  const [swapHistMode, setSwapHistMode] = useState(false)

  // ====== 过去记录（自助补录 有休/代休） ======
  // histFm.dates: 有休=多日；代休=代休日(单日，dates[0])
  // histFm.work_date: 仅代休用，对应"节假日出勤日"
  // histEditId: null | { table: "leave"|"swap", id }
  const [histShow, setHistShow] = useState(false)
  const [histFm, setHistFm] = useState({ leave_type: "有休", dates: [], reason: "", is_half_day: false, work_date: "" })
  const [histEditId, setHistEditId] = useState(null)
  const [histSub, setHistSub] = useState(false)

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

  // ====== 团队假期总览（admin 专用） ======
  const [overview, setOverview] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(false)

  // ====== 固定交通费 & 变更申请 ======
  const [myTransAmount, setMyTransAmount] = useState(0)
  const [myTransChangeReqs, setMyTransChangeReqs] = useState([])
  const [transChangeShow, setTransChangeShow] = useState(false)
  const [transChangeFm, setTransChangeFm] = useState({ requested_amount: "", effective_from: "", reason: "" })
  const [transChangeSub, setTransChangeSub] = useState(false)

  // ==================== 数据加载 ====================
  const load = useCallback(async () => {
    sLd(true)
    const from = `${y}-${pad(m)}-01`, to = `${y}-${pad(m)}-${pad(days)}`
    const [attData, trData, cmData, lvData, swData, usedReqs, compReqs, expData, meData, myTChg] = await Promise.all([
      sbGet(`attendance_records?employee_id=eq.${user.id}&work_date=gte.${from}&work_date=lte.${to}&order=work_date`, tk),
      sbGet(`transportation_claims?employee_id=eq.${user.id}&claim_date=gte.${from}&claim_date=lte.${to}&order=claim_date&select=*`, tk),
      user.has_commission ? sbGet(`commission_entries?employee_id=eq.${user.id}&entry_date=gte.${from}&entry_date=lte.${to}&order=entry_date,seq_number&select=*`, tk) : Promise.resolve([]),
      sbGet(`leave_requests?employee_id=eq.${(isAdmin && leaveViewEmp) ? leaveViewEmp : user.id}&order=leave_date.desc&select=*`, tk),
      sbGet(`day_swap_requests?employee_id=eq.${(isAdmin && leaveViewEmp) ? leaveViewEmp : user.id}&order=created_at.desc&select=*`, tk),
      sbGet(`leave_requests?employee_id=eq.${user.id}&status=eq.承認&leave_type=eq.有休&select=leave_date,is_half_day`, tk),
      sbGet(`day_swap_requests?employee_id=eq.${user.id}&swap_type=eq.休日出勤&compensation_type=eq.換休&status=eq.承認&select=id,swap_date`, tk),
      sbGet(`expense_claims?employee_id=eq.${user.id}&order=claim_date.desc&select=*`, tk),
      sbGet(`employees?id=eq.${user.id}&select=transport_amount`, tk),
      sbGet(`transport_change_requests?employee_id=eq.${user.id}&order=created_at.desc&select=*`, tk),
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
    setMyTransAmount(Number(meData?.[0]?.transport_amount || 0))
    setMyTransChangeReqs(myTChg || [])

    if (isAdmin && !allEmps.length) {
      const emps = await sbGet("employees?is_active=eq.true&order=name&select=id,name,employment_type,hire_date,company_id", tk)
      setAllEmps(emps || [])
    }

    setEditingKeys(new Set())
    sLd(false)
  }, [y, m, days, user.id, tk, user.has_commission, isAdmin, leaveViewEmp])

  useEffect(() => { load() }, [load])

  // 团队假期总览：切到 overview tab 时拉全员 approved 有休 + 换休做一次汇总
  useEffect(() => {
    if (!isAdmin || mainTab !== "overview") return
    let cancelled = false
    ;(async () => {
      setOverviewLoading(true)
      const [emps, leaves, swaps] = await Promise.all([
        sbGet("employees?is_active=eq.true&order=name&select=id,name,employment_type,hire_date,company_id", tk),
        sbGet("leave_requests?status=eq.承認&select=employee_id,leave_type,leave_date,is_half_day", tk),
        sbGet("day_swap_requests?status=eq.承認&swap_type=eq.休日出勤&compensation_type=eq.換休&select=employee_id,swap_date,deadline", tk),
      ])
      if (cancelled) return
      const currentYear = new Date().getFullYear()
      const now = new Date()
      const rows = (emps || []).filter(e => isFullTime(e.employment_type)).map(emp => {
        const myLeaves = (leaves || []).filter(l => l.employee_id === emp.id)
        const myPaid = myLeaves.filter(l => l.leave_type === "有休")
        const paid = calcPaidLeave(emp.hire_date, myPaid)
        const mySwaps = (swaps || []).filter(s => s.employee_id === emp.id)
        const compUnused = mySwaps.filter(s => !s.swap_date)
        const expiringSoon = compUnused.filter(s => {
          if (!s.deadline) return false
          const diff = (new Date(s.deadline) - now) / (1000 * 60 * 60 * 24)
          return diff >= 0 && diff <= 14
        })
        const thisYearLeaves = myLeaves.filter(l => l.leave_date && l.leave_date.startsWith(String(currentYear)))
        const byType = {}
        for (const l of thisYearLeaves) {
          const inc = l.is_half_day ? 0.5 : 1
          byType[l.leave_type] = (byType[l.leave_type] || 0) + inc
        }
        return {
          emp,
          paid,
          compUnused: compUnused.length,
          compExpiring: expiringSoon.length,
          thisYearTotal: thisYearLeaves.reduce((acc, l) => acc + (l.is_half_day ? 0.5 : 1), 0),
          byType,
        }
      })
      setOverview(rows)
      setOverviewLoading(false)
    })()
    return () => { cancelled = true }
  }, [mainTab, isAdmin, tk])

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
    if (!leaveFm.dates.length || !leaveFm.reason.trim()) return
    setLeaveSub(true)
    const targetId = leaveHistMode && selEmp ? selEmp : user.id
    if (leaveEditId) {
      await sbPatch(`leave_requests?id=eq.${leaveEditId}`, { leave_type: "有休", leave_date: leaveFm.dates[0], reason: leaveFm.reason.trim(), is_half_day: leaveFm.is_half_day }, tk)
    } else {
      for (const date of leaveFm.dates) {
        const rec = { employee_id: targetId, leave_type: "有休", leave_date: date, reason: leaveFm.reason.trim(), is_half_day: leaveFm.is_half_day }
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

  // ==================== 红日子休息记录 (赤日休) ====================
  const resetAkaForm = () => { setAkaFm({ dates: [], reason: "" }); setAkaEditId(null); setAkaShow(false) }

  const submitAka = async () => {
    if (!akaFm.dates.length || !akaFm.reason.trim()) return
    setAkaSub(true)
    const targetId = (isAdmin && leaveViewEmp) ? leaveViewEmp : user.id
    if (akaEditId) {
      await sbPatch(`leave_requests?id=eq.${akaEditId}`, {
        leave_date: akaFm.dates[0], reason: akaFm.reason.trim(),
      }, tk)
    } else {
      for (const date of akaFm.dates) {
        await sbPost("leave_requests", {
          employee_id: targetId, leave_type: "赤日休", leave_date: date,
          reason: akaFm.reason.trim(), is_half_day: false,
        }, tk)
      }
    }
    await load(); resetAkaForm(); setAkaSub(false)
  }

  const startAkaEdit = (r) => {
    setAkaFm({ dates: [r.leave_date], reason: r.reason || "" })
    setAkaEditId(r.id); setAkaShow(true); setTab("aka")
  }

  // ==================== 过去记录（自助补录） ====================
  const resetHistForm = () => { setHistFm({ leave_type: "有休", dates: [], reason: "", is_half_day: false, work_date: "" }); setHistEditId(null); setHistShow(false) }

  const submitHist = async () => {
    if (!histFm.reason.trim()) return
    if (histFm.leave_type === "有休") {
      if (!histFm.dates.length) return
      setHistSub(true)
      if (histEditId?.table === "leave") {
        await sbPatch(`leave_requests?id=eq.${histEditId.id}`, {
          leave_type: "有休", leave_date: histFm.dates[0],
          reason: histFm.reason || null, is_half_day: histFm.is_half_day,
        }, tk)
      } else {
        for (const date of histFm.dates) {
          await sbPost("leave_requests", {
            employee_id: (isAdmin && leaveViewEmp) ? leaveViewEmp : user.id, leave_type: "有休", leave_date: date,
            reason: histFm.reason || null, is_half_day: histFm.is_half_day,
            status: "承認", approved_at: new Date().toISOString(),
          }, tk)
        }
      }
    } else { // 代休：写入 day_swap_requests
      if (!histFm.work_date || !histFm.dates[0]) return
      setHistSub(true)
      if (histEditId?.table === "swap") {
        await sbPatch(`day_swap_requests?id=eq.${histEditId.id}`, {
          original_date: histFm.work_date, swap_date: histFm.dates[0],
          reason: histFm.reason || null,
        }, tk)
      } else {
        await sbPost("day_swap_requests", {
          employee_id: (isAdmin && leaveViewEmp) ? leaveViewEmp : user.id, swap_type: "休日出勤", compensation_type: "代休",
          original_date: histFm.work_date, swap_date: histFm.dates[0],
          reason: histFm.reason || null,
          status: "承認", approved_at: new Date().toISOString(), is_confirmed: true,
        }, tk)
      }
    }
    await load(); resetHistForm(); setHistSub(false)
  }

  const startHistEdit = (r, table) => {
    if (table === "leave") {
      setHistFm({ leave_type: "有休", dates: [r.leave_date], reason: r.reason || "", is_half_day: r.is_half_day || false, work_date: "" })
    } else {
      setHistFm({ leave_type: "代休", dates: [r.swap_date || ""], reason: r.reason || "", is_half_day: false, work_date: r.original_date })
    }
    setHistEditId({ table, id: r.id }); setHistShow(true)
  }

  const delHist = async (id, table) => {
    if (!confirm("确定要删除这条历史记录吗？此操作不可撤销。")) return
    await sbDel(`${table === "leave" ? "leave_requests" : "day_swap_requests"}?id=eq.${id}`, tk)
    await load()
  }

  // ==================== 换休管理 ====================
  const resetSwapForm = () => { setSwapFm({ swap_type: "休日出勤", original_dates: [], swap_date: "", compensation_type: "換休", reason: "" }); setSwapEditId(null); setSwapShow(false) }

  const submitSwap = async () => {
    if (!swapFm.original_dates.length || !swapFm.reason.trim()) return
    if (swapFm.swap_type === "出勤日休息" && swapFm.compensation_type === "使用代休") {
      const available = Math.max(0, compBal + unusedComp - usedViaSwap)
      if (available < swapFm.original_dates.length) {
        alert(`代休余额不足：申请 ${swapFm.original_dates.length} 天，可用 ${available} 天`)
        return
      }
    }
    setSwapSub(true)
    const targetId = swapHistMode && selEmp ? selEmp : user.id
    // compensation_type：休日出勤 -> 換休/加班；出勤日休息 -> NULL（補班）或 使用代休
    const compTypeOf = () => {
      if (swapFm.swap_type === "休日出勤") return swapFm.compensation_type
      if (swapFm.swap_type === "出勤日休息" && swapFm.compensation_type === "使用代休") return "使用代休"
      return null
    }
    if (swapEditId) {
      const patch = { swap_type: swapFm.swap_type, original_date: swapFm.original_dates[0], swap_date: swapFm.swap_date || null, compensation_type: compTypeOf(), reason: swapFm.reason.trim() }
      if (swapFm.swap_type === "休日出勤" && swapFm.compensation_type === "換休") {
        const d = new Date(swapFm.original_dates[0]); d.setDate(d.getDate() + 60); patch.deadline = d.toISOString().split("T")[0]
      } else { patch.deadline = null }
      await sbPatch(`day_swap_requests?id=eq.${swapEditId}`, patch, tk)
    } else {
      for (const date of swapFm.original_dates) {
        const payload = { employee_id: targetId, swap_type: swapFm.swap_type, original_date: date, swap_date: swapFm.original_dates.length === 1 ? (swapFm.swap_date || null) : null, compensation_type: compTypeOf(), reason: swapFm.reason.trim() }
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
    const defaultComp = r.compensation_type ?? (r.swap_type === "休日出勤" ? "換休" : "")
    setSwapFm({ swap_type: r.swap_type, original_dates: [r.original_date], swap_date: r.swap_date || "", compensation_type: defaultComp, reason: r.reason || "" })
    setSwapEditId(r.id); setSwapShow(true); setTab("swap")
  }

  const delSwap = async (id, status) => {
    const msg = status === "申請中" ? "确定要取消这条申请吗？" : "确定要删除这条已批准的换休记录吗？此操作不可撤销。"
    if (!confirm(msg)) return
    await sbDel(`day_swap_requests?id=eq.${id}`, tk); await load()
  }

  // ==================== 交通费（逐行保存） ====================
  const updateTrans = (key, field, value) => setTransRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value, _dirty: true } : r))
  const addTransRows = () => setTransRows(prev => [...prev, ...Array.from({ length: 2 }, mkTrans)])
  const removeTrans = (key) => setTransRows(prev => prev.filter(r => r._key !== key))
  const delTrans = async (id) => { if (!confirm("确定删除？")) return; await sbDel(`transportation_claims?id=eq.${id}`, tk); await load() }

  // ====== 固定交通费：首次设置 / 变更申请 ======
  const pendingTransChange = myTransChangeReqs.find(r => r.status === "申請中")
  const submitTransChange = async () => {
    const amt = parseFloat(transChangeFm.requested_amount)
    if (!(amt >= 0) || !transChangeFm.effective_from) return
    setTransChangeSub(true)
    if (myTransAmount === 0) {
      // 首次设置 — 直接更新，不走审批
      await sbPatch(`employees?id=eq.${user.id}`, { transport_amount: amt, transport_method: "固定" }, tk)
    } else {
      await sbPost("transport_change_requests", {
        employee_id: user.id,
        previous_amount: myTransAmount,
        requested_amount: amt,
        effective_from: transChangeFm.effective_from,
        reason: transChangeFm.reason || null,
      }, tk)
    }
    setTransChangeFm({ requested_amount: "", effective_from: "", reason: "" })
    setTransChangeShow(false)
    await load()
    setTransChangeSub(false)
  }
  const cancelTransChange = async (id) => {
    if (!confirm("撤回这条变更申请？")) return
    await sbDel(`transport_change_requests?id=eq.${id}`, tk)
    await load()
  }
  const toggleEdit = (key) => setEditingKeys(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const cancelEdit = (key) => { setEditingKeys(prev => { const n = new Set(prev); n.delete(key); return n }); load() }

  const saveTransRow = async (key) => {
    const r = transRows.find(r => r._key === key)
    if (!r) return
    sSv(true)
    if (r._isNew) {
      await sbPost("transportation_claims", { employee_id: user.id, claim_date: r.claim_date, route: r.route || null, round_trip: r.round_trip, amount: parseFloat(r.amount), note: r.note || null, status: "記録済み" }, tk)
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
  const usedViaSwap = swapApproved.filter(r => r.swap_type === "出勤日休息" && r.compensation_type === "使用代休").length
  const leavePending = leaveReqs.filter(r => r.status === "申請中" && r.leave_type !== "赤日休").length
  const akaPending = leaveReqs.filter(r => r.status === "申請中" && r.leave_type === "赤日休").length
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
  const leaveSubTabs = [
    { key: "leave", label: "带薪休假申请", icon: CalendarX2, badge: leavePending },
    { key: "aka", label: "红日子休息记录", icon: Flag, badge: akaPending },
    { key: "swap", label: "换休申请", icon: ArrowLeftRight, badge: swapPending },
    { key: "history", label: "过去记录", icon: History },
  ]
  const expenseSubTabs = [
    { key: "summary", label: "报销一览", icon: ListChecks },
    { key: "transport", label: "交通費", icon: Train },
    { key: "expense", label: "报销登记", icon: Banknote },
    ...(user.has_commission ? [{ key: "commission", label: "签单提成", icon: Receipt }] : []),
  ]
  const subTabs = mainTab === "leave" ? leaveSubTabs : mainTab === "expense" ? expenseSubTabs : []
  const switchMain = (mt) => {
    setMainTab(mt)
    if (mt === "leave") setTab("leave")
    else if (mt === "expense") setTab("summary")
  }
  const mainTabsDef = [
    { key: "work", label: "勤务时间登记", icon: ClipboardList },
    { key: "leave", label: "假期管理", icon: CalendarX2, badge: leavePending + akaPending + swapPending },
    ...(isAdmin ? [{ key: "overview", label: "团队假期总览", icon: Users }] : []),
    { key: "expense", label: "报销", icon: Banknote },
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

      {/* ====== 主 Tab 切换 ====== */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: `1px solid ${t.bd}`, paddingBottom: 0, flexWrap: "wrap" }}>
        {mainTabsDef.map(mt => {
          const Icon = mt.icon
          const active = mainTab === mt.key
          return (
            <button key={mt.key} onClick={() => switchMain(mt.key)} style={{ padding: "10px 18px", border: "none", borderBottom: `3px solid ${active ? t.ac : "transparent"}`, background: "transparent", color: active ? t.ac : t.ts, fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: -1, position: "relative" }}>
              <Icon size={16} />
              {mt.label}
              {mt.badge > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: t.wn, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{mt.badge}</span>}
            </button>
          )
        })}
      </div>

      {/* ====== 统计卡片（按 Tab 分组，overview tab 不显示） ====== */}
      {mainTab !== "overview" && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(95px,1fr))", gap: 8, marginBottom: 16 }}>
        {(() => {
          const cards = []
          if (mainTab === "work") {
            cards.push(
              { l: "出勤", v: `${wds}天`, c: t.ac },
              { l: "劳动时长", v: fmtMinutes(tw), c: t.gn },
              { l: "固定外加班", v: fmtMinutes(to), c: to / 60 > 20 ? t.rd : t.wn },
            )
          } else if (mainTab === "leave") {
            cards.push(
              { l: "有休余额", v: `${bal.balance}天`, c: t.ac, sub: `本年${bal.currentGrant}+繰越${bal.carryOver}-已用${bal.used}`, click: () => setShowTL(p => !p) },
              { l: "代休余额", v: `${Math.max(0, compBal + unusedComp - usedViaSwap)}天`, c: "#8B5CF6" },
            )
          } else { // expense
            cards.push(
              { l: "交通费", v: `¥${totalTrans.toLocaleString()}`, c: "#8B5CF6" },
              { l: "报销", v: `¥${totalExp.toLocaleString()}`, c: t.wn },
              ...(user.has_commission ? [{ l: "签单提成", v: `¥${totalComm.toLocaleString()}`, c: "#EC4899" }] : []),
            )
          }
          return cards
        })().map((c, i) => (
          <div key={i} onClick={c.click} style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}`, cursor: c.click ? "pointer" : "default" }}>
            <div style={{ fontSize: 10, color: t.tm }}>{c.l}{c.click && <span style={{ color: t.ac, marginLeft: 4 }}>▾</span>}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.c, marginTop: 2 }}>{c.v}</div>
            {c.sub && <div style={{ fontSize: 9, color: t.td, marginTop: 2 }}>{c.sub}</div>}
          </div>
        ))}
      </div>
      )}

      {/* ====== 团队假期总览（admin 专用） ====== */}
      {mainTab === "overview" && isAdmin && (
        overviewLoading || !overview ? (
          <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>
        ) : (
          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", marginBottom: 20 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, fontSize: 11, color: t.tm }}>
              仅统计 正社員 / 契約社員（含中国正社员）。点姓名跳转到该员工的「假期管理 → 过去记录」。
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: t.bgH }}>
                {[
                  ["姓名", "left"],
                  ["雇佣类型", "left"],
                  ["入职日期", "left"],
                  ["本年付与", "right"],
                  ["繰越", "right"],
                  ["已用", "right"],
                  ["有休余", "right"],
                  ["代休余", "right"],
                  ["即将过期代休", "right"],
                  ["本年休假总天数", "right"],
                ].map(([h, a], i) => (
                  <th key={i} style={{ padding: "10px 12px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: a, borderBottom: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {overview.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无符合条件的员工</td></tr>
                ) : overview.map(r => (
                  <tr key={r.emp.id} style={{ borderBottom: `1px solid ${t.bl}` }}>
                    <td style={{ padding: "10px 12px" }}>
                      <button onClick={() => { setMainTab("leave"); setTab("history"); setLeaveViewEmp(r.emp.id) }} style={{ background: "none", border: "none", padding: 0, color: t.ac, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{r.emp.name}</button>
                    </td>
                    <td style={{ padding: "10px 12px", color: t.ts }}>{r.emp.employment_type}</td>
                    <td style={{ padding: "10px 12px", color: t.ts, fontFamily: "monospace", fontSize: 11 }}>{r.emp.hire_date ? fmtDateW(r.emp.hire_date) : "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: t.ts, fontFamily: "monospace" }}>{r.paid.currentGrant}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: t.ts, fontFamily: "monospace" }}>{r.paid.carryOver}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: t.ts, fontFamily: "monospace" }}>{r.paid.used}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: r.paid.balance <= 0 ? t.rd : t.ac, fontWeight: 700 }}>{r.paid.balance}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "#8B5CF6", fontWeight: 600 }}>{r.compUnused}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: r.compExpiring > 0 ? t.rd : t.td, fontWeight: r.compExpiring > 0 ? 700 : 400 }}>{r.compExpiring > 0 ? r.compExpiring : "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: t.ts, fontFamily: "monospace" }}>{r.thisYearTotal}{Object.keys(r.byType).length > 0 && <div style={{ fontSize: 9, color: t.tm, marginTop: 2 }}>{Object.entries(r.byType).map(([k, v]) => `${k}${v}`).join(" · ")}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ====== 有休时间线（仅假期管理 tab 显示） ====== */}
      {mainTab === "leave" && showTL && bal.timeline?.length > 0 && (
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
                  <div style={{ fontSize: 10, color: t.tm }}>付与: {fmtDateW(item.grantDate)} → 期限: {fmtDateW(item.expiresDate)}</div>
                </div>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 600, color: sc, background: `${sc}18` }}>{item.status}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ====== 勤怠编辑按钮（仅勤务时间 tab） ====== */}
      {mainTab === "work" && (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, gap: 8 }}>
        {!ed ? <button onClick={startEd} style={{ padding: "7px 18px", borderRadius: 7, border: `1px solid ${t.ac}44`, background: `${t.ac}11`, color: t.ac, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>编辑勤怠</button> : <>
          <button onClick={() => sEd(false)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer" }}>取消</button>
          <button onClick={saveAtt} disabled={sv} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 12, fontWeight: 600, cursor: sv ? "wait" : "pointer", opacity: sv ? 0.7 : 1 }}>{sv ? "保存中..." : "保存勤怠"}</button>
        </>}
      </div>
      )}

      {/* ====== 勤怠表（仅勤务时间 tab） ====== */}
      {mainTab === "work" && (ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
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
        </div>)}

      {/* ====== 子 Tab 切换栏（仅 假期管理 / 报销） ====== */}
      {mainTab !== "work" && (
        <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
          {subTabs.map(tb => {
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
      )}

      {/* ====== 管理者切换查看员工（适用于假期管理所有子tab） ====== */}
      {mainTab === "leave" && isAdmin && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: `#8B5CF608`, border: `1px solid #8B5CF625`, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#8B5CF6", fontWeight: 600 }}>管理者 · 查看 / 编辑</span>
          <select value={leaveViewEmp} onChange={(e) => setLeaveViewEmp(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 11, minWidth: 160 }}>
            <option value="">本人 ({user.name})</option>
            {allEmps.filter(e => e.id !== user.id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {leaveViewEmp && <span style={{ fontSize: 10, color: t.tm }}>当前在管理 <strong style={{ color: t.tx }}>{allEmps.find(e => e.id === leaveViewEmp)?.name}</strong> 的有休 / 换休记录（编辑保存到该员工名下）</span>}
        </div>
      )}

      {/* ====== 假期申请 Tab ====== */}
      {mainTab === "leave" && tab === "leave" && (
        <div>
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
              <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: `${t.ac}10`, fontSize: 11, color: t.ac, fontWeight: 500 }}>
                申请类型：<strong>有休（带薪休假）</strong> · 赤日休请到「红日子休息记录」，换休请到「换休申请」</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{leaveEditId ? "日期" : "选择日期（点击选取，可多选）"}</label>
                {leaveEditId ? (
                  <input type="date" value={leaveFm.dates[0] || ""} onChange={(e) => setLeaveFm(p => ({ ...p, dates: [e.target.value] }))} style={fmS} />
                ) : (
                  <DateMultiPicker selected={leaveFm.dates} onChange={(dates) => setLeaveFm(p => ({ ...p, dates }))} t={t} tk={tk} />
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
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由 <span style={{ color: t.rd }}>*</span></label>
                <input placeholder="例：私事、身体不适" value={leaveFm.reason} onChange={(e) => setLeaveFm(p => ({ ...p, reason: e.target.value }))} style={fmS} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={submitLeave} disabled={leaveSub || !leaveFm.dates.length || !leaveFm.reason.trim() || (leaveHistMode && !selEmp)} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (leaveSub || !leaveFm.dates.length || !leaveFm.reason.trim()) ? "not-allowed" : "pointer", opacity: (leaveSub || !leaveFm.dates.length || !leaveFm.reason.trim() || (leaveHistMode && !selEmp)) ? 0.5 : 1 }}>{leaveSub ? "提交中..." : leaveEditId ? "保存修改" : `提交申请（${leaveFm.dates.length}天）`}</button>
                {leaveEditId && <button onClick={resetLeaveForm} style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>取消编辑</button>}
              </div>
            </div>
          )}

          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
            {(() => {
              const list = leaveReqs.filter(r => r.leave_type === "有休")
              if (!list.length) return <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无申请记录</div>
              return list.map((r) => {
                const lt = LEAVE_TYPES.find((l) => l.v === r.leave_type)
                const isPending = r.status === "申請中"
                return (
                  <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: lt?.c, background: (lt?.bg || "#eee") + "33" }}>{r.leave_type}</span>
                      <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{fmtDateW(r.leave_date)}{r.is_half_day && <span style={{ fontSize: 9, color: t.ac, marginLeft: 4 }}>半天</span>}</span>
                      {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isPending && (
                        <button onClick={() => startLeaveEdit(r)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 10, cursor: "pointer" }}>编辑</button>
                      )}
                      <span style={statusBadge(r.status)}>{r.status}</span>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}

      {/* ====== 红日子休息记录 Tab (赤日休) ====== */}
      {mainTab === "leave" && tab === "aka" && (
        <div>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#F9731610", border: "1px solid #F9731630", marginBottom: 12, fontSize: 11, color: "#C2410C", lineHeight: 1.5 }}>
            红日子本来就应该休息，但为了记录每位成员当天的状态，<strong>休息了的人也请登记一下</strong>（需要审批）。出勤的人请去「换休申请」登记。
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => { if (akaShow) resetAkaForm(); else setAkaShow(true) }} style={{ padding: "8px 18px", borderRadius: 8, border: akaShow ? `1px solid ${t.bd}` : "none", background: akaShow ? "transparent" : t.ac, color: akaShow ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>{akaShow ? "✕ 关闭" : <><Plus size={14} /> {leaveViewEmp ? `给 ${allEmps.find(e => e.id === leaveViewEmp)?.name} 登记休息` : "登记休息"}</>}</button>
          </div>

          {akaShow && (
            <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid #F9731640`, marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>{akaEditId ? "编辑红日子休息记录" : "登记红日子休息"}</h3>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{akaEditId ? "日期" : "选择日期（点击选取，可多选；建议仅选红日子）"}</label>
                {akaEditId ? (
                  <input type="date" value={akaFm.dates[0] || ""} onChange={(e) => setAkaFm(p => ({ ...p, dates: [e.target.value] }))} style={fmS} />
                ) : (
                  <DateMultiPicker selected={akaFm.dates} onChange={(dates) => setAkaFm(p => ({ ...p, dates }))} t={t} tk={tk} />
                )}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由 <span style={{ color: t.rd }}>*</span></label>
                <input placeholder="例：元日休息、GW休息、国庆休息" value={akaFm.reason} onChange={(e) => setAkaFm(p => ({ ...p, reason: e.target.value }))} style={fmS} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={submitAka} disabled={akaSub || !akaFm.dates.length || !akaFm.reason.trim()} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#F97316", color: "#fff", fontSize: 13, fontWeight: 600, cursor: (akaSub || !akaFm.dates.length || !akaFm.reason.trim()) ? "not-allowed" : "pointer", opacity: (akaSub || !akaFm.dates.length || !akaFm.reason.trim()) ? 0.5 : 1 }}>{akaSub ? "提交中..." : akaEditId ? "保存修改" : `提交登记（${akaFm.dates.length}天）`}</button>
                {akaEditId && <button onClick={resetAkaForm} style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>取消编辑</button>}
              </div>
            </div>
          )}

          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
            {(() => {
              const list = leaveReqs.filter(r => r.leave_type === "赤日休")
              if (!list.length) return <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无红日子休息记录</div>
              return list.map((r) => {
                const isPending = r.status === "申請中"
                return (
                  <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: "#F97316", background: "#FFEDD555" }}>赤日休</span>
                      <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{fmtDateW(r.leave_date)}</span>
                      {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isPending && (
                        <button onClick={() => startAkaEdit(r)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 10, cursor: "pointer" }}>编辑</button>
                      )}
                      <span style={statusBadge(r.status)}>{r.status}</span>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}

      {/* ====== 过去记录 Tab（自助补录历史 有休/代休） ====== */}
      {mainTab === "leave" && tab === "history" && (() => {
        const isDaikyu = histFm.leave_type === "代休"
        const canSubmit = isDaikyu ? !!(histFm.work_date && histFm.dates[0]) : histFm.dates.length > 0
        return (
        <div>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: `${t.ac}08`, border: `1px solid ${t.ac}20`, marginBottom: 12, fontSize: 11, color: t.tm, lineHeight: 1.5 }}>
            这里补录<strong style={{ color: t.tx }}>已经休过</strong>的有休 / 代休（无需审批，会自动算入余额）。新申请请到「带薪休假申请」或「换休申请」tab。
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => { if (histShow) resetHistForm(); else setHistShow(true) }} style={{ padding: "8px 18px", borderRadius: 8, border: histShow ? `1px solid ${t.bd}` : "none", background: histShow ? "transparent" : t.ac, color: histShow ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>{histShow ? "✕ 关闭" : <><Plus size={14} /> {leaveViewEmp ? `给 ${allEmps.find(e => e.id === leaveViewEmp)?.name} 记录` : "记录"}</>}</button>
          </div>

          {histShow && (
            <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>{histEditId ? "编辑历史记录" : "记录过去休假"}</h3>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>类型</label>
                <select value={histFm.leave_type} onChange={(e) => setHistFm(p => ({ ...p, leave_type: e.target.value, dates: [], work_date: "" }))} style={fmS} disabled={!!histEditId}>
                  <option value="有休">有休</option>
                  <option value="代休">代休（节假日出勤换的休）</option>
                </select>
                {isDaikyu && <div style={{ fontSize: 10, color: t.tm, marginTop: 4 }}>代休需要同时填"出勤日"和"代休日"，会自动同步到换休申请表。</div>}
              </div>

              {isDaikyu ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>节假日出勤日期</label>
                    <input type="date" value={histFm.work_date} onChange={(e) => setHistFm(p => ({ ...p, work_date: e.target.value }))} style={fmS} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>代休日期</label>
                    <input type="date" value={histFm.dates[0] || ""} onChange={(e) => setHistFm(p => ({ ...p, dates: [e.target.value] }))} style={fmS} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{histEditId ? "日期" : "选择日期（点击选取，可多选）"}</label>
                    {histEditId ? (
                      <input type="date" value={histFm.dates[0] || ""} onChange={(e) => setHistFm(p => ({ ...p, dates: [e.target.value] }))} style={fmS} />
                    ) : (
                      <DateMultiPicker selected={histFm.dates} onChange={(dates) => setHistFm(p => ({ ...p, dates }))} t={t} tk={tk} />
                    )}
                  </div>
                  <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 10, color: t.ts }}>半天休</label>
                    <button type="button" onClick={() => setHistFm(p => ({ ...p, is_half_day: !p.is_half_day }))} style={{ width: 40, height: 22, borderRadius: 11, border: "none", background: histFm.is_half_day ? t.ac : t.bd, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                      <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 3, left: histFm.is_half_day ? 21 : 3, transition: "left 0.2s" }} />
                    </button>
                    <span style={{ fontSize: 10, color: t.tm }}>{histFm.is_half_day ? "0.5天" : "1天"}</span>
                  </div>
                </>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由 <span style={{ color: t.rd }}>*</span></label>
                <input placeholder={isDaikyu ? "例：清明节加班" : "例：私事、身体不适"} value={histFm.reason} onChange={(e) => setHistFm(p => ({ ...p, reason: e.target.value }))} style={fmS} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={submitHist} disabled={histSub || !canSubmit || !histFm.reason.trim()} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (histSub || !canSubmit || !histFm.reason.trim()) ? "not-allowed" : "pointer", opacity: (histSub || !canSubmit || !histFm.reason.trim()) ? 0.5 : 1 }}>{histSub ? "保存中..." : histEditId ? "保存修改" : isDaikyu ? "记录" : `记录（${histFm.dates.length}天）`}</button>
                {histEditId && <button onClick={resetHistForm} style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>取消编辑</button>}
              </div>
            </div>
          )}

          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
            {(() => {
              const histLeave = leaveReqs.filter(r => r.status === "承認" && r.leave_type === "有休")
                .map(r => ({ ...r, _table: "leave", _sortDate: r.leave_date }))
              const histDaikyu = swapReqs.filter(r => r.status === "承認" && r.compensation_type === "代休" && r.swap_type === "休日出勤")
                .map(r => ({ ...r, _table: "swap", _sortDate: r.swap_date || r.original_date }))
              const histAll = [...histLeave, ...histDaikyu].sort((a, b) => (b._sortDate || "").localeCompare(a._sortDate || ""))
              if (!histAll.length) return <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>还没有历史记录，点上面的「记录」按钮添加</div>
              return histAll.map((r) => {
                const isLeave = r._table === "leave"
                const lt = LEAVE_TYPES.find((l) => l.v === (isLeave ? "有休" : "代休"))
                return (
                  <div key={`${r._table}-${r.id}`} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: lt?.c, background: (lt?.bg || "#eee") + "33" }}>{isLeave ? "有休" : "代休"}</span>
                      {isLeave ? (
                        <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{fmtDateW(r.leave_date)}{r.is_half_day && <span style={{ fontSize: 9, color: t.ac, marginLeft: 4 }}>半天</span>}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>休 <strong>{r.swap_date ? fmtDateW(r.swap_date) : "—"}</strong> <span style={{ fontSize: 10, color: t.tm }}>(出勤 {fmtDateW(r.original_date)})</span></span>
                      )}
                      {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => startHistEdit(r, r._table)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 10, cursor: "pointer" }}>编辑</button>
                      <button onClick={() => delHist(r.id, r._table)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>删除</button>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
        )
      })()}

      {/* ====== 换休管理 Tab ====== */}
      {mainTab === "leave" && tab === "swap" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => {
              if (swapShow) { resetSwapForm(); return }
              setSwapShow(true)
              if (isAdmin && leaveViewEmp) { setSwapHistMode(true); setSelEmp(leaveViewEmp) }
            }} style={{ padding: "8px 18px", borderRadius: 8, border: swapShow ? `1px solid ${t.bd}` : "none", background: swapShow ? "transparent" : t.ac, color: swapShow ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{swapShow ? "✕ 关闭" : leaveViewEmp ? `+ 给 ${allEmps.find(e => e.id === leaveViewEmp)?.name} 录入历史` : "+ 新申请"}</button>
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
                  <select value={swapFm.swap_type} onChange={(e) => setSwapFm(p => ({ ...p, swap_type: e.target.value, compensation_type: e.target.value === "休日出勤" ? "換休" : "" }))} style={fmS}>
                    <option value="休日出勤">休日出勤（定休日/祝日上班）</option>
                    <option value="出勤日休息">出勤日休息（工作日临时休息）</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>补偿方式</label>
                  {swapFm.swap_type === "休日出勤" ? (
                    <select value={swapFm.compensation_type} onChange={(e) => setSwapFm(p => ({ ...p, compensation_type: e.target.value }))} style={fmS}>
                      <option value="換休">換休（换一天休息）</option>
                      <option value="加班">加班（算加班费）</option>
                    </select>
                  ) : (
                    <select value={swapFm.compensation_type} onChange={(e) => setSwapFm(p => ({ ...p, compensation_type: e.target.value, swap_date: e.target.value === "使用代休" ? "" : p.swap_date }))} style={fmS}>
                      <option value="">補班（工作日另补一天）</option>
                      <option value="使用代休">使用代休余额（消化 1 天代休）</option>
                    </select>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>
                  {swapEditId ? (swapFm.swap_type === "休日出勤" ? "出勤日期" : "休息日期") : (swapFm.swap_type === "休日出勤" ? "出勤日期（点击选取，可多选）" : "休息日期（点击选取，可多选）")}
                </label>
                {swapEditId ? (
                  <input type="date" value={swapFm.original_dates[0] || ""} onChange={(e) => setSwapFm(p => ({ ...p, original_dates: [e.target.value] }))} style={fmS} />
                ) : (
                  <DateMultiPicker selected={swapFm.original_dates} onChange={(dates) => setSwapFm(p => ({ ...p, original_dates: dates }))} t={t} tk={tk} />
                )}
              </div>
              {(swapEditId || swapFm.original_dates.length === 1) && !(swapFm.swap_type === "出勤日休息" && swapFm.compensation_type === "使用代休") && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{swapFm.swap_type === "休日出勤" ? "换休日期（可留空=待定）" : "补班日期（可留空=待定）"}</label>
                  <input type="date" value={swapFm.swap_date} onChange={(e) => setSwapFm(p => ({ ...p, swap_date: e.target.value }))} style={fmS} />
                </div>
              )}
              {swapFm.swap_type === "出勤日休息" && swapFm.compensation_type === "使用代休" && (
                <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: `${t.ac}10`, fontSize: 10, color: t.ac, lineHeight: 1.5 }}>
                  该申请批准后将消化 1 天代休余额，不需要额外补班。当前可用代休：<strong>{Math.max(0, compBal + unusedComp - usedViaSwap)}</strong> 天
                </div>
              )}
              {!swapEditId && swapFm.original_dates.length > 1 && (
                <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: `${t.ac}10`, fontSize: 10, color: t.ac }}>
                  多日期模式：将为每个日期创建独立申请，换休/补班日期均设为待定，可在批准后单独编辑
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由 <span style={{ color: t.rd }}>*</span></label>
                <input placeholder="例：旺季需要出勤" value={swapFm.reason} onChange={(e) => setSwapFm(p => ({ ...p, reason: e.target.value }))} style={fmS} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={submitSwap} disabled={swapSub || !swapFm.original_dates.length || !swapFm.reason.trim() || (swapHistMode && !selEmp)} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (swapSub || !swapFm.original_dates.length || !swapFm.reason.trim()) ? "not-allowed" : "pointer", opacity: (swapSub || !swapFm.original_dates.length || !swapFm.reason.trim() || (swapHistMode && !selEmp)) ? 0.5 : 1 }}>{swapSub ? "提交中..." : swapEditId ? "保存修改" : `提交申请（${swapFm.original_dates.length}天）`}</button>
                {swapEditId && <button onClick={resetSwapForm} style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>取消编辑</button>}
              </div>
            </div>
          )}

          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
            {!swapReqs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无换休记录</div> : swapReqs.map((r) => {
              const isPending = r.status === "申請中"
              const compColor = r.compensation_type === "換休" ? "#8B5CF6" : r.compensation_type === "使用代休" ? "#0EA5E9" : t.rd
              const usingDaikyu = r.compensation_type === "使用代休"
              return (
                <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: r.swap_type === "休日出勤" ? "#8B5CF6" : "#F59E0B", background: r.swap_type === "休日出勤" ? "#8B5CF620" : "#F59E0B20" }}>{r.swap_type}</span>
                    {r.compensation_type && <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: compColor, background: `${compColor}15` }}>{r.compensation_type}</span>}
                    <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{fmtDateW(r.original_date)}</span>
                    {!usingDaikyu && (<>
                      <span style={{ fontSize: 10, color: t.tm }}>→</span>
                      <span style={{ fontSize: 12, color: r.swap_date ? t.tx : t.td, fontFamily: "monospace" }}>{r.swap_date ? fmtDateW(r.swap_date) : "待定"}</span>
                    </>)}
                    {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isPending && (
                      <button onClick={() => startSwapEdit(r)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 10, cursor: "pointer" }}>编辑</button>
                    )}
                    <span style={statusBadge(r.status)}>{r.status}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ====== 报销一览 Tab ====== */}
{mainTab === "expense" && tab === "summary" && (
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
              <span style={{ fontFamily: "monospace" }}>{fmtDateW(r.claim_date)}</span>
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
                <span style={{ fontFamily: "monospace" }}>{fmtDateW(r.entry_date)}</span>
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
      {mainTab === "expense" && tab === "transport" && (
        <>
          {/* ===== 固定月額（正/契用） ===== */}
          <div style={{ background: t.bgC, borderRadius: 10, padding: 16, border: `1px solid ${t.bd}`, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: t.tm, marginBottom: 4 }}>固定交通费（月額 · 通勤定期代等）</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#8B5CF6" }}>¥{myTransAmount.toLocaleString()}<span style={{ fontSize: 11, color: t.tm, fontWeight: 400, marginLeft: 6 }}>/ 月</span></div>
                {myTransAmount === 0 && <div style={{ fontSize: 10, color: t.wn, marginTop: 4 }}>尚未设置。首次设置无需审批，直接保存即可。</div>}
              </div>
              {!transChangeShow ? (
                pendingTransChange ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <span style={{ fontSize: 11, color: t.wn, fontWeight: 600 }}>已有变更申请待审批</span>
                    <span style={{ fontSize: 10, color: t.tm, fontFamily: "monospace" }}>¥{Number(pendingTransChange.previous_amount).toLocaleString()} → <strong style={{ color: t.ac }}>¥{Number(pendingTransChange.requested_amount).toLocaleString()}</strong>（{pendingTransChange.effective_from} 起）</span>
                    <button onClick={() => cancelTransChange(pendingTransChange.id)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>撤回申请</button>
                  </div>
                ) : (
                  <button onClick={() => { setTransChangeFm({ requested_amount: String(myTransAmount || ""), effective_from: `${y}-${pad(m)}-01`, reason: "" }); setTransChangeShow(true) }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{myTransAmount === 0 ? "首次设置" : "申请变更"}</button>
                )
              ) : null}
            </div>

            {transChangeShow && (
              <div style={{ marginTop: 14, padding: 14, borderRadius: 8, background: `${t.ac}08`, border: `1px solid ${t.ac}30` }}>
                <h4 style={{ fontSize: 12, fontWeight: 600, color: t.tx, margin: "0 0 10px" }}>{myTransAmount === 0 ? "首次设置固定交通费" : "申请变更固定交通费"}</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{myTransAmount === 0 ? "金額 (円 / 月)" : "新金額 (円 / 月)"}</label>
                    <input type="number" value={transChangeFm.requested_amount} onChange={(e) => setTransChangeFm(p => ({ ...p, requested_amount: e.target.value }))} placeholder="例: 18000" style={fmS} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{myTransAmount === 0 ? "起算月" : "生效月"}</label>
                    <input type="date" value={transChangeFm.effective_from} onChange={(e) => setTransChangeFm(p => ({ ...p, effective_from: e.target.value }))} style={fmS} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由 / 备注{myTransAmount === 0 ? "（选填）" : ""}</label>
                  <input value={transChangeFm.reason} onChange={(e) => setTransChangeFm(p => ({ ...p, reason: e.target.value }))} placeholder="例：搬家/路线变更" style={fmS} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={submitTransChange} disabled={transChangeSub || !transChangeFm.requested_amount || !transChangeFm.effective_from} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: transChangeSub ? 0.5 : 1 }}>{transChangeSub ? "提交中..." : myTransAmount === 0 ? "保存" : "提交申请"}</button>
                  <button onClick={() => setTransChangeShow(false)} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer" }}>取消</button>
                </div>
              </div>
            )}

            {myTransChangeReqs.filter(r => r.status !== "申請中").length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.bl}` }}>
                <div style={{ fontSize: 10, color: t.tm, marginBottom: 6 }}>变更历史</div>
                {myTransChangeReqs.filter(r => r.status !== "申請中").slice(0, 5).map(r => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 10, color: t.ts, fontFamily: "monospace" }}>
                    <span>¥{Number(r.previous_amount).toLocaleString()} → ¥{Number(r.requested_amount).toLocaleString()} ({r.effective_from}起)</span>
                    <span style={{ color: r.status === "承認" ? t.gn : t.rd, fontWeight: 600 }}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ===== 临时交通费表格（原有） ===== */}
          <div style={{ fontSize: 11, color: t.tm, marginBottom: 8, padding: "0 4px" }}>临时交通费（固定月額以外的单次出行）</div>
          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: t.bgH }}>{["日期", "路线", "往返", "金额", "备注", ""].map((h, i) => <th key={i} style={{ padding: "8px 8px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}` }}>{h}</th>)}</tr></thead>
            <tbody>{transRows.map(r => {
              const isEd = r._isNew || editingKeys.has(r._key)
              const canConfirm = r._isNew && r.claim_date && parseFloat(r.amount) > 0
              const isEditingExisting = !r._isNew && editingKeys.has(r._key)
              return (
                <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{isEd ? <input type="date" value={r.claim_date} onChange={e => updateTrans(r._key, "claim_date", e.target.value)} style={{ ...iS, width: 130 }} /> : <span style={roS}>{fmtDateW(r.claim_date)}</span>}</td>
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
        </>
      )}

      {/* ====== 报销登记 Tab ====== */}
      {mainTab === "expense" && tab === "expense" && (
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
                  <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{fmtDateW(r.claim_date)}</span>
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
      {mainTab === "expense" && tab === "commission" && user.has_commission && (
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 550 }}>
            <thead><tr style={{ background: t.bgH }}>{["日期", "第N个", "学生名字", "学费", "提成率(%)", "提成金额", ""].map((h, i) => <th key={i} style={{ padding: "8px 8px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}` }}>{h}</th>)}</tr></thead>
            <tbody>{commRows.map(r => {
              const isEd = r._isNew || editingKeys.has(r._key)
              const canConfirm = r._isNew && r.entry_date && r.student_name && parseFloat(r.tuition_amount) > 0
              const isEditingExisting = !r._isNew && editingKeys.has(r._key)
              return (
                <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{isEd ? <input type="date" value={r.entry_date} onChange={e => updateComm(r._key, "entry_date", e.target.value)} style={{ ...iS, width: 130 }} /> : <span style={roS}>{fmtDateW(r.entry_date)}</span>}</td>
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
