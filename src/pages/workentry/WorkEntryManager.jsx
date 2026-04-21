import { useState, useEffect, useCallback, useMemo } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { FileText, Plus, ChevronLeft, ChevronRight, Trash2, Save, AlertTriangle, AlertCircle, CheckCircle2, Pencil, ArrowLeft, Clock, User, Car, Receipt, CalendarDays } from "lucide-react"
import { fmtDateW, WEEKDAYS, pad } from "../../config/constants"

const DEPTS = ["大学院", "学部", "文书", "语言类"]
const mkWork = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, _type: "work", work_date: "", business_type: "", start_time: "", end_time: "", work_minutes: 0, hourly_rate: 0, transport_fee: "", subtotal: 0, student_name: "", course_name: "", other_expense: 0, other_expense_note: "" })
const mkExp = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, _type: "expense", work_date: "", other_expense: "", other_expense_note: "" })
const mkComm = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, entry_date: "", seq_number: "", student_name: "", tuition_amount: "", commission_rate: "", commission_amount: 0 })

const TYPE_COLORS = {
  "事務": "#8B5CF6",
  "講師（大課）": "#3B82F6",
  "講師（一対一）": "#06B6D4",
  "答疑做題": "#F59E0B",
  "研究計画書修改": "#EC4899",
}
const colorFor = (bt) => TYPE_COLORS[bt] || "#64748B"

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

