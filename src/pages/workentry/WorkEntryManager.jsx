import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { FileText, Plus, ChevronLeft, ChevronRight, Trash2, Save, AlertTriangle, Pencil, ArrowLeft } from "lucide-react"

const DEPTS = ["大学院", "学部", "文书", "语言类"]
const mkWork = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, _type: "work", work_date: "", business_type: "", start_time: "", end_time: "", work_minutes: 0, hourly_rate: 0, transport_fee: "", subtotal: 0, student_name: "", course_name: "", other_expense: 0, other_expense_note: "" })
const mkExp = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, _type: "expense", work_date: "", other_expense: "", other_expense_note: "" })
const mkComm = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, entry_date: "", seq_number: "", student_name: "", tuition_amount: "", commission_rate: "", commission_amount: 0 })

export default function WorkEntryManager({ user, t, tk }) {
  const isAdmin = user.role === "admin"

  // ========== Admin 列表模式 ==========
  const [allEmps, setAllEmps] = useState([])
  const [deptFilter, setDeptFilter] = useState("")
  const [selectedEmp, setSelectedEmp] = useState(isAdmin ? null : { id: user.id, name: user.name })

  // ========== 报表模式 ==========
  const [rows, setRows] = useState([])
  const [commRows, setCommRows] = useState([])
  const [ld, setLd] = useState(true)
  const [sv, setSv] = useState(false)
  const [rates, setRates] = useState([])
  const [editingKeys, setEditingKeys] = useState(new Set())
  const [saveMsg, setSaveMsg] = useState("")

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const targetEmpId = selectedEmp?.id || user.id

  // 加载员工列表（admin）
  useEffect(() => {
    if (!isAdmin) return
    (async () => {
      const emps = await sbGet("employees?is_active=eq.true&order=department,name&select=id,name,employment_type,department,is_teacher,login_id", tk)
      setAllEmps(emps || [])
    })()
  }, [tk, isAdmin])

  // 加载报表数据
  const load = useCallback(async () => {
    if (!selectedEmp) return
    setLd(true)
    const sd = `${year}-${String(month).padStart(2, "0")}-01`
    const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`
    const empQ = `employee_id=eq.${targetEmpId}&`
    const [r, c] = await Promise.all([
      sbGet(`work_entries?${empQ}work_date=gte.${sd}&work_date=lt.${ed}&order=work_date,created_at&select=*`, tk),
      sbGet(`commission_entries?${empQ}entry_date=gte.${sd}&entry_date=lt.${ed}&order=entry_date,seq_number&select=*`, tk),
    ])
    const loaded = (r || []).map(e => {
      const isExp = !e.business_type && (Number(e.other_expense) > 0 || e.other_expense_note)
      return { ...e, _key: e.id, _isNew: false, _dirty: false, _type: isExp ? "expense" : "work",
        start_time: e.start_time?.slice(0, 5) || "", end_time: e.end_time?.slice(0, 5) || "",
        transport_fee: e.transport_fee != null ? String(e.transport_fee) : "",
        other_expense: e.other_expense != null ? String(e.other_expense) : "",
        other_expense_note: e.other_expense_note || "", student_name: e.student_name || "", course_name: e.course_name || "" }
    })
    const wk = loaded.filter(r => r._type === "work"), ex = loaded.filter(r => r._type === "expense")
    setRows([...wk, ...Array.from({ length: 5 }, mkWork), ...ex, ...Array.from({ length: 2 }, mkExp)])
    const cm = (c || []).map(e => ({ ...e, _key: e.id, _isNew: false, _dirty: false,
      seq_number: String(e.seq_number || ""), tuition_amount: String(e.tuition_amount || ""),
      commission_rate: String(e.commission_rate || ""), commission_amount: Number(e.commission_amount || 0), student_name: e.student_name || "" }))
    setCommRows([...cm, ...Array.from({ length: 2 }, mkComm)])
    setEditingKeys(new Set())
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

  // ========== 行操作 ==========
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

  const toggleEdit = (key) => setEditingKeys(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const addWorkRows = () => setRows(prev => { const expI = prev.findIndex(r => r._type === "expense"); return expI === -1 ? [...prev, ...Array.from({ length: 5 }, mkWork)] : [...prev.slice(0, expI), ...Array.from({ length: 5 }, mkWork), ...prev.slice(expI)] })
  const addExpRows = () => setRows(prev => [...prev, ...Array.from({ length: 2 }, mkExp)])
  const addCommRows = () => setCommRows(prev => [...prev, ...Array.from({ length: 2 }, mkComm)])
  const removeRow = (key) => setRows(prev => prev.filter(r => r._key !== key))
  const removeComm = (key) => setCommRows(prev => prev.filter(r => r._key !== key))
  const delExisting = async (id, key) => { if (!confirm("确定删除？")) return; await sbDel(`work_entries?id=eq.${id}`, tk); setRows(prev => prev.filter(r => r._key !== key)) }
  const delCommExisting = async (id, key) => { if (!confirm("确定删除？")) return; await sbDel(`commission_entries?id=eq.${id}`, tk); setCommRows(prev => prev.filter(r => r._key !== key)) }

  // 一行能否保存：和按钮显示条件保持一致
  const validNewWork = (r) => r._isNew && r._type === "work" && r.work_date && r.business_type && r.work_minutes > 0
  const validNewExp = (r) => r._isNew && r._type === "expense" && r.work_date && parseFloat(r.other_expense) > 0
  const validNewComm = (r) => r._isNew && r.entry_date && r.student_name && parseFloat(r.tuition_amount) > 0
  // 已存在的行：被改过且必填仍齐全
  const validDirtyWork = (r) => !r._isNew && r._dirty && (r._type !== "work" || (r.work_date && r.business_type && r.work_minutes > 0)) && (r._type !== "expense" || (r.work_date && parseFloat(r.other_expense) > 0))
  const validDirtyComm = (r) => !r._isNew && r._dirty && r.entry_date && r.student_name && parseFloat(r.tuition_amount) > 0
  // 有写但不完整 → 用于"忽略 X 行"提示
  const incompleteNew = (r) => r._isNew && r._dirty && !validNewWork(r) && !validNewExp(r)
  const incompleteNewComm = (r) => r._isNew && r._dirty && !validNewComm(r)

  const saveAll = async () => {
    setSv(true); setSaveMsg("")
    const errors = []
    const track = async (label, p) => {
      const res = await p
      // PostgREST 错误返回 { code, message, ... }；成功返回数组（有 Prefer: return=representation）
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

  // ========== 样式 ==========
  const iS = { padding: "5px 6px", borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }
  const selS = { ...iS, fontFamily: "inherit", fontSize: 11 }
  const roS = { fontSize: 12, fontFamily: "monospace", color: t.tx, padding: "5px 6px" }

  // ========== 统计 ==========
  const workRows = rows.filter(r => r._type === "work"), expRows = rows.filter(r => r._type === "expense")
  const savedWork = workRows.filter(r => !r._isNew), savedExp = expRows.filter(r => !r._isNew), savedComm = commRows.filter(r => !r._isNew)
  const totalMins = savedWork.reduce((s, e) => s + (e.work_minutes || 0), 0)
  const totalWage = savedWork.reduce((s, e) => s + Math.round((e.work_minutes || 0) / 60 * (Number(e.hourly_rate) || 0)), 0)
  const totalTrans = savedWork.reduce((s, e) => s + (parseFloat(e.transport_fee) || 0), 0)
  const totalOther = savedExp.reduce((s, e) => s + (parseFloat(e.other_expense) || 0), 0)
  const totalComm = savedComm.reduce((s, e) => s + (e.commission_amount || 0), 0)
  const totalAll = totalWage + totalTrans + totalOther + totalComm
  // 按钮显示：有任意"动过的"行（即使不完整也显示，让用户能点保存得到反馈）
  const hasChanges = rows.some(r => (r._isNew && r._dirty) || validDirtyWork(r)) || commRows.some(r => (r._isNew && r._dirty) || validDirtyComm(r))

  const actBtns = (r, isComm) => r._isNew ? (
    (isComm ? r.entry_date : r.work_date) && <button onClick={() => isComm ? removeComm(r._key) : removeRow(r._key)} style={{ background: "none", border: "none", color: t.td, cursor: "pointer", padding: 2 }}><Trash2 size={12} /></button>
  ) : (
    <div style={{ display: "flex", gap: 3 }}>
      <button onClick={() => toggleEdit(r._key)} style={{ background: "none", border: `1px solid ${editingKeys.has(r._key) ? t.ac : t.bd}`, borderRadius: 4, color: editingKeys.has(r._key) ? t.ac : t.ts, cursor: "pointer", padding: "2px 4px", display: "flex", alignItems: "center" }}><Pencil size={11} /></button>
      <button onClick={() => isComm ? delCommExisting(r.id, r._key) : delExisting(r.id, r._key)} style={{ background: "none", border: "none", color: t.rd, cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}><Trash2 size={11} /></button>
    </div>
  )

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

  // ==================== 报表模式 ====================
  const showComm = selectedEmp?.has_commission || user.has_commission

  return (
    <div>
      {/* 顶栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isAdmin && <button onClick={() => setSelectedEmp(null)} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><ArrowLeft size={14} /> 返回列表</button>}
          <FileText size={20} color={t.ac} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>
            {isAdmin ? `${selectedEmp?.name} 的工资报表` : "工资报表"}
          </h2>
        </div>
        {hasChanges && <button onClick={saveAll} disabled={sv} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: sv ? "wait" : "pointer", opacity: sv ? 0.7 : 1, display: "flex", alignItems: "center", gap: 5 }}><Save size={14} /> {sv ? "保存中..." : "保存全部"}</button>}
      </div>

      {/* 月份 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => chgMonth(-1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 15, fontWeight: 600, color: t.tx }}>{year}年{month}月</span>
        <button onClick={() => chgMonth(1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}><ChevronRight size={14} /></button>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(95px,1fr))", gap: 8, marginBottom: 16 }}>
        {[
          { l: "总工时", v: `${(totalMins / 60).toFixed(1)}h`, c: t.ac },
          { l: "交通费", v: `¥${totalTrans.toLocaleString()}`, c: "#8B5CF6" },
          { l: "其他报销", v: `¥${totalOther.toLocaleString()}`, c: t.wn },
          ...(showComm ? [{ l: "签单提成", v: `¥${totalComm.toLocaleString()}`, c: "#EC4899" }] : []),
          { l: "合计", v: `¥${totalAll.toLocaleString()}`, c: t.tx },
        ].map((c, i) => (
          <div key={i} style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}` }}>
            <div style={{ fontSize: 10, color: t.tm }}>{c.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c.c, marginTop: 2 }}>{c.v}</div>
          </div>
        ))}
      </div>

      {saveMsg && (() => { const ok = saveMsg.startsWith("已保存"), err = saveMsg.startsWith("保存失败"); const c = err ? t.rd : ok ? t.gn : t.wn; return <div style={{ padding: 10, borderRadius: 8, background: `${c}15`, border: `1px solid ${c}33`, marginBottom: 12, fontSize: 12, color: c }}>{saveMsg}</div> })()}
      {!rates.length && <div style={{ padding: 12, borderRadius: 8, background: `${t.wn}15`, border: `1px solid ${t.wn}33`, marginBottom: 12, fontSize: 11, color: t.wn, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} /> 该员工尚未配置时薪，请先在人事档案中设定</div>}
      {rates.length > 0 && <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>{rates.map(r => <span key={r.business_type} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 10, color: "#8B5CF6", background: "#8B5CF612", border: "1px solid #8B5CF620" }}>{r.business_type}: ¥{Number(r.hourly_rate).toLocaleString()}/h</span>)}</div>}

      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> : (<>

        {/* ========== 工时表 ========== */}
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", maxHeight: "50vh", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 880 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr style={{ background: t.bgH }}>
                {["日期", "業務内容", "开始", "结束", "时数", "时薪", "交通费", "小计", "学生", "备注", ""].map((h, i) => (
                  <th key={i} style={{ padding: "8px 5px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workRows.map(r => { const ed = r._isNew || editingKeys.has(r._key); const hrs = r.work_minutes > 0 ? (r.work_minutes / 60).toFixed(2) : ""; return (
                <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
                  <td style={{ padding: "4px 3px", textAlign: "center" }}>{ed ? <input type="date" value={r.work_date} onChange={e => updateRow(r._key, "work_date", e.target.value)} style={{ ...iS, width: 130 }} /> : <span style={roS}>{r.work_date}</span>}</td>
                  <td style={{ padding: "4px 3px", textAlign: "center" }}>{ed ? <select value={r.business_type} onChange={e => updateRow(r._key, "business_type", e.target.value)} style={{ ...selS, width: 105 }}><option value="">选择</option>{rates.map(rt => <option key={rt.business_type} value={rt.business_type}>{rt.business_type}</option>)}</select> : <span style={{ fontSize: 11, color: "#8B5CF6", fontWeight: 600 }}>{r.business_type}</span>}</td>
                  <td style={{ padding: "4px 3px", textAlign: "center" }}>{ed ? <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5} value={r.start_time} onChange={e => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; updateRow(r._key, "start_time", v) }} style={{ ...iS, width: 55, textAlign: "center" }} /> : <span style={{ ...roS, color: t.ts }}>{r.start_time}</span>}</td>
                  <td style={{ padding: "4px 3px", textAlign: "center" }}>{ed ? <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5} value={r.end_time} onChange={e => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; updateRow(r._key, "end_time", v) }} style={{ ...iS, width: 55, textAlign: "center" }} /> : <span style={{ ...roS, color: t.ts }}>{r.end_time}</span>}</td>
                  <td style={{ padding: "4px 5px", fontSize: 12, fontFamily: "monospace", color: t.tx, textAlign: "center" }}>{hrs}</td>
                  <td style={{ padding: "4px 5px", fontSize: 11, color: t.tm, textAlign: "center" }}>{r.hourly_rate ? `¥${Number(r.hourly_rate).toLocaleString()}` : ""}</td>
                  <td style={{ padding: "4px 3px", textAlign: "center" }}>{ed ? <input type="number" value={r.transport_fee} onChange={e => updateRow(r._key, "transport_fee", e.target.value)} placeholder="0" style={{ ...iS, width: 58, textAlign: "right" }} /> : <span style={{ fontSize: 11, color: "#8B5CF6" }}>{parseFloat(r.transport_fee) ? `¥${Number(r.transport_fee).toLocaleString()}` : ""}</span>}</td>
                  <td style={{ padding: "4px 5px", fontSize: 12, fontWeight: 600, color: t.gn, fontFamily: "monospace", textAlign: "center" }}>{r.subtotal > 0 ? `¥${r.subtotal.toLocaleString()}` : ""}</td>
                  <td style={{ padding: "4px 3px", textAlign: "center" }}>{ed ? <input type="text" value={r.student_name} onChange={e => updateRow(r._key, "student_name", e.target.value)} placeholder="学生名" style={{ ...iS, width: 65, fontFamily: "inherit" }} /> : <span style={{ fontSize: 11, color: t.tx }}>{r.student_name}</span>}</td>
                  <td style={{ padding: "4px 3px", textAlign: "center" }}>{ed ? <input type="text" value={r.course_name} onChange={e => updateRow(r._key, "course_name", e.target.value)} placeholder="课程/备注" style={{ ...iS, width: 90, fontFamily: "inherit" }} /> : <span style={{ fontSize: 10, color: t.ts }}>{r.course_name}</span>}</td>
                  <td style={{ padding: "4px 3px", whiteSpace: "nowrap" }}>{actBtns(r, false)}</td>
                </tr>
              )})}
            </tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${t.bd}` }}>
              <td colSpan={4} style={{ padding: "10px 5px" }}><button onClick={addWorkRows} style={{ background: "none", border: `1px dashed ${t.bd}`, borderRadius: 6, padding: "4px 12px", color: t.ac, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus size={12} /> 添加更多行</button></td>
              <td style={{ padding: "10px 5px", fontSize: 12, fontWeight: 700, color: t.tx, textAlign: "center" }}>{(totalMins / 60).toFixed(1)}h</td>
              <td></td>
              <td style={{ padding: "10px 5px", fontSize: 11, fontWeight: 700, color: "#8B5CF6", textAlign: "center" }}>¥{totalTrans.toLocaleString()}</td>
              <td style={{ padding: "10px 5px", fontSize: 13, fontWeight: 700, color: t.gn, textAlign: "center" }}>¥{(totalWage + totalTrans).toLocaleString()}</td>
              <td colSpan={3}></td>
            </tr></tfoot>
          </table>
        </div>

        {/* ========== 其他报销 ========== */}
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", marginBottom: 16 }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bd}` }}><span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>其他报销</span></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: t.bgH }}>{["日期", "金额", "报销说明", ""].map((h, i) => <th key={i} style={{ padding: "8px 10px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}` }}>{h}</th>)}</tr></thead>
            <tbody>{expRows.map(r => { const ed = r._isNew || editingKeys.has(r._key); return (
              <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
                <td style={{ padding: "6px 10px", textAlign: "center" }}>{ed ? <input type="date" value={r.work_date} onChange={e => updateRow(r._key, "work_date", e.target.value)} style={{ ...iS, width: 130 }} /> : <span style={roS}>{r.work_date}</span>}</td>
                <td style={{ padding: "6px 10px", textAlign: "center" }}>{ed ? <input type="number" value={r.other_expense} onChange={e => updateRow(r._key, "other_expense", e.target.value)} placeholder="0" style={{ ...iS, width: 100, textAlign: "right" }} /> : <span style={{ fontSize: 12, fontWeight: 600, color: t.wn }}>¥{Number(r.other_expense || 0).toLocaleString()}</span>}</td>
                <td style={{ padding: "6px 10px" }}>{ed ? <input type="text" value={r.other_expense_note} onChange={e => updateRow(r._key, "other_expense_note", e.target.value)} placeholder="报销说明" style={{ ...iS, width: "100%", fontFamily: "inherit" }} /> : <span style={{ fontSize: 11, color: t.ts }}>{r.other_expense_note}</span>}</td>
                <td style={{ padding: "6px 10px", width: 60 }}>{actBtns(r, false)}</td>
              </tr>
            )})}</tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${t.bd}` }}>
              <td style={{ padding: "10px 10px" }}><button onClick={addExpRows} style={{ background: "none", border: `1px dashed ${t.bd}`, borderRadius: 6, padding: "4px 12px", color: t.ac, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus size={12} /> 添加</button></td>
              <td style={{ padding: "10px 10px", fontSize: 13, fontWeight: 700, color: t.wn, textAlign: "center" }}>¥{totalOther.toLocaleString()}</td>
              <td colSpan={2}></td>
            </tr></tfoot>
          </table>
        </div>

        {/* ========== 签单提成 ========== */}
        {showComm && (
          <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bd}` }}><span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>签单提成</span></div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 550 }}>
              <thead><tr style={{ background: t.bgH }}>{[
                { l: "日期", a: "left", w: 130 },
                { l: "第N个", a: "center", w: 60 },
                { l: "学生名字", a: "left" },
                { l: "学费", a: "right", w: 110 },
                { l: "提成率", a: "right", w: 80 },
                { l: "提成金额", a: "right", w: 110 },
                { l: "", a: "right", w: 70 },
              ].map((h, i) => <th key={i} style={{ padding: "10px 14px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: h.a, borderBottom: `1px solid ${t.bd}`, width: h.w, letterSpacing: 0.3 }}>{h.l}</th>)}</tr></thead>
              <tbody>{commRows.map(r => { const ed = r._isNew || editingKeys.has(r._key); return (
                <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
                  <td style={{ padding: "6px 14px", textAlign: "left" }}>{ed ? <input type="date" value={r.entry_date} onChange={e => updateComm(r._key, "entry_date", e.target.value)} style={{ ...iS, width: 130 }} /> : <span style={roS}>{r.entry_date}</span>}</td>
                  <td style={{ padding: "6px 14px", textAlign: "center" }}>{ed ? <input type="number" value={r.seq_number} onChange={e => updateComm(r._key, "seq_number", e.target.value)} placeholder="1" style={{ ...iS, width: 45, textAlign: "center" }} /> : <span>{r.seq_number}</span>}</td>
                  <td style={{ padding: "6px 14px", textAlign: "left" }}>{ed ? <input type="text" value={r.student_name} onChange={e => updateComm(r._key, "student_name", e.target.value)} placeholder="学生姓名" style={{ ...iS, width: "100%", maxWidth: 180, fontFamily: "inherit" }} /> : <span style={{ fontSize: 12, fontWeight: 500, color: t.tx }}>{r.student_name}</span>}</td>
                  <td style={{ padding: "6px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ed ? <input type="number" value={r.tuition_amount} onChange={e => updateComm(r._key, "tuition_amount", e.target.value)} placeholder="0" style={{ ...iS, width: 100, textAlign: "right" }} /> : <span>¥{Number(r.tuition_amount || 0).toLocaleString()}</span>}</td>
                  <td style={{ padding: "6px 14px", textAlign: "right", color: t.tm, fontVariantNumeric: "tabular-nums" }}>{ed ? <input type="number" value={r.commission_rate} onChange={e => updateComm(r._key, "commission_rate", e.target.value)} placeholder="0" style={{ ...iS, width: 65, textAlign: "right" }} /> : <span>{r.commission_rate}%</span>}</td>
                  <td style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600, color: "#EC4899", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.commission_amount > 0 ? `¥${r.commission_amount.toLocaleString()}` : ""}</td>
                  <td style={{ padding: "6px 14px", textAlign: "right" }}>{actBtns(r, true)}</td>
                </tr>
              )})}</tbody>
              <tfoot><tr style={{ borderTop: `2px solid ${t.bd}` }}>
                <td colSpan={5} style={{ padding: "10px 14px" }}><button onClick={addCommRows} style={{ background: "none", border: `1px dashed ${t.bd}`, borderRadius: 6, padding: "4px 12px", color: t.ac, fontSize: 11, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><Plus size={12} /> 添加</button></td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#EC4899", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>¥{totalComm.toLocaleString()}</td>
                <td></td>
              </tr></tfoot>
            </table>
          </div>
        )}

      </>)}
    </div>
  )
}
