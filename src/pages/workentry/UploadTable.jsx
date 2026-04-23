import { useState, useEffect, useCallback, useMemo } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { ChevronLeft, ChevronRight, Plus, Trash2, Save, Upload, Download, ArrowLeft, Search } from "lucide-react"
import { pad, WEEKDAYS } from "../../config/constants"

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

  // 学部老师才显示班课绩效列
  const showBonus = (selectedEmp?.department || "") === "学部"

  // admin 加载员工列表
  useEffect(() => {
    if (!isAdmin) return
    (async () => {
      const d = await sbGet("employees?is_active=eq.true&employment_type=in.(アルバイト,外部講師)&order=name&select=id,name,furigana,pinyin,department,company_id", tk)
      setAllEmps(d || [])
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
          <button disabled title="稍后实现" style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.td, cursor: "not-allowed", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <Upload size={13} /> 上传 Excel
          </button>
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