function HoverBtn({ children, primary, onClick, style, danger, disabled, t }) {
  const [hv, setHv] = useState(false)
  const baseBg = primary ? t.ac : (danger ? "transparent" : "transparent")
  const hoverBg = primary ? t.ah : (danger ? `${t.rd}10` : t.bgH)
  const textColor = primary ? "#fff" : (danger ? t.rd : t.ts)
  return (
    <button
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
  const [selectedEmp, setSelectedEmp] = useState(isAdmin ? null : { id: user.id, name: user.name, has_commission: user.has_commission })

  const [rows, setRows] = useState([])
  const [commRows, setCommRows] = useState([])
  const [ld, setLd] = useState(true)
  const [sv, setSv] = useState(false)
  const [rates, setRates] = useState([])
  const [saveMsg, setSaveMsg] = useState("")

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)

  const targetEmpId = selectedEmp?.id || user.id

  useEffect(() => {
    if (!isAdmin) return
    (async () => {
      const emps = await sbGet("employees?is_active=eq.true&order=department,name&select=id,name,employment_type,department,is_teacher,login_id,has_commission", tk)
      setAllEmps(emps || [])
    })()
  }, [tk, isAdmin])

  const load = useCallback(async () => {
    if (!selectedEmp) return
    setLd(true)
    const sd = `${year}-${pad(month)}-01`
    const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
    const empQ = `employee_id=eq.${targetEmpId}&`
    const [r, c] = await Promise.all([
      sbGet(`work_entries?${empQ}work_date=gte.${sd}&work_date=lt.${ed}&order=work_date,created_at&select=*`, tk),
      sbGet(`commission_entries?${empQ}entry_date=gte.${sd}&entry_date=lt.${ed}&order=entry_date,seq_number&select=*`, tk),
    ])
    const loaded = (r || []).map(e => {
      const isExp = !e.business_type && (Number(e.other_expense) > 0 || e.other_expense_note)
      return {
        ...e, _key: e.id, _isNew: false, _dirty: false, _type: isExp ? "expense" : "work",
        start_time: e.start_time?.slice(0, 5) || "", end_time: e.end_time?.slice(0, 5) || "",
        transport_fee: e.transport_fee != null ? String(e.transport_fee) : "",
        other_expense: e.other_expense != null ? String(e.other_expense) : "",
        other_expense_note: e.other_expense_note || "", student_name: e.student_name || "", course_name: e.course_name || ""
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

  // 切月时：若 selectedDate 不在当前月，跳到当月 1 号
  useEffect(() => {
    const ym = `${year}-${pad(month)}`
    if (!selectedDate.startsWith(ym)) setSelectedDate(`${ym}-01`)
  }, [year, month, selectedDate])

  const getRateForType = (bt) => { const r = rates.find(r => r.business_type === bt); return r ? Number(r.hourly_rate) : 0 }
  const calcMin = (s, e) => { if (!s || !e) return 0; const [sh, sm] = s.split(":").map(Number), [eh, em] = e.split(":").map(Number); const m = (eh * 60 + em) - (sh * 60 + sm); return m > 0 ? m : 0 }

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r
      const next = { ...r, [field]: value, _dirty: true }
      if (field === "business_type") next.hourly_rate = getRateForType(value)
      const st = field === "start_time" ? value : next.start_time, et = field === "end_time" ? value : next.end_time
      if (st && et) next.work_minutes = calcMin(st, et)
      if (next._type === "work") next.subtotal = Math.round((next.work_minutes || 0) / 60 * (next.hourly_rate || 0) + (parseFloat(next.transport_fee) || 0))
      else next.subtotal = parseFloat(next.other_expense) || 0
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

  const addWorkForDay = () => setRows(prev => [...prev, { ...mkWork(), work_date: selectedDate, _dirty: true }])
  const addExpForDay = () => setRows(prev => [...prev, { ...mkExp(), work_date: selectedDate, _dirty: true }])
  const addCommRow = () => setCommRows(prev => [...prev, { ...mkComm(), entry_date: selectedDate, _dirty: true }])

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
    setSv(true); setSaveMsg("")
    const errors = []
    const track = async (label, p) => {
      const res = await p
      if (res && !Array.isArray(res) && (res.code || res.message)) errors.push(`${label}：${res.message || res.code}`)
    }
    const newWork = rows.filter(validNewWork)
    const newExp = rows.filter(validNewExp)
    const dirty = rows.filter(validDirtyWork)
    for (const r of [...newWork, ...newExp]) {
      await track(r._type === "expense" ? "报销行" : "工时行", sbPost("work_entries", { employee_id: targetEmpId, work_date: r.work_date, business_type: r.business_type || null, start_time: r.start_time ? r.start_time + ":00" : null, end_time: r.end_time ? r.end_time + ":00" : null, work_minutes: r.work_minutes || 0, hourly_rate: r.hourly_rate || 0, subtotal: r.subtotal || 0, transport_fee: parseFloat(r.transport_fee) || 0, other_expense: parseFloat(r.other_expense) || 0, other_expense_note: r.other_expense_note || null, student_name: r.student_name || null, course_name: r.course_name || null }, tk))
    }
    for (const r of dirty) {
      await track("更新", sbPatch(`work_entries?id=eq.${r.id}`, { work_date: r.work_date, business_type: r.business_type || null, start_time: r.start_time ? r.start_time + ":00" : null, end_time: r.end_time ? r.end_time + ":00" : null, work_minutes: r.work_minutes || 0, hourly_rate: r.hourly_rate || 0, subtotal: r.subtotal || 0, transport_fee: parseFloat(r.transport_fee) || 0, other_expense: parseFloat(r.other_expense) || 0, other_expense_note: r.other_expense_note || null, student_name: r.student_name || null, course_name: r.course_name || null }, tk))
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
  const totalTrans = savedWork.reduce((s, e) => s + (parseFloat(e.transport_fee) || 0), 0)
  const totalOther = savedExp.reduce((s, e) => s + (parseFloat(e.other_expense) || 0), 0)
  const totalComm = savedComm.reduce((s, e) => s + (e.commission_amount || 0), 0)
  const totalAll = totalWage + totalTrans + totalOther + totalComm
  const hasChanges = rows.some(r => (r._isNew && r._dirty) || validDirtyWork(r)) || commRows.some(r => (r._isNew && r._dirty) || validDirtyComm(r))

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
    const filteredEmps = allEmps.filter(e => {
      const fullTime = e.employment_type === "正社員" || e.employment_type === "契約社員" || e.employment_type === "正社员"
      if (fullTime && e.login_id !== "luna") return false
      if (!deptFilter) return true
      return e.department === deptFilter
    })

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <FileText size={20} color={t.ac} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>工资报表</h2>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          <button onClick={() => setDeptFilter("")} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${!deptFilter ? t.ac : t.bd}`, background: !deptFilter ? `${t.ac}15` : "transparent", color: !deptFilter ? t.ac : t.ts, fontSize: 11, fontWeight: !deptFilter ? 600 : 400, cursor: "pointer" }}>全部时薪员工</button>
          {DEPTS.map(d => (
            <button key={d} onClick={() => setDeptFilter(deptFilter === d ? "" : d)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${deptFilter === d ? t.ac : t.bd}`, background: deptFilter === d ? `${t.ac}15` : "transparent", color: deptFilter === d ? t.ac : t.ts, fontSize: 11, fontWeight: deptFilter === d ? 600 : 400, cursor: "pointer" }}>{d}</button>
          ))}
        </div>

        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
          {!filteredEmps.length ? (
            <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>该分类下暂无员工</div>
          ) : filteredEmps.map(emp => (
            <div key={emp.id} onClick={() => setSelectedEmp(emp)} style={{ padding: "14px 18px", borderBottom: `1px solid ${t.bl}`, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.background = `${t.ac}06`} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{emp.name}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {emp.department && <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, background: `${t.ac}10`, color: t.ac }}>{emp.department}</span>}
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, background: `#8B5CF615`, color: "#8B5CF6" }}>{emp.employment_type}</span>
                </div>
              </div>
              <span style={{ color: t.ac, fontSize: 11, fontWeight: 600 }}>查看报表</span>
            </div>
          ))}
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isAdmin && <HoverBtn onClick={() => setSelectedEmp(null)} t={t}><ArrowLeft size={14} /> 返回列表</HoverBtn>}
            <FileText size={22} strokeWidth={1.8} color={t.ac} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: t.tx, margin: 0 }}>
              {isAdmin ? `${selectedEmp?.name} 的工资报表` : "工资报表"}
            </h2>
          </div>
          {hasChanges && <HoverBtn primary disabled={sv} onClick={saveAll} t={t}><Save size={14} /> {sv ? "保存中..." : "保存全部"}</HoverBtn>}
        </div>

        {/* 月份切换 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <HoverBtn onClick={() => chgMonth(-1)} t={t} style={{ padding: "7px 10px" }}><ChevronLeft size={14} /></HoverBtn>
          <span style={{ fontSize: 15, fontWeight: 700, color: t.tx, minWidth: 100, textAlign: "center" }}>{year}年{month}月</span>
          <HoverBtn onClick={() => chgMonth(1)} t={t} style={{ padding: "7px 10px" }}><ChevronRight size={14} /></HoverBtn>
        </div>

        {saveMsg && (() => { const ok = saveMsg.startsWith("已保存"), err = saveMsg.startsWith("保存失败"); const c = err ? t.rd : ok ? t.gn : t.wn; return <div style={{ padding: 10, borderRadius: 10, background: `${c}15`, border: `1px solid ${c}33`, marginBottom: 14, fontSize: 12, color: c }}>{saveMsg}</div> })()}
        {!rates.length && <div style={{ padding: 12, borderRadius: 10, background: `${t.wn}15`, border: `1px solid ${t.wn}33`, marginBottom: 14, fontSize: 12, color: t.wn, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} /> 该员工尚未配置时薪，请先在人事档案中设定</div>}

        {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>

            {/* ======= 左栏：日历 + 28h + 月度合计 ======= */}
            <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

              {/* 日历 */}
              <div style={{ ...glassCard, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 800, color: t.tx, margin: 0, letterSpacing: -0.5 }}>{month}月</h3>
                    <span style={{ fontSize: 11, color: t.tm, fontWeight: 600 }}>{year}</span>
                  </div>
                </div>
                <Calendar year={year} month={month} selectedDate={selectedDate} onPick={setSelectedDate} datesWithEntries={datesWithEntries} t={t} />
              </div>

              {/* 28h 工时预警 */}
              <div style={{ ...glassCard, padding: 18, background: hoursStatus.bg, border: hoursStatus.level !== "ok" ? `2px solid ${hoursStatus.color}` : glassCard.border }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 600, color: hoursStatus.color }}>
                  {hoursIcon} 最近 7 天累计工时
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: hoursStatus.level === "ok" ? t.tx : hoursStatus.color }}>{last7DaysHours.toFixed(1)}</span>
                  <span style={{ fontSize: 13, color: t.tm }}>/ 28 小时</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: hoursStatus.level === "ok" ? t.tm : hoursStatus.color, fontWeight: 500 }}>
                  {hoursStatus.text}
                </div>
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

              {/* 时薪参考（来自 pay_rates） */}
              {rates.length > 0 && (
                <div style={{ ...glassCard, padding: 16 }}>
                  <div style={{ fontSize: 11, color: t.tm, fontWeight: 600, marginBottom: 8 }}>我的时薪（参考）</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {rates.map(r => <span key={r.business_type} style={{ padding: "3px 9px", borderRadius: 8, fontSize: 11, fontWeight: 600, color: colorFor(r.business_type), background: `${colorFor(r.business_type)}15` }}>{r.business_type} ¥{Number(r.hourly_rate).toLocaleString()}/h</span>)}
                  </div>
                </div>
              )}
            </div>

            {/* ======= 右栏：选中日详情 ======= */}
            <div style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 20, minWidth: 0, paddingBottom: 80 }}>

              {/* 当日标题 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `2px solid ${t.bd}`, paddingBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: t.tm, fontWeight: 600, marginBottom: 2 }}>选中日期</div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.8, color: t.tx }}>
                    {fmtDateW(selectedDate)}
                  </h1>
                </div>
                <button onClick={addWorkForDay} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: t.ac, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "4px 8px", fontFamily: "inherit" }}>
                  <Plus size={14} /> 快捷添加
                </button>
              </div>

              {/* 工时时间轴 */}
              <div style={{ display: "flex", flexDirection: "column", paddingLeft: 8 }}>
                {dayWork.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "50px 0", color: t.td }}>
                    <CalendarDays size={42} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: 13 }}>今日无工时记录，点右下角 + 添加</p>
                  </div>
                ) : dayWork.map((r, idx) => (
                  <WorkTimelineCard key={r._key} r={r} isLast={idx === dayWork.length - 1}
                    onUpdate={updateRow} onRemove={removeRow} onDelExisting={delExisting}
                    rates={rates} t={t} />
                ))}
              </div>

              {/* 其他报销 */}
              <div style={{ ...glassCard, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 8 }}>
                    <Receipt size={16} color={t.wn} /> 其他报销（当日）
                  </h3>
                  <HoverBtn onClick={addExpForDay} t={t} style={{ padding: "6px 12px", fontSize: 12 }}><Plus size={13} /> 加一笔</HoverBtn>
                </div>
                {dayExp.length === 0 ? (
                  <div style={{ fontSize: 12, color: t.td }}>当日无其他报销记录</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {dayExp.map(r => (
                      <div key={r._key} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 8 }}>
                      <FileText size={16} color="#EC4899" /> 签单提成（{month}月全月）
                    </h3>
                    <HoverBtn onClick={addCommRow} t={t} style={{ padding: "6px 12px", fontSize: 12 }}><Plus size={13} /> 加一笔</HoverBtn>
                  </div>
                  {commRows.length === 0 ? (
                    <div style={{ fontSize: 12, color: t.td }}>本月无签单提成记录</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {commRows.map(r => (
                        <div key={r._key} style={{ display: "grid", gridTemplateColumns: "130px 60px 1fr 120px 80px 120px 44px", gap: 8, alignItems: "center" }}>
                          <input type="date" value={r.entry_date} onChange={e => updateComm(r._key, "entry_date", e.target.value)} style={inputStyle(t)} />
                          <input type="number" placeholder="#" value={r.seq_number} onChange={e => updateComm(r._key, "seq_number", e.target.value)} style={{ ...inputStyle(t), textAlign: "center" }} />
                          <input placeholder="学生姓名" value={r.student_name} onChange={e => updateComm(r._key, "student_name", e.target.value)} style={inputStyle(t)} />
                          <input type="number" placeholder="学费" value={r.tuition_amount} onChange={e => updateComm(r._key, "tuition_amount", e.target.value)} style={{ ...inputStyle(t), textAlign: "right" }} />
                          <input type="number" placeholder="%" value={r.commission_rate} onChange={e => updateComm(r._key, "commission_rate", e.target.value)} style={{ ...inputStyle(t), textAlign: "right" }} />
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#EC4899", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>¥{Number(r.commission_amount || 0).toLocaleString()}</div>
                          <HoverBtn danger onClick={() => r._isNew ? removeComm(r._key) : delCommExisting(r.id, r._key)} t={t} style={{ padding: 8 }}><Trash2 size={14} /></HoverBtn>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 悬浮添加按钮 */}
      {selectedEmp && !ld && (
        <button
          onClick={addWorkForDay}
          aria-label="添加工时"
          style={{
            position: "fixed", bottom: 32, right: 28, zIndex: 500,
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

const inputStyle = (t) => ({
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.85)",
  color: t.tx, fontSize: 13, outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
})

function Calendar({ year, month, selectedDate, onPick, datesWithEntries, t }) {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const daysInMo = new Date(year, month, 0).getDate()
  // 日期格显示：周一开头（月=1）
  const adjustedFirst = firstDow === 0 ? 6 : firstDow - 1
  const cells = []
  for (let i = 0; i < adjustedFirst; i++) cells.push(null)
  for (let d = 1; d <= daysInMo; d++) cells.push(d)

  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })()

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
      {["月", "火", "水", "木", "金", "土", "日"].map(d => (
        <div key={d} style={{ textAlign: "center", fontSize: 11, color: t.tm, fontWeight: 600, paddingBottom: 4 }}>{d}</div>
      ))}
      {cells.map((day, idx) => {
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

function WorkTimelineCard({ r, isLast, onUpdate, onRemove, onDelExisting, rates, t }) {
  const color = colorFor(r.business_type)
  const hrs = r.work_minutes > 0 ? (r.work_minutes / 60).toFixed(2) : "0.00"
  return (
    <div style={{ position: "relative", paddingLeft: 28, paddingBottom: 28 }}>
      {/* 时间轴点 */}
      <div style={{ position: "absolute", left: 0, top: 16, width: 12, height: 12, borderRadius: "50%", border: `3px solid ${color}`, background: "#fff", zIndex: 2, transform: "translateX(-4px)" }} />
      {!isLast && <div style={{ position: "absolute", left: 1, top: 28, bottom: 0, width: 2, background: t.bd, zIndex: 1 }} />}

      <div style={{ ...glassCard, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 第一行：时间 + 业务类型 + 删除 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.bgI, padding: 4, borderRadius: 10, border: `1px solid ${t.bd}` }}>
            <Clock size={15} color={t.tm} style={{ marginLeft: 6 }} />
            <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5} value={r.start_time}
              onChange={e => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; onUpdate(r._key, "start_time", v) }}
              style={{ border: "none", background: "transparent", outline: "none", fontSize: 14, fontWeight: 600, width: 62, color: t.tx, fontFamily: "inherit", textAlign: "center" }} />
            <span style={{ color: t.td }}>-</span>
            <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5} value={r.end_time}
              onChange={e => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; onUpdate(r._key, "end_time", v) }}
              style={{ border: "none", background: "transparent", outline: "none", fontSize: 14, fontWeight: 600, width: 62, color: t.tx, fontFamily: "inherit", textAlign: "center" }} />
          </div>
          <select value={r.business_type} onChange={e => onUpdate(r._key, "business_type", e.target.value)}
            style={{ ...inputStyle(t), width: "auto", flex: 1, minWidth: 140, background: `${color}10`, color, borderColor: `${color}40`, fontWeight: 600 }}>
            <option value="">选择业务类型</option>
            {rates.map(rt => <option key={rt.business_type} value={rt.business_type}>{rt.business_type}</option>)}
          </select>
          <HoverBtn danger onClick={() => r._isNew ? onRemove(r._key) : onDelExisting(r.id, r._key)} t={t} style={{ padding: 8 }}><Trash2 size={15} /></HoverBtn>
        </div>

        {/* 第二行：学生 + 内容 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, color: t.tm, display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}><User size={11} /> 学生姓名</label>
            <input placeholder="不填则为空" value={r.student_name} onChange={e => onUpdate(r._key, "student_name", e.target.value)} style={inputStyle(t)} />
          </div>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ fontSize: 11, color: t.tm, display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}><FileText size={11} /> 工作内容 / 课程</label>
            <input placeholder="简述内容" value={r.course_name} onChange={e => onUpdate(r._key, "course_name", e.target.value)} style={inputStyle(t)} />
          </div>
        </div>

        {/* 第三行：交通费 + 小计 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 10, borderTop: `1px dashed ${t.bd}`, gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 150 }}>
            <label style={{ fontSize: 11, color: t.tm, display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}><Car size={11} /> 交通费 (円)</label>
            <input type="number" placeholder="0" value={r.transport_fee} onChange={e => onUpdate(r._key, "transport_fee", e.target.value)} style={{ ...inputStyle(t), background: "rgba(255,255,255,0.9)" }} />
          </div>
          <div style={{ textAlign: "right", minWidth: 160 }}>
            <div style={{ fontSize: 11, color: t.tm, marginBottom: 2 }}>
              {hrs}h × ¥{Number(r.hourly_rate || 0).toLocaleString()} + 交通 ¥{Number(r.transport_fee || 0).toLocaleString()}
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
