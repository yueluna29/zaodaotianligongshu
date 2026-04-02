import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { Clock, Plus, ChevronLeft, ChevronRight, Trash2, Save, AlertTriangle } from "lucide-react"

const emptyRow = () => ({
  _key: Math.random().toString(36).slice(2),
  _isNew: true, _dirty: false,
  work_date: "", business_type: "", start_time: "", end_time: "",
  work_minutes: 0, hourly_rate: 0, transport_fee: "", other_expense: "", other_expense_note: "",
  subtotal: 0, student_name: "", course_name: "",
})

export default function WorkEntryManager({ user, t, tk }) {
  const [rows, setRows] = useState([])
  const [ld, setLd] = useState(true)
  const [sv, setSv] = useState(false)
  const [rates, setRates] = useState([])

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const isAdmin = user.role === "admin"
  const [allEmps, setAllEmps] = useState([])
  const [filterEmp, setFilterEmp] = useState("")
  const targetEmpId = isAdmin && filterEmp ? filterEmp : user.id

  const load = useCallback(async () => {
    setLd(true)
    const sd = `${year}-${String(month).padStart(2, "0")}-01`
    const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`

    let q = `work_entries?work_date=gte.${sd}&work_date=lt.${ed}&order=work_date,created_at&select=*`
    if (isAdmin && filterEmp) q += `&employee_id=eq.${filterEmp}`
    else if (!isAdmin) q += `&employee_id=eq.${user.id}`

    const [r, emps] = await Promise.all([
      sbGet(q, tk),
      isAdmin ? sbGet("employees?is_active=eq.true&order=name&select=id,name,employment_type,department", tk) : Promise.resolve(null),
    ])
    const ex = (r || []).map(e => ({
      ...e, _key: e.id, _isNew: false, _dirty: false,
      start_time: e.start_time?.slice(0, 5) || "", end_time: e.end_time?.slice(0, 5) || "",
      transport_fee: e.transport_fee != null ? String(e.transport_fee) : "",
      other_expense: e.other_expense != null ? String(e.other_expense) : "",
      other_expense_note: e.other_expense_note || "",
      student_name: e.student_name || "", course_name: e.course_name || "",
    }))
    setRows([...ex, ...Array.from({ length: 5 }, emptyRow)])
    if (emps) setAllEmps(emps)
    setLd(false)
  }, [user.id, tk, year, month, isAdmin, filterEmp])

  const loadRates = useCallback(async () => {
    const pr = await sbGet(`pay_rates?employee_id=eq.${targetEmpId}&order=business_type,effective_from.desc&select=*`, tk)
    const seen = new Set(), cur = []
    for (const r of (pr || [])) { if (!seen.has(r.business_type)) { seen.add(r.business_type); cur.push(r) } }
    setRates(cur)
  }, [targetEmpId, tk])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadRates() }, [loadRates])

  const getRateForType = (bt) => { const r = rates.find(r => r.business_type === bt); return r ? Number(r.hourly_rate) : 0 }

  const calcMin = (s, e) => {
    if (!s || !e) return 0
    const [sh, sm] = s.split(":").map(Number), [eh, em] = e.split(":").map(Number)
    const m = (eh * 60 + em) - (sh * 60 + sm); return m > 0 ? m : 0
  }

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r
      const next = { ...r, [field]: value, _dirty: true }
      if (field === "business_type") next.hourly_rate = getRateForType(value)
      const st = field === "start_time" ? value : next.start_time
      const et = field === "end_time" ? value : next.end_time
      if (st && et) next.work_minutes = calcMin(st, et)
      const mins = next.work_minutes || 0, rate = next.hourly_rate || 0
      const trans = parseFloat(next.transport_fee) || 0, other = parseFloat(next.other_expense) || 0
      next.subtotal = Math.round(mins / 60 * rate + trans + other)
      return next
    }))
  }

  const addMoreRows = () => setRows(prev => [...prev, ...Array.from({ length: 5 }, emptyRow)])
  const removeRow = (key) => setRows(prev => prev.filter(r => r._key !== key))

  const delExisting = async (id, key) => {
    if (!confirm("确定要删除这条记录？")) return
    await sbDel(`work_entries?id=eq.${id}`, tk)
    setRows(prev => prev.filter(r => r._key !== key))
  }

  const saveAll = async () => {
    setSv(true)
    const newRows = rows.filter(r => r._isNew && r.work_date && r.business_type && r.work_minutes > 0)
    const dirtyRows = rows.filter(r => !r._isNew && r._dirty)
    for (const r of newRows) {
      await sbPost("work_entries", {
        employee_id: targetEmpId, work_date: r.work_date, business_type: r.business_type,
        start_time: r.start_time ? r.start_time + ":00" : null, end_time: r.end_time ? r.end_time + ":00" : null,
        work_minutes: r.work_minutes, hourly_rate: r.hourly_rate, subtotal: r.subtotal,
        transport_fee: parseFloat(r.transport_fee) || 0, other_expense: parseFloat(r.other_expense) || 0,
        other_expense_note: r.other_expense_note || null, student_name: r.student_name || null,
        course_name: r.course_name || null,
      }, tk)
    }
    for (const r of dirtyRows) {
      await sbPatch(`work_entries?id=eq.${r.id}`, {
        work_date: r.work_date, business_type: r.business_type,
        start_time: r.start_time ? r.start_time + ":00" : null, end_time: r.end_time ? r.end_time + ":00" : null,
        work_minutes: r.work_minutes, hourly_rate: r.hourly_rate, subtotal: r.subtotal,
        transport_fee: parseFloat(r.transport_fee) || 0, other_expense: parseFloat(r.other_expense) || 0,
        other_expense_note: r.other_expense_note || null, student_name: r.student_name || null,
        course_name: r.course_name || null,
      }, tk)
    }
    await load(); setSv(false)
  }

  const chgMonth = (d) => {
    let nm = month + d, ny = year
    if (nm > 12) { nm = 1; ny++ } else if (nm < 1) { nm = 12; ny-- }
    setYear(ny); setMonth(nm)
  }

  const iS = { padding: "5px 6px", borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }
  const selS = { ...iS, fontFamily: "inherit", fontSize: 11 }

  const dataRows = rows.filter(r => !r._isNew && r.work_minutes > 0)
  const totalMins = dataRows.reduce((s, e) => s + (e.work_minutes || 0), 0)
  const totalWage = dataRows.reduce((s, e) => s + Math.round((e.work_minutes || 0) / 60 * (Number(e.hourly_rate) || 0)), 0)
  const totalTrans = dataRows.reduce((s, e) => s + (parseFloat(e.transport_fee) || 0), 0)
  const totalOther = dataRows.reduce((s, e) => s + (parseFloat(e.other_expense) || 0), 0)
  const totalAll = totalWage + totalTrans + totalOther
  const hasChanges = rows.some(r => r._dirty || (r._isNew && r.work_date && r.business_type))

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={20} color={t.ac} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>工时管理</h2>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => chgMonth(-1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 15, fontWeight: 600, color: t.tx }}>{year}年{month}月</span>
        <button onClick={() => chgMonth(1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}><ChevronRight size={14} /></button>
        {isAdmin && (
          <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, minWidth: 160 }}>
            <option value="">选择员工</option>
            {allEmps.map(e => <option key={e.id} value={e.id}>{e.name} ({e.department || e.employment_type})</option>)}
          </select>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 8, marginBottom: 16 }}>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>总工时</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.ac, marginTop: 2 }}>{(totalMins / 60).toFixed(1)}h</div>
        </div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>工资</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.gn, marginTop: 2 }}>¥{totalWage.toLocaleString()}</div>
        </div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>交通费</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#8B5CF6", marginTop: 2 }}>¥{totalTrans.toLocaleString()}</div>
        </div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>其他报销</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.wn, marginTop: 2 }}>¥{totalOther.toLocaleString()}</div>
        </div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>合计</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.tx, marginTop: 2 }}>¥{totalAll.toLocaleString()}</div>
        </div>
      </div>

      {!rates.length && targetEmpId && (
        <div style={{ padding: 12, borderRadius: 8, background: `${t.wn}15`, border: `1px solid ${t.wn}33`, marginBottom: 12, fontSize: 11, color: t.wn, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={14} /> 该员工尚未配置时薪，请先在人事档案中设定
        </div>
      )}

      {rates.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {rates.map(r => (
            <span key={r.business_type} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 10, color: "#8B5CF6", background: "#8B5CF612", border: "1px solid #8B5CF620" }}>
              {r.business_type}: ¥{Number(r.hourly_rate).toLocaleString()}/h
            </span>
          ))}
        </div>
      )}

      {hasChanges && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={saveAll} disabled={sv} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: sv ? "wait" : "pointer", opacity: sv ? 0.7 : 1, display: "flex", alignItems: "center", gap: 4 }}>
            <Save size={13} /> {sv ? "保存中..." : "保存全部"}
          </button>
        </div>
      )}

      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> : (
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", maxHeight: "70vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1050 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr style={{ background: t.bgH }}>
                {["日期", "業務内容", "开始", "结束", "时数", "时薪", "交通费", "其他报销", "报销说明", "小计", "学生", "备注", ""].map((h, i) => (
                  <th key={i} style={{ padding: "8px 5px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "left", borderBottom: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const hrs = r.work_minutes > 0 ? (r.work_minutes / 60).toFixed(2) : ""
                return (
                  <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
                    <td style={{ padding: "4px 3px" }}>
                      <input type="date" value={r.work_date} onChange={e => updateRow(r._key, "work_date", e.target.value)} style={{ ...iS, width: 110 }} />
                    </td>
                    <td style={{ padding: "4px 3px" }}>
                      <select value={r.business_type} onChange={e => updateRow(r._key, "business_type", e.target.value)} style={{ ...selS, width: 105 }}>
                        <option value="">选择</option>
                        {rates.map(rt => <option key={rt.business_type} value={rt.business_type}>{rt.business_type}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "4px 3px" }}>
                      <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5} value={r.start_time}
                        onChange={e => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; updateRow(r._key, "start_time", v) }}
                        style={{ ...iS, width: 55, textAlign: "center" }} />
                    </td>
                    <td style={{ padding: "4px 3px" }}>
                      <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5} value={r.end_time}
                        onChange={e => { let v = e.target.value.replace(/[^\d:]/g, ""); if (v.length === 2 && !v.includes(":")) v += ":"; updateRow(r._key, "end_time", v) }}
                        style={{ ...iS, width: 55, textAlign: "center" }} />
                    </td>
                    <td style={{ padding: "4px 5px", fontSize: 12, fontFamily: "monospace", color: t.tx, textAlign: "right" }}>{hrs}</td>
                    <td style={{ padding: "4px 5px", fontSize: 11, color: t.tm, textAlign: "right", whiteSpace: "nowrap" }}>{r.hourly_rate ? `¥${Number(r.hourly_rate).toLocaleString()}` : ""}</td>
                    <td style={{ padding: "4px 3px" }}>
                      <input type="number" value={r.transport_fee} onChange={e => updateRow(r._key, "transport_fee", e.target.value)} placeholder="0" style={{ ...iS, width: 58, textAlign: "right" }} />
                    </td>
                    <td style={{ padding: "4px 3px" }}>
                      <input type="number" value={r.other_expense} onChange={e => updateRow(r._key, "other_expense", e.target.value)} placeholder="0" style={{ ...iS, width: 58, textAlign: "right" }} />
                    </td>
                    <td style={{ padding: "4px 3px" }}>
                      <input type="text" value={r.other_expense_note} onChange={e => updateRow(r._key, "other_expense_note", e.target.value)} placeholder="" style={{ ...iS, width: 70, fontFamily: "inherit", fontSize: 10 }} />
                    </td>
                    <td style={{ padding: "4px 5px", fontSize: 12, fontWeight: 600, color: t.gn, fontFamily: "monospace", textAlign: "right", whiteSpace: "nowrap" }}>{r.subtotal > 0 ? `¥${r.subtotal.toLocaleString()}` : ""}</td>
                    <td style={{ padding: "4px 3px" }}>
                      <input type="text" value={r.student_name} onChange={e => updateRow(r._key, "student_name", e.target.value)} placeholder="学生名" style={{ ...iS, width: 65, fontFamily: "inherit" }} />
                    </td>
                    <td style={{ padding: "4px 3px" }}>
                      <input type="text" value={r.course_name} onChange={e => updateRow(r._key, "course_name", e.target.value)} placeholder="课程/备注" style={{ ...iS, width: 90, fontFamily: "inherit" }} />
                    </td>
                    <td style={{ padding: "4px 3px" }}>
                      {r._isNew ? (
                        r.work_date && <button onClick={() => removeRow(r._key)} style={{ background: "none", border: "none", color: t.td, cursor: "pointer", padding: 2 }}><Trash2 size={12} /></button>
                      ) : (
                        <button onClick={() => delExisting(r.id, r._key)} style={{ background: "none", border: "none", color: t.rd, cursor: "pointer", padding: 2 }}><Trash2 size={12} /></button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${t.bd}` }}>
                <td colSpan={4} style={{ padding: "10px 5px" }}>
                  <button onClick={addMoreRows} style={{ background: "none", border: `1px dashed ${t.bd}`, borderRadius: 6, padding: "4px 12px", color: t.ac, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <Plus size={12} /> 添加更多行
                  </button>
                </td>
                <td style={{ padding: "10px 5px", fontSize: 12, fontWeight: 700, color: t.tx, textAlign: "right" }}>{(totalMins / 60).toFixed(1)}h</td>
                <td></td>
                <td style={{ padding: "10px 5px", fontSize: 11, fontWeight: 700, color: "#8B5CF6", textAlign: "right" }}>¥{totalTrans.toLocaleString()}</td>
                <td style={{ padding: "10px 5px", fontSize: 11, fontWeight: 700, color: t.wn, textAlign: "right" }}>¥{totalOther.toLocaleString()}</td>
                <td></td>
                <td style={{ padding: "10px 5px", fontSize: 13, fontWeight: 700, color: t.gn, textAlign: "right" }}>¥{totalAll.toLocaleString()}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}