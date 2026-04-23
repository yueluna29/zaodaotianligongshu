import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { sbGet, sbPost, sbPatch, sbDel, sbFn } from "../../api/supabase"
import { FileText, Plus, ChevronLeft, ChevronRight, Trash2, Save, AlertTriangle, AlertCircle, CheckCircle2, Pencil, ArrowLeft, Clock, User, Car, Receipt, CalendarDays, Download, DollarSign, Briefcase, ArrowRight, Lock, Send, Sparkles, Unlock, X as XIcon, Check, Camera, Upload } from "lucide-react"
import { fmtDateW, WEEKDAYS, pad, COMPANIES, EMP_TYPES_JP, EMP_TYPES_CN, sortByName } from "../../config/constants"
import { compressImage } from "../../utils/compressImage"

const DEPTS = ["大学院", "学部", "文书", "语言类"]
const EJU_TYPE = "EJU講師（班課）"
const EJU_BONUS_PER_HOUR = 300
const mkWork = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, _type: "work", work_date: "", business_type: "", start_time: "", end_time: "", work_minutes: 0, hourly_rate: 0, transport_fee: "", subtotal: 0, student_name: "", course_name: "", other_expense: 0, other_expense_note: "", eju_bonus: false })
const mkExp = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, _type: "expense", work_date: "", other_expense: "", other_expense_note: "" })
const mkComm = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, entry_date: "", seq_number: "", student_name: "", tuition_amount: "", commission_rate: "", commission_amount: 0 })

const TYPE_COLORS = {
  "事務": "#8B5CF6",
  "講師（大課）": "#3B82F6",
  "講師（一対一）": "#06B6D4",
  "答疑做題": "#F59E0B",
  "研究計画書修改": "#EC4899",
  [EJU_TYPE]: "#10B981",
}
const colorFor = (bt) => TYPE_COLORS[bt] || "#64748B"

const calcRowSubtotal = (row) => {
  if (row._type !== "work") return parseFloat(row.other_expense) || 0
  const baseRate = Number(row.hourly_rate) || 0
  const bonus = row.eju_bonus && row.business_type === EJU_TYPE ? EJU_BONUS_PER_HOUR : 0
  const hrs = (row.work_minutes || 0) / 60
  return Math.round(hrs * (baseRate + bonus) + (parseFloat(row.transport_fee) || 0))
}

const glassCard = {
  background: "rgba(255, 255, 255, 0.65)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 24,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  boxShadow: "0 20px 50px -20px rgba(30, 64, 175, 0.05)",
}

const AmbientBlobs = () => (
  <>
    <div style={{ position: "fixed", top: "-15%", left: "-10%", width: "50vw", height: "50vw", minWidth: 400, minHeight: 400, background: "rgba(191,219,254,0.35)", filter: "blur(100px)", borderRadius: "50%", zIndex: 0, pointerEvents: "none" }} />
    <div style={{ position: "fixed", bottom: "-15%", right: "-5%", width: "60vw", height: "60vw", minWidth: 400, minHeight: 400, background: "rgba(153,246,228,0.30)", filter: "blur(100px)", borderRadius: "50%", zIndex: 0, pointerEvents: "none" }} />
  </>
)

