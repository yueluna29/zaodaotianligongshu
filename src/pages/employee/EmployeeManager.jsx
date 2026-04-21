import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { calcPaidLeave } from "../../config/leaveCalc"
import { WEEKDAYS, COMPANIES, EMP_TYPES_JP, EMP_TYPES_CN, empTypesFor, isChinaCompany, isFullTime, isHourly as empIsHourly, fmtDateW } from "../../config/constants"
import { Users, ArrowLeft, Plus, Search, Phone, Mail, AlertCircle, AlertTriangle, Lock, Edit3, Save, User as UserIcon, CreditCard, Clock, Check, X, ChevronRight, CheckSquare, Square } from "lucide-react"
import PayRateSection from "../../components/PayRateSection"

const EMP_TYPES_ALL = [...EMP_TYPES_JP, ...EMP_TYPES_CN]
const DEPTS_FULL = ["教务", "咨询", "宣传", "财务"]
const DEPTS_BAITO = ["大学院", "学部", "文书", "语言类"]
const REGIONS = ["日本", "中国"]
const deptListFor = (et) => isFullTime(et) ? DEPTS_FULL : DEPTS_BAITO
const SUBJECTS = ["物理", "数学", "机械工学", "电气电子", "情报科学", "土木建筑", "生命理工", "材料化学", "环境工学", "体育学", "大学院文科", "经营工学", "EJU数学", "EJU理科", "日语", "英语", "班主任"]
const GENDERS = ["男", "女"]
const PAY_METHODS = ["银行转账", "现金"]
const TRANSPORT_METHODS = ["实报实销", "固定"]
const ACCT_TYPES = ["普通", "当座"]

const emptyForm = () => ({
  name: "", furigana: "", pinyin: "", gender: "", birth_date: "", phone: "",
  email: "", postal_code: "", address: "", company_id: 1, employment_type: "正社員",
  role: "staff", department: "", subjects: [], is_teacher: false,
  has_dependent_deduction: false, hire_date: new Date().toISOString().split("T")[0],
  leave_date: "", residence_status: "", residence_card_number: "",
  residence_expiry: "", nationality: "", has_extra_work_permit: false, visa_status: "valid",
  region: "",
  commission_rate: "0", fixed_overtime_hours: "20", payment_method: "银行转账",
  transport_method: "实报实销", transport_amount: "0", transport_cap: "20000",
  dependents_count: "0", my_number: "", id_card_number: "", contract_start_date: "", contract_end_date: "",
  bank_name: "", bank_branch: "", bank_branch_code: "", bank_account_type: "普通",
  bank_account_number: "", bank_account_holder: "",
  days_off: [0, 6], available_days: [], remarks: "",
  has_commission: false,
})

const glassCard = {
  background: "rgba(255, 255, 255, 0.62)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 24,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  boxShadow: "0 20px 50px -20px rgba(30, 64, 175, 0.06)",
  position: "relative",
}

const AmbientBlobs = () => (
  <>
    <div style={{ position: "fixed", top: "-15%", left: "-10%", width: "50vw", height: "50vw", minWidth: 400, minHeight: 400, background: "rgba(191,219,254,0.35)", filter: "blur(100px)", borderRadius: "50%", zIndex: 0, pointerEvents: "none" }} />
    <div style={{ position: "fixed", bottom: "-15%", right: "-5%", width: "60vw", height: "60vw", minWidth: 400, minHeight: 400, background: "rgba(153,246,228,0.30)", filter: "blur(100px)", borderRadius: "50%", zIndex: 0, pointerEvents: "none" }} />
  </>
)

function HoverButton({ children, primary, onClick, iconOnly, disabled, t, style }) {
  const [hv, setHv] = useState(false)
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: iconOnly ? 8 : "10px 18px", borderRadius: 12,
    fontWeight: 600, fontSize: 13, cursor: disabled ? "wait" : "pointer",
    transition: "all 0.2s ease", whiteSpace: "nowrap", flexShrink: 0,
    opacity: disabled ? 0.65 : 1,
    ...style,
  }
  const pri = {
    backgroundColor: hv && !disabled ? t.ah : t.ac, color: "#fff", border: "none",
    boxShadow: hv && !disabled ? `0 4px 12px ${t.ac}55` : "none",
  }
  const sec = {
    backgroundColor: hv ? t.bgH : "rgba(255,255,255,0.8)",
    color: iconOnly ? (hv ? t.ac : t.td) : t.tx,
    border: iconOnly ? "none" : `1px solid ${t.bd}`,
  }
  return (
    <button onMouseEnter={() => setHv(true)} onMouseLeave={() => setHv(false)} onClick={onClick} disabled={disabled}
      style={{ ...base, ...(primary ? pri : sec) }}>{children}</button>
  )
}

