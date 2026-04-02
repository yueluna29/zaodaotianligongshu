import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { calcPaidLeave } from "../../config/leaveCalc"
import { WEEKDAYS } from "../../config/constants"
import { Users } from "lucide-react"
import PayRateSection from "../../components/PayRateSection"

const EMP_TYPES = ["正社員", "契約社員", "アルバイト", "外部講師"]
const COMPANIES = [{ id: 1, name: "世家学舍" }, { id: 2, name: "紫陽花教育" }]
const DEPTS = ["大学院", "学部", "教务", "咨询", "宣传"]
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
  commission_rate: "0", fixed_overtime_hours: "20", payment_method: "银行转账",
  transport_method: "实报实销", transport_amount: "0", transport_cap: "20000",
  dependents_count: "0", my_number: "", contract_start_date: "", contract_end_date: "",
  bank_name: "", bank_branch: "", bank_account_type: "普通",
  bank_account_number: "", bank_account_holder: "",
  days_off: [0, 6], available_days: [], remarks: "",
  has_commission: false,
})

export default function EmployeeManager({ user, t, tk }) {
  const [emps, sEmps] = useState([])
  const [ld, sLd] = useState(true)
  const [filter, sFilter] = useState("all")
  const [companyFilter, sCompanyFilter] = useState("all")
  const [selected, sSelected] = useState(null)
  const [editing, sEditing] = useState(false)
  const [creating, sCreating] = useState(false)
  const [fm, sFm] = useState({})
  const [saving, sSaving] = useState(false)
  const [leaveBal, setLeaveBal] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [editSched, setEditSched] = useState(false)
  const [schedFm, setSchedFm] = useState({})

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
      role: emp.role || "staff", department: emp.department || "", subjects: emp.subjects || [],
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
      contract_start_date: emp.contract_start_date || "", contract_end_date: emp.contract_end_date || "",
      bank_name: emp.bank_name || "", bank_branch: emp.bank_branch || "",
      bank_account_type: emp.bank_account_type || "普通",
      bank_account_number: emp.bank_account_number || "", bank_account_holder: emp.bank_account_holder || "",
      days_off: emp.days_off || [0, 6], available_days: emp.available_days || [], remarks: emp.remarks || "",
    })
    sEditing(true)
  }

  const startCreate = () => { sSelected({ id: "__new__" }); sCreating(true); sFm(emptyForm()); sEditing(true) }

  const startSchedEdit = () => {
    const fm = {}
    for (let i = 0; i < 7; i++) {
      const s = schedules.find(sc => sc.day_of_week === i)
      fm[i] = { enabled: !!s, start: s?.start_time?.slice(0, 5) || "09:00", end: s?.end_time?.slice(0, 5) || "18:00" }
    }
    setSchedFm(fm); setEditSched(true)
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

  const toggleArr = (field, val) => {
    sFm((p) => {
      const arr = [...(p[field] || [])]; const idx = arr.indexOf(val)
      if (idx >= 0) arr.splice(idx, 1); else arr.push(val)
      return { ...p, [field]: field === "subjects" ? arr : arr.sort() }
    })
  }

  // ========== 样式与工具 ==========
  const iS = { padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, boxSizing: "border-box", width: "100%" }
  const lockS = { ...iS, opacity: 0.5, cursor: "not-allowed" }
  const secTitle = (text) => <div style={{ fontSize: 14, fontWeight: 700, color: t.ac, margin: "20px 0 10px", paddingBottom: 6, borderBottom: `2px solid ${t.ac}22` }}>{text}</div>
  const fieldLabel = (text) => <div style={{ fontSize: 9, color: t.tm, marginBottom: 3 }}>{text}</div>
  const readField = (label, value) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, color: t.tm }}>{label}</div>
      <div style={{ fontSize: 13, color: t.tx, marginTop: 2 }}>{value || <span style={{ color: t.td }}>—</span>}</div>
    </div>
  )
  const g4 = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }
  const g2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }

  const filtered = emps
    .filter((e) => filter === "all" || e.employment_type === filter)
    .filter((e) => companyFilter === "all" || e.company_id === companyFilter)

  if (ld) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

  // ==================== 档案详情 ====================
  if (selected) {
    const e = creating ? {} : selected
    const empType = editing ? fm.employment_type : (e.employment_type || "正社員")
    const isHourly = empType === "アルバイト" || empType === "外部講師"
    const isExpiring = !creating && e.residence_expiry && new Date(e.residence_expiry) < new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000)
    // admin-only 字段的样式
    const aS = isAdmin ? iS : lockS
    const aD = !isAdmin

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          {isAdmin && <button onClick={() => { sSelected(null); sEditing(false); sCreating(false) }} style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 11, cursor: "pointer" }}>← 返回列表</button>}
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0, flex: 1, marginLeft: 8 }}>{creating ? "新增社员" : `${e.name || e.email} 的档案`}</h2>
          {(isAdmin || e.id === user.id) && !editing && !creating && <button onClick={() => startEdit(e)} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>编辑档案</button>}
          {editing && <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { if (creating) { sSelected(null); sCreating(false) } sEditing(false) }} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer" }}>取消</button>
            <button onClick={save} disabled={saving} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 12, fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "保存中..." : "保存"}</button>
          </div>}
        </div>

        <div style={{ background: t.bgC, borderRadius: 12, padding: "20px 24px", border: `1px solid ${t.bd}` }}>

          {/* ====== 1. 归属与状态（全部仅管理者可编辑） ====== */}
          {secTitle("1. 归属与状态")}
          {editing ? (
            <div style={g4}>
              <div>{fieldLabel("所属公司")}<select value={fm.company_id} onChange={(ev) => sFm((p) => ({ ...p, company_id: Number(ev.target.value) }))} disabled={aD} style={aS}>{COMPANIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div>{fieldLabel("工作类型")}<select value={fm.employment_type} onChange={(ev) => sFm((p) => ({ ...p, employment_type: ev.target.value }))} disabled={aD} style={aS}>{EMP_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select></div>
              <div>{fieldLabel("入职日期")}<input type="date" value={fm.hire_date} onChange={(ev) => sFm((p) => ({ ...p, hire_date: ev.target.value }))} disabled={aD} style={aS} /></div>
              <div>{fieldLabel("权限")}<select value={fm.role} onChange={(ev) => sFm((p) => ({ ...p, role: ev.target.value }))} disabled={aD} style={aS}><option value="staff">社员</option><option value="admin">管理者</option></select></div>
            </div>
          ) : (
            <div style={g4}>
              {readField("所属公司", COMPANIES.find((c) => c.id === e.company_id)?.name)}
              {readField("工作类型", e.employment_type)}
              {readField("入职日期", e.hire_date)}
              {readField("权限", e.role === "admin" ? "管理者" : "社员")}
            </div>
          )}

          {/* ====== 2. 基本信息（可编辑） ====== */}
          {secTitle("2. 基本信息")}
          {editing ? (<>
            <div style={g4}>
              <div>{fieldLabel("汉字姓名 *")}<input value={fm.name} onChange={(ev) => sFm((p) => ({ ...p, name: ev.target.value }))} style={iS} placeholder="姓 名" /></div>
              <div>{fieldLabel("假名 (Furigana)")}<input value={fm.furigana} onChange={(ev) => sFm((p) => ({ ...p, furigana: ev.target.value }))} style={iS} placeholder="セイ メイ" /></div>
              <div>{fieldLabel("拼音 (Pinyin)")}<input value={fm.pinyin} onChange={(ev) => sFm((p) => ({ ...p, pinyin: ev.target.value }))} style={iS} placeholder="Xing Ming" /></div>
              <div>{fieldLabel("电话号码")}<input value={fm.phone} onChange={(ev) => sFm((p) => ({ ...p, phone: ev.target.value }))} style={iS} /></div>
            </div>
            <div style={g4}>
              <div style={{ gridColumn: "span 2" }}>{fieldLabel("邮箱 *")}<input type="email" value={fm.email} onChange={(ev) => sFm((p) => ({ ...p, email: ev.target.value }))} style={iS} /></div>
              <div>{fieldLabel("负责部门")}<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{DEPTS.map((d) => <button type="button" key={d} onClick={() => sFm((p) => ({ ...p, department: p.department === d ? "" : d }))} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${fm.department === d ? t.ac : t.bd}`, background: fm.department === d ? `${t.ac}15` : "transparent", color: fm.department === d ? t.ac : t.ts, fontSize: 10, cursor: "pointer" }}>{d}</button>)}</div></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
                <label style={{ fontSize: 11, color: t.ts, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={fm.is_teacher} onChange={(ev) => sFm((p) => ({ ...p, is_teacher: ev.target.checked }))} />兼任教师</label>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>{fieldLabel("担任科目 (多选)")}<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{SUBJECTS.map((s) => <button type="button" key={s} onClick={() => toggleArr("subjects", s)} style={{ padding: "3px 8px", borderRadius: 14, border: `1px solid ${(fm.subjects || []).includes(s) ? t.gn : t.bd}`, background: (fm.subjects || []).includes(s) ? `${t.gn}15` : "transparent", color: (fm.subjects || []).includes(s) ? t.gn : t.ts, fontSize: 10, cursor: "pointer" }}>{s}</button>)}</div></div>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>{fieldLabel("住址")}<input value={fm.address} onChange={(ev) => sFm((p) => ({ ...p, address: ev.target.value }))} style={iS} /></div>
              <div>{fieldLabel("邮编")}<input value={fm.postal_code} onChange={(ev) => sFm((p) => ({ ...p, postal_code: ev.target.value }))} style={iS} placeholder="123-4567" /></div>
            </div>
            <div>{fieldLabel("备注")}<input value={fm.remarks} onChange={(ev) => sFm((p) => ({ ...p, remarks: ev.target.value }))} style={iS} /></div>
          </>) : (<>
            <div style={g4}>
              {readField("汉字姓名", e.name)}
              {readField("假名", e.furigana)}
              {readField("拼音", e.pinyin)}
              {readField("电话", e.phone)}
            </div>
            <div style={g4}>
              {readField("邮箱", e.email)}
              {readField("负责部门", e.department)}
              {readField("担任科目", (e.subjects || []).length > 0 ? e.subjects.join("、") : null)}
              {readField("兼任教师", e.is_teacher ? "是" : "否")}
            </div>
            <div style={g2}>
              {readField("住址", e.address ? `〒${e.postal_code || ""} ${e.address}` : null)}
              {readField("备注", e.remarks)}
            </div>
          </>)}

          {/* ====== 3. 外国人雇佣状况（可编辑） ====== */}
          {secTitle("3. 外国人雇佣状况")}
          {editing ? (<>
            <div style={g4}>
              <div>{fieldLabel("在留资格")}<input value={fm.residence_status} onChange={(ev) => sFm((p) => ({ ...p, residence_status: ev.target.value }))} style={iS} placeholder="按在留卡如实填写" /></div>
              <div>{fieldLabel("在留卡号码")}<input value={fm.residence_card_number} onChange={(ev) => sFm((p) => ({ ...p, residence_card_number: ev.target.value }))} style={iS} /></div>
              <div>{fieldLabel("在留期限")}<input type="date" value={fm.residence_expiry} onChange={(ev) => sFm((p) => ({ ...p, residence_expiry: ev.target.value }))} style={iS} /></div>
              <div>{fieldLabel("国籍/地域")}<input value={fm.nationality} onChange={(ev) => sFm((p) => ({ ...p, nationality: ev.target.value }))} style={iS} /></div>
            </div>
            <div style={g4}>
              <div>{fieldLabel("出生年月日")}<input type="date" value={fm.birth_date} onChange={(ev) => sFm((p) => ({ ...p, birth_date: ev.target.value }))} style={iS} /></div>
              <div>{fieldLabel("性别")}<select value={fm.gender} onChange={(ev) => sFm((p) => ({ ...p, gender: ev.target.value }))} style={iS}><option value="">—</option>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}><label style={{ fontSize: 11, color: t.ts, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={fm.has_extra_work_permit} onChange={(ev) => sFm((p) => ({ ...p, has_extra_work_permit: ev.target.checked }))} />资格外许可有无</label></div>
              <div />
            </div>
          </>) : (<>
            <div style={g4}>
              {readField("在留资格", e.residence_status)}
              {readField("在留卡号码", e.residence_card_number)}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: t.tm }}>在留期限</div>
                <div style={{ fontSize: 13, color: isExpiring ? t.rd : t.tx, marginTop: 2, fontWeight: isExpiring ? 700 : 400 }}>{e.residence_expiry || <span style={{ color: t.td }}>—</span>}{isExpiring && " (即将过期)"}</div>
              </div>
              {readField("国籍/地域", e.nationality)}
            </div>
            <div style={g4}>
              {readField("出生年月日", e.birth_date)}
              {readField("性别", e.gender)}
              {readField("资格外许可", e.has_extra_work_permit ? "有" : "无")}
              <div />
            </div>
          </>)}

          {/* ====== 4. 薪资与税务（根据类型不同权限不同） ====== */}
          {secTitle("4. 薪资与税务")}
          {editing ? (<>
            {/* 正社員/契約社員: 全部admin-only。アルバイト/外部講師: 部分admin-only、部分可自编 */}
            <div style={g4}>
              {!isHourly && <div>{fieldLabel("提成率 %")}<input type="number" value={fm.commission_rate} onChange={(ev) => sFm((p) => ({ ...p, commission_rate: ev.target.value }))} disabled={aD} style={aS} /></div>}
              {!isHourly && <div>{fieldLabel("固定加班 h")}<input type="number" value={fm.fixed_overtime_hours} onChange={(ev) => sFm((p) => ({ ...p, fixed_overtime_hours: ev.target.value }))} disabled={aD} style={aS} /></div>}
              <div>{fieldLabel("支付方式")}<select value={fm.payment_method} onChange={(ev) => sFm((p) => ({ ...p, payment_method: ev.target.value }))} disabled={isHourly ? false : aD} style={isHourly ? iS : aS}>{PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
              {!isHourly && <div>{fieldLabel("交通费方式")}<select value={fm.transport_method} onChange={(ev) => sFm((p) => ({ ...p, transport_method: ev.target.value }))} disabled={aD} style={aS}>{TRANSPORT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>}
            </div>
            <div style={g4}>
              {!isHourly && <div>{fieldLabel("交通费 (円)")}<input type="number" value={fm.transport_amount} onChange={(ev) => sFm((p) => ({ ...p, transport_amount: ev.target.value }))} disabled={aD} style={aS} /></div>}
              {!isHourly && <div>{fieldLabel("交通费上限 (円)")}<input type="number" value={fm.transport_cap} onChange={(ev) => sFm((p) => ({ ...p, transport_cap: ev.target.value }))} disabled={aD} style={aS} /></div>}
              <div>{fieldLabel("扶养人数")}<input type="number" value={fm.dependents_count} onChange={(ev) => sFm((p) => ({ ...p, dependents_count: ev.target.value }))} disabled={isHourly ? false : aD} style={isHourly ? iS : aS} /></div>
              <div>{fieldLabel("My Number")}<input value={fm.my_number} onChange={(ev) => sFm((p) => ({ ...p, my_number: ev.target.value }))} disabled={isHourly ? false : aD} style={isHourly ? iS : aS} /></div>
            </div>
            <div style={g2}>
              <div>{fieldLabel("合同开始日")}<input type="date" value={fm.contract_start_date} onChange={(ev) => sFm((p) => ({ ...p, contract_start_date: ev.target.value }))} disabled={isHourly ? false : aD} style={isHourly ? iS : aS} /></div>
              <div>{fieldLabel("合同结束日")}<input type="date" value={fm.contract_end_date} onChange={(ev) => sFm((p) => ({ ...p, contract_end_date: ev.target.value }))} disabled={isHourly ? false : aD} style={isHourly ? iS : aS} /></div>
            </div>
            {!isHourly && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: t.ts, cursor: isAdmin ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 4, opacity: aD ? 0.5 : 1 }}>
                  <input type="checkbox" checked={fm.has_dependent_deduction} onChange={(ev) => sFm((p) => ({ ...p, has_dependent_deduction: ev.target.checked }))} disabled={aD} />扶养控除
                </label>
                <label style={{ fontSize: 11, color: isAdmin ? t.ts : t.td, cursor: isAdmin ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 4, opacity: !isAdmin ? 0.5 : 1 }}>
                  <input type="checkbox" checked={fm.has_commission} onChange={(ev) => sFm((p) => ({ ...p, has_commission: ev.target.checked }))} disabled={!isAdmin} />签单提成
                </label>
              </div>
            )}
            <div style={{ marginTop: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: isAdmin ? t.ts : t.td, cursor: isAdmin ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 4, opacity: !isAdmin ? 0.5 : 1 }}>
              <input type="checkbox" checked={fm.has_commission} onChange={(ev) => sFm((p) => ({ ...p, has_commission: ev.target.checked }))} disabled={!isAdmin} />签单提成
            </label>
          </div>
          </>) : (<>
            <div style={g4}>
              {!isHourly && readField("提成率", `${((e.commission_rate || 0) * 100).toFixed(0)}%`)}
              {!isHourly && readField("固定加班", `${e.fixed_overtime_hours || 20}h`)}
              {readField("支付方式", e.payment_method)}
              {!isHourly && readField("交通费", `${e.transport_method} ${e.transport_amount ? "¥" + Number(e.transport_amount).toLocaleString() : ""}`)}
            </div>
            <div style={g4}>
              {readField("扶养人数", e.dependents_count)}
              {readField("My Number", e.my_number)}
              {readField("合同期间", e.contract_start_date ? `${e.contract_start_date} ~ ${e.contract_end_date || ""}` : null)}
              {readField("签单提成", e.has_commission ? "已开启" : "未开启")}
              {!isHourly && readField("扶养控除", e.has_dependent_deduction ? "有" : "无")}
            </div>
          </>)}

          {/* ====== 5. 银行信息（可编辑） ====== */}
          {secTitle("5. 银行信息")}
          {editing ? (
            <div style={g4}>
              <div>{fieldLabel("银行名称")}<input value={fm.bank_name} onChange={(ev) => sFm((p) => ({ ...p, bank_name: ev.target.value }))} style={iS} /></div>
              <div>{fieldLabel("支店名")}<input value={fm.bank_branch} onChange={(ev) => sFm((p) => ({ ...p, bank_branch: ev.target.value }))} style={iS} /></div>
              <div>{fieldLabel("账户类型")}<select value={fm.bank_account_type} onChange={(ev) => sFm((p) => ({ ...p, bank_account_type: ev.target.value }))} style={iS}>{ACCT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
              <div>{fieldLabel("账号")}<input value={fm.bank_account_number} onChange={(ev) => sFm((p) => ({ ...p, bank_account_number: ev.target.value }))} style={iS} /></div>
            </div>
          ) : (
            <div style={g4}>
              {readField("银行", e.bank_name)}
              {readField("支店", e.bank_branch)}
              {readField("类型", e.bank_account_type)}
              {readField("账号", e.bank_account_number)}
            </div>
          )}
          {editing ? (
            <div style={{ marginBottom: 10 }}>{fieldLabel("户名 (カナ)")}<input value={fm.bank_account_holder} onChange={(ev) => sFm((p) => ({ ...p, bank_account_holder: ev.target.value }))} style={{ ...iS, maxWidth: 300 }} placeholder="ヤマダ タロウ" /></div>
          ) : (
            <div>{readField("户名", e.bank_account_holder)}</div>
          )}

          {/* ====== 6. 排班设定 ====== */}
          {!creating && (<>
            {secTitle("6. 排班设定")}
            {editSched ? (
              <div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {WEEKDAYS.map((w, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: schedFm[i]?.enabled ? `${t.ac}06` : "transparent" }}>
                      <button type="button" onClick={() => setSchedFm(p => ({ ...p, [i]: { ...p[i], enabled: !p[i]?.enabled } }))} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${schedFm[i]?.enabled ? t.ac : t.bd}`, background: schedFm[i]?.enabled ? `${t.ac}20` : "transparent", color: schedFm[i]?.enabled ? t.ac : t.td, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{w}</button>
                      {schedFm[i]?.enabled ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input type="time" value={schedFm[i]?.start || "09:00"} onChange={(ev) => setSchedFm(p => ({ ...p, [i]: { ...p[i], start: ev.target.value } }))} style={{ ...iS, width: 110 }} />
                          <span style={{ color: t.tm, fontSize: 12 }}>~</span>
                          <input type="time" value={schedFm[i]?.end || "18:00"} onChange={(ev) => setSchedFm(p => ({ ...p, [i]: { ...p[i], end: ev.target.value } }))} style={{ ...iS, width: 110 }} />
                        </div>
                      ) : <span style={{ fontSize: 12, color: t.td }}>休息</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveSched} disabled={saving} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 12, fontWeight: 600, cursor: saving ? "wait" : "pointer" }}>{saving ? "保存中..." : "保存排班"}</button>
                  <button onClick={() => setEditSched(false)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer" }}>取消</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {WEEKDAYS.map((w, i) => {
                    const s = schedules.find(sc => sc.day_of_week === i)
                    return (
                      <div key={i} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${s ? t.ac : t.bd}`, background: s ? `${t.ac}08` : "transparent", minWidth: 70, textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: s ? t.ac : t.td }}>{w}</div>
                        {s ? <div style={{ fontSize: 11, color: t.tx, marginTop: 4 }}>{s.start_time?.slice(0, 5)}~{s.end_time?.slice(0, 5)}</div>
                          : <div style={{ fontSize: 11, color: t.td, marginTop: 4 }}>休</div>}
                      </div>
                    )
                  })}
                </div>
                {isAdmin && <button onClick={startSchedEdit} style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 11, cursor: "pointer" }}>编辑排班</button>}
              </div>
            )}
          </>)}

          {/* ====== 7. 时薪配置（正社員隐藏） ====== */}
          {!creating && empType !== "正社員" && (<>
            {secTitle("7. 时薪配置")}
            <PayRateSection empId={selected.id} isAdmin={isAdmin} t={t} tk={tk} userId={user.id} allEmps={emps} />
          </>)}

          {/* ====== 8. 假期余额（アルバイト/外部講師隐藏） ====== */}
          {!creating && !isHourly && leaveBal && (<>
            {secTitle("8. 假期余额")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
              <div style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${t.bd}`, background: `${t.ac}08` }}>
                <div style={{ fontSize: 9, color: t.tm }}>有休余额</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: t.ac, marginTop: 4 }}>{leaveBal.paid.balance}天</div>
                <div style={{ fontSize: 9, color: t.td }}>本年{leaveBal.paid.currentGrant} + 繰越{leaveBal.paid.carryOver} - 已用{leaveBal.paid.used}</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${t.bd}`, background: "#8B5CF608" }}>
                <div style={{ fontSize: 9, color: t.tm }}>代休余额</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#8B5CF6", marginTop: 4 }}>{leaveBal.compUnused}天</div>
                <div style={{ fontSize: 9, color: t.td }}>累计{leaveBal.compTotal}次换休</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${t.bd}`, background: leaveBal.expiringSoon > 0 ? `${t.rd}08` : `${t.gn}08` }}>
                <div style={{ fontSize: 9, color: t.tm }}>即将过期代休</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: leaveBal.expiringSoon > 0 ? t.rd : t.gn, marginTop: 4 }}>{leaveBal.expiringSoon}天</div>
                <div style={{ fontSize: 9, color: t.td }}>{leaveBal.expiringSoon > 0 ? "14天内到期" : "暂无到期"}</div>
              </div>
              {!selected.hire_date && (
                <div style={{ padding: "14px 16px", borderRadius: 10, border: `1px dashed ${t.wn}`, background: `${t.wn}08` }}>
                  <div style={{ fontSize: 11, color: t.wn, fontWeight: 600 }}>未设定入职日期</div>
                  <div style={{ fontSize: 9, color: t.tm, marginTop: 4 }}>请在"归属与状态"中填写入职日期</div>
                </div>
              )}
            </div>
          </>)}
        </div>
      </div>
    )
  }

  // ==================== 列表页 ====================
  if (!isAdmin) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={20} color={t.ac} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>人事档案库 <span style={{ fontSize: 12, fontWeight: 400, color: t.tm }}>({emps.length}名)</span></h2>
        </div>
        <button onClick={startCreate} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 新增社员</button>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {COMPANIES.map((c) => (
          <button key={c.id} onClick={() => sCompanyFilter(companyFilter === c.id ? "all" : c.id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${companyFilter === c.id ? t.wn : t.bd}`, background: companyFilter === c.id ? `${t.wn}15` : "transparent", color: companyFilter === c.id ? t.wn : t.ts, fontSize: 10, cursor: "pointer", fontWeight: companyFilter === c.id ? 600 : 400 }}>{c.name}</button>
        ))}
        <div style={{ width: 1, height: 16, background: t.bd }} />
        {["all", ...EMP_TYPES].map((f) => (
          <button key={f} onClick={() => sFilter(f)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${filter === f ? t.ac : t.bd}`, background: filter === f ? `${t.ac}15` : "transparent", color: filter === f ? t.ac : t.ts, fontSize: 10, cursor: "pointer", fontWeight: filter === f ? 600 : 400 }}>{f === "all" ? "全部" : f}</button>
        ))}
      </div>

      <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: t.bgH }}>
            {["姓名", "部门", "科目", "工作类型", "在留状态", "操作"].map((h, i) => (
              <th key={i} style={{ padding: "10px 12px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: i === 5 ? "right" : "left", borderBottom: `1px solid ${t.bd}` }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((emp) => {
              const isExp = emp.residence_expiry && new Date(emp.residence_expiry) < new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000)
              return (
                <tr key={emp.id} style={{ borderBottom: `1px solid ${t.bl}`, cursor: "pointer" }} onClick={() => { sSelected(emp); sEditing(false); sCreating(false) }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600, color: t.tx }}>{emp.name || emp.email}</div>
                    {emp.furigana && <div style={{ fontSize: 10, color: t.td }}>{emp.furigana}</div>}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{emp.department && <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, background: `${t.ac}10`, color: t.ts }}>{emp.department}</span>}</td>
                  <td style={{ padding: "10px 12px" }}><div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{(emp.subjects || []).slice(0, 3).map((s, i) => <span key={i} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 9, background: `${t.gn}15`, color: t.gn }}>{s}</span>)}{(emp.subjects || []).length > 3 && <span style={{ fontSize: 9, color: t.tm }}>+{emp.subjects.length - 3}</span>}</div></td>
                  <td style={{ padding: "10px 12px", color: t.ts }}>{emp.employment_type}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {emp.residence_status && <div style={{ fontSize: 11, color: t.ts }}>{emp.residence_status}</div>}
                    {isExp && <div style={{ fontSize: 10, color: t.rd, fontWeight: 600 }}>即将过期 ({emp.residence_expiry})</div>}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}><span style={{ color: t.ac, fontSize: 11, fontWeight: 600 }}>查看档案</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}