function HoverBtn({ children, primary, onClick, style, danger, disabled, t, title }) {
  const [hv, setHv] = useState(false)
  const baseBg = primary ? t.ac : (danger ? "transparent" : "transparent")
  const hoverBg = primary ? t.ah : (danger ? `${t.rd}10` : t.bgH)
  const textColor = primary ? "#fff" : (danger ? t.rd : t.ts)
  return (
    <button title={title}
      onMouseEnter={() => setHv(true)} onMouseLeave={() => setHv(false)} onClick={onClick} disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "8px 14px", borderRadius: 12, fontWeight: 600, fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.2s",
        border: primary ? "none" : `1px solid ${t.bd}`,
        backgroundColor: hv && !disabled ? hoverBg : (primary ? baseBg : "rgba(255,255,255,0.7)"),
        color: textColor, opacity: disabled ? 0.5 : 1, fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
        boxShadow: primary && hv && !disabled ? `0 4px 12px ${t.ac}40` : "none",
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export default function WorkEntryManager({ user, t, tk }) {
  const isAdmin = user.role === "admin"

  const [allEmps, setAllEmps] = useState([])
  const [deptFilter, setDeptFilter] = useState("")
  const [companyFilter, setCompanyFilter] = useState("all") // "all" | number
  const [typeFilter, setTypeFilter] = useState("all") // "all" | type string
  const [adminAgg, setAdminAgg] = useState({}) // { [empId]: { hours, wage, transport, other, commission } }
  const [adminSubmitted, setAdminSubmitted] = useState(new Set()) // baito 本月已提交的 employee_id 集合
  const [adminLd, setAdminLd] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState(isAdmin ? null : { id: user.id, name: user.name, has_commission: user.has_commission })

  const [rows, setRows] = useState([])
  const [commRows, setCommRows] = useState([])
  const [ld, setLd] = useState(true)
  const [sv, setSv] = useState(false)
  const [rates, setRates] = useState([])
  const [saveMsg, setSaveMsg] = useState("")
  const [submission, setSubmission] = useState(null) // { id, status, submitted_at, unlocked_at, unlocked_by, note }
  const [submitModal, setSubmitModal] = useState(false)
  const [submittingReport, setSubmittingReport] = useState(false)
  const [noteDraft, setNoteDraft] = useState("")
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteSavedAt, setNoteSavedAt] = useState(null)
  const [photoUploading, setPhotoUploading] = useState({ 1: false, 2: false })
  const [photoError, setPhotoError] = useState("")
  const [lightboxPhoto, setLightboxPhoto] = useState(null) // { slot, driveId } | null
  const [sectionPreview, setSectionPreview] = useState({ work: false, expenses: false, commissions: false }) // 客户端视图切换，非锁定
  const [errorModal, setErrorModal] = useState(null) // { title, message }

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
  const [viewMode, setViewMode] = useState("week") // month | week — baito 默认周历

  const targetEmpId = selectedEmp?.id || user.id

  useEffect(() => {
    if (!isAdmin) return
    (async () => {
      const emps = await sbGet("employees?is_active=eq.true&select=id,name,furigana,pinyin,employment_type,department,company_id,is_teacher,login_id,has_commission,transport_amount", tk)
      setAllEmps(sortByName(emps))
    })()
  }, [tk, isAdmin])

  const load = useCallback(async () => {
    if (!selectedEmp) return
    setLd(true)
    const sd = `${year}-${pad(month)}-01`
    const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
    const empQ = `employee_id=eq.${targetEmpId}&`
    const [r, c, sub] = await Promise.all([
      sbGet(`work_entries?${empQ}work_date=gte.${sd}&work_date=lt.${ed}&order=work_date,created_at&select=*`, tk),
      sbGet(`commission_entries?${empQ}entry_date=gte.${sd}&entry_date=lt.${ed}&order=entry_date,seq_number&select=*`, tk),
      sbGet(`monthly_report_submissions?${empQ}year=eq.${year}&month=eq.${month}&select=*`, tk),
    ])
    const subRow = (sub && sub[0]) || null
    setSubmission(subRow)
    setNoteDraft(subRow?.note || "")
    setNoteSavedAt(null)
    const loaded = (r || []).map(e => {
      const isExp = !e.business_type && (Number(e.other_expense) > 0 || e.other_expense_note)
      const start_time = e.start_time?.slice(0, 5) || ""
      const end_time = e.end_time?.slice(0, 5) || ""
      // 自愈：旧跨夜记录存成 work_minutes=0，读时重算；subtotal 也跟着重算
      let work_minutes = e.work_minutes
      let subtotal = e.subtotal
      if (!isExp && start_time && end_time && (!work_minutes || work_minutes === 0)) {
        const [sh, sm] = start_time.split(":").map(Number)
        const [eh, em] = end_time.split(":").map(Number)
        let m = (eh * 60 + em) - (sh * 60 + sm)
        if (m < 0) m += 24 * 60
        work_minutes = m
        const baseRate = Number(e.hourly_rate) || 0
        const bonus = e.eju_bonus && e.business_type === EJU_TYPE ? EJU_BONUS_PER_HOUR : 0
        subtotal = Math.round((m / 60) * (baseRate + bonus) + (Number(e.transport_fee) || 0))
      }
      return {
        ...e, work_minutes, subtotal, _key: e.id, _isNew: false, _dirty: false, _type: isExp ? "expense" : "work",
        start_time, end_time,
        transport_fee: e.transport_fee != null ? String(e.transport_fee) : "",
        other_expense: e.other_expense != null ? String(e.other_expense) : "",
        other_expense_note: e.other_expense_note || "", student_name: e.student_name || "", course_name: e.course_name || "",
        eju_bonus: !!e.eju_bonus,
      }
    })
    setRows(loaded)
    const cm = (c || []).map(e => ({
      ...e, _key: e.id, _isNew: false, _dirty: false,
      seq_number: String(e.seq_number || ""), tuition_amount: String(e.tuition_amount || ""),
      commission_rate: String(e.commission_rate || ""), commission_amount: Number(e.commission_amount || 0), student_name: e.student_name || ""
    }))
    setCommRows(cm)
    setLd(false)
  }, [selectedEmp, targetEmpId, tk, year, month])

  const loadRates = useCallback(async () => {
    if (!selectedEmp) return
    const pr = await sbGet(`pay_rates?employee_id=eq.${targetEmpId}&order=business_type,effective_from.desc&select=*`, tk)
    const seen = new Set(), cur = []
    for (const r of (pr || [])) { if (!seen.has(r.business_type)) { seen.add(r.business_type); cur.push(r) } }
    setRates(cur)
  }, [selectedEmp, targetEmpId, tk])

  useEffect(() => { if (selectedEmp) load() }, [load, selectedEmp])
  useEffect(() => { if (selectedEmp) loadRates() }, [loadRates, selectedEmp])

  // admin 列表聚合：按员工聚合本月所有 work_entries + commission_entries
  const loadAdminAgg = useCallback(async () => {
    if (!isAdmin || selectedEmp) return
    setAdminLd(true)
    const sd = `${year}-${pad(month)}-01`
    const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
    const [we, ce, subs] = await Promise.all([
      sbGet(`work_entries?work_date=gte.${sd}&work_date=lt.${ed}&select=employee_id,work_minutes,hourly_rate,transport_fee,other_expense,business_type,eju_bonus`, tk),
      sbGet(`commission_entries?entry_date=gte.${sd}&entry_date=lt.${ed}&select=employee_id,commission_amount`, tk),
      sbGet(`monthly_report_submissions?status=eq.submitted&year=eq.${year}&month=eq.${month}&select=employee_id`, tk),
    ])
    const agg = {}
    for (const r of (we || [])) {
      const a = agg[r.employee_id] = agg[r.employee_id] || { hours: 0, wage: 0, transport: 0, other: 0, commission: 0 }
      const hrs = (r.work_minutes || 0) / 60
      if (r.business_type) {
        a.hours += hrs
        const baseRate = Number(r.hourly_rate) || 0
        const bonus = r.eju_bonus && r.business_type === EJU_TYPE ? EJU_BONUS_PER_HOUR : 0
        a.wage += Math.round(hrs * (baseRate + bonus))
        a.transport += Number(r.transport_fee || 0)
      } else {
        a.other += Number(r.other_expense || 0)
      }
    }
    for (const r of (ce || [])) {
      const a = agg[r.employee_id] = agg[r.employee_id] || { hours: 0, wage: 0, transport: 0, other: 0, commission: 0 }
      a.commission += Number(r.commission_amount || 0)
    }
    setAdminAgg(agg)
    setAdminSubmitted(new Set((subs || []).map(s => s.employee_id)))
    setAdminLd(false)
  }, [isAdmin, selectedEmp, year, month, tk])

  useEffect(() => { loadAdminAgg() }, [loadAdminAgg])

  // 切月时：若 selectedDate 不在当前月，跳到当月 1 号
  useEffect(() => {
    const ym = `${year}-${pad(month)}`
    if (!selectedDate.startsWith(ym)) setSelectedDate(`${ym}-01`)
  }, [year, month, selectedDate])

  // 切月时重置分段预览视图
  useEffect(() => { setSectionPreview({ work: false, expenses: false, commissions: false }) }, [year, month, targetEmpId])

  // ======= 本地草稿：未保存的行自动 dump 到 localStorage，关页/刷新/断网都能恢复 =======
  const draftKey = targetEmpId ? `kintai_draft_work_${targetEmpId}_${year}_${month}` : null
  const draftAskedRef = useRef(new Set())

  // 行变动 → 存草稿（仅当有 _isNew / _dirty）
  useEffect(() => {
    if (!draftKey) return
    const dirtyCount = rows.filter(r => r._isNew || r._dirty).length + commRows.filter(r => r._isNew || r._dirty).length
    if (dirtyCount > 0) {
      try { localStorage.setItem(draftKey, JSON.stringify({ rows, commRows, savedAt: Date.now() })) } catch {/* storage full, ignore */}
    } else {
      localStorage.removeItem(draftKey)
    }
  }, [rows, commRows, draftKey])

  // load 完成后检查草稿，提示是否恢复（每个 key 只问一次）
  useEffect(() => {
    if (ld || !draftKey || draftAskedRef.current.has(draftKey)) return
    draftAskedRef.current.add(draftKey)
    const raw = localStorage.getItem(draftKey)
    if (!raw) return
    try {
      const d = JSON.parse(raw)
      const dirty = (d.rows || []).filter(r => r._isNew || r._dirty).length + (d.commRows || []).filter(r => r._isNew || r._dirty).length
      if (!dirty) { localStorage.removeItem(draftKey); return }
      const ageMin = Math.max(1, Math.round((Date.now() - (d.savedAt || 0)) / 60000))
      if (confirm(`检测到 ${ageMin} 分钟前的未保存草稿（${dirty} 行修改），是否恢复？\n\n确定 = 恢复并继续编辑\n取消 = 丢弃草稿`)) {
        setRows(d.rows || [])
        setCommRows(d.commRows || [])
        setSaveMsg(`已恢复未保存的 ${dirty} 行修改`)
        setTimeout(() => setSaveMsg(""), 6000)
      } else {
        localStorage.removeItem(draftKey)
      }
    } catch {
      localStorage.removeItem(draftKey)
    }
  }, [ld, draftKey])

  const getRateForType = (bt) => { const r = rates.find(r => r.business_type === bt); return r ? Number(r.hourly_rate) : 0 }
  const calcMin = (s, e) => { if (!s || !e) return 0; const [sh, sm] = s.split(":").map(Number), [eh, em] = e.split(":").map(Number); let m = (eh * 60 + em) - (sh * 60 + sm); if (m < 0) m += 24 * 60; return m }

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r
      const next = { ...r, [field]: value, _dirty: true }
      if (field === "business_type") {
        next.hourly_rate = getRateForType(value)
        if (value !== EJU_TYPE) next.eju_bonus = false
      }
      const st = field === "start_time" ? value : next.start_time, et = field === "end_time" ? value : next.end_time
      if (st && et) next.work_minutes = calcMin(st, et)
      next.subtotal = calcRowSubtotal(next)
      return next
    }))
  }

  const updateComm = (key, field, value) => {
    setCommRows(prev => prev.map(r => {
      if (r._key !== key) return r
      const next = { ...r, [field]: value, _dirty: true }
      next.commission_amount = Math.round((parseFloat(next.tuition_amount) || 0) * (parseFloat(next.commission_rate) || 0) / 100)
      return next
    }))
  }

  const scrollToNewRow = (key) => {
    setTimeout(() => {
      const el = document.querySelector(`[data-row-key="${key}"]`)
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 60)
  }
  const addWorkForDay = () => {
    const nr = { ...mkWork(), work_date: selectedDate, _dirty: true }
    setRows(prev => [...prev, nr])
    scrollToNewRow(nr._key)
  }
  const addExpForDay = () => {
    const nr = { ...mkExp(), work_date: selectedDate, _dirty: true }
    setRows(prev => [...prev, nr])
    scrollToNewRow(nr._key)
  }
  const addCommRow = () => {
    const nr = { ...mkComm(), entry_date: selectedDate, _dirty: true }
    setCommRows(prev => [...prev, nr])
    scrollToNewRow(nr._key)
  }

  const removeRow = (key) => setRows(prev => prev.filter(r => r._key !== key))
  const removeComm = (key) => setCommRows(prev => prev.filter(r => r._key !== key))
  const delExisting = async (id, key) => { if (!confirm("确定删除？")) return; await sbDel(`work_entries?id=eq.${id}`, tk); setRows(prev => prev.filter(r => r._key !== key)) }
  const delCommExisting = async (id, key) => { if (!confirm("确定删除？")) return; await sbDel(`commission_entries?id=eq.${id}`, tk); setCommRows(prev => prev.filter(r => r._key !== key)) }

  const validNewWork = (r) => r._isNew && r._type === "work" && r.work_date && r.business_type && r.work_minutes > 0
  const validNewExp = (r) => r._isNew && r._type === "expense" && r.work_date && parseFloat(r.other_expense) > 0
  const validNewComm = (r) => r._isNew && r.entry_date && r.student_name && parseFloat(r.tuition_amount) > 0
  const validDirtyWork = (r) => !r._isNew && r._dirty && (r._type !== "work" || (r.work_date && r.business_type && r.work_minutes > 0)) && (r._type !== "expense" || (r.work_date && parseFloat(r.other_expense) > 0))
  const validDirtyComm = (r) => !r._isNew && r._dirty && r.entry_date && r.student_name && parseFloat(r.tuition_amount) > 0
  const incompleteNew = (r) => r._isNew && r._dirty && !validNewWork(r) && !validNewExp(r)
  const incompleteNewComm = (r) => r._isNew && r._dirty && !validNewComm(r)

  const saveAll = async () => {
    const newWork = rows.filter(validNewWork)
    const newExp = rows.filter(validNewExp)
    const dirty = rows.filter(validDirtyWork)
    // 工作内容/课程必填 —— 针对所有即将保存的工时行
    const workToSave = [...newWork, ...dirty.filter(r => r._type === "work")]
    const missingCourse = workToSave.filter(r => !(r.course_name || "").trim())
    if (missingCourse.length > 0) {
      setErrorModal({
        title: "请填写工作内容",
        message: `有 ${missingCourse.length} 条工时记录还没填写「工作内容 / 课程」，请补全后再保存。`,
      })
      return
    }
    setSv(true); setSaveMsg("")
    const errors = []
    const track = async (label, p) => {
      const res = await p
      if (res && !Array.isArray(res) && (res.code || res.message)) errors.push(`${label}：${res.message || res.code}`)
    }
    for (const r of [...newWork, ...newExp]) {
      await track(r._type === "expense" ? "报销行" : "工时行", sbPost("work_entries", { employee_id: targetEmpId, work_date: r.work_date, business_type: r.business_type || null, start_time: r.start_time ? r.start_time + ":00" : null, end_time: r.end_time ? r.end_time + ":00" : null, work_minutes: r.work_minutes || 0, hourly_rate: r.hourly_rate || 0, subtotal: r.subtotal || 0, transport_fee: parseFloat(r.transport_fee) || 0, other_expense: parseFloat(r.other_expense) || 0, other_expense_note: r.other_expense_note || null, student_name: r.student_name || null, course_name: r.course_name || null, eju_bonus: !!r.eju_bonus }, tk))
    }
    for (const r of dirty) {
      await track("更新", sbPatch(`work_entries?id=eq.${r.id}`, { work_date: r.work_date, business_type: r.business_type || null, start_time: r.start_time ? r.start_time + ":00" : null, end_time: r.end_time ? r.end_time + ":00" : null, work_minutes: r.work_minutes || 0, hourly_rate: r.hourly_rate || 0, subtotal: r.subtotal || 0, transport_fee: parseFloat(r.transport_fee) || 0, other_expense: parseFloat(r.other_expense) || 0, other_expense_note: r.other_expense_note || null, student_name: r.student_name || null, course_name: r.course_name || null, eju_bonus: !!r.eju_bonus }, tk))
    }
    const newCm = commRows.filter(validNewComm)
    const dirtyCm = commRows.filter(validDirtyComm)
    for (const r of newCm) await track("提成行", sbPost("commission_entries", { employee_id: targetEmpId, entry_date: r.entry_date, seq_number: parseInt(r.seq_number) || 1, student_name: r.student_name, tuition_amount: parseFloat(r.tuition_amount), commission_rate: parseFloat(r.commission_rate) || 0, commission_amount: r.commission_amount || 0 }, tk))
    for (const r of dirtyCm) await track("提成更新", sbPatch(`commission_entries?id=eq.${r.id}`, { entry_date: r.entry_date, seq_number: parseInt(r.seq_number) || 1, student_name: r.student_name, tuition_amount: parseFloat(r.tuition_amount), commission_rate: parseFloat(r.commission_rate) || 0, commission_amount: r.commission_amount || 0 }, tk))

    const attempted = newWork.length + newExp.length + dirty.length + newCm.length + dirtyCm.length
    const savedCount = attempted - errors.length
    const skippedCount = rows.filter(incompleteNew).length + commRows.filter(incompleteNewComm).length
    if (errors.length) setSaveMsg(`保存失败 ${errors.length} 行：${errors[0]}${errors.length > 1 ? ` (及其它 ${errors.length - 1} 条)` : ""}`)
    else if (savedCount === 0 && skippedCount > 0) setSaveMsg(`未保存：${skippedCount} 行信息不完整（请确认日期、业务内容、起止时间都已填写）`)
    else if (savedCount > 0) setSaveMsg(`已保存 ${savedCount} 行${skippedCount > 0 ? `（${skippedCount} 行不完整已跳过）` : ""}`)

    await load(); setSv(false)
    setTimeout(() => setSaveMsg(""), errors.length ? 10000 : 5000)
  }

  const chgMonth = (d) => { let nm = month + d, ny = year; if (nm > 12) { nm = 1; ny++ } else if (nm < 1) { nm = 12; ny-- } setYear(ny); setMonth(nm) }

  // 月度统计（所有已存在的行）
  const workRows = rows.filter(r => r._type === "work")
  const expRows = rows.filter(r => r._type === "expense")
  const savedWork = workRows.filter(r => !r._isNew)
  const savedExp = expRows.filter(r => !r._isNew)
  const savedComm = commRows.filter(r => !r._isNew)
  const totalMins = savedWork.reduce((s, e) => s + (e.work_minutes || 0), 0)
  const totalWage = savedWork.reduce((s, e) => s + Math.round((e.work_minutes || 0) / 60 * (Number(e.hourly_rate) || 0)), 0)
  const totalEjuBonus = savedWork.reduce((s, e) => s + (e.eju_bonus && e.business_type === EJU_TYPE ? Math.round((e.work_minutes || 0) / 60 * EJU_BONUS_PER_HOUR) : 0), 0)
  const totalTrans = savedWork.reduce((s, e) => s + (parseFloat(e.transport_fee) || 0), 0)
  const totalOther = savedExp.reduce((s, e) => s + (parseFloat(e.other_expense) || 0), 0)
  const totalComm = savedComm.reduce((s, e) => s + (e.commission_amount || 0), 0)
  const totalAll = totalWage + totalEjuBonus + totalTrans + totalOther + totalComm
  const hasChanges = rows.some(r => (r._isNew && r._dirty) || validDirtyWork(r)) || commRows.some(r => (r._isNew && r._dirty) || validDirtyComm(r))

  // 提交状态：已提交且非管理员 → 锁定
  const isSubmitted = submission?.status === "submitted"
  const locked = isSubmitted && !isAdmin
  // 分段预览 = 纯客户端视图切换（无 DB 持久化）；全月提交才是真锁（admin 可解锁）
  const workLocked = isSubmitted || sectionPreview.work
  const expensesLocked = isSubmitted || sectionPreview.expenses
  const commissionsLocked = isSubmitted || sectionPreview.commissions
  const canSubmit = !isAdmin && !isSubmitted && savedWork.length > 0 && !hasChanges

  const submitReport = async () => {
    setSubmittingReport(true)
    const payload = { employee_id: targetEmpId, year, month, status: "submitted", submitted_at: new Date().toISOString(), unlocked_by: null, unlocked_at: null }
    let res
    if (submission) {
      res = await sbPatch(`monthly_report_submissions?id=eq.${submission.id}`, { status: "submitted", submitted_at: payload.submitted_at, unlocked_by: null, unlocked_at: null }, tk)
    } else {
      res = await sbPost("monthly_report_submissions", payload, tk)
    }
    setSubmittingReport(false)
    if (res && !Array.isArray(res) && (res.code || res.message)) {
      setSaveMsg(`提交失败：${res.message || res.code}`)
      setTimeout(() => setSaveMsg(""), 10000)
      return
    }
    setSubmitModal(false)
    setSaveMsg(`已提交 ${month}月 工时报表`)
    setTimeout(() => setSaveMsg(""), 5000)
    await load()
  }

  const unlockReport = async () => {
    if (!submission || !isAdmin) return
    if (!confirm(`确认解锁 ${month}月 工时报表？员工将可以再次修改并重新提交。`)) return
    await sbPatch(`monthly_report_submissions?id=eq.${submission.id}`, { status: "unlocked", unlocked_by: user.id, unlocked_at: new Date().toISOString() }, tk)
    await load()
  }

  const togglePreview = (section, on) => setSectionPreview(p => ({ ...p, [section]: on }))

  // 一时保存：先把当前未保存改动写入 DB（触发 load 重算总合计），再切只读
  const saveAndPreview = async (section) => {
    if (hasChanges) await saveAll()
    togglePreview(section, true)
  }

  const saveNote = async () => {
    setNoteSaving(true)
    const val = noteDraft.trim() ? noteDraft : null
    let res
    if (submission) {
      res = await sbPatch(`monthly_report_submissions?id=eq.${submission.id}`, { note: val }, tk)
    } else {
      res = await sbPost("monthly_report_submissions", { employee_id: targetEmpId, year, month, status: "draft", note: val }, tk)
    }
    setNoteSaving(false)
    if (res && !Array.isArray(res) && (res.code || res.message)) {
      setSaveMsg(`备注保存失败：${res.message || res.code}`)
      setTimeout(() => setSaveMsg(""), 6000)
      return
    }
    setNoteSavedAt(new Date())
    await load()
  }

  const uploadClockPhoto = async (slot, file) => {
    if (!file) return
    setPhotoError("")
    setPhotoUploading(p => ({ ...p, [slot]: true }))
    try {
      const blob = await compressImage(file, 500, 1600)
      const ym = `${year}-${pad(month)}`
      const ts = Date.now()
      const safeName = (selectedEmp?.name || user.name || "emp").replace(/[\\/:*?"<>|]/g, "_")
      const filename = `${safeName}_${ym}_${slot}_${ts}.jpg`
      const fd = new FormData()
      fd.append("file", blob, filename)
      fd.append("filename", filename)
      const res = await sbFn("upload-clock-photo", fd)
      if (!res?.id) {
        const parts = [res?.error || "未知错误"]
        if (res?.status) parts.push(`HTTP ${res.status}`)
        if (res?.detail) parts.push(String(res.detail).slice(0, 200))
        setPhotoError(`照片 ${slot} 上传失败：${parts.join(" | ")}`)
        return
      }
      const col = slot === 1 ? "photo_1_drive_id" : "photo_2_drive_id"
      if (submission) {
        await sbPatch(`monthly_report_submissions?id=eq.${submission.id}`, { [col]: res.id }, tk)
      } else {
        await sbPost("monthly_report_submissions", { employee_id: targetEmpId, year, month, status: "draft", [col]: res.id }, tk)
      }
      await load()
    } catch (e) {
      setPhotoError(`照片 ${slot} 上传失败：${e.message || String(e)}`)
    } finally {
      setPhotoUploading(p => ({ ...p, [slot]: false }))
    }
  }

  const shiftSelectedDate = (delta) => {
    const [yy, mm, dd] = selectedDate.split("-").map(Number)
    const d = new Date(yy, mm - 1, dd); d.setDate(d.getDate() + delta)
    const ns = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    setSelectedDate(ns)
    // 如果跨月，同步切换 year/month
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) {
      setYear(d.getFullYear()); setMonth(d.getMonth() + 1)
    }
  }

  // hooks 必须在 early return 之前调用，所以写在这里
  const datesWithEntries = useMemo(() => {
    const s = new Set()
    for (const r of rows) if (r.work_date && !r._isNew) s.add(r.work_date)
    return s
  }, [rows])

  const last7DaysHours = useMemo(() => {
    if (!selectedDate) return 0
    const end = new Date(selectedDate + "T00:00:00")
    const start = new Date(end); start.setDate(end.getDate() - 6)
    let mins = 0
    for (const r of savedWork) {
      if (!r.work_date) continue
      const d = new Date(r.work_date + "T00:00:00")
      if (d >= start && d <= end) mins += r.work_minutes || 0
    }
    return mins / 60
  }, [selectedDate, savedWork])

  const hoursStatus = useMemo(() => {
    if (last7DaysHours >= 25) return { color: t.rd, bg: `${t.rd}0D`, level: "red", text: "🔴 濒临 28h 红线，禁止继续排班" }
    if (last7DaysHours >= 20) return { color: t.wn, bg: `${t.wn}0D`, level: "amber", text: "⚡ 工时偏高，请留意后续排班空间" }
    return { color: t.ts, bg: "rgba(255,255,255,0.7)", level: "ok", text: "合规范围内，可安心排班" }
  }, [last7DaysHours, t])

  // ==================== ADMIN 列表模式 ====================
  if (isAdmin && !selectedEmp) {
    const isHourly = (et) => et === "アルバイト" || et === "外部講師" || et === "兼职"

    const totalsFor = (emp) => {
      const a = adminAgg[emp.id] || { hours: 0, wage: 0, transport: 0, other: 0, commission: 0 }
      if (isHourly(emp.employment_type)) {
        return {
          isH: true,
          hours: a.hours, wage: a.wage, transport: a.transport, other: a.other, commission: a.commission,
          total: a.wage + a.transport + a.other + a.commission,
        }
      }
      return {
        isH: false,
        hours: null, wage: null,
        transport: Number(emp.transport_amount || 0),
        other: 0,
        commission: a.commission,
        total: Number(emp.transport_amount || 0) + a.commission,
      }
    }

    const filteredEmps = allEmps.filter(e => {
      if (companyFilter !== "all" && e.company_id !== companyFilter) return false
      if (typeFilter !== "all" && e.employment_type !== typeFilter) return false
      return true
    })

    const rowsWithTotals = filteredEmps.map(emp => {
      const submitted = adminSubmitted.has(emp.id)
      return { emp, submitted, ...totalsFor(emp) }
    })
    // 汇总只算已提交（未提交的不定，算进去没意义）
    const submittedRows = rowsWithTotals.filter(r => r.submitted)
    const hourlySum = submittedRows.filter(r => r.isH).reduce((s, r) => s + r.total, 0)
    const fulltimeSum = submittedRows.filter(r => !r.isH).reduce((s, r) => s + r.total, 0)
    const grandTotal = hourlySum + fulltimeSum
    const unsubmittedCount = filteredEmps.filter(e => !adminSubmitted.has(e.id)).length

    // 按公司分组
    const groupedByCompany = COMPANIES.map(c => ({
      company: c,
      rows: rowsWithTotals.filter(r => r.emp.company_id === c.id),
      submittedCount: rowsWithTotals.filter(r => r.emp.company_id === c.id && r.submitted).length,
    })).filter(g => g.rows.length > 0)

    const exportCSV = () => {
      const rows = [["姓名", "公司", "雇佣类型", "部门", "提交状态", "工时(h)", "课时费", "交通费", "其他报销", "签单提成", "合计"]]
      for (const r of rowsWithTotals) {
        rows.push([
          r.emp.name,
          COMPANIES.find(c => c.id === r.emp.company_id)?.name || "",
          r.emp.employment_type,
          r.emp.department || "",
          r.submitted ? "已提交" : "未提交",
          r.hours == null ? "" : r.hours.toFixed(1),
          r.wage == null ? "" : r.wage,
          r.transport, r.other, r.commission, r.total,
        ])
      }
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `工资总表_${year}年${month}月.csv`; a.click()
      URL.revokeObjectURL(url)
    }

    const fmt = (n) => n == null ? "—" : `¥${Number(n).toLocaleString()}`
    const EMP_TYPES_ALL = [...EMP_TYPES_JP, ...EMP_TYPES_CN]

    return (
      <div style={{ minHeight: "100vh", position: "relative" }}>
        <AmbientBlobs />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1400, margin: "0 auto", paddingBottom: 40 }}>

          {/* 顶部 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "rgba(59,130,246,.8)", fontSize: 11, fontWeight: 600, letterSpacing: ".2em", textTransform: "uppercase" }}>月度工资</div>
                <h1 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 500, color: "#1e293b", letterSpacing: ".04em" }}>工资总表</h1>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 12, padding: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
                <button onClick={() => chgMonth(-1)} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: t.ts, display: "inline-flex", alignItems: "center", fontFamily: "inherit" }}><ChevronLeft size={17} /></button>
                <div style={{ padding: "0 14px", fontSize: 14, fontWeight: 700, color: t.ac, fontVariantNumeric: "tabular-nums" }}>{year}年 {month}月</div>
                <button onClick={() => chgMonth(1)} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: t.ts, display: "inline-flex", alignItems: "center", fontFamily: "inherit" }}><ChevronRight size={17} /></button>
              </div>
            </div>
            <HoverBtn onClick={exportCSV} t={t}><Download size={14} /> 导出 CSV</HoverBtn>
          </div>

          {/* 统计卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 22 }}>
            <div style={{ ...glassCard, padding: 22, background: `${t.ac}0D`, border: `1px solid ${t.ac}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.ac, marginBottom: 10 }}>
                <DollarSign size={17} /> <span style={{ fontSize: 13, fontWeight: 600 }}>本月总支出预估</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: t.ac, fontVariantNumeric: "tabular-nums", letterSpacing: -1 }}>¥{grandTotal.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: t.tm, marginTop: 6 }}>含时薪员工全额 + 正社员变动项</div>
            </div>

            <div style={{ ...glassCard, padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.ts, marginBottom: 10 }}>
                <Clock size={17} /> <span style={{ fontSize: 13, fontWeight: 600 }}>时薪员工小计</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: t.tx, fontVariantNumeric: "tabular-nums" }}>¥{hourlySum.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: t.tm, marginTop: 6 }}>{rowsWithTotals.filter(r => r.isH).length} 人</div>
            </div>

            <div style={{ ...glassCard, padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.ts, marginBottom: 10 }}>
                <Briefcase size={17} /> <span style={{ fontSize: 13, fontWeight: 600 }}>正社员变动项小计</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: t.tx, fontVariantNumeric: "tabular-nums" }}>¥{fulltimeSum.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: t.wn, fontWeight: 600, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={13} /> 未含基本给
              </div>
            </div>
          </div>

          {/* 筛选 */}
          <div style={{ ...glassCard, padding: 18, marginBottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: t.tm, fontWeight: 600, width: 40 }}>公司</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[{ id: "all", name: "全部" }, ...COMPANIES].map(c => {
                  const on = companyFilter === c.id
                  return <span key={c.id} onClick={() => setCompanyFilter(c.id)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: on ? t.tb : "transparent", color: on ? t.ac : t.ts, border: `1px solid ${on ? t.ac : t.bd}`, transition: "all 0.2s", whiteSpace: "nowrap" }}>{c.name}</span>
                })}
              </div>
            </div>
            <div style={{ height: 1, background: t.bd, opacity: 0.5 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: t.tm, fontWeight: 600, width: 40 }}>雇佣</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["all", ...EMP_TYPES_ALL].map(c => {
                  const on = typeFilter === c
                  return <span key={c} onClick={() => setTypeFilter(c)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: on ? "#fff" : "transparent", color: on ? t.tx : t.ts, border: `1px solid ${on ? t.tx : t.bd}`, transition: "all 0.2s", whiteSpace: "nowrap" }}>{c === "all" ? "全部" : c}</span>
                })}
              </div>
            </div>
          </div>

          {/* 未提交提示 */}
          {unsubmittedCount > 0 && (
            <div style={{ padding: 12, borderRadius: 12, background: `${t.wn}12`, border: `1px solid ${t.wn}40`, marginBottom: 16, fontSize: 12, color: t.tx, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={14} color={t.wn} />
              <span>当前筛选下 <strong style={{ color: t.wn }}>{unsubmittedCount}</strong> 位员工未提交本月工资报表。未提交的显示「⏳未提交」标记，数据不计入上方合计。</span>
            </div>
          )}

          {/* 员工列表 —— 按公司分组 */}
          {adminLd ? (
            <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>
          ) : rowsWithTotals.length === 0 ? (
            <div style={{ ...glassCard, padding: 40, textAlign: "center", color: t.tm, fontSize: 13 }}>
              当前筛选条件下无员工
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
              {groupedByCompany.map(({ company, rows: groupRows, submittedCount }) => (
                <div key={company.id}>
                  {/* 公司分组标题 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${t.ac}33` }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.tx }}>{company.name}</h2>
                    <span style={{ fontSize: 12, color: t.tm }}>
                      {groupRows.length} 人 · <strong style={{ color: t.gn }}>{submittedCount}</strong> 已提交 · <strong style={{ color: submittedCount < groupRows.length ? t.wn : t.gn }}>{groupRows.length - submittedCount}</strong> 未提交
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {groupRows.map(({ emp, submitted, isH, hours, wage, transport, other, commission, total }) => {
                      const fade = !submitted
                      return (
                        <div key={emp.id} onClick={() => setSelectedEmp(emp)}
                          style={{ ...glassCard, padding: "16px 20px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 18, cursor: "pointer", transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", opacity: fade ? 0.75 : 1, borderLeft: `3px solid ${submitted ? t.gn : t.wn}` }}
                          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 25px 50px -12px ${t.ac}26`; e.currentTarget.style.borderLeftColor = submitted ? t.gn : t.wn }}
                          onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = glassCard.boxShadow }}>

                          {/* 名片区 */}
                          <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 220, flex: "1 1 auto" }}>
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: submitted ? `${t.gn}18` : `${t.wn}18`, color: submitted ? t.gn : t.wn, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{(emp.name || "?").slice(0, 1)}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: t.tx }}>{emp.name}</span>
                                {(emp.furigana || emp.pinyin) && <span style={{ fontSize: 10, color: t.tm }}>{emp.furigana || emp.pinyin}</span>}
                                {submitted
                                  ? <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: `${t.gn}18`, color: t.gn, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={10} strokeWidth={3} />已提交</span>
                                  : <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: `${t.wn}18`, color: t.wn, whiteSpace: "nowrap" }}>⏳ 未提交</span>}
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ padding: "1px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: "#D1FAE5", color: t.gn, whiteSpace: "nowrap" }}>{emp.employment_type}</span>
                                {emp.department && <span style={{ padding: "1px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: t.tb, color: t.ac, whiteSpace: "nowrap" }}>{emp.department}</span>}
                              </div>
                            </div>
                          </div>

                          {/* 数据列（4 列固定宽，跨行对齐） */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(72px, 1fr))", gap: 10, flex: "2 1 auto" }}>
                            <DataCol label="总工时" value={hours == null ? "—" : `${hours.toFixed(1)}h`} isMoney={false} t={t} />
                            <DataCol label="课时费" value={fmt(wage)} t={t} />
                            <DataCol label="交通费" value={fmt(transport)} t={t} />
                            <DataCol label="报销+提成" value={fmt(other + commission)} t={t} />
                          </div>

                          {/* 合计 + 详情 */}
                          <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: "auto", paddingLeft: 16, borderLeft: `1px dashed ${t.bd}` }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 10, color: t.tm, marginBottom: 2, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                                本月合计
                                {!isH && <span style={{ color: t.wn, background: "#FEF3C7", padding: "1px 5px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>未含基本给</span>}
                              </div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: submitted ? t.ac : t.tm, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>¥{total.toLocaleString()}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: t.ts, fontWeight: 600 }}>
                              详情 <ArrowRight size={13} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    )
  }

  // ==================== 单人报表模式（新 UI） ====================
  const showComm = selectedEmp?.has_commission || user.has_commission

  // 当日数据
  const dayWork = workRows.filter(r => r.work_date === selectedDate)
  const dayExp = expRows.filter(r => r.work_date === selectedDate)
  const hoursIcon = hoursStatus.level === "ok" ? <CheckCircle2 size={14} color={t.gn} /> : <AlertCircle size={14} />

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <AmbientBlobs />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto" }}>

        {/* 顶栏 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            {isAdmin && <HoverBtn onClick={() => setSelectedEmp(null)} t={t} style={{ padding: "7px 10px" }}><ArrowLeft size={14} /></HoverBtn>}
            <FileText size={20} strokeWidth={1.8} color={t.ac} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "rgba(59,130,246,.8)", fontSize: 10, fontWeight: 600, letterSpacing: ".2em", textTransform: "uppercase" }}>{month}月 · 工时明细</div>
              <h1 style={{ fontSize: 20, fontWeight: 500, color: "#1e293b", margin: "2px 0 0", letterSpacing: ".04em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {isAdmin ? `${selectedEmp?.name} · 工资报表` : "工资报表"}
              </h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {hasChanges && !locked && <HoverBtn primary disabled={sv} onClick={saveAll} t={t}><Save size={14} /> {sv ? "保存中..." : "保存全部"}</HoverBtn>}
            {canSubmit && (
              <HoverBtn primary onClick={() => setSubmitModal(true)} t={t}><Send size={14} /> 提交 {month}月 报表</HoverBtn>
            )}
            {isAdmin && isSubmitted && (
              <HoverBtn onClick={unlockReport} t={t}><Unlock size={14} /> 解锁 {month}月</HoverBtn>
            )}
          </div>
        </div>

        {saveMsg && (() => { const ok = saveMsg.startsWith("已保存") || saveMsg.startsWith("已提交"), err = saveMsg.startsWith("保存失败") || saveMsg.startsWith("提交失败"); const c = err ? t.rd : ok ? t.gn : t.wn; return <div style={{ padding: 10, borderRadius: 10, background: `${c}15`, border: `1px solid ${c}33`, marginBottom: 14, fontSize: 12, color: c }}>{saveMsg}</div> })()}

        {/* 提交状态 banner */}
        {isSubmitted && (
          <div style={{ padding: 14, borderRadius: 12, background: `${t.gn}12`, border: `1px solid ${t.gn}40`, marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Lock size={16} color={t.gn} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: t.tx, fontWeight: 600, flex: 1, minWidth: 200 }}>
              {month}月 工时报表已提交 <span style={{ color: t.tm, fontWeight: 400, marginLeft: 6 }}>{submission?.submitted_at ? new Date(submission.submitted_at).toLocaleDateString("zh-CN") : ""}</span>
              {!isAdmin && <div style={{ fontSize: 11, color: t.tm, fontWeight: 400, marginTop: 4 }}>如需修改请联系管理员</div>}
            </div>
          </div>
        )}
        {submission?.status === "unlocked" && (
          <div style={{ padding: 12, borderRadius: 10, background: `${t.wn}15`, border: `1px solid ${t.wn}40`, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.tx }}>
            <Unlock size={14} color={t.wn} />
            <span><strong>{month}月</strong> 已由管理员解锁，请修改后重新提交</span>
          </div>
        )}

        {!rates.length && isAdmin && <div style={{ padding: 12, borderRadius: 10, background: `${t.wn}15`, border: `1px solid ${t.wn}33`, marginBottom: 14, fontSize: 12, color: t.wn, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} /> 该员工尚未配置时薪，请先在人事档案中设定</div>}

        {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>

            {/* ======= 左栏：日历 + 28h + 月度合计 ======= */}
            <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

              {/* 日历 */}
              <div style={{ ...glassCard, padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 800, color: t.tx, margin: 0, letterSpacing: -0.5, whiteSpace: "nowrap" }}>{month}月</h3>
                    <span style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>{year}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => setViewMode(viewMode === "month" ? "week" : "month")}
                      title={viewMode === "month" ? "折叠为周历" : "展开为月历"}
                      style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: t.bgI, color: t.ac, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}
                    >
                      <ChevronLeft size={15} style={{ transform: viewMode === "month" ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform 0.25s" }} />
                    </button>
                    <div style={{ width: 1, height: 14, background: t.bd, margin: "0 4px" }} />
                    <button onClick={() => chgMonth(-1)} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "transparent", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}><ChevronLeft size={15} /></button>
                    <button onClick={() => chgMonth(1)} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "transparent", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}><ChevronRight size={15} /></button>
                  </div>
                </div>
                <Calendar year={year} month={month} selectedDate={selectedDate} onPick={setSelectedDate} datesWithEntries={datesWithEntries} viewMode={viewMode} t={t} />
              </div>

              {/* 28h 工时预警 + 打卡照片（并排） */}
              <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                <div style={{ flex: 1, minWidth: 0, ...glassCard, padding: 14, background: hoursStatus.bg, border: hoursStatus.level !== "ok" ? `2px solid ${hoursStatus.color}` : glassCard.border }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 11, fontWeight: 600, color: hoursStatus.color }}>
                    {hoursIcon} 最近 7 天累计
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: hoursStatus.level === "ok" ? t.tx : hoursStatus.color }}>{last7DaysHours.toFixed(1)}</span>
                    <span style={{ fontSize: 12, color: t.tm }}>/ 28h</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 10, color: hoursStatus.level === "ok" ? t.tm : hoursStatus.color, fontWeight: 500, lineHeight: 1.35 }}>
                    {hoursStatus.text}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0, ...glassCard, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 600, color: t.ac }}>
                    <Camera size={13} /> 打卡照片
                    {submission?.photo_1_drive_id && submission?.photo_2_drive_id && (
                      <span style={{ fontSize: 10, color: t.gn, fontWeight: 600, marginLeft: "auto" }}>已完成</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[1, 2].map((slot) => {
                      const driveId = submission?.[`photo_${slot}_drive_id`]
                      const uploading = photoUploading[slot]
                      const tileBase = {
                        position: "relative", flex: 1, minWidth: 0, aspectRatio: "1 / 1",
                        borderRadius: 8,
                        border: `1px dashed ${driveId ? `${t.gn}66` : t.bd}`,
                        background: driveId ? `${t.gn}08` : "rgba(255,255,255,0.55)",
                        overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                      }
                      if (driveId) {
                        return (
                          <div key={slot} onClick={() => setLightboxPhoto({ slot, driveId })}
                               style={{ ...tileBase, cursor: "zoom-in" }}>
                            <img src={`https://cssnsgdawdhrkrmztuas.supabase.co/functions/v1/get-clock-photo?id=${driveId}`} alt={`打卡${slot}`}
                                 style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <span style={{ position: "absolute", top: 3, left: 3, width: 16, height: 16, borderRadius: "50%", background: t.gn, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                              <Check size={10} strokeWidth={3} />
                            </span>
                          </div>
                        )
                      }
                      return (
                        <label key={slot} style={{ ...tileBase, cursor: uploading ? "wait" : (isSubmitted && !isAdmin ? "not-allowed" : "pointer") }}>
                          {uploading ? (
                            <div style={{ width: 16, height: 16, border: `2px solid ${t.ac}33`, borderTopColor: t.ac, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: t.tm }}>
                              <Upload size={14} />
                              <span style={{ fontSize: 9, fontWeight: 600 }}>{slot}</span>
                            </div>
                          )}
                          {!(isSubmitted && !isAdmin) && (
                            <input type="file" accept="image/*" disabled={uploading}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadClockPhoto(slot, f); e.target.value = "" }}
                              style={{ position: "absolute", inset: 0, opacity: 0, cursor: uploading ? "wait" : "pointer" }} />
                          )}
                        </label>
                      )
                    })}
                  </div>
                  {photoError && <div style={{ fontSize: 9, color: t.rd, marginTop: 4 }}>{photoError}</div>}
                </div>
              </div>

              {/* 时薪参考（来自 pay_rates） */}
              <div style={{ ...glassCard, padding: 16 }}>
                <div style={{ fontSize: 11, color: t.tm, fontWeight: 600, marginBottom: 8 }}>我的时薪</div>
                {rates.length > 0 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {rates.map(r => <span key={r.business_type} style={{ padding: "3px 9px", borderRadius: 8, fontSize: 11, fontWeight: 600, color: colorFor(r.business_type), background: `${colorFor(r.business_type)}15` }}>{r.business_type} ¥{Number(r.hourly_rate).toLocaleString()}/h</span>)}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: `${t.wn}12`, border: `1px solid ${t.wn}33`, color: t.wn, fontSize: 12, lineHeight: 1.5 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span>还没设置时薪，请联系管理员配置</span>
                  </div>
                )}
              </div>

              {/* 月度合计 */}
              <div style={{ ...glassCard, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 4, height: 14, backgroundColor: t.ac, borderRadius: 2 }} />
                  {month}月 薪资总览
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Row label="总工时" value={`${(totalMins / 60).toFixed(1)} h`} t={t} />
                  <Row label="课时费合计" value={`¥${totalWage.toLocaleString()}`} t={t} />
                  {totalEjuBonus > 0 && <Row label="EJU 绩效" value={`¥${totalEjuBonus.toLocaleString()}`} t={t} color="#10B981" />}
                  <Row label="交通费合计" value={`¥${totalTrans.toLocaleString()}`} t={t} />
                  <Row label="其他报销" value={`¥${totalOther.toLocaleString()}`} t={t} />
                  {showComm && <Row label="签单提成" value={`¥${totalComm.toLocaleString()}`} t={t} color="#EC4899" />}
                  <div style={{ height: 1, backgroundColor: t.bd, margin: "4px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: t.tx, fontWeight: 700, fontSize: 14 }}>总合计</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: t.ac }}>¥{totalAll.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* 备注 */}
              {(() => {
                const noteDirty = (noteDraft || "") !== (submission?.note || "")
                const noteReadOnly = isSubmitted && !isAdmin
                return (
                  <div style={{ ...glassCard, padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 4, height: 14, backgroundColor: t.wn, borderRadius: 2 }} />
                        备注
                        {noteSavedAt && !noteDirty && <span style={{ fontSize: 11, color: t.gn, fontWeight: 500 }}>已保存</span>}
                      </h3>
                      {!noteReadOnly && (
                        <button onClick={saveNote} disabled={noteSaving || !noteDirty} title={noteDirty ? "保存备注" : "无改动"}
                          style={{
                            width: 32, height: 32, borderRadius: "50%",
                            border: `1px solid ${noteDirty ? `${t.gn}50` : t.bd}`,
                            background: noteDirty ? `${t.gn}18` : "rgba(255,255,255,0.6)",
                            color: noteDirty ? t.gn : t.td,
                            cursor: noteDirty && !noteSaving ? "pointer" : "not-allowed",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontFamily: "inherit", opacity: noteSaving ? 0.5 : 1, transition: "all .15s",
                          }}>
                          <Check size={15} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                    {noteReadOnly ? (
                      <div style={{ fontSize: 13, color: submission?.note ? t.ts : t.td, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {submission?.note || "（无备注）"}
                      </div>
                    ) : (
                      <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="本月需要说明的情况…" rows={4}
                        style={{ ...inputStyle(t), width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
                    )}
                  </div>
                )
              })()}

              {/* 其他报销 */}
              <div style={{ ...glassCard, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Receipt size={16} color={t.wn} style={{ flexShrink: 0 }} /> 其他报销（当日）
                  </h3>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!isSubmitted && <HoverBtn onClick={() => { togglePreview("expenses", false); addExpForDay() }} title="加一笔" t={t} style={{ padding: 8 }}><Plus size={14} /></HoverBtn>}
                    {!expensesLocked && dayExp.length > 0 && (
                      <HoverBtn onClick={() => saveAndPreview("expenses")} title="一时保存" t={t} style={{ padding: 8 }}><Check size={14} /></HoverBtn>
                    )}
                    {sectionPreview.expenses && !isSubmitted && (
                      <HoverBtn onClick={() => togglePreview("expenses", false)} title="编辑" t={t} style={{ padding: 8 }}><Pencil size={14} /></HoverBtn>
                    )}
                  </div>
                </div>
                {dayExp.length === 0 ? (
                  <div style={{ fontSize: 12, color: t.td }}>当日无其他报销记录</div>
                ) : expensesLocked ? (
                  // 只读显示模式
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dayExp.map(r => (
                      <div key={r._key} style={{ display: "flex", gap: 14, padding: "8px 2px", borderBottom: `1px dashed ${t.bl}`, alignItems: "baseline" }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: t.wn, minWidth: 90, fontVariantNumeric: "tabular-nums" }}>¥{Number(r.other_expense || 0).toLocaleString()}</span>
                        <span style={{ fontSize: 13, color: t.ts }}>{r.other_expense_note || <span style={{ color: t.td }}>—</span>}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {dayExp.map(r => (
                      <div key={r._key} data-row-key={r._key} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", scrollMarginTop: 80 }}>
                        <input type="number" placeholder="金额 (円)" value={r.other_expense} onChange={e => updateRow(r._key, "other_expense", e.target.value)} style={{ ...inputStyle(t), width: 130 }} />
                        <input placeholder="报销说明（如：文具）" value={r.other_expense_note} onChange={e => updateRow(r._key, "other_expense_note", e.target.value)} style={{ ...inputStyle(t), flex: 1, minWidth: 180 }} />
                        <HoverBtn danger onClick={() => r._isNew ? removeRow(r._key) : delExisting(r.id, r._key)} t={t} style={{ padding: 8 }}><Trash2 size={14} /></HoverBtn>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 签单提成（月度，不按日） */}
              {showComm && (
                <div style={{ ...glassCard, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                      <FileText size={16} color="#EC4899" style={{ flexShrink: 0 }} /> 签单提成
                      <span style={{ fontSize: 11, color: t.tm, fontWeight: 500 }}>{month}月 · {commRows.filter(r => !r._isNew).length}笔</span>
                      {totalComm > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: "#EC4899", fontVariantNumeric: "tabular-nums", background: "rgba(236,72,153,0.1)", padding: "3px 10px", borderRadius: 8 }}>¥{totalComm.toLocaleString()}</span>}
                    </h3>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {!isSubmitted && <HoverBtn onClick={() => { togglePreview("commissions", false); addCommRow() }} title="加一笔" t={t} style={{ padding: 8 }}><Plus size={14} /></HoverBtn>}
                      {!commissionsLocked && commRows.length > 0 && (
                        <HoverBtn onClick={() => saveAndPreview("commissions")} title="一时保存" t={t} style={{ padding: 8 }}><Check size={14} /></HoverBtn>
                      )}
                      {sectionPreview.commissions && !isSubmitted && (
                        <HoverBtn onClick={() => togglePreview("commissions", false)} title="编辑" t={t} style={{ padding: 8 }}><Pencil size={14} /></HoverBtn>
                      )}
                    </div>
                  </div>

                  {commRows.length === 0 ? (
                    <div style={{ padding: "30px 16px", textAlign: "center", color: t.td, fontSize: 12, borderRadius: 12, border: `1px dashed ${t.bd}`, background: "rgba(255,255,255,0.4)" }}>本月暂无签单提成记录，点右上角 + 添加</div>
                  ) : commissionsLocked ? (
                    // ===== 只读预览模式：跟编辑态同结构的卡片，input 换成纯文字 =====
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {commRows.map(r => (
                        <div key={r._key} style={{ background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                          {/* 上半层：日期 / 签号 / 学生 */}
                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                            <div style={{ flex: "1 1 120px" }}>
                              <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>日期</div>
                              <div style={{ fontSize: 14, color: t.tx, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{r.entry_date || "—"}</div>
                            </div>
                            <div style={{ flex: "0 1 90px" }}>
                              <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>签号</div>
                              <div style={{ fontSize: 14, color: "#DB2777", fontWeight: 700 }}>#{r.seq_number || "?"}</div>
                            </div>
                            <div style={{ flex: "2 1 140px" }}>
                              <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>学生姓名</div>
                              <div style={{ fontSize: 14, color: t.tx, fontWeight: 500 }}>{r.student_name || <span style={{ color: t.td }}>—</span>}</div>
                            </div>
                          </div>
                          {/* 下半层：学费 × 率（值行）+ = 金额（单独行） */}
                          <div style={{ background: t.bgI, padding: 12, borderRadius: 12, border: `1px dashed ${t.bd}`, display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
                              <div style={{ flex: "1 1 0", minWidth: 0 }}>
                                <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>学费总额 (円)</div>
                                <div style={{ fontSize: 14, color: t.tx, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>¥{Number(r.tuition_amount || 0).toLocaleString()}</div>
                              </div>
                              <span style={{ color: t.td, fontWeight: 600, flexShrink: 0 }}>×</span>
                              <div style={{ width: 90, flexShrink: 0 }}>
                                <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>提成率 (%)</div>
                                <div style={{ fontSize: 14, color: t.tx, fontWeight: 600 }}>{r.commission_rate || "0"}%</div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: `1px dashed ${t.bd}` }}>
                              <div style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>= 提成金额</div>
                              <span style={{ fontSize: 22, fontWeight: 800, color: "#DB2777", letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>¥{Number(r.commission_amount || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    // ===== 编辑模式：上下分层卡片（身份 + 算钱引擎） =====
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {commRows.map(r => (
                        <div key={r._key} data-row-key={r._key} style={{ background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.02)", scrollMarginTop: 80 }}>
                          {/* 上半层：日期 / 签号 / 学生 */}
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ flex: "1 1 120px" }}>
                              <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>日期</div>
                              <input type="date" value={r.entry_date} onChange={e => updateComm(r._key, "entry_date", e.target.value)} style={{ ...inputStyle(t), padding: "8px 12px" }} />
                            </div>
                            <div style={{ flex: "0 1 90px" }}>
                              <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>签号</div>
                              <input type="number" placeholder="# 1" value={r.seq_number} onChange={e => updateComm(r._key, "seq_number", e.target.value)} style={{ ...inputStyle(t), padding: "8px 12px", color: "#DB2777", fontWeight: 700, background: "#FDF2F8", border: "1px solid #FBCFE8" }} />
                            </div>
                            <div style={{ flex: "2 1 140px" }}>
                              <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>学生姓名</div>
                              <input placeholder="填写姓名" value={r.student_name} onChange={e => updateComm(r._key, "student_name", e.target.value)} style={{ ...inputStyle(t), padding: "8px 12px" }} />
                            </div>
                          </div>
                          {/* 下半层：算钱引擎（输入一行、金额一行，防止数字长度挤动布局） */}
                          <div style={{ background: t.bgI, padding: 12, borderRadius: 12, border: `1px dashed ${t.bd}`, display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                              <div style={{ flex: "1 1 0", minWidth: 0 }}>
                                <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>学费总额 (円)</div>
                                <input type="number" placeholder="0" value={r.tuition_amount} onChange={e => updateComm(r._key, "tuition_amount", e.target.value)} style={{ ...inputStyle(t), padding: "8px 12px" }} />
                              </div>
                              <span style={{ color: t.td, fontWeight: 600, paddingBottom: 10, flexShrink: 0 }}>×</span>
                              <div style={{ width: 90, flexShrink: 0 }}>
                                <div style={{ fontSize: 11, color: t.tm, marginBottom: 4, fontWeight: 600 }}>提成率 (%)</div>
                                <input type="number" placeholder="0" value={r.commission_rate} onChange={e => updateComm(r._key, "commission_rate", e.target.value)} style={{ ...inputStyle(t), padding: "8px 12px" }} />
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: `1px dashed ${t.bd}`, gap: 10 }}>
                              <div style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>= 提成金额</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontSize: 22, fontWeight: 800, color: "#DB2777", letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>
                                  ¥{Number(r.commission_amount || 0).toLocaleString()}
                                </span>
                                <HoverBtn danger onClick={() => r._isNew ? removeComm(r._key) : delCommExisting(r.id, r._key)} t={t} style={{ padding: 8, background: "#fff", border: `1px solid ${t.bd}` }}><Trash2 size={15} /></HoverBtn>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ======= 右栏：选中日详情 ======= */}
            <div style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 20, minWidth: 0, paddingBottom: 80 }}>

              {/* 当日标题 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `2px solid ${t.bd}`, paddingBottom: 12, gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minWidth: 0 }}>
                  <button onClick={() => shiftSelectedDate(-1)} title="前一天" style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.7)", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", flexShrink: 0 }}><ChevronLeft size={15} /></button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: t.tm, fontWeight: 600, marginBottom: 2 }}>选中日期</div>
                    <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.8, color: t.tx }}>
                      {fmtDateW(selectedDate)}
                    </h1>
                  </div>
                  <button onClick={() => shiftSelectedDate(1)} title="后一天" style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.7)", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", flexShrink: 0 }}><ChevronRight size={15} /></button>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, paddingBottom: 2 }}>
                  {!isSubmitted && <HoverBtn onClick={() => { togglePreview("work", false); addWorkForDay() }} title="加一笔" t={t} style={{ padding: 8 }}><Plus size={14} /></HoverBtn>}
                  {!workLocked && dayWork.length > 0 && (
                    <HoverBtn onClick={() => saveAndPreview("work")} title="一时保存" t={t} style={{ padding: 8 }}><Check size={14} /></HoverBtn>
                  )}
                  {sectionPreview.work && !isSubmitted && (
                    <HoverBtn onClick={() => togglePreview("work", false)} title="编辑" t={t} style={{ padding: 8 }}><Pencil size={14} /></HoverBtn>
                  )}
                </div>
              </div>

              {/* 工时时间轴 */}
              <div style={{ display: "flex", flexDirection: "column", paddingLeft: 8 }}>
                {dayWork.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "50px 0", color: t.td }}>
                    <CalendarDays size={42} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: 13 }}>{locked ? "本月已提交，暂无工时记录" : "今日无工时记录，点右下角 + 添加"}</p>
                  </div>
                ) : dayWork.map((r, idx) => (
                  <WorkTimelineCard key={r._key} r={r} isLast={idx === dayWork.length - 1}
                    onUpdate={updateRow} onRemove={removeRow} onDelExisting={delExisting}
                    rates={rates} t={t} locked={workLocked} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 打卡照片放大预览 Lightbox */}
      {lightboxPhoto && (
        <div onClick={() => setLightboxPhoto(null)} style={{
          position: "fixed", inset: 0, zIndex: 1500, background: "rgba(0,0,0,0.88)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, cursor: "zoom-out",
        }}>
          <img src={`https://cssnsgdawdhrkrmztuas.supabase.co/functions/v1/get-clock-photo?id=${lightboxPhoto.driveId}`}
               alt={`打卡照片 ${lightboxPhoto.slot}`}
               onClick={(e) => e.stopPropagation()}
               style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 30px 80px rgba(0,0,0,0.5)", cursor: "auto" }} />
          <button onClick={(e) => { e.stopPropagation(); setLightboxPhoto(null) }}
            style={{ position: "fixed", top: 20, right: 20, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", backdropFilter: "blur(8px)" }}>
            <XIcon size={20} />
          </button>
          <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 12, fontWeight: 600, backdropFilter: "blur(8px)" }}>
            <Camera size={14} /> 打卡照片 {lightboxPhoto.slot}
            {!(isSubmitted && !isAdmin) && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 12, background: "rgba(255,255,255,0.22)", cursor: "pointer", marginLeft: 6 }}>
                <Upload size={12} /> 重新上传
                <input type="file" accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadClockPhoto(lightboxPhoto.slot, f); setLightboxPhoto(null) } e.target.value = "" }}
                  style={{ display: "none" }} />
              </label>
            )}
          </div>
        </div>
      )}

      {/* 错误提示 Modal */}
      {errorModal && (
        <div onClick={() => setErrorModal(null)} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "rgba(255,255,255,0.98)", borderRadius: 20, maxWidth: 420, width: "100%", padding: 24, boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${t.wn}18`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={20} color={t.wn} />
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.tx }}>{errorModal.title}</h3>
            </div>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: t.ts, lineHeight: 1.6 }}>{errorModal.message}</p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <HoverBtn primary onClick={() => setErrorModal(null)} t={t}>知道了</HoverBtn>
            </div>
          </div>
        </div>
      )}

      {/* 提交确认 Modal */}
      {submitModal && (
        <div onClick={() => !submittingReport && setSubmitModal(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "rgba(255,255,255,0.98)", borderRadius: 24, maxWidth: 520, width: "100%", padding: 28, boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: t.tx, display: "flex", alignItems: "center", gap: 8 }}>
                <Send size={18} color={t.ac} /> 提交 {year}年 {month}月 工时报表
              </h3>
              <button onClick={() => !submittingReport && setSubmitModal(false)} style={{ background: "transparent", border: "none", color: t.tm, cursor: "pointer", padding: 4, display: "inline-flex", fontFamily: "inherit" }}><XIcon size={18} /></button>
            </div>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: t.tm, lineHeight: 1.6 }}>
              请核对本月总览。提交后该月工时将被锁定不可修改，如需变更请联系管理员解锁。
            </p>
            <div style={{ padding: 18, borderRadius: 16, background: `${t.ac}08`, border: `1px solid ${t.ac}22`, display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <Row label="总工时" value={`${(totalMins / 60).toFixed(1)} h`} t={t} />
              <Row label="课时费合计" value={`¥${totalWage.toLocaleString()}`} t={t} />
              {totalEjuBonus > 0 && <Row label="EJU 绩效 (+300円/h)" value={`¥${totalEjuBonus.toLocaleString()}`} t={t} color="#10B981" />}
              <Row label="交通费合计" value={`¥${totalTrans.toLocaleString()}`} t={t} />
              <Row label="其他报销" value={`¥${totalOther.toLocaleString()}`} t={t} />
              {showComm && <Row label="签单提成" value={`¥${totalComm.toLocaleString()}`} t={t} color="#EC4899" />}
              <div style={{ height: 1, backgroundColor: t.bd, margin: "4px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: t.tx, fontWeight: 700, fontSize: 15 }}>总合计</span>
                <span style={{ fontSize: 26, fontWeight: 800, color: t.ac }}>¥{totalAll.toLocaleString()}</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <HoverBtn onClick={() => setSubmitModal(false)} disabled={submittingReport} t={t}>取消</HoverBtn>
              <HoverBtn primary onClick={submitReport} disabled={submittingReport} t={t}>
                <Send size={14} /> {submittingReport ? "提交中..." : "确认提交"}
              </HoverBtn>
            </div>
          </div>
        </div>
      )}

      {/* 悬浮添加按钮 */}
      {selectedEmp && !ld && !isSubmitted && (
        <button
          onClick={() => { togglePreview("work", false); addWorkForDay() }}
          aria-label="添加工时"
          className="fab-add"
          style={{
            zIndex: 500,
            width: 56, height: 56, borderRadius: "50%",
            backgroundColor: t.ac, color: "#fff",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 8px 24px ${t.ac}66`,
            transition: "all 0.2s",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = `0 12px 32px ${t.ac}88` }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = `0 8px 24px ${t.ac}66` }}
        >
          <Plus size={26} />
        </button>
      )}
    </div>
  )
}

function Row({ label, value, t, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: t.ts }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || t.tx }}>{value}</span>
    </div>
  )
}

function DataCol({ label, value, isMoney = true, highlight, t }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 80 }}>
      <span style={{ fontSize: 11, color: t.tm, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: highlight ? 19 : 14, fontWeight: highlight ? 800 : 600, color: highlight ? t.ac : t.tx, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}>
        {value}
      </span>
    </div>
  )
}

const inputStyle = (t) => ({
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.85)",
  color: t.tx, fontSize: 13, outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
})

function Calendar({ year, month, selectedDate, onPick, datesWithEntries, viewMode, t }) {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const daysInMo = new Date(year, month, 0).getDate()
  // 日期格显示：周一开头（月=1）
  const adjustedFirst = firstDow === 0 ? 6 : firstDow - 1
  const cells = []
  for (let i = 0; i < adjustedFirst; i++) cells.push(null)
  for (let d = 1; d <= daysInMo; d++) cells.push(d)
  // 补到整周
  while (cells.length % 7 !== 0) cells.push(null)

  // 周历模式：只渲染包含 selectedDate 的那一行
  let displayCells = cells
  if (viewMode === "week") {
    const selDay = parseInt((selectedDate || "").split("-")[2])
    const selIdx = cells.indexOf(selDay)
    if (selIdx >= 0) {
      const weekStart = Math.floor(selIdx / 7) * 7
      displayCells = cells.slice(weekStart, weekStart + 7)
    } else {
      displayCells = cells.slice(0, 7)
    }
  }

  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })()

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, transition: "all 0.3s" }}>
      {["月", "火", "水", "木", "金", "土", "日"].map(d => (
        <div key={d} style={{ textAlign: "center", fontSize: 11, color: t.tm, fontWeight: 600, paddingBottom: 4 }}>{d}</div>
      ))}
      {displayCells.map((day, idx) => {
        if (!day) return <div key={`e-${idx}`} style={{ width: 36, height: 36, margin: "0 auto" }} />
        const ds = `${year}-${pad(month)}-${pad(day)}`
        const isSelected = selectedDate === ds
        const hasEntries = datesWithEntries.has(ds)
        const isToday = ds === todayStr
        return (
          <div key={ds} onClick={() => onPick(ds)} style={{
            width: 36, height: 36, margin: "0 auto",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "50%", cursor: "pointer", transition: "all 0.2s",
            background: isSelected ? t.ac : (hasEntries ? "rgba(255,255,255,0.8)" : "transparent"),
            color: isSelected ? "#fff" : (isToday ? t.ac : t.tx),
            boxShadow: isSelected ? `0 4px 12px ${t.ac}66` : "none",
            border: isSelected ? "none" : (hasEntries ? `1px solid ${t.bd}` : (isToday ? `1px solid ${t.ac}60` : "1px solid transparent")),
            transform: isSelected ? "scale(1.05)" : "scale(1)",
            position: "relative",
          }}>
            <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : (isToday ? 700 : 500) }}>{day}</span>
            {hasEntries && !isSelected && (
              <div style={{ position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: "50%", background: t.ac }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function WorkTimelineCard({ r, isLast, onUpdate, onRemove, onDelExisting, rates, t, locked }) {
  const color = colorFor(r.business_type)
  const hrs = r.work_minutes > 0 ? (r.work_minutes / 60).toFixed(2) : "0.00"
  const isEju = r.business_type === EJU_TYPE
  const effectiveRate = Number(r.hourly_rate || 0) + (r.eju_bonus && isEju ? EJU_BONUS_PER_HOUR : 0)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const hasEjuInRates = rates.some(rt => rt.business_type === EJU_TYPE)
  return (
    <div data-row-key={r._key} style={{ position: "relative", paddingLeft: 28, paddingBottom: 28, scrollMarginTop: 80 }}>
      <div style={{ position: "absolute", left: 0, top: 16, width: 12, height: 12, borderRadius: "50%", border: `3px solid ${color}`, background: "#fff", zIndex: 2, transform: "translateX(-4px)" }} />
      {!isLast && <div style={{ position: "absolute", left: 1, top: 28, bottom: 0, width: 2, background: t.bd, zIndex: 1 }} />}

      <div style={{ ...glassCard, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 第一行：时间 + 业务类型 + 删除 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {(() => {
            const isOvernight = r.start_time && r.end_time && r.start_time > r.end_time
            const OvernightTag = isOvernight ? <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", background: "#FEF3C7", padding: "1px 6px", borderRadius: 4, marginLeft: 4 }} title="跨夜：结束时间属于第二天">次日</span> : null
            return locked ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: t.bgI, padding: "8px 14px", borderRadius: 10, border: `1px solid ${t.bd}` }}>
                <Clock size={14} color={t.tm} />
                <span style={{ fontSize: 14, fontWeight: 700, color: t.tx, fontVariantNumeric: "tabular-nums" }}>{r.start_time || "—"}</span>
                <span style={{ color: t.td }}>-</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.tx, fontVariantNumeric: "tabular-nums" }}>{r.end_time || "—"}</span>
                {OvernightTag}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.bgI, padding: 4, borderRadius: 10, border: `1px solid ${t.bd}` }}>
                <Clock size={15} color={t.tm} style={{ marginLeft: 6 }} />
                <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5} value={r.start_time}
                  onChange={e => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; onUpdate(r._key, "start_time", v) }}
                  style={{ border: "none", background: "transparent", outline: "none", fontSize: 14, fontWeight: 600, width: 62, color: t.tx, fontFamily: "inherit", textAlign: "center" }} />
                <span style={{ color: t.td }}>-</span>
                <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5} value={r.end_time}
                  onChange={e => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; onUpdate(r._key, "end_time", v) }}
                  style={{ border: "none", background: "transparent", outline: "none", fontSize: 14, fontWeight: 600, width: 62, color: t.tx, fontFamily: "inherit", textAlign: "center", marginRight: OvernightTag ? 0 : 6 }} />
                {OvernightTag}
              </div>
            )
          })()}
          {locked ? (
            <div style={{ flex: 1, minWidth: 140, background: `${color}10`, color, border: `1px solid ${color}40`, fontWeight: 600, padding: "8px 14px", borderRadius: 10, fontSize: 13 }}>
              {r.business_type || "—"}
            </div>
          ) : (
            <select value={r.business_type} onChange={e => onUpdate(r._key, "business_type", e.target.value)}
              style={{ ...inputStyle(t), width: "auto", flex: 1, minWidth: 140, background: `${color}10`, color, borderColor: `${color}40`, fontWeight: 600 }}>
              <option value="">选择业务类型</option>
              {rates.map(rt => <option key={rt.business_type} value={rt.business_type}>{rt.business_type}</option>)}
              {hasEjuInRates ? null : isEju ? <option value={EJU_TYPE}>{EJU_TYPE}</option> : null}
            </select>
          )}
          {!locked && <HoverBtn danger onClick={() => r._isNew ? onRemove(r._key) : onDelExisting(r.id, r._key)} t={t} style={{ padding: 8 }}><Trash2 size={15} /></HoverBtn>}
        </div>

        {/* EJU 绩效勾选 + 申报须知 */}
        {isEju && (locked ? (r.eju_bonus && (
          <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", gap: 8, color: "#047857", fontSize: 13, fontWeight: 600 }}>
            <Sparkles size={14} color="#10B981" />
            <span>已申报 +¥{EJU_BONUS_PER_HOUR} 班课绩效</span>
          </div>
        )) : (
          <div style={{ padding: 12, borderRadius: 12, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.25)", display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.tx, cursor: "pointer", fontWeight: 600 }}>
              <input type="checkbox" checked={!!r.eju_bonus} onChange={e => onUpdate(r._key, "eju_bonus", e.target.checked)} style={{ width: 16, height: 16, accentColor: "#10B981", cursor: "pointer" }} />
              <Sparkles size={14} color="#10B981" />
              <span>申报 +¥{EJU_BONUS_PER_HOUR} 班课绩效</span>
            </label>
            <button type="button" onClick={() => setNoticeOpen(v => !v)} style={{ background: "transparent", border: "none", color: "#10B981", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <ChevronRight size={12} style={{ transform: noticeOpen ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }} />
              班课绩效申报须知
            </button>
            {noticeOpen && (
              <div style={{ fontSize: 11, color: t.tm, lineHeight: 1.8, padding: "8px 10px", background: "rgba(255,255,255,0.6)", borderRadius: 8, whiteSpace: "pre-line" }}>
                {`本栏勾选 "300" 即代表您确认本次课程教学质量已达优秀标准（考核分 ≥ 90）。\n我们默认每一位勾选的老师都表现优异，因此不做预扣除。\n教务处将进行不定期教学抽查。如经核实实际教学情况与申报不符（未达 90 分标准），我们将不得不撤回该次奖励并启动面谈复盘流程。\n请老师们珍视个人职业信誉，按实申报。`}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, color: t.tm, display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}><User size={11} /> 学生姓名</label>
            {locked
              ? <div style={{ fontSize: 14, color: t.tx, fontWeight: 500, padding: "4px 0" }}>{r.student_name || <span style={{ color: t.td }}>—</span>}</div>
              : <input placeholder="请填写学生全名" value={r.student_name} onChange={e => onUpdate(r._key, "student_name", e.target.value)} style={inputStyle(t)} />
            }
          </div>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ fontSize: 11, color: t.tm, display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}><FileText size={11} /> 工作内容 / 课程</label>
            {locked
              ? <div style={{ fontSize: 14, color: t.tx, fontWeight: 500, padding: "4px 0" }}>{r.course_name || <span style={{ color: t.td }}>—</span>}</div>
              : <input placeholder="简述内容" value={r.course_name} onChange={e => onUpdate(r._key, "course_name", e.target.value)} style={inputStyle(t)} />
            }
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 10, borderTop: `1px dashed ${t.bd}`, gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 150 }}>
            <label style={{ fontSize: 11, color: t.tm, display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}><Car size={11} /> 交通费 (円)</label>
            {locked
              ? <div style={{ fontSize: 14, color: t.tx, fontWeight: 600, padding: "4px 0", fontVariantNumeric: "tabular-nums" }}>¥{Number(r.transport_fee || 0).toLocaleString()}</div>
              : <input type="number" placeholder="0" value={r.transport_fee} onChange={e => onUpdate(r._key, "transport_fee", e.target.value)} style={{ ...inputStyle(t), background: "rgba(255,255,255,0.9)" }} />
            }
          </div>
          <div style={{ textAlign: "right", minWidth: 160 }}>
            <div style={{ fontSize: 11, color: t.tm, marginBottom: 2 }}>
              {hrs}h × ¥{effectiveRate.toLocaleString()}{r.eju_bonus && isEju ? <span style={{ color: "#10B981" }}>（含绩效）</span> : ""} + 交通 ¥{Number(r.transport_fee || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.tx }}>
              <span style={{ fontSize: 13, color: t.ts, fontWeight: 600, marginRight: 4 }}>小计</span>
              ¥{Number(r.subtotal || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