function Field({ label, value, onChange, isEditing, isLocked, required, type, options, t, placeholder, fullWidth }) {
  const flexBasis = fullWidth ? "1 1 100%" : "1 1 220px"
  if (!isEditing) {
    let display = value
    if (value === null || value === undefined || value === "") display = null
    else if (type === "date" && typeof value === "string") display = fmtDateW(value)
    else if (type === "select" && options) {
      const opt = options.find(o => (typeof o === "object" ? o.value : o) === value)
      if (opt) display = typeof opt === "object" ? opt.label : opt
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: flexBasis, padding: "8px 0", minWidth: 0 }}>
        <label style={{ fontSize: 13, color: t.tm, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
          {label}
          {isLocked && <Lock size={12} color={t.td} />}
        </label>
        <div style={{ fontSize: 15, color: isLocked ? t.ts : t.tx, fontWeight: 600, letterSpacing: 0.2, minHeight: 24, wordBreak: "break-word" }}>
          {display !== null && display !== undefined ? display : <span style={{ color: t.td, fontWeight: 400 }}>—未填写—</span>}
        </div>
      </div>
    )
  }
  const iS = {
    width: "100%", padding: "11px 14px", borderRadius: 12,
    border: `1px solid ${t.bd}`, backgroundColor: "rgba(255,255,255,0.85)", color: t.tx,
    outline: "none", boxSizing: "border-box", fontSize: 14, fontFamily: "inherit",
  }
  const lS = { ...iS, paddingLeft: 38, border: `1px dashed ${t.td}`, backgroundColor: t.bl, color: t.tm, cursor: "not-allowed" }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: flexBasis, minWidth: 0 }}>
      <label style={{ fontSize: 13, color: t.ts, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
        {label} {required && <span style={{ color: t.rd }}>*</span>}
        {isLocked && <Lock size={12} color={t.td} />}
      </label>
      {isLocked ? (
        <div style={{ position: "relative" }}>
          <Lock size={14} color={t.td} style={{ position: "absolute", left: 13, top: 14 }} />
          <input style={lS} value={value ?? ""} disabled readOnly />
        </div>
      ) : type === "select" ? (
        <select style={iS} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(options || []).map(o => typeof o === "object"
            ? <option key={o.value} value={o.value}>{o.label}</option>
            : <option key={o} value={o}>{o}</option>
          )}
        </select>
      ) : (
        <input type={type || "text"} style={iS} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}

function ChipPicker({ label, options, value, onChange, multi, isEditing, isLocked, t }) {
  if (!isEditing) {
    if (multi) {
      const sel = value || []
      const top = sel.slice(0, 3)
      const overflow = sel.length > 3 ? sel.length - 3 : 0
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 100%", padding: "8px 0" }}>
          <label style={{ fontSize: 13, color: t.tm, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            {label}
            {isLocked && <Lock size={12} color={t.td} />}
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", minHeight: 28 }}>
            {sel.length === 0
              ? <span style={{ color: t.td, fontSize: 14 }}>—未填写—</span>
              : top.map(item => (
                  <span key={item} style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, color: t.tx, background: t.bl, border: `1px solid ${t.bd}` }}>{item}</span>
                ))
            }
            {overflow > 0 && <span style={{ fontSize: 12, color: t.tm, fontWeight: 600 }}>+{overflow}</span>}
          </div>
        </div>
      )
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 100%", padding: "8px 0" }}>
        <label style={{ fontSize: 13, color: t.tm, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
          {label}
          {isLocked && <Lock size={12} color={t.td} />}
        </label>
        <div style={{ fontSize: 15, color: t.tx, fontWeight: 600 }}>
          {value || <span style={{ color: t.td, fontWeight: 400 }}>—未填写—</span>}
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 100%" }}>
      <label style={{ fontSize: 13, color: t.ts, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
        {label} {isLocked && <Lock size={12} color={t.td} />}
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map(o => {
          const active = multi ? (value || []).includes(o) : value === o
          return (
            <button key={o} type="button" disabled={isLocked} onClick={() => {
              if (multi) {
                const arr = value || []
                onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])
              } else {
                onChange(value === o ? "" : o)
              }
            }} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              color: active ? t.ac : t.ts,
              backgroundColor: active ? t.tb : t.bl,
              border: `1px solid ${active ? t.ac : "transparent"}`,
              cursor: isLocked ? "not-allowed" : "pointer",
              opacity: isLocked ? 0.6 : 1,
              fontFamily: "inherit",
            }}>{o}</button>
          )
        })}
      </div>
    </div>
  )
}

function CheckBox({ label, checked, onChange, disabled, isEditing = true, t }) {
  if (!isEditing) {
    if (!checked) return null
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 0", flex: "1 1 220px" }}>
        <CheckSquare size={18} color={t.ac} />
        <span style={{ fontSize: 14, color: t.tx, fontWeight: 600 }}>{label}</span>
      </div>
    )
  }
  return (
    <div onClick={() => !disabled && onChange?.(!checked)} style={{
      display: "inline-flex", alignItems: "center", gap: 10,
      padding: "10px 14px", borderRadius: 12,
      border: `1px solid ${checked ? t.ac : t.bd}`,
      backgroundColor: checked ? t.tb : "rgba(255,255,255,0.7)",
      fontSize: 13, color: disabled ? t.td : t.tx, fontWeight: 500,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.65 : 1,
      transition: "all 0.2s",
      userSelect: "none",
    }}>
      {checked ? <CheckSquare size={18} color={t.ac} /> : <Square size={18} color={t.td} />}
      {label}
      {disabled && <Lock size={12} color={t.td} style={{ marginLeft: 4 }} />}
    </div>
  )
}

function SectionTitle({ children, t }) {
  return (
    <h3 style={{ margin: "0 0 20px 0", fontSize: 15, color: t.tx, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 4, height: 14, backgroundColor: t.ac, borderRadius: 2 }} />
      {children}
    </h3>
  )
}

const chipBadge = (color, bg, border = "transparent") => ({
  padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
  color, backgroundColor: bg, border: `1px solid ${border}`,
  display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
})

