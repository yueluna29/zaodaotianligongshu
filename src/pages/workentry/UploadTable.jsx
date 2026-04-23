import { useState, useEffect, useCallback, useMemo } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { ChevronLeft, ChevronRight, Plus, Trash2, Save, Upload, Download, ArrowLeft, Search, X as XIcon, AlertTriangle, Check } from "lucide-react"
import { pad, WEEKDAYS, sortByName, COMPANIES } from "../../config/constants"
import { parsePayrollExcel, applyBizMapping, SUPPORTED_BIZ } from "../../utils/parsePayrollExcel"

// 业务内容 master（从 Excel 模板提炼）— 映射到 DB business_type
const BIZ_TYPES = ["事務性工作", "専業課老師", "答疑做題", "研究計画書修改", "過去問", "EJU講師（班課）"]

const mkRow = (emp_id, date = "") => ({
  _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false,
  employee_id: emp_id, work_date: date, business_type: "",
  start_time: "", end_time: "", work_minutes: 0,
  hourly_rate: 0, bonus_per_hour: 0, transport_fee: "",
  student_name: "", course_name: "", eju_bonus: false,
})

const timeToMin = (s) => {
  if (!s) return 0
  const [h, m] = s.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
const calcMin = (st, et) => {
  if (!st || !et) return 0
  const d = timeToMin(et) - timeToMin(st)
  return d > 0 ? d : 0
}
const fmtHours = (min) => (min / 60).toFixed(2)
const yen = (n) => `¥${Math.round(n).toLocaleString()}`

export default function UploadTable({ user, t, tk }) {
  const isAdmin = user.role === "admin"
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedEmp, setSelectedEmp] = useState(isAdmin ? null : { id: user.id, name: user.name, department: user.department })
  const [allEmps, setAllEmps] = useState([])
  const [empSearch, setEmpSearch] = useState("")
  const [rows, setRows] = useState([])
  const [rates, setRates] = useState([])
  const [ld, setLd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")

  // 上传状态
  const [uploadState, setUploadState] = useState(null) // null | 'mapping' | 'preview' | 'submitting'
  const [uploadData, setUploadData] = useState(null) // { rows, unmappedBizTypes, hasBonus, fileName }
  const [bizMapping, setBizMapping] = useState({}) // { "事务/TA": "事務性工作" }
  const [uploadMode, setUploadMode] = useState("append") // 'append' | 'replace'

  // 学部老师才显示班课绩效列
  const showBonus = (selectedEmp?.department || "") === "学部"

  // admin 加载员工列表
  useEffect(() => {
    if (!isAdmin) return
    (async () => {
      const d = await sbGet("employees?is_active=eq.true&employment_type=in.(アルバイト,外部講師)&select=id,name,furigana,pinyin,department,company_id", tk)
      setAllEmps(sortByName(d))
    })()
  }, [isAdmin, tk])

  const load = useCallback(async () => {
    if (!selectedEmp) return
    setLd(true)
    const sd = `${year}-${pad(month)}-01`
    const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
    const [entries, payRates] = await Promise.all([
      sbGet(`work_entries?employee_id=eq.${selectedEmp.id}&work_date=gte.${sd}&work_date=lt.${ed}&order=work_date,start_time&select=*`, tk),
      sbGet(`pay_rates?employee_id=eq.${selectedEmp.id}&order=business_type&select=business_type,hourly_rate`, tk),
    ])
    const loaded = (entries || [])
      .filter(e => e.business_type) // 过滤掉纯"其他报销"行
      .map(e => ({
        ...e, _key: e.id, _isNew: false, _dirty: false,
        start_time: e.start_time?.slice(0, 5) || "",
        end_time: e.end_time?.slice(0, 5) || "",
        transport_fee: e.transport_fee != null ? String(e.transport_fee) : "",
        bonus_per_hour: e.bonus_per_hour != null ? Number(e.bonus_per_hour) : 0,
      }))
    setRows(loaded)
    setRates(payRates || [])
    setLd(false)
  }, [selectedEmp, year, month, tk])

  useEffect(() => { load() }, [load])

  const getRateFor = (bizType) => rates.find(r => r.business_type === bizType)?.hourly_rate || 0

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r
      const next = { ...r, [field]: value, _dirty: true }
      if (field === "business_type") next.hourly_rate = getRateFor(value)
      const st = field === "start_time" ? value : next.start_time
      const et = field === "end_time" ? value : next.end_time
      if (st && et) next.work_minutes = calcMin(st, et)
      return next
    }))
  }

  const removeRow = async (r) => {
    if (!confirm(`删除 ${r.work_date || "这一行"}？`)) return
    if (r._isNew) setRows(prev => prev.filter(x => x._key !== r._key))
    else {
      await sbDel(`work_entries?id=eq.${r.id}`, tk)
      setRows(prev => prev.filter(x => x._key !== r._key))
    }
  }

  const addRow = () => {
    const defaultDate = `${year}-${pad(month)}-${pad(Math.min(now.getDate(), 28))}`
    setRows(prev => [...prev, mkRow(selectedEmp.id, defaultDate)])
  }

  const rowSubtotal = (r) => {
    const hours = (r.work_minutes || 0) / 60
    const base = hours * Number(r.hourly_rate || 0)
    const bonus = hours * Number(r.bonus_per_hour || 0)
    const trans = parseFloat(r.transport_fee) || 0
    return Math.round(base + bonus + trans)
  }

  const totals = useMemo(() => {
    let totalMin = 0, wageSum = 0, bonusSum = 0, transSum = 0
    for (const r of rows) {
      const hours = (r.work_minutes || 0) / 60
      totalMin += r.work_minutes || 0
      wageSum += hours * Number(r.hourly_rate || 0)
      bonusSum += hours * Number(r.bonus_per_hour || 0)
      transSum += parseFloat(r.transport_fee) || 0
    }
    return {
      totalHours: totalMin / 60,
      wageSum: Math.round(wageSum),
      bonusSum: Math.round(bonusSum),
      transSum: Math.round(transSum),
      grand: Math.round(wageSum + bonusSum + transSum),
    }
  }, [rows])

  const save = async () => {
    const valid = rows.filter(r => r.work_date && r.business_type && r.start_time && r.end_time && r.work_minutes > 0)
    setSaving(true); setMsg("")
    let ok = 0, err = 0
    for (const r of valid) {
      const body = {
        employee_id: selectedEmp.id,
        work_date: r.work_date,
        business_type: r.business_type,
        start_time: r.start_time + ":00",
        end_time: r.end_time + ":00",
        work_minutes: r.work_minutes || 0,
        hourly_rate: r.hourly_rate || 0,
        bonus_per_hour: r.bonus_per_hour || 0,
        transport_fee: parseFloat(r.transport_fee) || 0,
        subtotal: rowSubtotal(r),
        student_name: r.student_name || null,
        course_name: r.course_name || null,
      }
      let res
      if (r._isNew) res = await sbPost("work_entries", body, tk)
      else if (r._dirty) res = await sbPatch(`work_entries?id=eq.${r.id}`, body, tk)
      else continue
      if (res && !Array.isArray(res) && (res.code || res.message)) err++
      else ok++
    }
    setSaving(false)
    setMsg(err ? `保存：成功 ${ok}，失败 ${err}` : `已保存 ${ok} 行`)
    setTimeout(() => setMsg(""), 5000)
    await load()
  }

  // ========== Excel 上传 ==========
  const handleFilePick = async (file) => {
    if (!file) return
    setMsg("")
    try {
      const result = await parsePayrollExcel(file)
      if (!result.rows.length) {
        alert("文件里没有解析到有效的工时记录行")
        return
      }
      setUploadData({ ...result, fileName: file.name })
      // 如果有未识别的业务名，先进映射步骤；否则直接进预览
      const initMapping = {}
      result.unmappedBizTypes.forEach(raw => { initMapping[raw] = "" })
      setBizMapping(initMapping)
      setUploadState(result.unmappedBizTypes.length ? "mapping" : "preview")
    } catch (e) {
      alert(`解析失败：${e.message}`)
    }
  }

  const confirmMapping = () => {
    const unresolved = uploadData.unmappedBizTypes.filter(raw => !bizMapping[raw])
    if (unresolved.length) {
      alert(`还有 ${unresolved.length} 个业务名没选：${unresolved.join("、")}`)
      return
    }
    setUploadData(d => ({ ...d, rows: applyBizMapping(d.rows, bizMapping) }))
    setUploadState("preview")
  }

  const submitUpload = async () => {
    if (!uploadData?.rows.length) return
    const monthRows = uploadData.rows.filter(r => r.work_date.startsWith(`${year}-${pad(month)}`))
    if (monthRows.length === 0) {
      if (!confirm(`文件里没有 ${year}年${month}月 的记录，确定继续吗？（会按记录原日期插入）`)) return
    }
    setUploadState("submitting")
    try {
      if (uploadMode === "replace") {
        const sd = `${year}-${pad(month)}-01`
        const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
        await sbDel(`work_entries?employee_id=eq.${selectedEmp.id}&work_date=gte.${sd}&work_date=lt.${ed}&business_type=not.is.null`, tk)
      }
      let ok = 0, err = 0
      for (const r of uploadData.rows) {
        const hours = (r.work_minutes || 0) / 60
        const subtotal = Math.round(hours * (r.hourly_rate + r.bonus_per_hour) + r.transport_fee)
        const body = {
          employee_id: selectedEmp.id,
          work_date: r.work_date,
          business_type: r.business_type,
          start_time: r.start_time ? r.start_time + ":00" : null,
          end_time: r.end_time ? r.end_time + ":00" : null,
          work_minutes: r.work_minutes,
          hourly_rate: r.hourly_rate,
          bonus_per_hour: r.bonus_per_hour || 0,
          transport_fee: r.transport_fee,
          subtotal,
          student_name: r.student_name || null,
          course_name: r.course_name || null,
        }
        const res = await sbPost("work_entries", body, tk)
        if (res && !Array.isArray(res) && (res.code || res.message)) err++
        else ok++
      }
      setUploadState(null)
      setUploadData(null)
      setBizMapping({})
      setUploadMode("append")
      setMsg(err ? `上传完成：成功 ${ok} 行，失败 ${err} 行` : `上传成功：${ok} 行`)
      setTimeout(() => setMsg(""), 6000)
      await load()
    } catch (e) {
      setUploadState("preview")
      alert(`上传出错：${e.message || e}`)
    }
  }

  const chgMonth = (d) => {
    let m = month + d, y = year
    if (m > 12) { m = 1; y++ } else if (m < 1) { m = 12; y-- }
    setYear(y); setMonth(m)
  }

  // ========== Admin 员工选择视图 ==========
  if (isAdmin && !selectedEmp) {
    const filtered = allEmps.filter(e => {
      if (!empSearch) return true
      const q = empSearch.toLowerCase()
      return (e.name || "").toLowerCase().includes(q) || (e.furigana || "").toLowerCase().includes(q) || (e.pinyin || "").toLowerCase().includes(q)
    })
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: "0 0 4px" }}>一键上传 · 选择老师</h2>
          <p style={{ fontSize: 11, color: t.tm, margin: 0 }}>点击老师查看其月度工时表</p>
        </div>
        <div style={{ marginBottom: 16, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.tm }} />
          <input placeholder="搜索姓名 / 假名 / 拼音" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, border: `1px solid ${t.bd}`, background: t.bgC, color: t.tx, fontSize: 13, boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {filtered.map(e => (
            <button key={e.id} onClick={() => setSelectedEmp(e)} style={{
              padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.bd}`, background: t.bgC, color: t.tx,
              cursor: "pointer", textAlign: "left", fontFamily: "inherit",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{e.name}</div>
              <div style={{ fontSize: 10, color: t.tm, marginTop: 2 }}>{e.department || "—"}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12, gridColumn: "1/-1" }}>无匹配老师</div>
          )}
        </div>
      </div>
    )
  }

  // ========== 主表格视图 ==========
  const colWidths = {
    num: 36, date: 110, biz: 150, start: 76, end: 76,
    hours: 66, rate: 80, bonus: 82, trans: 82, subtotal: 96,
    student: 100, course: 160, del: 36,
  }
  const thStyle = { padding: "8px 6px", fontSize: 10, color: t.tm, fontWeight: 600, textAlign: "left", borderBottom: `1px solid ${t.bd}`, background: t.bgH, position: "sticky", top: 0, zIndex: 1, whiteSpace: "nowrap" }
  const tdStyle = { padding: "4px 6px", fontSize: 12, color: t.tx, borderBottom: `1px solid ${t.bl}`, verticalAlign: "middle" }
  const inpStyle = { width: "100%", padding: "4px 6px", border: "1px solid transparent", borderRadius: 4, fontSize: 12, background: "transparent", color: t.tx, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isAdmin && (
            <button onClick={() => setSelectedEmp(null)} style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              <ArrowLeft size={13} /> 换一位
            </button>
          )}
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: t.tx, margin: 0 }}>一键上传 · {selectedEmp?.name}</h2>
            <p style={{ fontSize: 11, color: t.tm, margin: "2px 0 0" }}>{selectedEmp?.department || "—"} · 与工资报表共享同一数据</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => chgMonth(-1)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", fontFamily: "inherit" }}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.tx, minWidth: 90, textAlign: "center" }}>{year}年{month}月</span>
          <button onClick={() => chgMonth(1)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", fontFamily: "inherit" }}><ChevronRight size={14} /></button>
          <label style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.ac}`, background: `${t.ac}10`, color: t.ac, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}>
            <Upload size={13} /> 上传 Excel
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePick(f); e.target.value = "" }} />
          </label>
          <button disabled title="稍后实现" style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.td, cursor: "not-allowed", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <Download size={13} /> 导出 Excel
          </button>
        </div>
      </div>

      {msg && <div style={{ padding: 10, borderRadius: 8, background: `${t.gn}15`, color: t.gn, marginBottom: 12, fontSize: 12 }}>{msg}</div>}

      {ld ? (
        <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>
      ) : (
      <>
      <div style={{ background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 10, overflow: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showBonus ? 1100 : 1000 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: colWidths.num, textAlign: "center" }}>#</th>
              <th style={{ ...thStyle, width: colWidths.date }}>日付</th>
              <th style={{ ...thStyle, width: colWidths.biz }}>業務内容</th>
              <th style={{ ...thStyle, width: colWidths.start }}>開始</th>
              <th style={{ ...thStyle, width: colWidths.end }}>終了</th>
              <th style={{ ...thStyle, width: colWidths.hours, textAlign: "right" }}>時間数</th>
              <th style={{ ...thStyle, width: colWidths.rate, textAlign: "right" }}>時給</th>
              {showBonus && <th style={{ ...thStyle, width: colWidths.bonus, textAlign: "right" }}>班课绩效</th>}
              <th style={{ ...thStyle, width: colWidths.trans, textAlign: "right" }}>交通費</th>
              <th style={{ ...thStyle, width: colWidths.subtotal, textAlign: "right" }}>回当り総額</th>
              <th style={{ ...thStyle, width: colWidths.student }}>学生氏名</th>
              <th style={{ ...thStyle, width: colWidths.course }}>備考</th>
              <th style={{ ...thStyle, width: colWidths.del }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={showBonus ? 13 : 12} style={{ padding: 40, textAlign: "center", color: t.tm, fontSize: 12 }}>本月无工时记录，点下方「+ 新增一行」添加</td></tr>
            )}
            {rows.map((r, i) => {
              const rateOptions = rates.map(x => x.business_type)
              const wd = r.work_date ? new Date(r.work_date + "T00:00:00").getDay() : null
              return (
                <tr key={r._key} style={{ background: r._isNew ? `${t.ac}05` : "transparent" }}>
                  <td style={{ ...tdStyle, textAlign: "center", color: t.tm }}>{i + 1}</td>
                  <td style={tdStyle}>
                    <input type="date" value={r.work_date} onChange={(e) => updateRow(r._key, "work_date", e.target.value)} style={inpStyle} />
                    {wd !== null && <div style={{ fontSize: 9, color: wd === 0 || wd === 6 ? t.rd : t.td, paddingLeft: 6 }}>{WEEKDAYS[wd]}</div>}
                  </td>
                  <td style={tdStyle}>
                    <select value={r.business_type} onChange={(e) => updateRow(r._key, "business_type", e.target.value)}
                      style={{ ...inpStyle, fontFamily: "inherit" }}>
                      <option value="">—</option>
                      {[...new Set([...BIZ_TYPES, ...rateOptions])].map(bt => (
                        <option key={bt} value={bt}>{bt}{rateOptions.includes(bt) ? ` ¥${getRateFor(bt)}` : ""}</option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}><input type="time" value={r.start_time} onChange={(e) => updateRow(r._key, "start_time", e.target.value)} style={inpStyle} /></td>
                  <td style={tdStyle}><input type="time" value={r.end_time} onChange={(e) => updateRow(r._key, "end_time", e.target.value)} style={inpStyle} /></td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: t.tm }}>{fmtHours(r.work_minutes || 0)}</td>
                  <td style={tdStyle}>
                    <input type="number" value={r.hourly_rate || ""} onChange={(e) => updateRow(r._key, "hourly_rate", parseInt(e.target.value) || 0)} style={{ ...inpStyle, textAlign: "right" }} />
                  </td>
                  {showBonus && (
                    <td style={tdStyle}>
                      <input type="number" value={r.bonus_per_hour || ""} onChange={(e) => updateRow(r._key, "bonus_per_hour", parseInt(e.target.value) || 0)} placeholder="円/h" style={{ ...inpStyle, textAlign: "right" }} />
                    </td>
                  )}
                  <td style={tdStyle}>
                    <input type="number" value={r.transport_fee} onChange={(e) => updateRow(r._key, "transport_fee", e.target.value)} style={{ ...inpStyle, textAlign: "right" }} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: t.ac, fontVariantNumeric: "tabular-nums" }}>{yen(rowSubtotal(r))}</td>
                  <td style={tdStyle}>
                    <input value={r.student_name || ""} onChange={(e) => updateRow(r._key, "student_name", e.target.value)} placeholder="一对一必填" style={inpStyle} />
                  </td>
                  <td style={tdStyle}>
                    <input value={r.course_name || ""} onChange={(e) => updateRow(r._key, "course_name", e.target.value)} placeholder="课程名/说明" style={inpStyle} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <button onClick={() => removeRow(r)} style={{ background: "transparent", border: "none", color: t.rd, cursor: "pointer", padding: 4, fontFamily: "inherit" }} title="删除">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <button onClick={addRow} style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.ac}`, background: `${t.ac}08`, color: t.ac, cursor: "pointer", fontSize: 12, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Plus size={14} /> 新增一行
        </button>
        <button onClick={save} disabled={saving || rows.every(r => !r._dirty && !r._isNew)} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, opacity: (saving || rows.every(r => !r._dirty && !r._isNew)) ? 0.5 : 1 }}>
          <Save size={14} /> {saving ? "保存中..." : "保存全部"}
        </button>
      </div>

      {/* 底部汇总（粘性） */}
      <div style={{
        position: "sticky", bottom: 0, background: t.bgC, border: `1px solid ${t.bd}`,
        borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 14, boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 12, color: t.ts }}>
          <Stat label="総時間数" value={`${totals.totalHours.toFixed(2)} h`} t={t} />
          <Stat label="給与総額" value={yen(totals.wageSum)} t={t} />
          {showBonus && <Stat label="班课绩效" value={yen(totals.bonusSum)} t={t} />}
          <Stat label="交通費総額" value={yen(totals.transSum)} t={t} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 12, color: t.tm }}>合計</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: t.ac, fontVariantNumeric: "tabular-nums" }}>{yen(totals.grand)}</span>
        </div>
      </div>
      </>)}

      {/* 业务名映射对话框 */}
      {uploadState === "mapping" && uploadData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setUploadState(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(255,255,255,0.98)", borderRadius: 18, maxWidth: 600, width: "100%", padding: 24, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={16} color={t.wn} /> 业务名需要确认
              </h3>
              <button onClick={() => setUploadState(null)} style={{ background: "transparent", border: "none", color: t.tm, cursor: "pointer", fontFamily: "inherit", display: "inline-flex" }}><XIcon size={18} /></button>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: t.tm, lineHeight: 1.6 }}>
              文件「{uploadData.fileName}」里的以下业务名系统认不出，请选对应的工种。选完点"确认"继续。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {uploadData.unmappedBizTypes.map(raw => (
                <div key={raw} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 }}>
                  <code style={{ padding: "6px 10px", borderRadius: 6, background: t.bgI, color: t.tx, fontSize: 12, fontFamily: "monospace" }}>{raw}</code>
                  <span style={{ color: t.tm, fontSize: 11 }}>→</span>
                  <select value={bizMapping[raw] || ""} onChange={(e) => setBizMapping(p => ({ ...p, [raw]: e.target.value }))}
                    style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, fontFamily: "inherit" }}>
                    <option value="">— 请选 —</option>
                    {SUPPORTED_BIZ.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setUploadState(null)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
              <button onClick={confirmMapping} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>确认映射</button>
            </div>
          </div>
        </div>
      )}

      {/* 上传预览 + 确认 */}
      {uploadState === "preview" && uploadData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setUploadState(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(255,255,255,0.98)", borderRadius: 18, maxWidth: 900, width: "100%", padding: 24, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.tx }}>预览并确认上传</h3>
              <button onClick={() => setUploadState(null)} style={{ background: "transparent", border: "none", color: t.tm, cursor: "pointer", fontFamily: "inherit", display: "inline-flex" }}><XIcon size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.tm, marginBottom: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>文件：<strong style={{ color: t.tx }}>{uploadData.fileName}</strong></span>
              <span>共 <strong style={{ color: t.tx }}>{uploadData.rows.length}</strong> 行</span>
              <span>{uploadData.hasBonus ? "含班课绩效（学部模板）" : "大学院模板"}</span>
            </div>

            {/* 冲突模式 */}
            <div style={{ padding: 12, borderRadius: 10, background: `${t.wn}10`, border: `1px solid ${t.wn}30`, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.tx, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={13} color={t.wn} /> 和当月已有记录怎么处理？
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input type="radio" checked={uploadMode === "append"} onChange={() => setUploadMode("append")} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ color: t.tx, fontWeight: 600 }}>追加（推荐）</div>
                    <div style={{ color: t.tm, fontSize: 11 }}>不动已有记录，新文件的行加进去。可能产生重复，但不会丢数据。</div>
                  </div>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input type="radio" checked={uploadMode === "replace"} onChange={() => setUploadMode("replace")} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ color: t.rd, fontWeight: 600 }}>替换当月全部</div>
                    <div style={{ color: t.tm, fontSize: 11 }}>先删除 {year}年{month}月 该老师的所有工时记录（不影响其他月份），再插入新行。<strong style={{ color: t.rd }}>不可撤销</strong>。</div>
                  </div>
                </label>
              </div>
            </div>

            {/* 数据预览 */}
            <div style={{ border: `1px solid ${t.bd}`, borderRadius: 8, overflow: "auto", maxHeight: 300, marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 700 }}>
                <thead>
                  <tr style={{ background: t.bgH }}>
                    {["日付", "業務内容", "起止", "時給", ...(uploadData.hasBonus ? ["绩效"] : []), "交通費", "学生", "備考"].map((h, i) => (
                      <th key={i} style={{ padding: "6px 8px", color: t.tm, fontWeight: 600, textAlign: "left", borderBottom: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadData.rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${t.bl}` }}>
                      <td style={{ padding: "5px 8px", color: t.ts, fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.work_date}</td>
                      <td style={{ padding: "5px 8px" }}>
                        <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, background: `${t.ac}15`, color: t.ac }}>{r.business_type || "⚠ 未映射"}</span>
                      </td>
                      <td style={{ padding: "5px 8px", color: t.ts, fontFamily: "monospace" }}>{r.start_time || "—"} ~ {r.end_time || "—"}</td>
                      <td style={{ padding: "5px 8px", color: t.ts, textAlign: "right" }}>¥{r.hourly_rate.toLocaleString()}</td>
                      {uploadData.hasBonus && <td style={{ padding: "5px 8px", color: t.ts, textAlign: "right" }}>{r.bonus_per_hour ? `¥${r.bonus_per_hour}/h` : "—"}</td>}
                      <td style={{ padding: "5px 8px", color: t.ts, textAlign: "right" }}>{r.transport_fee ? `¥${r.transport_fee}` : "—"}</td>
                      <td style={{ padding: "5px 8px", color: t.ts }}>{r.student_name || "—"}</td>
                      <td style={{ padding: "5px 8px", color: t.tm }}>{r.course_name || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setUploadState(null)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
              <button onClick={() => {
                if (uploadMode === "replace" && !confirm(`确认删除 ${year}年${month}月 的所有工时记录，然后插入 ${uploadData.rows.length} 行新数据？此操作不可撤销。`)) return
                submitUpload()
              }} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: uploadMode === "replace" ? t.rd : t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Check size={13} /> {uploadMode === "replace" ? `清空并插入 ${uploadData.rows.length} 行` : `追加 ${uploadData.rows.length} 行`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 上传中遮罩 */}
      {uploadState === "submitting" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "rgba(255,255,255,0.98)", borderRadius: 14, padding: "22px 28px", fontSize: 14, color: t.tx, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 18, height: 18, border: `2px solid ${t.ac}33`, borderTopColor: t.ac, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            上传中...
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, t }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, color: t.tm }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: t.tx, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  )
}