export default function EmployeeManager({ user, t, tk }) {
  const [emps, sEmps] = useState([])
  const [ld, sLd] = useState(true)
  const [filter, sFilter] = useState("all")
  const [companyFilter, sCompanyFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [selected, sSelected] = useState(null)
  const [editing, sEditing] = useState(false)
  const [creating, sCreating] = useState(false)
  const [fm, sFm] = useState({})
  const [saving, sSaving] = useState(false)
  const [leaveBal, setLeaveBal] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [editSched, setEditSched] = useState(false)
  const [schedFm, setSchedFm] = useState({})
  const [activeTab, setActiveTab] = useState("basic")

  const isAdmin = user && user.role === "admin"

  const load = useCallback(async () => {
    sLd(true)
    const d = await sbGet("employees?is_active=eq.true&order=name", tk)
    sEmps(d || [])
    if (user && user.role !== "admin") {
      const me = (d || []).find((e) => e.id === user.id)
      if (me) sSelected(me)
    }
    sLd(false)
  }, [tk])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selected || selected.id === "__new__") { setLeaveBal(null); setSchedules([]); return }
    (async () => {
      const [usedReqs, compReqs, scheds] = await Promise.all([
        sbGet(`leave_requests?employee_id=eq.${selected.id}&status=eq.承認&leave_type=eq.有休&select=leave_date,is_half_day`, tk),
        sbGet(`day_swap_requests?employee_id=eq.${selected.id}&swap_type=eq.休日出勤&compensation_type=eq.換休&status=eq.承認&select=id,swap_date,deadline`, tk),
        sbGet(`work_schedules?employee_id=eq.${selected.id}&order=day_of_week&select=*`, tk),
      ])
      const paid = calcPaidLeave(selected.hire_date, usedReqs || [])
      const compAll = compReqs || []
      const compUnused = compAll.filter(c => !c.swap_date)
      const expiringSoon = compUnused.filter(c => {
        if (!c.deadline) return false
        const diff = (new Date(c.deadline) - new Date()) / (1000 * 60 * 60 * 24)
        return diff >= 0 && diff <= 14
      })
      setLeaveBal({ paid, compTotal: compAll.length, compUnused: compUnused.length, expiringSoon: expiringSoon.length })
      setSchedules(scheds || [])
    })()
  }, [selected, tk])

  useEffect(() => {
    if (user && user.role !== "admin" && emps.length > 0) {
      const me = emps.find((e) => e.id === user.id)
      if (me) { sSelected(me); sEditing(false) }
    }
  }, [user, emps])

  const startEdit = (emp) => {
    sCreating(false)
    sFm({
      name: emp.name || "", furigana: emp.furigana || "", pinyin: emp.pinyin || "",
      gender: emp.gender || "", birth_date: emp.birth_date || "", phone: emp.phone || "",
      email: emp.email || "", postal_code: emp.postal_code || "", address: emp.address || "",
      company_id: emp.company_id || 1, employment_type: emp.employment_type || "正社員",
      role: emp.role || "staff", department: emp.department || "", region: emp.region || "", subjects: emp.subjects || [],
      is_teacher: emp.is_teacher || false, has_dependent_deduction: emp.has_dependent_deduction || false,
      hire_date: emp.hire_date || "", leave_date: emp.leave_date || "",
      residence_status: emp.residence_status || "", residence_card_number: emp.residence_card_number || "",
      residence_expiry: emp.residence_expiry || "", nationality: emp.nationality || "",
      has_extra_work_permit: emp.has_extra_work_permit || false, visa_status: emp.visa_status || "valid",
      commission_rate: String(Number(emp.commission_rate || 0) * 100),
      fixed_overtime_hours: String(emp.fixed_overtime_hours || 20),
      payment_method: emp.payment_method || "银行转账",
      transport_method: emp.transport_method || "实报实销",
      transport_amount: String(emp.transport_amount || 0),
      transport_cap: String(emp.transport_cap || 20000),
      dependents_count: String(emp.dependents_count || 0), my_number: emp.my_number || "",
      id_card_number: emp.id_card_number || "",
      contract_start_date: emp.contract_start_date || "", contract_end_date: emp.contract_end_date || "",
      bank_name: emp.bank_name || "", bank_branch: emp.bank_branch || "", bank_branch_code: emp.bank_branch_code || "",
      bank_account_type: emp.bank_account_type || "普通",
      bank_account_number: emp.bank_account_number || "", bank_account_holder: emp.bank_account_holder || "",
      days_off: emp.days_off || [0, 6], available_days: emp.available_days || [], remarks: emp.remarks || "",
      has_commission: emp.has_commission || false,
    })
    sEditing(true)
  }

  const startCreate = () => { sSelected({ id: "__new__" }); sCreating(true); sFm(emptyForm()); sEditing(true); setActiveTab("basic") }

  const startSchedEdit = () => {
    const nf = {}
    for (let i = 0; i < 7; i++) {
      const s = schedules.find(sc => sc.day_of_week === i)
      nf[i] = { enabled: !!s, start: s?.start_time?.slice(0, 5) || "09:00", end: s?.end_time?.slice(0, 5) || "18:00" }
    }
    setSchedFm(nf); setEditSched(true)
  }

  const saveSched = async () => {
    sSaving(true)
    await sbDel(`work_schedules?employee_id=eq.${selected.id}`, tk)
    for (let i = 0; i < 7; i++) {
      if (schedFm[i]?.enabled) {
        await sbPost("work_schedules", { employee_id: selected.id, day_of_week: i, start_time: schedFm[i].start, end_time: schedFm[i].end }, tk)
      }
    }
    const scheds = await sbGet(`work_schedules?employee_id=eq.${selected.id}&order=day_of_week&select=*`, tk)
    setSchedules(scheds || []); setEditSched(false); sSaving(false)
  }

  const save = async () => {
    if (!fm.name || !fm.email) { alert("姓名和邮箱不能为空"); return }
    sSaving(true)
    const body = {
      ...fm,
      commission_rate: Number(fm.commission_rate) / 100,
      fixed_overtime_hours: Number(fm.fixed_overtime_hours),
      transport_amount: Number(fm.transport_amount),
      transport_cap: Number(fm.transport_cap),
      dependents_count: Number(fm.dependents_count),
      leave_date: fm.leave_date || null, birth_date: fm.birth_date || null,
      residence_expiry: fm.residence_expiry || null,
      contract_start_date: fm.contract_start_date || null,
      contract_end_date: fm.contract_end_date || null,
    }
    if (creating) {
      const res = await sbPost("employees", { ...body, is_active: true }, tk)
      if (res && res.length > 0) { await load(); sSelected(res[0]); sCreating(false); sEditing(false) }
    } else {
      await sbPatch(`employees?id=eq.${selected.id}`, body, tk)
      await load()
      const updated = (await sbGet(`employees?id=eq.${selected.id}`, tk))[0]
      if (updated) sSelected(updated); sEditing(false)
    }
    sSaving(false)
  }

  if (ld) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

  // ==================== 档案详情 ====================
  if (selected) {
    const e = creating ? {} : selected
    const empType = editing ? fm.employment_type : (e.employment_type || "正社員")
    const isHourly = empIsHourly(empType)
    const cid = editing ? fm.company_id : e.company_id
    const isCN = isChinaCompany(cid)
    const isJP = !isCN
    const isExpiring = !creating && !isCN && e.residence_expiry && new Date(e.residence_expiry) < new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000)
    const yearsOfService = (!creating && e.hire_date) ? ((new Date() - new Date(e.hire_date)) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1) : null
    const contractExpiring = !creating && e.contract_end_date && new Date(e.contract_end_date) < new Date(new Date().getTime() + 60 * 24 * 60 * 60 * 1000)
    const isSelf = !creating && user && e.id === user.id

    // 字段辅助：非 admin-lock 场景的简写
    const fld = (name, label, opts = {}) => (
      <Field
        key={name}
        label={label}
        value={editing ? fm[name] : e[name]}
        onChange={(v) => sFm(p => ({ ...p, [name]: v }))}
        isEditing={editing}
        isLocked={opts.locked}
        required={opts.required}
        type={opts.type}
        options={opts.options}
        placeholder={opts.placeholder}
        fullWidth={opts.fullWidth}
        t={t}
      />
    )

    const tabsDef = [
      { id: "basic", icon: UserIcon, label: "基本与归属" },
      { id: "finance", icon: CreditCard, label: "薪资与税务" },
      { id: "schedule", icon: Clock, label: "排班与假期" },
    ]

    const flexRow = { display: "flex", flexWrap: "wrap", gap: 20 }

    return (
      <div style={{ minHeight: "100vh", position: "relative" }}>
        <AmbientBlobs />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", padding: "8px 4px" }}>

          {/* 顶部操作栏 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isAdmin && (
                <HoverButton iconOnly onClick={() => { sSelected(null); sEditing(false); sCreating(false) }} t={t}>
                  <ArrowLeft size={20} />
                </HoverButton>
              )}
              <h2 style={{ margin: 0, color: "#1E293B", fontSize: 22, fontWeight: 700 }}>
                {creating ? "新增社员档案" : (editing ? "编辑档案" : (isAdmin ? "人事档案" : "入职信息"))}
              </h2>
            </div>
            {(isAdmin || isSelf) && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {editing ? (
                  <>
                    <HoverButton onClick={() => { if (creating) { sSelected(null); sCreating(false) } sEditing(false) }} t={t}>
                      <X size={15} /> 取消
                    </HoverButton>
                    <HoverButton primary disabled={saving} onClick={save} t={t}>
                      <Save size={15} /> {saving ? "保存中..." : "保存更改"}
                    </HoverButton>
                  </>
                ) : (
                  <HoverButton primary onClick={() => startEdit(e)} t={t}>
                    <Edit3 size={15} /> 编辑档案
                  </HoverButton>
                )}
              </div>
            )}
          </div>

          {/* Hero 名片（创建模式隐藏） */}
          {!creating && (
            <div style={{ ...glassCard, padding: 28, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
                <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: "50%",
                    background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)",
                    color: "rgba(59,130,246,0.85)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 28, fontWeight: 700, flexShrink: 0,
                  }}>
                    {(e.name || e.email || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                      <h1 style={{ margin: 0, fontSize: 24, color: t.tx, fontWeight: 700 }}>{e.name || e.email || "—"}</h1>
                      {(e.furigana || e.pinyin) && <span style={{ color: t.ts, fontSize: 13 }}>{[e.furigana, e.pinyin].filter(Boolean).join(" ・ ")}</span>}
                      {e.login_id && (
                        <span style={{ fontSize: 11, color: t.ac, fontFamily: "monospace", fontWeight: 600, backgroundColor: t.tb, padding: "3px 10px", borderRadius: 6, border: `1px solid ${t.ac}30` }}>
                          {e.login_id}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {e.company_id && <span style={chipBadge(t.wn, "#FEF3C7", "transparent")}>{COMPANIES.find(c => c.id === e.company_id)?.name}</span>}
                      {e.employment_type && <span style={chipBadge(t.gn, "#D1FAE5", "transparent")}>{e.employment_type}</span>}
                      {isFullTime(e.employment_type) && e.region && <span style={chipBadge(t.ac, t.tb, "transparent")}>{e.region}</span>}
                      {e.department && <span style={chipBadge(t.ac, t.tb, "transparent")}>{e.department}</span>}
                      {e.role === "admin" && <span style={chipBadge("#7C3AED", "rgba(124,58,237,0.1)", "transparent")}>管理者</span>}
                      {e.is_teacher && <span style={chipBadge(t.ts, t.bl, "transparent")}>兼任教师</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200 }}>
                  <div style={{ fontSize: 13, color: t.tm }}>
                    入职于 <strong style={{ color: t.tx }}>{e.hire_date ? fmtDateW(e.hire_date) : "—"}</strong>
                    {yearsOfService && <span style={{ color: t.ac, marginLeft: 8, fontWeight: 600 }}>在职 {yearsOfService} 年</span>}
                  </div>
                  {e.phone && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.ts, fontSize: 13 }}>
                      <Phone size={14} color={t.td} /> {e.phone}
                    </div>
                  )}
                  {e.email && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.ts, fontSize: 13 }}>
                      <Mail size={14} color={t.td} /> {e.email}
                    </div>
                  )}
                </div>
              </div>

              {(isExpiring || contractExpiring) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
                  {isExpiring && (
                    <div style={{ backgroundColor: "rgba(255,247,237,0.55)", border: "1px solid rgba(254,215,170,0.7)", color: "rgba(180,83,9,0.9)", padding: "10px 14px", borderRadius: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertCircle size={16} color="#FB923C" />
                      <strong>在留卡即将过期：</strong> {fmtDateW(e.residence_expiry)}
                    </div>
                  )}
                  {contractExpiring && (
                    <div style={{ backgroundColor: `${t.wn}10`, border: `1px solid ${t.wn}40`, color: t.wn, padding: "10px 14px", borderRadius: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertCircle size={16} />
                      <strong>合同即将到期：</strong> {fmtDateW(e.contract_end_date)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 完成度进度条（编辑态 / 新增态） */}
          {editing && (() => {
            const src = fm
            const checks = [
              { key: "name", label: "姓名" },
              { key: "email", label: "邮箱" },
              { key: "phone", label: "电话" },
              { key: "hire_date", label: "入职日期" },
              { key: "department", label: "部门" },
              { key: "bank_account_number", label: "银行账号" },
              ...(isHourly ? [] : [{ key: "contract_start_date", label: "合同开始日" }, { key: "my_number", label: "My Number" }]),
              ...(isJP && !isHourly ? [{ key: "residence_status", label: "在留资格" }, { key: "residence_expiry", label: "在留期限" }] : []),
            ]
            const filled = checks.filter((c) => src[c.key])
            const missing = checks.filter((c) => !src[c.key])
            const rate = Math.round((filled.length / checks.length) * 100)
            const done = rate === 100
            return (
              <div style={{ ...glassCard, padding: "14px 20px", marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.tx, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <AlertCircle size={14} color={done ? t.gn : t.wn} />
                    档案填写完成度
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: done ? t.gn : t.ac }}>{rate}%</span>
                </div>
                <div style={{ width: "100%", height: 6, backgroundColor: t.bd, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${rate}%`, height: "100%", backgroundColor: done ? t.gn : t.ac, transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                </div>
                {!done && missing.length > 0 && (
                  <div style={{ fontSize: 12, color: t.ts }}>
                    缺少：<span style={{ color: t.wn }}>{missing.map(m => m.label).join("、")}</span>。为了保证算薪正常，请尽快补全。
                  </div>
                )}
              </div>
            )
          })()}

          {/* Tab 导航 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
            {tabsDef.map(tb => {
              const Icon = tb.icon
              const active = activeTab === tb.id
              return (
                <button key={tb.id} onClick={() => setActiveTab(tb.id)} style={{
                  padding: "11px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
                  color: active ? t.ac : t.ts, fontWeight: 600, fontSize: 13,
                  backgroundColor: active ? "rgba(255,255,255,0.72)" : "transparent",
                  border: active ? "1px solid rgba(255,255,255,0.9)" : "1px solid transparent",
                  borderRadius: 16,
                  boxShadow: active ? "0 4px 12px rgba(0,0,0,0.02)" : "none",
                  transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0,
                  fontFamily: "inherit",
                }}>
                  <Icon size={15} /> {tb.label}
                </button>
              )
            })}
          </div>

          {/* Tab 内容 */}
          <div style={{ ...glassCard, padding: 28 }}>

            {/* ========== Tab 1: 基本与归属 ========== */}
            {activeTab === "basic" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
                {/* 归属与状态 */}
                <div>
                  <SectionTitle t={t}>归属与状态</SectionTitle>
                  <div style={flexRow}>
                    <Field
                      label="所属公司"
                      value={editing ? fm.company_id : e.company_id}
                      onChange={(v) => {
                        const nextId = Number(v)
                        const nextTypes = empTypesFor(nextId)
                        sFm(p => ({ ...p, company_id: nextId, employment_type: nextTypes.includes(p.employment_type) ? p.employment_type : nextTypes[0] }))
                      }}
                      isEditing={editing} isLocked={!isAdmin}
                      type="select"
                      options={COMPANIES.map(c => ({ value: c.id, label: c.name }))}
                      t={t}
                    />
                    <Field
                      label="雇佣类型"
                      value={editing ? fm.employment_type : e.employment_type}
                      onChange={(v) => sFm(p => ({ ...p, employment_type: v }))}
                      isEditing={editing} isLocked={!isAdmin}
                      type="select"
                      options={empTypesFor(editing ? fm.company_id : e.company_id)}
                      t={t}
                    />
                    {fld("hire_date", "入职日期", { locked: !isAdmin, type: "date" })}
                    <Field
                      label="系统权限"
                      value={editing ? fm.role : (e.role === "admin" ? "管理者" : "社员")}
                      onChange={(v) => sFm(p => ({ ...p, role: v }))}
                      isEditing={editing} isLocked={!isAdmin}
                      type="select"
                      options={[{ value: "staff", label: "社员" }, { value: "admin", label: "管理者" }]}
                      t={t}
                    />
                  </div>
                </div>

                <div style={{ height: 1, backgroundColor: t.bd, opacity: 0.5 }} />

                {/* 基本资料 */}
                <div>
                  <SectionTitle t={t}>基本资料</SectionTitle>
                  <div style={flexRow}>
                    {fld("name", isCN ? "姓名" : "汉字姓名", { required: true })}
                    {isJP && fld("furigana", "假名 (Furigana)", { placeholder: "セイ メイ" })}
                    {fld("pinyin", "拼音", { placeholder: "Xing Ming" })}
                    {fld("phone", "电话号码")}
                    {fld("email", "电子邮箱", { required: true, fullWidth: isCN })}
                    {isJP && isFullTime(empType) && (
                      <ChipPicker
                        label="地区"
                        options={REGIONS}
                        value={editing ? fm.region : e.region}
                        onChange={(v) => sFm(p => ({ ...p, region: v }))}
                        isEditing={editing}
                        t={t}
                      />
                    )}
                    {isCN && fld("id_card_number", "身份证号码", { placeholder: "18 位身份证号" })}
                    {isCN && fld("birth_date", "出生年月日", { type: "date" })}
                    {isCN && fld("gender", "性别", { type: "select", options: GENDERS })}
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <ChipPicker
                      label={`负责部门${isFullTime(empType) ? "（教务/咨询/宣传/财务）" : "（大学院/学部/文书/语言类）"}`}
                      options={deptListFor(empType)}
                      value={editing ? fm.department : e.department}
                      onChange={(v) => sFm(p => ({ ...p, department: v }))}
                      isEditing={editing}
                      t={t}
                    />
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <ChipPicker
                      label="担任科目（多选）"
                      options={SUBJECTS}
                      value={editing ? fm.subjects : e.subjects}
                      onChange={(v) => sFm(p => ({ ...p, subjects: v }))}
                      multi
                      isEditing={editing}
                      t={t}
                    />
                  </div>

                  <div style={{ ...flexRow, marginTop: 20 }}>
                    {isJP ? (
                      <>
                        <Field label="住址" value={editing ? fm.address : e.address} onChange={(v) => sFm(p => ({ ...p, address: v }))} isEditing={editing} t={t} fullWidth={false} />
                        {fld("postal_code", "邮编", { placeholder: "123-4567" })}
                      </>
                    ) : (
                      fld("address", "住址", { fullWidth: true })
                    )}
                    {fld("remarks", "备注", { fullWidth: true })}
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <CheckBox
                      label="兼任教师（允许排课）"
                      checked={editing ? fm.is_teacher : e.is_teacher}
                      onChange={(v) => sFm(p => ({ ...p, is_teacher: v }))}
                      isEditing={editing}
                      t={t}
                    />
                  </div>
                </div>

                {/* 外国人雇佣（仅日本公司） */}
                {isJP && (
                  <>
                    <div style={{ height: 1, backgroundColor: t.bd, opacity: 0.5 }} />
                    <div>
                      <SectionTitle t={t}>外国人雇佣状况</SectionTitle>
                      <div style={flexRow}>
                        {fld("residence_status", "在留资格", { placeholder: "按在留卡如实填写" })}
                        {fld("residence_card_number", "在留卡号码")}
                        {fld("residence_expiry", "在留期限", { type: "date" })}
                        {fld("nationality", "国籍/地域")}
                        {fld("birth_date", "出生年月日", { type: "date" })}
                        {fld("gender", "性别", { type: "select", options: GENDERS })}
                      </div>
                      <div style={{ marginTop: 20 }}>
                        <CheckBox
                          label="持有资格外活动许可"
                          checked={editing ? fm.has_extra_work_permit : e.has_extra_work_permit}
                          onChange={(v) => sFm(p => ({ ...p, has_extra_work_permit: v }))}
                          isEditing={editing}
                          t={t}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ========== Tab 2: 薪资与税务 ========== */}
            {activeTab === "finance" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
                {/* 时薪配置（仅 baito/外部，按业务类型多套时薪 + 涨薪记录 — 这是他们的薪资主体） */}
                {!creating && isHourly && (
                  <div>
                    <SectionTitle t={t}>时薪配置（按业务类型）</SectionTitle>
                    <div style={{ fontSize: 12, color: t.tm, margin: "-12px 0 16px" }}>
                      如果时薪显示不正确，请及时联系财务老师。
                    </div>
                    <PayRateSection empId={selected.id} isAdmin={isAdmin} t={t} tk={tk} userId={user.id} allEmps={emps} />
                  </div>
                )}
                {creating && isHourly && (
                  <div style={{ padding: 18, borderRadius: 16, background: `${t.wn}10`, border: `1px dashed ${t.wn}60`, color: t.wn, fontSize: 13, fontWeight: 500 }}>
                    保存新员工后可配置各业务类型时薪
                  </div>
                )}
                {isHourly && <div style={{ height: 1, backgroundColor: t.bd, opacity: 0.5 }} />}

                {/* 薪资与税务 */}
                <div>
                  <SectionTitle t={t}>{isHourly ? "税务与合同信息" : "常规薪资配置"}</SectionTitle>
                  <div style={{ padding: !isAdmin ? 20 : 0, backgroundColor: !isAdmin ? t.bl : "transparent", borderRadius: 16, border: !isAdmin ? `1px dashed ${t.bd}` : "none" }}>
                    {!isAdmin && (
                      <div style={{ color: t.ts, fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                        <Lock size={14} /> 以下部分字段仅管理员可修改
                      </div>
                    )}
                    <div style={flexRow}>
                      {!isHourly && (
                        <Field
                          label="固定加班 (h)"
                          value={editing ? fm.fixed_overtime_hours : `${e.fixed_overtime_hours || 20}h`}
                          onChange={(v) => sFm(p => ({ ...p, fixed_overtime_hours: v }))}
                          isEditing={editing} isLocked={!isAdmin} type="number"
                          t={t}
                        />
                      )}
                      {fld("payment_method", "支付方式", { locked: isHourly ? false : !isAdmin, type: "select", options: PAY_METHODS })}
                      {!isHourly && fld("transport_method", "交通费方式", { locked: !isAdmin, type: "select", options: TRANSPORT_METHODS })}
                      {fld("dependents_count", "扶养人数", { locked: isHourly ? false : !isAdmin, type: "number" })}
                      {fld("my_number", "My Number", { locked: isHourly ? false : !isAdmin })}
                      {fld("contract_start_date", "合同开始日", { locked: isHourly ? false : !isAdmin, type: "date" })}
                      {fld("contract_end_date", "合同结束日", { locked: isHourly ? false : !isAdmin, type: "date" })}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                      {!isHourly && (
                        <CheckBox
                          label="启用扶养控除"
                          checked={editing ? fm.has_dependent_deduction : e.has_dependent_deduction}
                          onChange={(v) => sFm(p => ({ ...p, has_dependent_deduction: v }))}
                          disabled={!isAdmin}
                          isEditing={editing}
                          t={t}
                        />
                      )}
                      <CheckBox
                        label="计算签单提成"
                        checked={editing ? fm.has_commission : e.has_commission}
                        onChange={(v) => sFm(p => ({ ...p, has_commission: v }))}
                        disabled={!isAdmin}
                        isEditing={editing}
                        t={t}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ height: 1, backgroundColor: t.bd, opacity: 0.5 }} />

                {/* 银行账户 */}
                <div>
                  <SectionTitle t={t}>银行账户</SectionTitle>
                  <div style={flexRow}>
                    {isCN ? (
                      <>
                        {fld("bank_account_holder", "开户名", { placeholder: "张三" })}
                        {fld("bank_name", "开户银行", { placeholder: "中国工商银行大连支行" })}
                        {fld("bank_account_number", "账户号码")}
                      </>
                    ) : (
                      <>
                        {fld("bank_name", "银行名称")}
                        {fld("bank_branch", "支店名")}
                        {fld("bank_branch_code", "支店番号", { placeholder: "例：001" })}
                        {fld("bank_account_type", "账户类型", { type: "select", options: ACCT_TYPES })}
                        {fld("bank_account_number", "账号")}
                        {fld("bank_account_holder", "户名 (カナ)", { fullWidth: true, placeholder: "ヤマダ タロウ" })}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ========== Tab 3: 排班与假期（Gemini 未设计，先用 glass 风格临时实现） ========== */}
            {activeTab === "schedule" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
                {/* 排班设定 */}
                {!creating && (
                  <div>
                    <SectionTitle t={t}>固定排班周视图</SectionTitle>
                    {editSched ? (
                      <div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                          {WEEKDAYS.map((w, i) => {
                            const on = !!schedFm[i]?.enabled
                            return (
                              <div key={i} style={{
                                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                                background: "rgba(255,255,255,0.72)", padding: "10px 16px", borderRadius: 14,
                                border: `1px solid ${on ? t.ac + "40" : t.bd}`,
                              }}>
                                <div onClick={() => setSchedFm(p => ({ ...p, [i]: { ...p[i], enabled: !p[i]?.enabled } }))} style={{
                                  display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none",
                                  minWidth: 90,
                                }}>
                                  {on ? <CheckSquare size={18} color={t.ac} /> : <Square size={18} color={t.td} />}
                                  <span style={{ fontSize: 14, fontWeight: 600, color: on ? t.tx : t.tm }}>{w}</span>
                                </div>
                                {on ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                                    <input type="time" value={schedFm[i]?.start || "09:00"} onChange={(ev) => setSchedFm(p => ({ ...p, [i]: { ...p[i], start: ev.target.value } }))} style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.bd}`, backgroundColor: "rgba(255,255,255,0.85)", color: t.tx, fontSize: 13, fontFamily: "inherit", width: 120, outline: "none" }} />
                                    <span style={{ color: t.td }}>~</span>
                                    <input type="time" value={schedFm[i]?.end || "18:00"} onChange={(ev) => setSchedFm(p => ({ ...p, [i]: { ...p[i], end: ev.target.value } }))} style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.bd}`, backgroundColor: "rgba(255,255,255,0.85)", color: t.tx, fontSize: 13, fontFamily: "inherit", width: 120, outline: "none" }} />
                                  </div>
                                ) : <span style={{ fontSize: 13, color: t.td, marginLeft: "auto" }}>休息</span>}
                              </div>
                            )
                          })}
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <HoverButton primary disabled={saving} onClick={saveSched} t={t}><Save size={14} /> {saving ? "保存中..." : "保存排班"}</HoverButton>
                          <HoverButton onClick={() => setEditSched(false)} t={t}><X size={14} /> 取消</HoverButton>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 14 }}>
                          {WEEKDAYS.map((w, i) => {
                            const s = schedules.find(sc => sc.day_of_week === i)
                            return (
                              <div key={i} style={{
                                flex: 1, minWidth: 90,
                                background: s ? "rgba(255,255,255,0.75)" : t.bl,
                                border: `1px solid ${s ? t.bd : "transparent"}`,
                                borderRadius: 14, padding: 14, textAlign: "center",
                                opacity: s ? 1 : 0.55,
                              }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: s ? t.tx : t.tm, marginBottom: 8 }}>{w}</div>
                                {s ? (
                                  <div style={{ fontSize: 12, color: t.ac, fontWeight: 600, fontFamily: "monospace", lineHeight: 1.5 }}>
                                    <div>{s.start_time?.slice(0, 5)}</div>
                                    <div>{s.end_time?.slice(0, 5)}</div>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 12, color: t.td, fontWeight: 500 }}>休息</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {isAdmin && <HoverButton onClick={startSchedEdit} t={t}><Edit3 size={14} /> 编辑排班</HoverButton>}
                      </div>
                    )}
                  </div>
                )}

                {/* 假期余额（仅正/契） */}
                {!creating && !isHourly && leaveBal && (
                  <>
                    <div style={{ height: 1, backgroundColor: t.bd, opacity: 0.5 }} />
                    <div>
                      <SectionTitle t={t}>假期余额</SectionTitle>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                        {/* 有休 */}
                        <div style={{ backgroundColor: `${t.gn}0D`, border: `1px solid ${t.gn}33`, padding: 20, borderRadius: 16 }}>
                          <div style={{ fontSize: 13, color: t.ts, marginBottom: 8 }}>有休余额</div>
                          <div style={{ fontSize: 28, fontWeight: 700, color: t.gn, marginBottom: 4, lineHeight: 1 }}>
                            {leaveBal.paid.balance} <span style={{ fontSize: 14, fontWeight: 500 }}>天</span>
                          </div>
                          <div style={{ fontSize: 12, color: t.tm }}>本年 {leaveBal.paid.currentGrant} + 繰越 {leaveBal.paid.carryOver} − 已用 {leaveBal.paid.used}</div>
                        </div>
                        {/* 義務残 */}
                        <div style={{ backgroundColor: leaveBal.paid.mandatoryRequired === 0 ? `${t.td}0D` : leaveBal.paid.mandatoryRemaining > 0 ? `${t.wn}0D` : `${t.gn}0D`, border: `1px solid ${leaveBal.paid.mandatoryRequired === 0 ? t.bd : leaveBal.paid.mandatoryRemaining > 0 ? t.wn + "40" : t.gn + "40"}`, padding: 20, borderRadius: 16 }}>
                          <div style={{ fontSize: 13, color: t.ts, marginBottom: 8 }}>義務残（有休年 5 日）</div>
                          {leaveBal.paid.mandatoryRequired === 0 ? (
                            <>
                              <div style={{ fontSize: 20, fontWeight: 700, color: t.td, marginBottom: 4, lineHeight: 1 }}>—</div>
                              <div style={{ fontSize: 12, color: t.tm }}>付与未满 10 日不適用</div>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: 28, fontWeight: 700, color: leaveBal.paid.mandatoryRemaining > 0 ? t.wn : t.gn, marginBottom: 4, lineHeight: 1 }}>
                                {leaveBal.paid.mandatoryRemaining} <span style={{ fontSize: 14, fontWeight: 500 }}>天</span>
                              </div>
                              <div style={{ fontSize: 12, color: t.tm }}>本年须取 {leaveBal.paid.mandatoryRequired} 日 · 已取 {leaveBal.paid.thisYearUsed}</div>
                            </>
                          )}
                        </div>
                        {/* 代休 */}
                        <div style={{ backgroundColor: `${t.ac}0D`, border: `1px solid ${t.ac}33`, padding: 20, borderRadius: 16 }}>
                          <div style={{ fontSize: 13, color: t.ts, marginBottom: 8 }}>代休余额</div>
                          <div style={{ fontSize: 28, fontWeight: 700, color: t.ac, marginBottom: 4, lineHeight: 1 }}>
                            {leaveBal.compUnused} <span style={{ fontSize: 14, fontWeight: 500 }}>天</span>
                          </div>
                          <div style={{ fontSize: 12, color: t.tm }}>累计 {leaveBal.compTotal} 次换休</div>
                        </div>
                        {/* 即将过期 */}
                        <div style={{ backgroundColor: `${t.wn}0D`, border: `1px solid ${t.wn}40`, padding: 20, borderRadius: 16 }}>
                          <div style={{ fontSize: 13, color: t.wn, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                            <AlertTriangle size={14} /> 即将过期（14 天内）
                          </div>
                          <div style={{ fontSize: 28, fontWeight: 700, color: t.wn, marginBottom: 4, lineHeight: 1 }}>
                            {leaveBal.expiringSoon} <span style={{ fontSize: 14, fontWeight: 500 }}>天</span>
                          </div>
                          <div style={{ fontSize: 12, color: t.wn, opacity: 0.8 }}>
                            {leaveBal.expiringSoon > 0 ? "请尽快安排休假" : "暂无到期记录"}
                          </div>
                        </div>
                        {!selected.hire_date && (
                          <div style={{ padding: 20, borderRadius: 16, background: `${t.wn}10`, border: `1px dashed ${t.wn}` }}>
                            <div style={{ fontSize: 13, color: t.wn, fontWeight: 600 }}>未设定入职日期</div>
                            <div style={{ fontSize: 11, color: t.tm, marginTop: 6 }}>请在「归属与状态」中填写</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {creating && (
                  <div style={{ textAlign: "center", color: t.tm, padding: "40px 20px" }}>
                    <Clock size={40} color={t.td} style={{ marginBottom: 12 }} />
                    <div style={{ fontSize: 14, color: t.ts, fontWeight: 500 }}>保存新员工后可配置排班与假期</div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    )
  }

  // ==================== 档案库列表 ====================
  if (!isAdmin) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

  const processedEmployees = emps
    .filter((em) => filter === "all" || em.employment_type === filter)
    .filter((em) => companyFilter === "all" || em.company_id === companyFilter)
    .filter((em) => {
      if (!searchTerm) return true
      const term = searchTerm.toLowerCase()
      return (em.name || "").toLowerCase().includes(term)
        || (em.furigana || "").toLowerCase().includes(term)
        || (em.pinyin || "").toLowerCase().includes(term)
        || (em.email || "").toLowerCase().includes(term)
        || (em.login_id || "").toLowerCase().includes(term)
    })

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <AmbientBlobs />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1400, margin: "0 auto", padding: "8px 4px" }}>

        {/* 头部 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, color: "#1E293B", margin: "0 0 4px", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
              <Users size={24} color={t.ac} />
              人事档案库
              <span style={{ color: t.td, fontSize: 20, fontWeight: 500 }}>({processedEmployees.length})</span>
            </h1>
            <p style={{ color: t.ts, margin: 0, fontSize: 13 }}>管理世家学舍 / 紫陽花教育 / 早稻大连 / 早理金华 员工档案</p>
          </div>
          <HoverButton primary onClick={startCreate} t={t}>
            <Plus size={16} /> 新增社员
          </HoverButton>
        </div>

        {/* 筛选区 */}
        <div style={{ ...glassCard, padding: "20px 22px", marginBottom: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 搜索框 */}
          <div style={{ position: "relative" }}>
            <Search size={18} color={t.tm} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              placeholder="搜索姓名、假名、拼音、邮箱或登录 ID..."
              value={searchTerm}
              onChange={(ev) => setSearchTerm(ev.target.value)}
              style={{
                width: "100%", padding: "12px 16px 12px 44px", borderRadius: 12,
                border: `1px solid ${t.bd}`, backgroundColor: "rgba(255,255,255,0.8)",
                color: t.tx, outline: "none", boxSizing: "border-box", fontSize: 14, fontFamily: "inherit",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
              }}
            />
          </div>

          <div style={{ height: 1, backgroundColor: t.bd, opacity: 0.5 }} />

          {/* 公司筛选 */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: t.tm, fontWeight: 600, width: 40 }}>公司</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[{ id: "all", name: "全部" }, ...COMPANIES].map((c) => {
                const on = companyFilter === c.id
                return (
                  <button key={c.id} onClick={() => sCompanyFilter(on ? "all" : c.id)} style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    color: on ? t.ac : t.ts,
                    backgroundColor: on ? t.tb : t.bl,
                    border: `1px solid ${on ? t.ac : "transparent"}`,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>{c.name}</button>
                )
              })}
            </div>
          </div>

          <div style={{ height: 1, backgroundColor: t.bd, opacity: 0.5 }} />

          {/* 雇佣类型筛选 */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: t.tm, fontWeight: 600, width: 40 }}>雇佣</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["all", ...EMP_TYPES_ALL].map((f) => {
                const on = filter === f
                return (
                  <button key={f} onClick={() => sFilter(f)} style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    color: on ? t.ac : t.ts,
                    backgroundColor: on ? t.tb : t.bl,
                    border: `1px solid ${on ? t.ac : "transparent"}`,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>{f === "all" ? "全部" : f}</button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 卡片网格 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
          {processedEmployees.length > 0 ? processedEmployees.map((em) => {
            const isExp = !isChinaCompany(em.company_id) && em.residence_expiry && new Date(em.residence_expiry) < new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000)
            const pendingProfile = !em.contract_start_date || !em.my_number
            return (
              <div
                key={em.id}
                onClick={() => { sSelected(em); sEditing(false); sCreating(false); setActiveTab("basic") }}
                style={{ ...glassCard, padding: 22, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: "rgba(59,130,246,0.1)", color: "rgba(59,130,246,0.85)",
                      border: "1px solid rgba(59,130,246,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 700, flexShrink: 0,
                    }}>{(em.name || em.email || "?").slice(0, 1).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: "0 0 2px", color: t.tx, fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{em.name || em.email}</h3>
                      <span style={{ color: t.tm, fontSize: 12 }}>{em.furigana || em.pinyin || ""}</span>
                    </div>
                  </div>
                  {em.login_id && <span style={{ fontSize: 11, color: t.tm, fontFamily: "monospace", flexShrink: 0 }}>{em.login_id}</span>}
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                  <span style={chipBadge(t.wn, "#FEF3C7")}>{COMPANIES.find(c => c.id === em.company_id)?.name}</span>
                  <span style={chipBadge(t.gn, "#D1FAE5")}>{em.employment_type}</span>
                  {(em.region || em.department) && (
                    <span style={chipBadge(t.ac, t.tb)}>{[em.region, em.department].filter(Boolean).join(" · ")}</span>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: `1px dashed ${t.bd}` }}>
                  {isExp ? (
                    <div style={{ backgroundColor: "rgba(255,247,237,0.55)", border: "1px solid rgba(254,215,170,0.7)", color: "rgba(180,83,9,0.85)", padding: "5px 10px", borderRadius: 8, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      <AlertCircle size={13} color="#FB923C" /> 在留卡预警
                    </div>
                  ) : pendingProfile ? (
                    <span style={{ fontSize: 11, color: t.wn, fontWeight: 500 }}>档案待完善</span>
                  ) : (
                    <span style={{ fontSize: 11, color: t.td }}>档案完整</span>
                  )}
                  <ChevronRight size={18} color={t.td} />
                </div>
              </div>
            )
          }) : (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", color: t.tm, background: "rgba(255,255,255,0.4)", borderRadius: 24, border: `1px dashed ${t.bd}` }}>
              <Search size={40} color={t.bd} style={{ margin: "0 auto 12px", display: "block" }} />
              <p style={{ margin: 0 }}>没有匹配的员工</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
